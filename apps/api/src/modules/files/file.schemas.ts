import { id } from "../quotes/quote.schemas";

export type UploadBody = {
  name: string;
  contentType: string;
  size: number;
  sha256: string;
  clientRequestId: string;
};
export type BuyerUploadBody = UploadBody & { threadId: string };

// Downloads are always attachments, so the allowlist bounds what a buyer or
// provider can hand the other side, not how a browser renders it.
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
  "video/mp4",
] as const;

const upload = {
  name: { type: "string", minLength: 1, maxLength: 255, pattern: "^[^\\x00-\\x1f\\x7f/\\\\]+$" },
  contentType: { type: "string", enum: CONTENT_TYPES },
  size: { type: "integer", minimum: 1 },
  sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
  clientRequestId: id,
} as const;

export const providerUploadSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["name", "contentType", "size", "sha256", "clientRequestId"],
    properties: upload,
  },
};

export const buyerUploadSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["threadId", "name", "contentType", "size", "sha256", "clientRequestId"],
    properties: { ...upload, threadId: id },
  },
};
