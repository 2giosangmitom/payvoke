import { z } from "zod";
import { fileManifestEntry } from "../files/file.schemas";
import { toolCall } from "../tools/tool.schemas";

const object = z.record(z.string(), z.unknown());
const identifier = z.string().regex(/^[\w-]{1,128}$/);

export const ackBody = z.object({ eventId: z.string().max(128).optional() });

// The service checks the sequence and the per-type report data.
export const reportBody = z.object({
  reportId: identifier,
  sequence: z.number(),
  type: z.string(),
  data: object.optional(),
});

export const revisionBody = z.object({
  reason: z
    .string()
    .max(2000)
    .refine((reason) => reason.trim().length > 0),
  clientRequestId: identifier,
});

export const feedQuery = z.object({ once: z.string().optional() });

// Documented feed, report and stream shapes (http/openapi.ts). The service
// checks each report's data by type; these mirror run-rules.ts.
const executionStatus = z.enum([
  "NOT_STARTED",
  "QUEUED",
  "ACKED",
  "RUNNING",
  "WAITING_BUYER",
  "VERIFYING",
  "DELIVERED",
  "FAILED",
]);

const conversationEntry = z
  .object({
    seq: z.number().int(),
    role: z.enum(["BUYER", "PROVIDER"]),
    content: z.string(),
    commandId: z.string().nullable(),
    arguments: z.unknown(),
    files: z.array(fileManifestEntry),
    tool: toolCall.optional(),
    replyToId: z.string().optional(),
  })
  .meta({ id: "ConversationEntry" });

export const threadMessageEvent = z
  .object({
    type: z.literal("thread.message"),
    threadId: z.string(),
    messageId: z.string().meta({ description: "Acknowledge with the message ACK route." }),
    seq: z.number().int(),
    content: z.string(),
    commandId: z.string().nullable(),
    arguments: z.unknown().meta({ description: "Slash-command arguments, or null." }),
    toolResult: z
      .object({ toolCallId: z.string(), result: z.unknown() })
      .nullable()
      .meta({ description: "The buyer's answer to a tool you opened before payment." }),
    files: z.array(fileManifestEntry),
    conversation: z
      .array(conversationEntry)
      .meta({ description: "The last 30 messages of the thread, oldest first." }),
  })
  .meta({
    id: "ThreadMessageEvent",
    description: "A free pre-sale message or slash command from a buyer.",
  });

export const invocationReadyEvent = z
  .object({
    type: z.literal("invocation.ready"),
    invocationId: z.string(),
    runId: z.string(),
    threadId: z.string(),
    input: z
      .object({
        schemaVersion: z.number().int(),
        sessionId: z.string(),
        commandId: z.string(),
        arguments: z.record(z.string(), z.unknown()),
        context: z.object({
          messages: z.unknown(),
          files: z.array(fileManifestEntry),
        }),
        offer: z.record(z.string(), z.unknown()).optional(),
      })
      .loose()
      .meta({ description: "The paid input, frozen and hashed into the quote." }),
  })
  .meta({
    id: "InvocationReadyEvent",
    description:
      "A buyer paid and the hold is final on Avalanche. Acknowledge it, then start the run.",
  });

export const invocationToolResultEvent = z
  .object({
    type: z.literal("invocation.tool_result"),
    invocationId: z.string(),
    runId: z.string().meta({ description: "The new run to acknowledge and continue in." }),
    threadId: z.string(),
    resultId: z.string(),
    toolCallId: z.string(),
    name: z.enum(["ask_form", "ask_choice", "confirm"]),
    result: z.unknown(),
  })
  .meta({
    id: "InvocationToolResultEvent",
    description: "The buyer answered a `tool_call` report.",
  });

export const revisionRequestedEvent = z
  .object({
    type: z.literal("invocation.revision_requested"),
    invocationId: z.string(),
    runId: z.string(),
    threadId: z.string(),
    revisionId: z.string(),
    reason: z.string(),
    targetArtifactVersion: z.number().int(),
  })
  .meta({ id: "RevisionRequestedEvent", description: "The buyer asked for an in-scope revision." });

export const feedEvent = z
  .discriminatedUnion("type", [
    threadMessageEvent,
    invocationReadyEvent,
    invocationToolResultEvent,
    revisionRequestedEvent,
  ])
  .meta({ id: "FeedEvent" });

export const feedSnapshot = z
  .object({
    events: z.array(
      z.intersection(
        z.object({ id: z.string().meta({ description: "The event id to acknowledge." }) }),
        feedEvent,
      ),
    ),
  })
  .meta({ id: "FeedSnapshot" });

export const ackView = z
  .object({ invocationId: z.string(), runId: z.string(), status: executionStatus })
  .meta({ id: "RunAck" });

const reportBase = { reportId: identifier, sequence: z.number().int().min(1).max(1_000_000) };
export const reportDoc = z
  .discriminatedUnion("type", [
    z.object({ ...reportBase, type: z.literal("started"), data: object.optional() }),
    z.object({
      ...reportBase,
      type: z.literal("progress"),
      data: z.object({
        stepId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
        label: z.string().min(1).max(120),
        status: z.enum(["running", "done", "failed"]).optional(),
        detail: z.string().max(500).optional(),
      }),
    }),
    z.object({
      ...reportBase,
      type: z.literal("tool_call"),
      data: z.intersection(
        z.object({ toolCallId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }),
        toolCall,
      ),
    }),
    z.object({
      ...reportBase,
      type: z.literal("result"),
      data: z.object({
        artifactVersion: z
          .number()
          .int()
          .min(1)
          .meta({ description: "Must grow with every result of the invocation." }),
        output: z.unknown().optional().meta({
          description:
            "Markdown text (up to 64 KiB) or any JSON. Required when there are no files.",
        }),
        files: z
          .array(z.object({ fileId: z.string() }))
          .meta({ description: "READY artifacts uploaded for this invocation." }),
      }),
    }),
    z.object({ ...reportBase, type: z.literal("failed"), data: object.optional() }),
  ])
  .meta({
    id: "Report",
    description:
      "One step of a run. Sequences start at 1 per run and grow by one; a retried report with the same id, sequence and data replays its answer.",
  });

export const reportAck = z
  .object({
    lastCommittedSequence: z.number().int(),
    executionStatus: executionStatus.optional().meta({ description: "Absent on a replay." }),
  })
  .meta({ id: "ReportAck" });

export const streamCursor = z
  .object({ runId: z.string(), lastCommittedSequence: z.number().int() })
  .meta({ id: "StreamCursor" });

export const aguiEvent = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("TEXT_MESSAGE_START"),
      messageId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      role: z.literal("assistant"),
    }),
    z.object({
      type: z.literal("TEXT_MESSAGE_CONTENT"),
      messageId: z.string(),
      delta: z.string().min(1).max(4096),
    }),
    z.object({ type: z.literal("TEXT_MESSAGE_END"), messageId: z.string() }),
    z.object({
      type: z.literal("CUSTOM"),
      name: z.literal("payvoke.openui"),
      value: z.object({
        surfaceId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
        source: z.string().meta({ description: "An OpenUI Lang patch for the surface." }),
      }),
    }),
  ])
  .meta({ id: "AguiEvent", description: "The AG-UI events a provider may stream." });

export const streamLine = z
  .object({
    streamSequence: z.number().int().min(1).max(1_000_000),
    event: aguiEvent,
  })
  .meta({
    id: "StreamLine",
    description:
      "One NDJSON line. Sequences grow by one per run; resend from the cursor after a dropped connection.",
  });
