import { z } from "zod";

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

export const answerBody = z.object({
  questionId: identifier,
  arguments: object,
  clientRequestId: identifier,
});

export const revisionBody = z.object({
  reason: z
    .string()
    .max(2000)
    .refine((reason) => reason.trim().length > 0),
  clientRequestId: identifier,
});

export const feedQuery = z.object({ once: z.string().optional() });
