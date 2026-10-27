import { api } from "./api";

export type ThreadFile = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  status: "AWAITING_UPLOAD" | "READY" | "REJECTED" | "EXPIRED";
  rejectionCode: string | null;
};
type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> };

// Mirrors the API allowlist; anything else is refused before hashing.
export const ACCEPTED_FILE_TYPES = [
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
];

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Declares size and digest, PUTs the bytes straight to storage, then asks the
// API to verify them. Only a READY file can be attached to a quote.
export async function uploadThreadFile(threadId: string, file: File): Promise<ThreadFile> {
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) throw new Error("Unsupported file type.");
  const requested = await api<{ file: ThreadFile; upload: UploadTarget | null }>(
    "/v1/files",
    "POST",
    {
      threadId,
      name: file.name,
      contentType: file.type,
      size: file.size,
      sha256: await sha256Hex(file),
      clientRequestId: crypto.randomUUID(),
    },
  );
  if (requested.upload) {
    const { url, method, headers } = requested.upload;
    const put = await fetch(url, { method, headers, body: file });
    if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
  }
  const verified = await api<ThreadFile>(
    `/v1/files/${encodeURIComponent(requested.file.id)}/completions`,
    "POST",
    {},
  );
  if (verified.status !== "READY") throw new Error(verified.rejectionCode ?? "UPLOAD_REJECTED");
  return verified;
}

// Each download is re-authorized; the signed URL is short-lived and not cached.
export const downloadFile = async (fileId: string) => {
  const { url } = await api<{ url: string }>(`/v1/files/${encodeURIComponent(fileId)}/download`);
  window.location.assign(url);
};

export const formatBytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1048576).toFixed(1)} MB`;
