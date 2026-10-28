import { call, client, type Body } from "@/src/lib/api/client";

export type ThreadFile = Body<(typeof client.v1.files)[":fileId"]["completions"]["$post"]>;
export type AudioMeta = { durationMs: number; peaks: number[] };

// Mirrors the API allowlist; anything else is refused before hashing.
export const ACCEPTED_FILE_TYPES: string[] = [
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
];

type AcceptedFileType = Parameters<typeof client.v1.files.$post>[0]["json"]["contentType"];

const PEAKS = 96;

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The player draws what the uploader measured: the length and a waveform of
// the loudest sample in each of PEAKS equal slices, scaled to 0..1. Decoding
// happens on the local copy, so the stored file never needs CORS to be drawn.
async function audioMeta(bytes: ArrayBuffer): Promise<AudioMeta | undefined> {
  if (typeof AudioContext === "undefined") return undefined;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(bytes.slice(0));
    const channel = buffer.getChannelData(0);
    const slice = Math.max(1, Math.floor(channel.length / PEAKS));
    const raw: number[] = [];
    for (let start = 0; start < channel.length && raw.length < PEAKS; start += slice) {
      let peak = 0;
      for (let index = start; index < Math.min(start + slice, channel.length); index += 16)
        peak = Math.max(peak, Math.abs(channel[index]));
      raw.push(peak);
    }
    const loudest = Math.max(...raw, 0.0001);
    return {
      durationMs: Math.max(1, Math.round(buffer.duration * 1000)),
      peaks: raw.map((peak) => Math.round((peak / loudest) * 1000) / 1000),
    };
  } catch {
    // A format this browser cannot decode still uploads, with no waveform.
    return undefined;
  } finally {
    void context.close();
  }
}

// Declares size and digest, PUTs the bytes straight to storage, then asks the
// API to verify them. Only a READY file can be attached to a quote.
export async function uploadThreadFile(threadId: string, file: File): Promise<ThreadFile> {
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) throw new Error("Unsupported file type.");
  const bytes = await file.arrayBuffer();
  const audio = file.type.startsWith("audio/") ? await audioMeta(bytes) : undefined;
  const requested = await call(
    client.v1.files.$post({
      json: {
        threadId,
        name: file.name,
        contentType: file.type as AcceptedFileType,
        size: file.size,
        sha256: await sha256Hex(bytes),
        clientRequestId: crypto.randomUUID(),
        ...(audio ? { audio } : {}),
      },
    }),
  );
  if (requested.upload) {
    const { url, method, headers } = requested.upload;
    const put = await fetch(url, { method, headers, body: file });
    if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
  }
  const verified = await call(
    client.v1.files[":fileId"].completions.$post({ param: { fileId: requested.file.id } }),
  );
  if (verified.status !== "READY") throw new Error(verified.rejectionCode ?? "UPLOAD_REJECTED");
  return verified;
}

// Each download is re-authorized; the signed URL is short-lived and not cached.
export const downloadFile = async (fileId: string) => {
  const { url } = await call(client.v1.files[":fileId"].download.$get({ param: { fileId } }));
  window.location.assign(url);
};

// An inline URL for the player or an image preview; audio and images only.
export const streamFile = (fileId: string) =>
  call(client.v1.files[":fileId"].stream.$get({ param: { fileId } }));

export const formatBytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1048576).toFixed(1)} MB`;
