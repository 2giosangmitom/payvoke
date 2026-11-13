/// <reference types="emscripten" />
/// <reference types="bun" />
import { inject } from "#test/kit/http";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, it } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { offerFixture } from "./offer-fixture";
import { loadConfig } from "../src/config";
import { PrismaClient } from "#core/db";
import { readMigrations, startTestPostgres, type TestPostgres } from "#test/kit/database";
import { verifyStructuredDeliveries } from "#core/payments/delivery";
import { expireStaleUploads } from "#core/payments/files";
import { MemoryStorage } from "#core/storage";

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

beforeAll(async () => {
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
    MAX_APPS_PER_OWNER: "1000",
    APP_CREATES_PER_DAY: "1000",
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
afterAll(async () => {
  await app?.close();
  await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  await postgres?.stop();
});

async function login(account: typeof wallet) {
  const nonce = await inject(app, {
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
  const verified = await inject(app, {
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
    inject(app, {
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
    scopes: [
      "events:read",
      "events:ack",
      "reports:write",
      "files:write",
      "messages:write",
      "offers:write",
    ],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(key.statusCode, 201, key.body);
  const worker = (method: string, url: string, payload?: unknown) =>
    inject(app, {
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
  const quote = async (threadId: string, fileIds: string[] = []) => {
    const clientRequestId = randomUUID();
    const offer = await offerFixture(db, {
      threadId,
      commandId,
      arguments: { text: "convert this" },
      grossAmount: "10000",
    });
    return inject(app, {
      method: "POST",
      url: "/v1/quotes",
      headers: { origin, cookie, "idempotency-key": clientRequestId },
      payload: {
        threadId,
        offerId: offer.id,
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
        fundingMode: "GRANT",
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

it("takes files from bot form tools and FILE options into the frozen quote", async () => {
  const { web, worker, appId, thread } = await marketplace();
  const threadId = await thread();
  const readyFile = async (target: string, body: string, contentType: string, name: string) => {
    const file = (
      await web("POST", "/v1/files", upload(body, { threadId: target, contentType, name }))
    ).json().file;
    storage.put(`staging/${file.id}`, body);
    assert.equal((await web("POST", `/v1/files/${file.id}/completions`, {})).statusCode, 200);
    return file.id as string;
  };
  const say = (body: Record<string, unknown>) =>
    web("POST", `/v1/threads/${threadId}/messages`, { clientRequestId: randomUUID(), ...body });
  const botSays = (body: Record<string, unknown>) =>
    worker("POST", `/threads/${threadId}/messages`, { clientRequestId: randomUUID(), ...body });
  assert.equal((await say({ content: "I have a scan" })).statusCode, 201);

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["scan"],
    properties: {
      scan: { type: "string", format: "file", title: "Scan", accept: ["image/*"], maxBytes: 64 },
      note: { type: "string", maxLength: 200 },
    },
  };
  for (const args of [
    {
      title: "Nested",
      schema: {
        ...schema,
        properties: {
          deep: { type: "object", properties: {}, required: [], additionalProperties: false },
        },
      },
    },
    {
      title: "Bad format",
      schema: { ...schema, properties: { scan: { type: "string", format: "uri" } } },
    },
    { title: "", schema },
  ])
    assert.equal(
      (await botSays({ content: "Upload", tool: { name: "ask_form", args } })).json().error,
      "INVALID_TOOL_CALL",
    );
  const asked = await botSays({
    content: "Please upload the scan",
    tool: { name: "ask_form", args: { title: "Scan", schema } },
  });
  assert.equal(asked.statusCode, 201, asked.body);
  assert.equal(asked.json().tool.args.title, "Scan");

  const png = await readyFile(threadId, "png bytes", "image/png", "scan.png");
  const text = await readyFile(threadId, "plain text", "text/plain", "scan.txt");
  const large = await readyFile(threadId, "x".repeat(65), "image/png", "large.png");
  const foreign = await readyFile(await thread(), "other", "image/png", "other.png");
  const answer = (scan: unknown) =>
    web("POST", `/v1/threads/${threadId}/tool-results`, {
      toolCallId: asked.json().id,
      result: { scan },
      clientRequestId: randomUUID(),
    });
  for (const scan of [text, large, foreign, randomUUID()])
    assert.equal((await answer(scan)).json().error, "INVALID_ARGUMENT_FILES");
  assert.equal((await answer(42)).json().error, "INVALID_TOOL_RESULT");
  const answered = await answer(png);
  assert.equal(answered.statusCode, 201, answered.body);
  const reply = answered.json().message;
  assert.equal(reply.replyToId, asked.json().id);
  assert.deepEqual(
    reply.files.map((file: { fileId: string }) => file.fileId),
    [png],
  );
  assert.equal((await answer(png)).json().error, "TOOL_CALL_ALREADY_ANSWERED");
  // The bot sees the result and its file metadata, never the bytes before payment.
  const feed = (await worker("GET", "/events?once=1")).json().events;
  const event = feed.find((item: { messageId: string }) => item.messageId === reply.id);
  assert.deepEqual(event.toolResult, { toolCallId: asked.json().id, result: { scan: png } });
  assert.equal(event.files[0].contentType, "image/png");
  assert.equal(event.conversation.at(-2).tool.args.title, "Scan");

  // Audio carries player metadata and gets an inline URL; other types do not.
  const audioBody = "audio bytes";
  assert.equal(
    (
      await web(
        "POST",
        "/v1/files",
        upload("text", { threadId, audio: { durationMs: 1000, peaks: [0.5] } }),
      )
    ).json().error,
    "INVALID_UPLOAD",
  );
  const voice = (
    await web(
      "POST",
      "/v1/files",
      upload(audioBody, {
        threadId,
        name: "voice.ogg",
        contentType: "audio/ogg",
        audio: { durationMs: 2500, peaks: [0, 0.4, 1] },
      }),
    )
  ).json().file;
  assert.equal(voice.durationMs, 2500);
  storage.put(`staging/${voice.id}`, audioBody);
  assert.equal((await web("POST", `/v1/files/${voice.id}/completions`, {})).statusCode, 200);
  assert.equal((await web("GET", `/v1/files/${voice.id}/stream`)).statusCode, 200);
  assert.equal((await web("GET", `/v1/files/${text}/stream`)).json().error, "INLINE_NOT_SUPPORTED");
  assert.equal((await say({ content: "Listen", fileIds: [voice.id] })).statusCode, 201);
  const voicePart = (await web("GET", `/v1/threads/${threadId}/timeline`))
    .json()
    .messages.flatMap((m: { parts: { type: string; fileId?: string }[] }) => m.parts)
    .find((part: { fileId?: string }) => part.fileId === voice.id);
  assert.deepEqual(voicePart.audio, { durationMs: 2500, peaks: [0, 0.4, 1] });

  // A FILE option takes the same path through slash commands and offers.
  const command = await web("POST", `/v1/provider/apps/${appId}/commands`, {
    name: "ocr",
    description: "Reads an image",
    options: [{ name: "image", type: "FILE", required: true, accept: ["image/*"] }],
    terms: {
      deliverySeconds: 600,
      reviewSeconds: 3600,
      revisionPolicy: { maxIncluded: 0, description: "None" },
      refundPolicy: "Refund undelivered",
      sideEffects: "none",
      dataUse: "This request",
    },
  });
  assert.equal(command.statusCode, 201, command.body);
  const ocr = command.json().id as string;
  assert.equal(
    (await say({ content: "/ocr", commandId: ocr, arguments: { image: text } })).json().error,
    "INVALID_ARGUMENT_FILES",
  );
  const slash = await say({ content: "/ocr", commandId: ocr, arguments: { image: png } });
  assert.equal(slash.statusCode, 201, slash.body);
  assert.equal(slash.json().files[0].fileId, png);
  const offer = await worker("POST", `/threads/${threadId}/offers`, {
    clientRequestId: randomUUID(),
    commandId: ocr,
    arguments: { image: png },
    grossAmount: "5000",
    summary: "OCR of your scan",
  });
  assert.equal(offer.statusCode, 201, offer.body);
  const clientRequestId = randomUUID();
  const quoted = await inject(app, {
    method: "POST",
    url: "/v1/quotes",
    headers: { origin, cookie: await login(wallet), "idempotency-key": clientRequestId },
    payload: {
      threadId,
      offerId: offer.json().id,
      contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
      clientRequestId,
    },
  });
  assert.equal(quoted.statusCode, 201, quoted.body);
  // The offer named the file, so the quote froze it for the provider.
  assert.deepEqual(
    quoted.json().contextManifest.files.map((file: { fileId: string }) => file.fileId),
    [png],
  );
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
  const timeline = await web("GET", `/v1/threads/${threadId}/timeline`);
  const delivered = timeline
    .json()
    .messages.find((m: { id: string }) => m.id === `run-${invocationId}`);
  assert.equal(delivered.run.phase, "delivered");
  assert.deepEqual(
    delivered.parts.filter((part: { type: string }) => part.type === "file"),
    [
      {
        type: "file",
        id: file.id,
        fileId: file.id,
        name: "result.txt",
        contentType: "text/plain",
        size: 17,
        audio: null,
      },
    ],
  );
});

it("keeps file routes and file context closed when files are disabled", async () => {
  const disabled = createApp({ ...config, FILES_ENABLED: false }, db);
  try {
    await disabled.ready();
    // Sessions live in the shared database, so the same cookie works here.
    const cookie = await login(wallet);
    const response = await inject(disabled, {
      method: "POST",
      url: "/v1/files",
      headers: { origin, cookie },
      payload: upload("x", { threadId: randomUUID() }),
    });
    assert.equal(response.statusCode, 503, response.body);
    assert.equal(response.json().error, "FILES_DISABLED");
    const clientRequestId = randomUUID();
    const quoted = await inject(disabled, {
      method: "POST",
      url: "/v1/quotes",
      headers: { origin, cookie, "idempotency-key": clientRequestId },
      payload: {
        threadId: randomUUID(),
        offerId: randomUUID(),
        contextSelection: { messageIds: [], briefVersionId: null, fileIds: [randomUUID()] },
        clientRequestId,
      },
    });
    assert.equal(quoted.json().error, "CONTEXT_NOT_SUPPORTED");
  } finally {
    await disabled.close();
  }
});

it("pays the owner's wallet and serves the agent image the owner uploads", async () => {
  const cookie = await login(wallet);
  const otherCookie = await login(other);
  const send = (method: string, url: string, payload?: unknown, headers = {}, user = cookie) =>
    inject(app, {
      method: method as "GET",
      url,
      headers: { origin, cookie: user, ...headers },
      payload,
    });
  const created = await send("POST", "/v1/provider/apps", {
    name: "Pictured",
    payoutAddress: other.address,
    clientRequestId: randomUUID(),
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().payoutAddress, wallet.address);
  assert.equal(created.json().imageUrl, null);
  const appId = created.json().id as string;
  // Listed without going through the publish gate; this test is about images.
  await db.app.update({ where: { id: appId }, data: { visibility: "PUBLIC" } });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

  const wrongType = await send("PUT", `/v1/provider/apps/${appId}/image`, png, {
    "content-type": "image/svg+xml",
  });
  assert.equal(wrongType.statusCode, 415, wrongType.body);
  const stranger = await send(
    "PUT",
    `/v1/provider/apps/${appId}/image`,
    png,
    { "content-type": "image/png" },
    otherCookie,
  );
  assert.equal(stranger.statusCode, 404, stranger.body);

  const uploaded = await send("PUT", `/v1/provider/apps/${appId}/image`, png, {
    "content-type": "image/png",
  });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const url = uploaded.json().imageUrl as string;
  assert.match(url, new RegExp(`^/v1/apps/${appId}/image\\?v=`));
  assert.equal(uploaded.json().imageKey, undefined);
  // The store lists only connected agents; the public detail shows the same URL.
  const listed = (await send("GET", `/v1/apps/${appId}`)).json();
  assert.equal(listed.imageUrl, url);
  const served = await send("GET", url);
  assert.equal(served.statusCode, 302);
  assert.match(String(served.headers.location), /^memory:\/\/get\/app-images\//);
  assert.equal(served.headers["cross-origin-resource-policy"], "cross-origin");

  const replaced = await send("PUT", `/v1/provider/apps/${appId}/image`, png, {
    "content-type": "image/webp",
  });
  assert.notEqual(replaced.json().imageUrl, url);
  const removed = await send("DELETE", `/v1/provider/apps/${appId}/image`);
  assert.equal(removed.json().imageUrl, null);
  assert.equal((await send("GET", `/v1/apps/${appId}/image`)).statusCode, 404);
});
