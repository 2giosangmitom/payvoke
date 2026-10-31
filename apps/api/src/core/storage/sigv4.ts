import { CryptoHasher } from "bun";

// AWS Signature V4 for the two S3 requests Bun's S3Client cannot make: a
// presigned PUT that signs Content-Length (so S3 rejects any other size) and
// a server-side CopyObject. Everything else goes through Bun.S3Client.

export type SignerOptions = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

// Neither payload is hashed: presigned uploads cannot know it, and CopyObject has none.
const UNSIGNED = "UNSIGNED-PAYLOAD";

const hmac = (key: string | Uint8Array, data: string) =>
  new CryptoHasher("sha256", key).update(data).digest() as Uint8Array;
const sha256Hex = (data: string) => new CryptoHasher("sha256").update(data).digest("hex");

// RFC 3986 encoding, as SigV4 requires; `/` stays literal inside a key.
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
export const encodeKey = (key: string) => key.split("/").map(encode).join("/");

export class S3Signer {
  constructor(private readonly options: SignerOptions) {}

  // The object's URL; an empty key addresses the bucket itself.
  url(key: string) {
    const { endpoint, bucket, forcePathStyle } = this.options;
    const base = new URL(endpoint);
    if (forcePathStyle) base.pathname = `/${encode(bucket)}/${encodeKey(key)}`;
    else {
      base.hostname = `${bucket}.${base.hostname}`;
      base.pathname = `/${encodeKey(key)}`;
    }
    return base;
  }

  private scope(now: Date) {
    const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const day = stamp.slice(0, 8);
    return { stamp, day, scope: `${day}/${this.options.region}/s3/aws4_request` };
  }

  private signature(day: string, stamp: string, scope: string, canonical: string) {
    const { secretAccessKey, region } = this.options;
    const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"), "aws4_request");
    const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonical)].join("\n");
    return new CryptoHasher("sha256", key).update(toSign).digest("hex");
  }

  // Lowercase names; `host` is always signed.
  private canonical(method: string, url: URL, headers: Record<string, string>) {
    const all: Record<string, string> = { ...headers, host: url.host };
    const names = Object.keys(all)
      .map((name) => name.toLowerCase())
      .sort();
    const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), v]));
    const query = [...url.searchParams]
      .map(([k, v]) => [encode(k), encode(v)])
      .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const signed = names.join(";");
    return {
      signed,
      text: [
        method,
        url.pathname,
        query,
        names.map((name) => `${name}:${lower[name].trim()}`).join("\n") + "\n",
        signed,
        UNSIGNED,
      ].join("\n"),
    };
  }

  // A URL the client replays with exactly these headers.
  presign(method: string, key: string, headers: Record<string, string>, expiresIn: number) {
    const url = this.url(key);
    const { stamp, day, scope } = this.scope(new Date());
    const names = [...Object.keys(headers).map((name) => name.toLowerCase()), "host"].sort();
    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set("X-Amz-Content-Sha256", UNSIGNED);
    url.searchParams.set("X-Amz-Credential", `${this.options.accessKeyId}/${scope}`);
    url.searchParams.set("X-Amz-Date", stamp);
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    url.searchParams.set("X-Amz-SignedHeaders", names.join(";"));
    const { text } = this.canonical(method, url, headers);
    url.searchParams.set("X-Amz-Signature", this.signature(day, stamp, scope, text));
    return url.href;
  }

  // A header-signed request, sent now.
  fetch(method: string, key: string, headers: Record<string, string> = {}) {
    const url = this.url(key);
    const { stamp, day, scope } = this.scope(new Date());
    const all = { ...headers, "x-amz-content-sha256": UNSIGNED, "x-amz-date": stamp };
    const { signed, text } = this.canonical(method, url, all);
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signed}, Signature=${this.signature(day, stamp, scope, text)}`;
    return fetch(url, { method, headers: { ...all, authorization } });
  }
}
