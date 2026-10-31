import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { it } from "bun:test";
import { attachment, createStorage, MemoryStorage } from "#core/storage";
import { S3Signer } from "../../src/core/storage/sigv4";

const complete = {
  FILES_ENABLED: true,
  S3_ENDPOINT: "https://s3.example.com",
  S3_REGION: "us-east-1",
  S3_BUCKET: "files",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FORCE_PATH_STYLE: false,
};

it("is off unless enabled and rejects incomplete or unsafe configuration", () => {
  assert.equal(createStorage({ FILES_ENABLED: false, S3_FORCE_PATH_STYLE: false }), null);
  assert.ok(createStorage(complete));
  assert.ok(createStorage({ ...complete, S3_ENDPOINT: "http://127.0.0.1:9000" }));
  // A container service name may be reached over http; browsers never use it.
  assert.ok(createStorage({ ...complete, S3_ENDPOINT: "http://rustfs:9000" }));
  for (const S3_ENDPOINT of ["http://s3.example.com", "http://user:pw@rustfs:9000"])
    assert.throws(() => createStorage({ ...complete, S3_ENDPOINT }));
  assert.throws(() => createStorage({ ...complete, S3_PUBLIC_ENDPOINT: "http://rustfs:9000" }));
  for (const change of [
    { S3_BUCKET: undefined },
    { S3_REGION: undefined },
    { S3_SECRET_ACCESS_KEY: undefined },
    { S3_ENDPOINT: "http://s3.example.com" },
    { S3_ENDPOINT: "https://user:pass@s3.example.com" },
    { S3_PUBLIC_ENDPOINT: "http://files.example.com" },
  ])
    assert.throws(() => createStorage({ ...complete, ...change }));
});

it("forces attachment downloads with a safe filename", () => {
  assert.equal(
    attachment('báo "cáo".pdf'),
    `attachment; filename="b_o _c_o_.pdf"; filename*=UTF-8''b%C3%A1o%20%22c%C3%A1o%22.pdf`,
  );
});

it("memory storage copies, hashes and deletes", async () => {
  const storage = new MemoryStorage();
  assert.equal(await storage.head("a"), null);
  assert.equal(await storage.sha256("a"), null);
  storage.put("a", "hello");
  await storage.copy("a", "b");
  storage.put("a", "changed");
  assert.deepEqual(await storage.head("b"), { size: 5 });
  assert.equal(await storage.sha256("b"), createHash("sha256").update("hello").digest("hex"));
  await storage.delete("b");
  assert.equal(await storage.head("b"), null);
  await assert.rejects(storage.copy("missing", "c"));
});

// Opt-in, against a disposable S3-compatible store (creates its own bucket):
// TEST_S3_ENDPOINT=http://127.0.0.1:9000 bun test test/core/storage.test.ts
const s3 = process.env.TEST_S3_ENDPOINT;
it.skipIf(!s3)("round-trips presigned uploads against a real S3 endpoint", async () => {
  const env = {
    ...complete,
    S3_ENDPOINT: s3!,
    S3_BUCKET: `payvoke-test-${randomUUID().slice(0, 8)}`,
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? "payvoke",
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "payvoke-secret",
    S3_FORCE_PATH_STYLE: true,
  };
  const created = await new S3Signer({
    endpoint: s3!,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: true,
  }).fetch("PUT", "");
  assert.ok(created.ok, await created.text());
  const storage = createStorage(env)!;
  const body = Buffer.from("payvoke file body");

  const upload = await storage.presignPut(
    "staging/x",
    { contentType: "text/plain", size: body.length },
    60,
  );
  const wrongType = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "text/html" },
    body,
  });
  assert.ok(!wrongType.ok, "a different content type must break the signature");
  const wrongSize = await fetch(upload.url, {
    method: "PUT",
    headers: upload.headers,
    body: Buffer.concat([body, body]),
  });
  assert.ok(!wrongSize.ok, "a different length must break the signature");
  const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body });
  assert.ok(put.ok, await put.text());

  // Keys with spaces and non-ASCII must survive signing and the copy source.
  await storage.copy("staging/x", "files/kết quả x");
  await storage.copy("files/kết quả x", "files/x");
  await storage.delete("files/kết quả x");
  await assert.rejects(storage.copy("staging/missing", "files/y"), { name: "NoSuchKey" });
  // A replayed upload URL only reaches staging, never the verified copy.
  await fetch(upload.url, {
    method: "PUT",
    headers: upload.headers,
    body: Buffer.from("tampered body !!!"),
  });
  assert.deepEqual(await storage.head("files/x"), { size: body.length });
  assert.equal(await storage.sha256("files/x"), createHash("sha256").update(body).digest("hex"));

  const download = await storage.presignGet(
    "files/x",
    { filename: "kết quả.txt", contentType: "text/plain" },
    60,
  );
  const got = await fetch(download.url);
  assert.equal(Buffer.from(await got.arrayBuffer()).toString(), body.toString());
  assert.match(got.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.equal(got.headers.get("content-type"), "text/plain");
  assert.equal(await storage.head("files/missing"), null);
  assert.equal(await storage.sha256("files/missing"), null);
  await storage.put("files/image", new Uint8Array([1, 2, 3]), "image/png");
  assert.deepEqual(await storage.head("files/image"), { size: 3 });
  await storage.delete("files/image");

  await storage.delete("staging/x");
  await storage.delete("files/x");
  assert.equal(await storage.head("files/x"), null);
});
