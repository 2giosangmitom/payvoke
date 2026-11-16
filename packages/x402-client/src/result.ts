import type { JobResult, ResultFile } from "./types";

type Part = Record<string, unknown>;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// The verified result of one invocation in a `GET /v1/threads/:id/timeline`
// answer. The run message carries it as an `output-<invocationId>-<version>`
// part (text, or a `result` tool call for JSON), followed by its files. Null
// until the delivery is verified.
export function readResult(timeline: unknown, invocationId: string): JobResult | null {
  if (!record(timeline) || !Array.isArray(timeline.messages)) return null;
  const message = timeline.messages.find(
    (m: unknown) => record(m) && record(m.run) && m.run.invocationId === invocationId,
  ) as { parts?: unknown; run: { phase?: unknown } } | undefined;
  if (!message || message.run.phase !== "delivered" || !Array.isArray(message.parts)) return null;
  const parts = message.parts.filter(record) as Part[];
  const prefix = `output-${invocationId}-`;
  const index = parts.findIndex(
    (p) =>
      (p.type === "text" && typeof p.id === "string" && p.id.startsWith(prefix)) ||
      (p.type === "tool-call" &&
        typeof p.toolCallId === "string" &&
        p.toolCallId.startsWith(prefix)),
  );
  const files = parts
    .slice(index + 1)
    .filter((p) => p.type === "file")
    .map((p): ResultFile => ({
      fileId: String(p.fileId),
      name: String(p.name),
      contentType: String(p.contentType),
      size: Number(p.size),
    }));
  if (index === -1)
    return files.length ? { artifactVersion: 1, output: null, text: null, files } : null;
  const part = parts[index];
  const id = String(part.type === "text" ? part.id : part.toolCallId);
  const artifactVersion = Number(id.slice(prefix.length)) || 1;
  if (part.type === "text") {
    const text = typeof part.text === "string" ? part.text : "";
    return { artifactVersion, output: text, text, files };
  }
  const args = record(part.args) ? part.args : {};
  const output = args.output ?? null;
  return { artifactVersion, output, text: typeof output === "string" ? output : null, files };
}
