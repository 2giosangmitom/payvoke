import type { Prisma } from "#core/db";

export type TranscriptMessage = {
  role: "user" | "assistant";
  content: string;
  invocationId: string;
};

const MESSAGE_LIMIT = 2000;
const object = (value: unknown): value is Record<string, Prisma.JsonValue> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// A single string argument is the chat prompt; anything else is shown as JSON.
export function promptText(args: Record<string, unknown>) {
  const values = Object.values(args);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : JSON.stringify(args);
}

// The paid agent sees a bounded, verified transcript from this owned session:
// the last delivered invocations only. Unverified streaming previews cannot
// enter a new quote.
export async function loadTranscript(tx: Prisma.TransactionClient, threadId: string) {
  const history: TranscriptMessage[] = [];
  const previous = (
    await tx.quote.findMany({
      where: { threadId, invocation: { executionStatus: "DELIVERED" } },
      select: {
        invocationId: true,
        document: true,
        invocation: { select: { run: { select: { result: true } } } },
      },
      take: 6,
      orderBy: { createdAt: "desc" },
    })
  ).reverse();
  const events = previous.length
    ? await tx.aguiStreamEvent.findMany({
        where: { invocationId: { in: previous.map((p) => p.invocationId) } },
        orderBy: { cursor: "asc" },
        select: { invocationId: true, event: true },
        take: 10000,
      })
    : [];
  const outputs = new Map<string, string[]>();
  for (const { invocationId, event } of events) {
    if (!object(event)) continue;
    if (event.type === "TEXT_MESSAGE_START")
      outputs.set(invocationId, [...(outputs.get(invocationId) ?? []), ""]);
    if (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string") {
      const messages = outputs.get(invocationId);
      if (messages?.length) messages[messages.length - 1] += event.delta;
    }
  }
  for (const quote of previous) {
    const document = quote.document;
    if (!object(document) || !object(document.inputSnapshot)) continue;
    const args = document.inputSnapshot.arguments;
    if (!object(args)) continue;
    history.push({
      role: "user",
      content: promptText(args).slice(0, MESSAGE_LIMIT),
      invocationId: quote.invocationId,
    });
    const text = (outputs.get(quote.invocationId) ?? []).join("\n").trim();
    const result = quote.invocation?.run?.result;
    const fallback = object(result) ? JSON.stringify(result.output) : "";
    if (text || fallback)
      history.push({
        role: "assistant",
        content: (text || fallback).slice(0, MESSAGE_LIMIT),
        invocationId: quote.invocationId,
      });
  }
  return history;
}
