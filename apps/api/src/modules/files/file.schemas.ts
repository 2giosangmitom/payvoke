import { z } from "zod";
import { id } from "../schemas";

// Downloads are attachments, so the allowlist bounds what a buyer or provider
// can hand the other side. Only audio and images also get an inline URL, for
// the chat's player and previews; none of these types can run script.
export const CONTENT_TYPES = [
  "application/pdf",
  "application/json",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/flac",
  "audio/aac",
  "video/mp4",
] as const;

const upload = {
  name: z
    .string()
    .min(1)
    .max(255)
    // Control characters and path separators never reach a stored filename.
    // oxlint-disable-next-line no-control-regex
    .regex(/^[^\x00-\x1f\x7f/\\]+$/),
  contentType: z.enum(CONTENT_TYPES),
  size: z.number().int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  clientRequestId: id,
  // Audio only: what the player draws. Up to six hours, up to 256 peaks in 0..1.
  audio: z
    .object({
      durationMs: z.number().int().min(1).max(21_600_000),
      peaks: z.array(z.number().min(0).max(1)).max(256).optional(),
    })
    .strict()
    .optional(),
};

export const providerUploadBody = z.object(upload).strict();
export const buyerUploadBody = z.object({ ...upload, threadId: id }).strict();
export type UploadBody = z.infer<typeof providerUploadBody>;
export type BuyerUploadBody = z.infer<typeof buyerUploadBody>;
