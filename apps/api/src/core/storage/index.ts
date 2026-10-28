import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Type, type Static } from "typebox";
import { isPrivateServiceUrl, isSafeServiceUrl } from "#core/runtime";

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
  presignGet(
    key: string,
    object: { filename: string; contentType: string },
    expiresInSeconds: number,
  ): Promise<DownloadTarget>;
  // Null when the object does not exist.
  head(key: string): Promise<{ size: number } | null>;
  copy(from: string, to: string): Promise<void>;
  // Lowercase hex SHA-256 of the stored bytes, or null when missing.
  sha256(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

// Shared env fields. Required ones are optional here and enforced by
// `createStorage` only when files are enabled, so other deployments start.
export const storageEnv = {
  FILES_ENABLED: Type.Boolean({ default: false }),
  S3_ENDPOINT: Type.Optional(Type.String()),
  // Presigned URLs must be reachable by browsers and providers; defaults to S3_ENDPOINT.
  S3_PUBLIC_ENDPOINT: Type.Optional(Type.String()),
  S3_REGION: Type.Optional(Type.String()),
  S3_BUCKET: Type.Optional(Type.String()),
  S3_ACCESS_KEY_ID: Type.Optional(Type.String()),
  S3_SECRET_ACCESS_KEY: Type.Optional(Type.String()),
  S3_FORCE_PATH_STYLE: Type.Boolean({ default: false }),
};
const storageEnvSchema = Type.Object(storageEnv);
export type StorageEnv = Static<typeof storageEnvSchema>;

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
  const options = {
    region: S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    // Default CRC checksums would leak into presigned URLs and are not
    // implemented by every S3-compatible store.
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  };
  return new S3Storage(
    new S3Client({ ...options, endpoint: server }),
    new S3Client({ ...options, endpoint: endpoint(env.S3_PUBLIC_ENDPOINT) ?? server }),
    S3_BUCKET,
  );
}

const missing = (error: unknown) => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
};

// RFC 6266 attachment with an ASCII fallback; downloads are never inline.
export function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export class S3Storage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    // Same credentials, public endpoint: used only to sign URLs.
    private readonly signer: S3Client,
    private readonly bucket: string,
  ) {}

  async presignPut(key: string, object: { contentType: string; size: number }, expiresIn: number) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: object.contentType,
      ContentLength: object.size,
    });
    const url = await getSignedUrl(this.signer, command, {
      expiresIn,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return {
      url,
      method: "PUT" as const,
      headers: { "Content-Type": object.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async presignGet(
    key: string,
    object: { filename: string; contentType: string },
    expiresIn: number,
  ) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: object.contentType,
      ResponseContentDisposition: attachment(object.filename),
    });
    const url = await getSignedUrl(this.signer, command, { expiresIn });
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async head(key: string) {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0 };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async copy(from: string, to: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: to,
        CopySource: `${this.bucket}/${from.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
  }

  async sha256(key: string) {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const hash = createHash("sha256");
      for await (const chunk of object.Body as Readable) hash.update(chunk as Buffer);
      return hash.digest("hex");
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// In-process store for tests. `put` stands in for the client's presigned PUT.
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, Buffer>();

  put(key: string, bytes: Buffer | string) {
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
}
