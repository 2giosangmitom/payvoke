import { z } from "zod";
import { fileManifestEntry } from "../files/file.schemas";
import { timestamp, usdcAmount } from "../schemas";
import { toolCall } from "../tools/tool.schemas";

// Field shapes only; the presale service checks lengths, command arguments
// and offer bounds and owns the public codes for those.
const requestId = z.string().regex(/^[\w-]{1,128}$/);

export const buyerMessageBody = z.object({
  content: z.string().optional(),
  commandId: z.string().optional(),
  arguments: z.unknown().optional(),
  fileIds: z.array(z.string()).optional(),
  clientRequestId: requestId,
});

// `tool` opens a built-in tool ({name, args}); its text is then optional.
export const providerMessageBody = z.object({
  content: z.string().optional(),
  tool: z.unknown().optional(),
  streaming: z.boolean().optional(),
  clientRequestId: requestId,
});

export const messageDeltaBody = z.object({
  sequence: z.number().int().min(1),
  delta: z.string().max(4000),
  done: z.boolean().optional(),
});

export const offerBody = z.object({
  clientRequestId: requestId,
  commandId: z.string().optional(),
  arguments: z.unknown().optional(),
  // Atomic USDC as an integer string.
  grossAmount: z.string().regex(/^[1-9]\d*$/),
  deliverySeconds: z.number().int().positive().optional(),
  summary: z.string(),
  validForSeconds: z.number().int().positive().optional(),
});

export const toolResultBody = z.object({
  toolCallId: z.string().max(128),
  result: z.unknown(),
  clientRequestId: requestId,
});

// Documented requests and views (http/openapi.ts).
export const providerMessageDoc = z
  .object({
    content: z.string().max(4000).optional().meta({
      description: "Markdown text. Optional when `tool` carries its own prompt.",
    }),
    tool: toolCall.optional(),
    streaming: z.boolean().optional().meta({
      description:
        "Opens a reply that streams in: `content` may be empty, and text is added with message deltas until one has `done: true`.",
    }),
    clientRequestId: requestId.meta({
      description: "Idempotency key: a retry with the same id returns the first message.",
    }),
  })
  .meta({ id: "ProviderMessage" });

export const messageDeltaDoc = z
  .object({
    sequence: z.number().int().min(1).meta({
      description:
        "1 for the first delta of the message, then one more each time. A retried sequence is applied once.",
    }),
    delta: z.string().max(4000).meta({ description: "Markdown text to append. May be empty." }),
    done: z.boolean().optional().meta({ description: "Closes the reply." }),
  })
  .meta({ id: "MessageDelta" });

export const offerDoc = z
  .object({
    clientRequestId: requestId.meta({ description: "Idempotency key, unique per app." }),
    commandId: z
      .string()
      .optional()
      .meta({ description: "Defaults to the app's default command." }),
    arguments: z.record(z.string(), z.unknown()).optional().meta({
      description: "Arguments for the command's input schema, frozen into the quote.",
    }),
    grossAmount: usdcAmount.meta({
      description:
        "The price in atomic USDC. At least the deployment floor, at most the command's `maxAmount`.",
    }),
    deliverySeconds: z.number().int().positive().optional().meta({
      description: "May only shorten the command's delivery time.",
    }),
    summary: z.string().min(1).max(2000).meta({ description: "What the buyer gets." }),
    validForSeconds: z.number().int().min(60).max(86400).optional().meta({
      description: "Offer lifetime. Defaults to 3600.",
    }),
  })
  .meta({ id: "OfferRequest" });

export const messageView = z
  .object({
    id: z.string(),
    seq: z.number().int(),
    role: z.enum(["BUYER", "PROVIDER", "SYSTEM"]),
    content: z.string(),
    commandId: z.string().nullable(),
    arguments: z.unknown(),
    files: z.array(fileManifestEntry),
    tool: toolCall.nullable(),
    replyToId: z.string().nullable(),
    streaming: z.boolean().meta({ description: "True while a streamed reply is still open." }),
    createdAt: timestamp,
  })
  .meta({ id: "Message" });

export const offerView = z
  .object({
    id: z.string(),
    threadId: z.string(),
    commandRevisionId: z.string(),
    arguments: z.unknown(),
    grossAmount: usdcAmount,
    deliverySeconds: z.number().int(),
    summary: z.string(),
    messageSeq: z.number().int(),
    conversationHash: z.string(),
    status: z.enum(["OPEN", "ACCEPTED", "DECLINED", "WITHDRAWN", "SUPERSEDED", "EXPIRED"]),
    expiresAt: timestamp,
    quoteId: z.string().nullable(),
    createdAt: timestamp,
  })
  .meta({ id: "Offer" });
