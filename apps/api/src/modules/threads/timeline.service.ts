import type { Cradle } from "../../container";
import type { Prisma } from "#core/db";
import { parseManifest, type FileManifestEntry } from "#core/payments/files";
import { PayloadTooLargeError } from "../../errors";
import { offerStatus } from "../presale/presale.service";
import { object } from "../runs/protocol";
import { revisionPolicy } from "../runs/run-rules";
import { storedToolCall } from "../tools/builtin";

type Json = Prisma.JsonValue;

export type AudioMeta = { durationMs: number; peaks: number[] | null };
export type ToolStatus = "open" | "running" | "done" | "failed" | "cancelled";
// Message parts in the shape assistant-ui renders. Every interactive or
// structured piece is a tool call: the built-in tools a provider opens
// (ask_form, ask_choice, confirm), offers, slash commands, run steps
// (progress), OpenUI surfaces (render_ui), revisions and JSON results.
export type TimelinePart =
  | { type: "text"; id: string; text: string; format: "plain" | "markdown"; streaming: boolean }
  | {
      type: "file";
      id: string;
      fileId: string;
      name: string;
      contentType: string;
      size: number;
      audio: AudioMeta | null;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Json;
      result: Json;
      status: ToolStatus;
    };
export type RunPhase =
  | "awaiting_payment"
  | "payment_expired"
  | "payment_pending"
  | "payment_rejected"
  | "queued"
  | "running"
  | "waiting_buyer"
  | "verifying"
  | "delivered"
  | "failed";
export type TimelineRun = {
  invocationId: string;
  quoteId: string;
  offerId: string;
  grossAmount: string;
  phase: RunPhase;
  revisions: { used: number; included: number };
};
export type TimelineMessage = {
  id: string;
  role: "user" | "assistant";
  createdAt: Date;
  status: "complete" | "running" | "requires-action" | "incomplete";
  parts: TimelinePart[];
  run: TimelineRun | null;
};
export type Timeline = { cursor: string; messages: TimelineMessage[] };

const HISTORY_LIMIT = 100000;
// Live text deltas address their run message by this id.
export const runMessageId = (invocationId: string) => `run-${invocationId}`;
const MESSAGE_LIMIT = 200;
const OFFER_LIMIT = 50;

const runStatus: Record<RunPhase, TimelineMessage["status"]> = {
  awaiting_payment: "requires-action",
  payment_expired: "incomplete",
  payment_pending: "running",
  payment_rejected: "incomplete",
  queued: "running",
  running: "running",
  waiting_buyer: "requires-action",
  verifying: "running",
  delivered: "complete",
  failed: "incomplete",
};

const execution: Record<string, RunPhase> = {
  NOT_STARTED: "queued",
  QUEUED: "queued",
  ACKED: "queued",
  RUNNING: "running",
  WAITING_BUYER: "waiting_buyer",
  VERIFYING: "verifying",
  DELIVERED: "delivered",
  FAILED: "failed",
};

// Projects a thread into the ordered message list the chat renders: the
// pre-sale conversation, each offer after the message it answered and each
// paid run after its offer. The browser never stitches tables together.
export class TimelineService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  // Highest stream cursor of the thread: the fence a timeline is built at.
  async cursor(threadId: string) {
    return (
      (
        await this.db.aguiStreamEvent.aggregate({
          where: { threadId },
          _max: { cursor: true },
        })
      )._max.cursor ?? 0n
    );
  }

  // Run events after `fence` are not included, so a stream can resume from it.
  async build(threadId: string, fence?: bigint): Promise<Timeline> {
    const upTo = fence ?? (await this.cursor(threadId));
    const [rows, offers] = await Promise.all([
      this.db.threadMessage.findMany({
        where: { threadId },
        orderBy: { seq: "desc" },
        take: MESSAGE_LIMIT,
        include: { reply: true },
      }),
      this.db.offer.findMany({
        where: { threadId },
        orderBy: { createdAt: "desc" },
        take: OFFER_LIMIT,
        include: {
          commandRevision: { select: { command: { select: { id: true, name: true } } } },
          quote: {
            include: {
              invocation: {
                include: { settlement: { select: { state: true } }, run: true },
              },
            },
          },
        },
      }),
    ]);
    const conversation = rows.reverse();
    const invocationIds = offers.flatMap((offer) =>
      offer.quote?.invocation ? [offer.quote.invocation.id] : [],
    );
    const [events, calls, revisions] = await Promise.all([
      this.events(threadId, upTo),
      this.db.invocationToolCall.findMany({
        where: { invocationId: { in: invocationIds } },
        include: { result: true },
      }),
      this.db.invocationRevision.findMany({
        where: { invocationId: { in: invocationIds } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const audio = await this.audio([
      ...conversation.flatMap((row) => parseManifest(row.fileManifest) ?? []),
      ...offers.flatMap((offer) => {
        const result = offer.quote?.invocation?.run?.result;
        return object(result) ? (parseManifest(result.files) ?? []) : [];
      }),
    ]);
    const file = (entry: FileManifestEntry): TimelinePart => ({
      type: "file",
      id: entry.fileId,
      fileId: entry.fileId,
      name: entry.name,
      contentType: entry.contentType,
      size: entry.size,
      audio: audio.get(entry.fileId) ?? null,
    });

    const messages: TimelineMessage[] = [];
    const offersBySeq = new Map<number, typeof offers>();
    for (const offer of offers.reverse()) {
      const list = offersBySeq.get(offer.messageSeq) ?? [];
      list.push(offer);
      offersBySeq.set(offer.messageSeq, list);
    }
    for (const row of conversation) {
      // A tool result is shown on the call it answers, not as its own bubble.
      if (!row.replyToId) messages.push(this.conversationMessage(row, file));
      for (const offer of offersBySeq.get(row.seq) ?? []) {
        messages.push(this.offerMessage(offer));
        const quote = offer.quote;
        if (!quote) continue;
        const invocationId = quote.invocation?.id;
        messages.push(
          this.runMessage(
            offer,
            invocationId ? (events.get(invocationId) ?? []) : [],
            calls.filter((call) => call.invocationId === invocationId),
            revisions.filter((revision) => revision.invocationId === invocationId),
            file,
          ),
        );
      }
    }
    return { cursor: upTo.toString(), messages };
  }

  private async events(threadId: string, fence: bigint) {
    const byInvocation = new Map<string, { event: Json; createdAt: Date }[]>();
    let last = 0n;
    let total = 0;
    for (;;) {
      const batch = await this.db.aguiStreamEvent.findMany({
        where: { threadId, cursor: { gt: last, lte: fence } },
        orderBy: { cursor: "asc" },
        take: 1000,
        select: { cursor: true, invocationId: true, event: true, createdAt: true },
      });
      if (!batch.length) break;
      total += batch.length;
      if (total > HISTORY_LIMIT) throw new PayloadTooLargeError("THREAD_HISTORY_TOO_LARGE");
      for (const row of batch) {
        const list = byInvocation.get(row.invocationId) ?? [];
        list.push({ event: row.event, createdAt: row.createdAt });
        byInvocation.set(row.invocationId, list);
      }
      last = batch.at(-1)!.cursor;
    }
    return byInvocation;
  }

  private async audio(entries: FileManifestEntry[]) {
    const ids = entries
      .filter((entry) => entry.contentType.startsWith("audio/"))
      .map((entry) => entry.fileId);
    if (!ids.length) return new Map<string, AudioMeta>();
    const rows = await this.db.fileAsset.findMany({
      where: { id: { in: ids }, durationMs: { not: null } },
      select: { id: true, durationMs: true, peaks: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          durationMs: row.durationMs!,
          peaks: Array.isArray(row.peaks) ? (row.peaks as number[]) : null,
        },
      ]),
    );
  }

  private conversationMessage(
    row: Prisma.ThreadMessageGetPayload<{ include: { reply: true } }>,
    file: (entry: FileManifestEntry) => TimelinePart,
  ): TimelineMessage {
    const parts: TimelinePart[] = [];
    if (row.commandId)
      parts.push({
        type: "tool-call",
        toolCallId: `command-${row.id}`,
        toolName: "command",
        args: { commandId: row.commandId, arguments: row.arguments ?? {} },
        result: null,
        status: "done",
      });
    if (row.content)
      parts.push({
        type: "text",
        id: row.id,
        text: row.content,
        format: "plain",
        streaming: false,
      });
    if (row.tool) {
      const call = storedToolCall(row.tool);
      parts.push({
        type: "tool-call",
        toolCallId: row.id,
        toolName: call.name,
        args: call.args as unknown as Json,
        result: row.reply?.arguments ?? null,
        status: row.reply ? "done" : "open",
      });
    }
    parts.push(...(parseManifest(row.fileManifest) ?? []).map(file));
    return {
      id: row.id,
      role: row.role === "BUYER" ? "user" : "assistant",
      createdAt: row.createdAt,
      status: row.tool && !row.reply ? "requires-action" : "complete",
      parts,
      run: null,
    };
  }

  private offerMessage(offer: OfferRow): TimelineMessage {
    const status = offerStatus(offer);
    return {
      id: `offer-${offer.id}`,
      role: "assistant",
      createdAt: offer.createdAt,
      status: status === "OPEN" ? "requires-action" : "complete",
      parts: [
        {
          type: "tool-call",
          toolCallId: offer.id,
          toolName: "offer",
          args: {
            offerId: offer.id,
            summary: offer.summary,
            grossAmount: offer.grossAmount.toFixed(0),
            deliverySeconds: offer.deliverySeconds,
            expiresAt: offer.expiresAt.toISOString(),
            commandRevisionId: offer.commandRevisionId,
            command: offer.commandRevision.command,
            arguments: offer.arguments,
          },
          result: status === "OPEN" ? null : { status, quoteId: offer.quoteId },
          status: status === "OPEN" ? "open" : status === "ACCEPTED" ? "done" : "cancelled",
        },
      ],
      run: null,
    };
  }

  private runMessage(
    offer: OfferRow,
    events: { event: Json; createdAt: Date }[],
    calls: Prisma.InvocationToolCallGetPayload<{ include: { result: true } }>[],
    revisions: { id: string; reason: string; status: string; createdAt: Date }[],
    file: (entry: FileManifestEntry) => TimelinePart,
  ): TimelineMessage {
    const quote = offer.quote!;
    const invocation = quote.invocation;
    const settlement = invocation?.settlement?.state;
    const phase: RunPhase = !invocation
      ? quote.validUntil.getTime() > Date.now()
        ? "awaiting_payment"
        : "payment_expired"
      : !settlement || settlement === "PENDING"
        ? "payment_pending"
        : settlement !== "HELD"
          ? "payment_rejected"
          : execution[invocation.executionStatus];

    // Stream events and revision requests, in the order they happened.
    const timed: { at: number; index: number; part: TimelinePart }[] = [];
    const byId = new Map<string, number>();
    const put = (at: Date, part: TimelinePart, key: string) => {
      const index = byId.get(key);
      if (index === undefined) {
        byId.set(key, timed.length);
        timed.push({ at: at.getTime(), index: timed.length, part });
      } else timed[index].part = part;
    };
    const callById = new Map(calls.map((call) => [call.id, call]));
    for (const { event, createdAt } of events) {
      if (!object(event)) continue;
      const messageId = typeof event.messageId === "string" ? event.messageId : null;
      if (event.type === "TEXT_MESSAGE_START" && messageId)
        put(
          createdAt,
          { type: "text", id: messageId, text: "", format: "markdown", streaming: true },
          messageId,
        );
      else if (
        (event.type === "TEXT_MESSAGE_CONTENT" || event.type === "TEXT_MESSAGE_END") &&
        messageId &&
        byId.has(messageId)
      ) {
        const entry = timed[byId.get(messageId)!];
        if (entry.part.type !== "text") continue;
        entry.part =
          event.type === "TEXT_MESSAGE_END"
            ? { ...entry.part, streaming: false }
            : { ...entry.part, text: entry.part.text + String(event.delta ?? "") };
      } else if (event.type === "ACTIVITY_SNAPSHOT" && messageId && object(event.content)) {
        if (event.activityType === "openui-surface")
          put(
            createdAt,
            {
              type: "tool-call",
              toolCallId: messageId,
              toolName: "render_ui",
              args: event.content,
              result: null,
              status: "done",
            },
            messageId,
          );
        else if (event.activityType === "payvoke.progress" && "label" in event.content)
          put(
            createdAt,
            {
              type: "tool-call",
              toolCallId: messageId,
              toolName: "progress",
              args: event.content,
              result: null,
              status:
                event.content.status === "done"
                  ? "done"
                  : event.content.status === "failed"
                    ? "failed"
                    : "running",
            },
            messageId,
          );
      } else if (
        event.type === "CUSTOM" &&
        event.name === "payvoke.tool_call" &&
        object(event.value) &&
        typeof event.value.toolCallId === "string"
      ) {
        const call = callById.get(event.value.toolCallId);
        if (!call) continue;
        put(
          createdAt,
          {
            type: "tool-call",
            toolCallId: call.id,
            toolName: call.name,
            args: call.args,
            result: call.result?.result ?? null,
            status: call.status === "OPEN" ? "open" : "done",
          },
          call.id,
        );
      }
    }
    for (const revision of revisions)
      put(
        revision.createdAt,
        {
          type: "tool-call",
          toolCallId: revision.id,
          toolName: "revision",
          args: { reason: revision.reason },
          result: null,
          status: "done",
        },
        revision.id,
      );
    const parts = timed.sort((a, b) => a.at - b.at || a.index - b.index).map((item) => item.part);

    // Only a verified delivery is shown as the result.
    const result = phase === "delivered" ? invocation?.run?.result : null;
    if (object(result)) {
      const version = Number(result.artifactVersion) || 1;
      if (typeof result.output === "string")
        parts.push({
          type: "text",
          id: `output-${invocation!.id}-${version}`,
          text: result.output,
          format: "markdown",
          streaming: false,
        });
      else if (result.output !== undefined)
        parts.push({
          type: "tool-call",
          toolCallId: `output-${invocation!.id}-${version}`,
          toolName: "result",
          args: { output: result.output ?? null, artifactVersion: version },
          result: null,
          status: "done",
        });
      parts.push(...(parseManifest(result.files) ?? []).map(file));
    }

    const document = quote.document as Record<string, unknown>;
    const terms = object(document.termsSnapshot) ? document.termsSnapshot.definition : undefined;
    return {
      id: runMessageId(quote.invocationId),
      role: "assistant",
      createdAt: quote.createdAt,
      status: runStatus[phase],
      parts,
      run: {
        invocationId: quote.invocationId,
        quoteId: quote.id,
        offerId: offer.id,
        grossAmount: offer.grossAmount.toFixed(0),
        phase,
        revisions: {
          used: revisions.length,
          included: revisionPolicy(terms)?.maxIncluded ?? 0,
        },
      },
    };
  }
}

type OfferRow = Prisma.OfferGetPayload<{
  include: {
    commandRevision: { select: { command: { select: { id: true; name: true } } } };
    quote: {
      include: {
        invocation: { include: { settlement: { select: { state: true } }; run: true } };
      };
    };
  };
}>;
