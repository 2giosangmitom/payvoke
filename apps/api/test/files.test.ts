/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "@payvoke/db";
import { readMigrations, startTestPostgres, type TestPostgres } from "@payvoke/testkit/database";
import { verifyStructuredDeliveries } from "@payvoke/payments/delivery";
import { expireStaleUploads } from "@payvoke/payments/files";
import { MemoryStorage } from "@payvoke/storage";

const origin = "https://app.payvoke.test";
const schema = `files_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const storage = new MemoryStorage();
let postgres: TestPostgres;
let pool: Pool;
let db: PrismaClient;
let app: ReturnType<typeof createApp>;
let config: ReturnType<typeof loadConfig>;

before(async () => {
  postgres = await startTestPostgres();
  const { connectionString } = postgres;
  pool = new Pool({ connectionString, max: 1, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    for (const migration of await readMigrations()) await client.query(migration.sql);
  } finally {
    client.release();
  }
  db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  config = loadConfig({
    DATABASE_URL: connectionString,
    // Unused: the test passes in-process signals.
    REDIS_URL: "redis://127.0.0.1:1",
    WEB_ORIGIN: origin,
    API_ORIGIN: "https://api.payvoke.test",
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
    LOG_LEVEL: "silent",
    VAULT_ADDRESS: wallet.address,
    FILES_ENABLED: "true",
    FILE_MAX_BYTES: "1024",
  });
  app = createApp(config, db, undefined, storage);
  await app.ready();
});
after(async () => {
  await app?.close();
  await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  await postgres?.stop();
});

async function login(account: typeof wallet) {
  const nonce = await app.inject({
    method: "POST",
    url: "/v1/auth/siwe/nonce",
    headers: { origin },
    payload: {},
  });
  const binding = nonce.cookies.find((cookie) => cookie.name.endsWith("payvoke_siwe"))!;
  const issuedAt = new Date();
  const message = createSiweMessage({
    address: account.address,
    chainId: 43113,
    domain: new URL(origin).host,
    uri: origin,
    version: "1",
    nonce: nonce.json().nonce,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 300000),
  });
  const verified = await app.inject({
    method: "POST",
    url: "/v1/auth/siwe/verify",
    headers: { origin, cookie: `${binding.name}=${encodeURIComponent(binding.value)}` },
    payload: { message, signature: await account.signMessage({ message }) },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  const session = verified.cookies.find((cookie) => cookie.name.endsWith("session_token"))!;
  return `${session.name}=${encodeURIComponent(session.value)}`;
}

const sha256 = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

// One app with a JSON command, a worker key and an active policy; quotes and
// finalized holds are fixtures, as in the catalog test.
async function marketplace() {
  const cookie = await login(wallet);
  const otherCookie = await login(other);
  const web = (method: string, url: string, payload?: unknown, userCookie = cookie) =>
    app.inject({
      method: method as "GET",
      url,
      headers: { origin, cookie: userCookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
  await db.deploymentPolicy.upsert({
    where: { version: "test" },
    update: {},
    create: {
      version: "test",
      activeSlot: "active",
      vault: wallet.address,
      feeBps: 0,
      feeRecipient: wallet.address,
      quoteLifetimeSeconds: 60,
      maxHoldSeconds: 10000,
      resolutionGraceSeconds: 60,
      minGrossAmount: "1000",
    },
  });
  const created = await web("POST", "/v1/provider/apps", {
    name: `Files ${randomUUID().slice(0, 6)}`,
    payoutAddress: wallet.address,
    clientRequestId: randomUUID(),
  });
  assert.equal(created.statusCode, 201, created.body);
  const appId = created.json().id as string;
  const command = await web("POST", `/v1/provider/apps/${appId}/commands`, {
    name: "convert",
    description: "Converts a file",
    options: [{ name: "text", type: "STRING", required: true }],
    positionalParameter: "text",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
    grossAmount: "10000",
    terms: {
      deliverySeconds: 600,
      reviewSeconds: 3600,
      revisionPolicy: { maxIncluded: 0, description: "None" },
      refundPolicy: "Refund undelivered",
      sideEffects: "none",
      dataUse: "This request",
      verification: { minEvidence: "REC" },
    },
  });
  assert.equal(command.statusCode, 201, command.body);
  const commandId = command.json().id as string;
  await web("POST", `/v1/provider/apps/${appId}/commands/${commandId}/default`, {});
  await db.app.update({ where: { id: appId }, data: { lastHeartbeatAt: new Date() } });
  const key = await web("POST", `/v1/provider/apps/${appId}/keys`, {
    scopes: ["events:read", "events:ack", "reports:write", "files:write"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(key.statusCode, 201, key.body);
  const worker = (method: string, url: string, payload?: unknown) =>
    app.inject({
      method: method as "GET",
      url: `/v1/provider/apps/${appId}${url}`,
      headers: { authorization: `Bearer ${key.json().secret}` },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
  const buyer = await db.walletAddress.findFirstOrThrow({
    where: { address: { equals: wallet.address, mode: "insensitive" } },
  });
  const thread = async () =>
    (await web("POST", "/v1/threads", { appId, clientRequestId: randomUUID() })).json()
      .id as string;
  const quote = (threadId: string, fileIds: string[] = []) => {
    const clientRequestId = randomUUID();
    return app.inject({
      method: "POST",
      url: "/v1/quotes",
      headers: { origin, cookie, "idempotency-key": clientRequestId },
      payload: {
        threadId,
        commandId,
        arguments: { text: "convert this" },
        contextSelection: { messageIds: [], briefVersionId: null, fileIds },
        clientRequestId,
      },
    });
  };
  // A finalized, ready hold; the settlement worker creates this in production.
  const hold = async (quoted: {
    invocationId: string;
    quoteId: string;
    quoteDigest: string;
    protocolQuote: { invocationKey: string };
  }) => {
    await db.invocation.create({
      data: {
        id: quoted.invocationId,
        quoteId: quoted.quoteId,
        buyerId: buyer.userId,
        executionStatus: "QUEUED",
      },
    });
    await db.settlementOperation.create({
      data: {
        invocationId: quoted.invocationId,
        invocationKey: quoted.protocolQuote.invocationKey,
        quoteDigest: quoted.quoteDigest,
        authorizationDigest: `0x${randomBytes(32).toString("hex")}`,
        recoveredSigner: wallet.address,
        paymentPayload: {},
        state: "HELD",
      },
    });
    await db.invocationReady.create({
      data: { invocationId: quoted.invocationId, quoteId: quoted.quoteId },
    });
  };
  return { web, worker, cookie, otherCookie, appId, thread, quote, hold };
}

// Presigned PUT stand-in: the client writes the declared bytes to staging.
const upload = (body: string, overrides: Record<string, unknown> = {}) => ({
  name: "input.txt",
  contentType: "text/plain",
  size: Buffer.byteLength(body),
  sha256: sha256(body),
  clientRequestId: randomUUID(),
  ...overrides,
});

it("verifies buyer inputs before a quote freezes them for the provider", async () => {
  const { web, worker, otherCookie, thread, quote, hold } = await marketplace();
  const threadId = await thread();
  const body = "buyer input bytes";
  const request = upload(body, { threadId, name: "báo cáo.txt" });

  const requested = await web("POST", "/v1/files", request);
  assert.equal(requested.statusCode, 200, requested.body);
  assert.equal(requested.headers["cache-control"], "no-store");
  const file = requested.json().file;
  assert.equal(file.status, "AWAITING_UPLOAD");
  assert.equal(requested.json().upload.url, `memory://put/staging/${file.id}`);
  // Same request replays the same file; a different one under the id conflicts.
  assert.equal((await web("POST", "/v1/files", request)).json().file.id, file.id);
  assert.equal((await web("POST", "/v1/files", { ...request, size: 3 })).statusCode, 409);

  const complete = (id: string, userCookie?: string) =>
    web("POST", `/v1/files/${id}/completions`, {}, userCookie);
  assert.equal((await complete(file.id)).json().error, "UPLOAD_NOT_FOUND");
  storage.put(`staging/${file.id}`, body);
  assert.equal((await complete(file.id, otherCookie)).statusCode, 404);
  const ready = await complete(file.id);
  assert.equal(ready.statusCode, 200, ready.body);
  assert.equal(ready.json().status, "READY");
  assert.equal((await complete(file.id)).json().status, "READY");
  const stored = await db.fileAsset.findUniqueOrThrow({ where: { id: file.id } });
  assert.match(stored.objectKey!, new RegExp(`^files/${file.id}/`));
  // Staging is gone, and rewriting it could never reach the verified copy.
  assert.equal(await storage.head(`staging/${file.id}`), null);
  assert.equal(await storage.sha256(stored.objectKey!), sha256(body));
  assert.equal((await web("POST", "/v1/files", request)).json().upload, null);

  // Rejections: wrong digest, wrong size, policy limits, foreign thread.
  const tampered = (await web("POST", "/v1/files", upload("expected", { threadId }))).json().file;
  storage.put(`staging/${tampered.id}`, "tampered");
  assert.deepEqual(
    [
      (await complete(tampered.id)).json().status,
      (await complete(tampered.id)).json().rejectionCode,
    ],
    ["REJECTED", "CHECKSUM_MISMATCH"],
  );
  const short = (await web("POST", "/v1/files", upload("12345", { threadId }))).json().file;
  storage.put(`staging/${short.id}`, "123");
  assert.equal((await complete(short.id)).json().rejectionCode, "SIZE_MISMATCH");
  assert.equal(
    (await web("POST", "/v1/files", upload("x".repeat(1025), { threadId }))).statusCode,
    413,
  );
  assert.equal(
    (await web("POST", "/v1/files", upload("<p>", { threadId, contentType: "text/html" })))
      .statusCode,
    400,
  );
  assert.equal(
    (await web("POST", "/v1/files", upload("../x", { threadId, name: "../x" }))).statusCode,
    400,
  );
  assert.equal(
    (await web("POST", "/v1/files", upload("x", { threadId }), otherCookie)).statusCode,
    404,
  );

  // Downloads are re-authorized and always signed as attachments.
  const download = await web("GET", `/v1/files/${file.id}/download`);
  assert.equal(download.statusCode, 200, download.body);
  assert.equal(download.json().url, `memory://get/${stored.objectKey}`);
  assert.equal(
    (await web("GET", `/v1/files/${file.id}/download`, undefined, otherCookie)).statusCode,
    404,
  );
  assert.equal((await web("GET", `/v1/files/${tampered.id}/download`)).statusCode, 404);

  // Only READY inputs of this buyer and thread can be selected.
  assert.equal((await quote(threadId, [tampered.id])).json().error, "INVALID_CONTEXT_FILES");
  const elsewhere = await thread();
  assert.equal((await quote(elsewhere, [file.id])).json().error, "INVALID_CONTEXT_FILES");
  const quoted = await quote(threadId, [file.id]);
  assert.equal(quoted.statusCode, 201, quoted.body);
  const manifest = [
    {
      fileId: file.id,
      name: "báo cáo.txt",
      contentType: "text/plain",
      size: 17,
      sha256: sha256(body),
    },
  ];
  assert.deepEqual(quoted.json().inputSnapshot.context.files, manifest);
  assert.deepEqual(quoted.json().contextManifest.files, manifest);

  // The provider sees metadata in the ready event and downloads per invocation.
  await hold(quoted.json());
  const feed = await worker("GET", "/events?once=1");
  const ready_ = feed
    .json()
    .events.find(
      (event: { invocationId: string }) => event.invocationId === quoted.json().invocationId,
    );
  assert.deepEqual(ready_.input.context.files, manifest);
  const task = `/invocations/${quoted.json().invocationId}/files`;
  const fetched = await worker("GET", `${task}/${file.id}/download`);
  assert.equal(fetched.statusCode, 200, fetched.body);
  assert.equal(fetched.json().url, `memory://get/${stored.objectKey}`);
  const unlisted = (await web("POST", "/v1/files", upload("other", { threadId }))).json().file;
  storage.put(`staging/${unlisted.id}`, "other");
  await complete(unlisted.id);
  assert.equal((await worker("GET", `${task}/${unlisted.id}/download`)).statusCode, 404);

  // Abandoned uploads expire after the grace window and lose their staging object.
  const abandoned = (await web("POST", "/v1/files", upload("late", { threadId }))).json().file;
  storage.put(`staging/${abandoned.id}`, "late");
  await db.fileAsset.update({
    where: { id: abandoned.id },
    data: { uploadExpiresAt: new Date(Date.now() - 2 * 3600000) },
  });
  assert.equal((await complete(abandoned.id)).json().error, "UPLOAD_EXPIRED");
  assert.equal(await expireStaleUploads(db, storage), 1);
  assert.equal(
    (await db.fileAsset.findUniqueOrThrow({ where: { id: abandoned.id } })).status,
    "EXPIRED",
  );
  assert.equal(await storage.head(`staging/${abandoned.id}`), null);
});

it("accepts verified provider artifacts and records REC evidence", async () => {
  const { web, worker, otherCookie, thread, quote, hold } = await marketplace();
  const threadId = await thread();
  const quoted = (await quote(threadId)).json();
  await hold(quoted);
  const invocationId = quoted.invocationId as string;
  const task = `/invocations/${invocationId}`;
  const body = "provider artifact";
  const request = upload(body, { name: "result.txt" });
  assert.equal((await worker("POST", `${task}/files`, request)).json().error, "RUN_NOT_ACKED");

  const feed = await worker("GET", "/events?once=1");
  assert.ok(
    feed
      .json()
      .events.some((event: { invocationId: string }) => event.invocationId === invocationId),
  );
  assert.equal((await worker("POST", `${task}/acks`, { eventId: invocationId })).statusCode, 200);
  const report = (sequence: number, type: string, data?: unknown) =>
    worker("POST", `${task}/reports`, {
      reportId: `r${sequence}-${randomUUID()}`,
      sequence,
      type,
      data,
    });
  assert.equal((await report(1, "started")).statusCode, 200);

  const requested = await worker("POST", `${task}/files`, request);
  assert.equal(requested.statusCode, 200, requested.body);
  const file = requested.json().file;
  storage.put(`staging/${file.id}`, body);
  const completed = await worker("POST", `${task}/files/${file.id}/completions`);
  assert.equal(completed.json().status, "READY", completed.body);
  const pending = (await worker("POST", `${task}/files`, upload("never uploaded"))).json().file;

  const result = (files: unknown) => ({ artifactVersion: 1, output: { summary: "Done" }, files });
  for (const files of [
    [{ fileId: pending.id }],
    [{ fileId: file.id }, { fileId: file.id }],
    [{ fileId: file.id, url: "https://example.com/x" }],
    [{ fileId: randomUUID() }],
  ])
    assert.equal((await report(2, "result", result(files))).json().error, "INVALID_RESULT_FILES");
  const accepted = await report(2, "result", result([{ fileId: file.id }]));
  assert.equal(accepted.statusCode, 200, accepted.body);
  const stored = await db.fileAsset.findUniqueOrThrow({ where: { id: file.id } });
  const run = await db.invocation.findUniqueOrThrow({
    where: { id: invocationId },
    select: { run: { select: { result: true } } },
  });
  assert.deepEqual((run.run!.result as { files: unknown }).files, [
    {
      fileId: file.id,
      name: "result.txt",
      contentType: "text/plain",
      size: 17,
      sha256: sha256(body),
    },
  ]);

  // The buyer can fetch it once a result lists it; nobody else can.
  assert.equal((await web("GET", `/v1/files/${file.id}/download`)).statusCode, 200);
  assert.equal(
    (await web("GET", `/v1/files/${file.id}/download`, undefined, otherCookie)).statusCode,
    404,
  );
  assert.equal((await web("GET", `/v1/files/${pending.id}/download`)).statusCode, 404);

  // Without storage, or with the object missing, the run stays unverified.
  assert.equal(await verifyStructuredDeliveries(db), 0);
  storage.objects.delete(stored.objectKey!);
  assert.equal(await verifyStructuredDeliveries(db, storage), 0);
  storage.put(stored.objectKey!, body);
  assert.equal(await verifyStructuredDeliveries(db, storage), 1);
  assert.equal(await verifyStructuredDeliveries(db, storage), 0);
  const evidence = await db.paymentDeliveryEvidence.findFirstOrThrow({ where: { invocationId } });
  assert.equal(evidence.evidenceLevel, "REC");
  assert.equal(evidence.verifier, "payvoke-host-files-v1");
  assert.deepEqual((evidence.envelope as { files: unknown }).files, [
    { fileId: file.id, sha256: sha256(body), size: 17 },
  ]);
  const snapshot = await web("GET", `/v1/threads/${threadId}/ag-ui/snapshot`);
  const delivered = snapshot.json().invocations.find((i: { id: string }) => i.id === invocationId);
  assert.equal(delivered.executionStatus, "DELIVERED");
  assert.deepEqual(delivered.files, [
    { fileId: file.id, name: "result.txt", contentType: "text/plain", size: 17 },
  ]);
});

it("keeps file routes and file context closed when files are disabled", async () => {
  const disabled = createApp({ ...config, FILES_ENABLED: false }, db);
  try {
    await disabled.ready();
    // Sessions live in the shared database, so the same cookie works here.
    const cookie = await login(wallet);
    const response = await disabled.inject({
      method: "POST",
      url: "/v1/files",
      headers: { origin, cookie },
      payload: upload("x", { threadId: randomUUID() }),
    });
    assert.equal(response.statusCode, 503, response.body);
    assert.equal(response.json().error, "FILES_DISABLED");
    const clientRequestId = randomUUID();
    const quoted = await disabled.inject({
      method: "POST",
      url: "/v1/quotes",
      headers: { origin, cookie, "idempotency-key": clientRequestId },
      payload: {
        threadId: randomUUID(),
        commandId: randomUUID(),
        arguments: {},
        contextSelection: { messageIds: [], briefVersionId: null, fileIds: [randomUUID()] },
        clientRequestId,
      },
    });
    assert.equal(quoted.json().error, "CONTEXT_NOT_SUPPORTED");
  } finally {
    await disabled.close();
  }
});
