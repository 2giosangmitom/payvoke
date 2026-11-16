import { createHash, randomUUID } from "node:crypto";
import { PayvokeError, apiError } from "./errors";
import { transport } from "./fetch";
import { readBody, type FetchLike } from "./session";
import type { FileInput } from "./types";

const bytesOf = async (data: FileInput["data"]) =>
  data instanceof Uint8Array
    ? data
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(await data.arrayBuffer());

// Stages one buyer input for an instant purchase: declare size and SHA-256,
// PUT the bytes to the presigned URL, then let the API verify its own copy.
// The file has no thread yet; the purchase that names it binds it, once.
export async function uploadFile(
  http: FetchLike,
  raw: FetchLike,
  url: (path: string) => string,
  file: FileInput,
): Promise<string> {
  const bytes = await bytesOf(file.data);
  const call = async (path: string, json?: unknown) => {
    const response = await transport(http, url(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(json ?? {}),
    });
    const body = await readBody(response);
    if (response.status >= 400) throw apiError(response.status, body);
    return body as Record<string, any>;
  };
  const requested = await call("/v1/files", {
    name: file.name,
    contentType: file.contentType,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    clientRequestId: randomUUID(),
  });
  const fileId = requested?.file?.id;
  if (typeof fileId !== "string") throw new PayvokeError("INVALID_RESPONSE", 200, requested);
  if (requested.upload) {
    // Straight to storage: not the API origin, so no session or token.
    const put = await transport(raw, requested.upload.url, {
      method: requested.upload.method,
      headers: requested.upload.headers,
      body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
    });
    if (!put.ok) throw new PayvokeError("UPLOAD_REJECTED", put.status, await readBody(put));
  }
  const verified = await call(`/v1/files/${encodeURIComponent(fileId)}/completions`);
  if (verified?.status !== "READY") throw new PayvokeError("UPLOAD_REJECTED", 200, verified);
  return fileId;
}
