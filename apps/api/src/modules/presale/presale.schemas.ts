import { z } from "zod";

// Field shapes only; the presale service checks lengths, command arguments
// and offer bounds and owns the public codes for those.
const requestId = z.string().regex(/^[\w-]{1,128}$/);

export const buyerMessageBody = z.object({
  content: z.string().optional(),
  commandId: z.string().optional(),
  arguments: z.unknown().optional(),
  // Answers a provider form instead of naming a command.
  replyToId: z.string().optional(),
  fileIds: z.array(z.string()).optional(),
  clientRequestId: requestId,
});

export const providerMessageBody = z.object({
  content: z.string(),
  form: z.unknown().optional(),
  clientRequestId: requestId,
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
