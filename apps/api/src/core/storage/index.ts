import { createHash } from "node:crypto";
import { CryptoHasher, S3Client } from "bun";
import type { z } from "zod";
import { envBoolean, envString, isPrivateServiceUrl, isSafeServiceUrl } from "#core/runtime";
import { encodeKey, S3Signer } from "./sigv4";

// A presigned request the uploader replays exactly: the signed headers are
// part of the signature, so a different type or length is rejected by S3.
export type UploadTarget = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
};
export type DownloadTarget = { url: string; expiresAt: Date };

// The few S3 operations Payvoke relies on. Any S3-compatible provider works;
// nothing here is specific to one vendor.
export interface ObjectStorage {
  presignPut(
    key: string,
    object: { contentType: string; size: number },
    expiresInSeconds: number,
  ): Promise<UploadTarget>;
  // `inline` lets a browser play or show the object instead of saving it.
  presignGet(
    key: string,
    object: { filename: string; contentType: string; inline?: boolean },
    expiresInSeconds: number,
  ): Promise<DownloadTarget>;
  // Null when the object does not exist.
  head(key: string): Promise<{ size: number } | null>;
  copy(from: string, to: string): Promise<void>;
  // Server-side write of small objects the API already holds (agent images).
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  // Lowercase hex SHA-256 of the stored bytes, or null when missing.
  sha256(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  // Every object with its last-modified time, for orphan cleanup.
  list(): AsyncIterable<{ key: string; lastModified: Date }>;
}

// Shared env fields. Required ones are optional here and enforced by
// `createStorage` only when files are enabled, so other deployments start.
export const storageEnv = {
  FILES_ENABLED: envBoolean().default(false),
  S3_ENDPOINT: envString().optional(),
  // Presigned URLs must be reachable by browsers and providers; defaults to S3_ENDPOINT.
  S3_PUBLIC_ENDPOINT: envString().optional(),
  S3_REGION: envString().optional(),
  S3_BUCKET: envString().optional(),
  S3_ACCESS_KEY_ID: envString().optional(),
  S3_SECRET_ACCESS_KEY: envString().optional(),
  S3_FORCE_PATH_STYLE: envBoolean().default(false),
};
export type StorageEnv = z.output<z.ZodObject<typeof storageEnv>>;

// The server-side endpoint may be a private service name (`http://rustfs:9000`);
// the public endpoint is fetched by browsers and stays https or loopback.
const endpoint = (value: string | undefined, { allowPrivate = false } = {}) => {
  if (!value) return undefined;
  const url = new URL(value);
  const safe = allowPrivate ? isPrivateServiceUrl(url) : isSafeServiceUrl(url);
  if (!safe || url.search || url.pathname !== "/")
    throw new Error("S3 endpoint must be an https origin (http only on loopback)");
  return url.origin;
};

// Null when files are disabled; throws on incomplete configuration so startup fails.
export function createStorage(env: StorageEnv): ObjectStorage | null {
  if (!env.FILES_ENABLED) return null;
  const { S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  const server = endpoint(env.S3_ENDPOINT, { allowPrivate: true });
  if (!server || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    throw new Error("Files require S3 endpoint, region, bucket and credentials");
  const credentials = {
    region: S3_REGION,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  };
  const publicEndpoint = endpoint(env.S3_PUBLIC_ENDPOINT) ?? server;
  const client = (at: string) =>
    new S3Client({ ...credentials, endpoint: at, virtualHostedStyle: !env.S3_FORCE_PATH_STYLE });
  const signer = (at: string) =>
    new S3Signer({ ...credentials, endpoint: at, forcePathStyle: env.S3_FORCE_PATH_STYLE });
  return new S3Storage(
    { client: client(server), signer: signer(server) },
    { client: client(publicEndpoint), signer: signer(publicEndpoint) },
    S3_BUCKET,
  );
}

const missing = (error: unknown) => {
  const e = error as { code?: string; name?: string };
  return e?.code === "NoSuchKey" || e?.code === "NotFound" || e?.name === "NoSuchKey";
};

// RFC 6266 disposition with an ASCII fallback.
export function attachment(filename: string, type: "attachment" | "inline" = "attachment") {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

type Endpoint = { client: S3Client; signer: S3Signer };

export class S3Storage implements ObjectStorage {
  constructor(
    private readonly server: Endpoint,
    // Same credentials, public endpoint: used only to sign URLs.
    private readonly browser: Endpoint,
    private readonly bucket: string,
  ) {}

  async presignPut(key: string, object: { contentType: string; size: number }, expiresIn: number) {
    // Content-Length is signed, so S3 rejects a body of any other size.
    const url = this.browser.signer.presign(
      "PUT",
      key,
      { "content-type": object.contentType, "content-length": String(object.size) },
      expiresIn,
    );
    return {
      url,
      method: "PUT" as const,
      headers: { "Content-Type": object.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async presignGet(
    key: string,
    object: { filename: string; contentType: string; inline?: boolean },
    expiresIn: number,
  ) {
    const url = this.browser.client.presign(key, {
      expiresIn,
      type: object.contentType,
      contentDisposition: attachment(object.filename, object.inline ? "inline" : "attachment"),
    });
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async head(key: string) {
    try {
      return { size: (await this.server.client.stat(key)).size };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async copy(from: string, to: string) {
    const response = await this.server.signer.fetch("PUT", to, {
      "x-amz-copy-source": `/${this.bucket}/${encodeKey(from)}`,
    });
    const body = await response.text();
    // CopyObject can fail after a 200 status, with the error in the body.
    if (!response.ok || body.includes("<Error>"))
      throw Object.assign(new Error("S3 copy failed"), {
        name: /<Code>NoSuchKey<\/Code>/.test(body) ? "NoSuchKey" : "S3Error",
        status: response.status,
      });
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.server.client.write(key, bytes, { type: contentType });
  }

  async sha256(key: string) {
    try {
      const hash = new CryptoHasher("sha256");
      for await (const chunk of this.server.client.file(key).stream()) hash.update(chunk);
      return hash.digest("hex");
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async delete(key: string) {
    await this.server.client.delete(key);
  }

  async *list() {
    let continuationToken: string | undefined;
    do {
      const page = await this.server.client.list({ continuationToken, maxKeys: 1000 });
      for (const object of page.contents ?? [])
        yield { key: object.key, lastModified: new Date(object.lastModified ?? 0) };
      continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
    } while (continuationToken);
  }
}

// In-process store for tests. `put` stands in for the client's presigned PUT.
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, Buffer>();

  async put(key: string, bytes: Uint8Array | string, _contentType?: string) {
    this.objects.set(key, Buffer.from(bytes));
  }

  async presignPut(key: string, object: { contentType: string }, expiresIn: number) {
    return {
      url: `memory://put/${key}`,
      method: "PUT" as const,
      headers: { "Content-Type": object.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async presignGet(key: string, _object: unknown, expiresIn: number) {
    return { url: `memory://get/${key}`, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async head(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? { size: bytes.length } : null;
  }

  async copy(from: string, to: string) {
    const bytes = this.objects.get(from);
    if (!bytes) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
    this.objects.set(to, Buffer.from(bytes));
  }

  async sha256(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  readonly modified = new Map<string, Date>();
  async *list() {
    for (const key of this.objects.keys())
      yield { key, lastModified: this.modified.get(key) ?? new Date(0) };
  }
}
