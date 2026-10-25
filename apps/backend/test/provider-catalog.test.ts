/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { after, before, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { verifyStructuredDeliveries } from "../src/modules/agui/verify";

const origin = "https://app.payvoke.test";
const schema = `catalog_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
let embedded: PGlite;
let socket: PGLiteSocketServer;
let pool: Pool;
let db: PrismaClient;
let app: ReturnType<typeof createApp>;

before(async () => {
  embedded = await PGlite.create();
  socket = new PGLiteSocketServer({ db: embedded, port: 0, host: "127.0.0.1" });
  await socket.start();
  const connectionString = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  pool = new Pool({ connectionString, max: 1, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    const dir = new URL("../prisma/migrations/", import.meta.url);
    for (const migration of (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const sql = await readFile(new URL(`${migration}/migration.sql`, dir), "utf8");
      await client.query(sql.replace('CREATE SCHEMA IF NOT EXISTS "public";', ""));
    }
  } finally {
    client.release();
  }
  db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  app = createApp(
    loadConfig({
      DATABASE_URL: connectionString,
      WEB_ORIGIN: origin,
      API_ORIGIN: "https://api.payvoke.test",
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
      LOG_LEVEL: "silent",
      VAULT_ADDRESS: wallet.address,
    }),
    db,
  );
  await app.ready();
});
after(async () => {
  await app?.close();
  await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  await socket?.stop();
  await embedded?.close();
});

async function login(account: typeof wallet) {
  const nonce = await app.inject({
    method: "POST",
    url: "/v1/auth/siwe/nonce",
    headers: { origin },
    payload: {},
  });
  assert.equal(nonce.statusCode, 200, nonce.body);
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

it("isolates provider keys, exposes public apps, and keeps stars private", async () => {
  const cookie = await login(wallet);
  const otherCookie = await login(other);
  const web = (
    method: string,
    url: string,
    payload?: Record<string, unknown>,
    userCookie = cookie,
  ) =>
    app.inject({
      method: method as "GET",
      url,
      headers: { origin, cookie: userCookie },
      ...(payload === undefined ? {} : { payload }),
    });
  const appOne = await web("POST", "/v1/provider/apps", {
    name: "First",
    payoutAddress: wallet.address,
    clientRequestId: randomUUID(),
  });
  assert.equal(appOne.statusCode, 201, appOne.body);
  const appTwo = await web("POST", "/v1/provider/apps", {
    name: "Second",
    payoutAddress: wallet.address,
    visibility: "PRIVATE",
    clientRequestId: randomUUID(),
  });
  assert.equal(appTwo.statusCode, 201, appTwo.body);
  const id = appOne.json().id;
  const otherAppId = appTwo.json().id;
  const keys = `/v1/provider/apps/${id}/keys`;
  const key = await web("POST", keys, {
    scopes: ["products:write"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(key.statusCode, 201, key.body);
  assert.equal((await web("GET", keys, undefined, otherCookie)).statusCode, 404);
  const secret = key.json().secret;
  assert.equal((await db.appApiKey.findFirstOrThrow()).secretHash.includes(secret), false);
  const bearer = (method: string, url: string, payload: Record<string, unknown>, token = secret) =>
    app.inject({
      method: method as "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  await db.deploymentPolicy.create({
    data: {
      version: "test",
      activeSlot: "active",
      vault: wallet.address,
      feeBps: 0,
      feeRecipient: wallet.address,
      quoteLifetimeSeconds: 60,
      maxHoldSeconds: 10000,
      resolutionGraceSeconds: 60,
    },
  });
  const terms = {
    deliverySeconds: 600,
    reviewSeconds: 3600,
    revisionPolicy: { maxIncluded: 1, description: "One in-scope revision" },
    refundPolicy: "Refund undelivered",
    sideEffects: "none",
    dataUse: "This request",
  };
  const first = await bearer("POST", `/v1/provider/apps/${id}/commands`, {
    name: "summarize",
    description: "Summarizes text",
    options: [
      {
        name: "text",
        type: "STRING",
        required: true,
        description: "Text to summarize",
      },
    ],
    positionalParameter: "text",
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
    grossAmount: "10000",
    terms,
  });
  assert.equal(first.statusCode, 201, first.body);
  const commandId = first.json().id;
  const invalidName = await bearer("POST", `/v1/provider/apps/${id}/commands`, {
    name: "Not Valid",
    description: "Invalid command name",
    options: [{ name: "text", type: "STRING", required: true }],
    grossAmount: "10000",
    terms,
  });
  assert.equal(invalidName.statusCode, 400, invalidName.body);
  const formOnly = await bearer("POST", `/v1/provider/apps/${id}/commands`, {
    name: "form_only",
    description: "Explicitly has no positional argument",
    options: [{ name: "text", type: "STRING", required: true }],
    positionalParameter: null,
    grossAmount: "10000",
    terms,
  });
  assert.equal(formOnly.statusCode, 201, formOnly.body);
  assert.equal(formOnly.json().revision.positionalParameter, null);
  const archivedByKey = await bearer(
    "DELETE",
    `/v1/provider/apps/${id}/commands/${formOnly.json().id}`,
    {},
  );
  assert.equal(archivedByKey.statusCode, 200, archivedByKey.body);
  assert.equal(
    (
      await bearer("POST", `/v1/provider/apps/${otherAppId}/commands`, {
        name: "escape",
        description: "No",
        options: [{ name: "text", type: "STRING", required: true }],
        grossAmount: "10000",
        terms,
      })
    ).statusCode,
    401,
  );
  const defaulted = await bearer(
    "POST",
    `/v1/provider/apps/${id}/commands/${commandId}/default`,
    {},
  );
  assert.equal(defaulted.statusCode, 200, defaulted.body);
  await db.app.update({ where: { id }, data: { lastHeartbeatAt: new Date() } });
  const catalog = await web("GET", "/v1/apps");
  assert.equal(catalog.statusCode, 200, catalog.body);
  assert.equal(catalog.json().items[0].id, id);
  assert.equal(catalog.json().items[0].availability, "AVAILABLE");
  assert.equal(catalog.json().items[0].fromPrice, "10000");
  // Private apps stay out of the public catalog but remain visible to the owner.
  assert.equal(
    catalog.json().items.some((item: { id: string }) => item.id === otherAppId),
    false,
  );
  assert.equal((await web("GET", `/v1/apps/${otherAppId}`)).statusCode, 200);
  const buyer = await db.walletAddress.findFirstOrThrow({
    where: { address: { equals: wallet.address, mode: "insensitive" } },
  });
  const threadResponse = await web("POST", "/v1/threads", {
    appId: id,
    clientRequestId: "thread-one",
  });
  assert.equal(threadResponse.statusCode, 201, threadResponse.body);
  const thread = threadResponse.json();
  const quote = await app.inject({
    method: "POST",
    url: "/v1/quotes",
    headers: { origin, cookie, "idempotency-key": "not-ready" },
    payload: {
      threadId: thread.id,
      commandId,
      arguments: { text: "hello" },
      contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
      clientRequestId: "not-ready",
    },
  });
  assert.equal(quote.statusCode, 201, quote.body);
  assert.equal(quote.json().effectiveArguments.text, "hello");
  const recover = await web("GET", `/v1/quotes/${quote.json().quoteId}`);
  assert.equal(recover.statusCode, 200, recover.body);
  assert.equal(recover.json().quote.quoteId, quote.json().quoteId);
  assert.equal(
    (await web("GET", `/v1/quotes/${quote.json().quoteId}`, undefined, otherCookie)).statusCode,
    404,
  );
  const original = await db.appCommandRevision.findFirstOrThrow({ where: { commandId } });
  const changed = await bearer("PATCH", `/v1/provider/apps/${id}/commands/${commandId}`, {
    name: "summarize",
    description: "Summarizes text",
    options: [
      {
        name: "text",
        type: "STRING",
        required: true,
        description: "Text to summarize",
      },
    ],
    positionalParameter: "text",
    outputSchema: original.outputSchema as Record<string, unknown>,
    grossAmount: "20000",
    terms,
    expectedRevisionId: original.id,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.notEqual(changed.json().revision.id, original.id);
  assert.equal(original.grossAmount.toString(), "10000");
  assert.equal(
    (
      await db.appCommandRevision.findUniqueOrThrow({
        where: { id: changed.json().revision.id },
      })
    ).grossAmount.toString(),
    "20000",
  );
  assert.equal((await web("PUT", `/v1/apps/${id}/star`)).statusCode, 200);
  assert.deepEqual((await web("GET", "/v1/stars", undefined, otherCookie)).json(), []);
  assert.equal((await web("GET", "/v1/stars")).json()[0].id, id);
  assert.equal((await web("POST", `/v1/provider/apps/${id}/suspensions`)).statusCode, 200);
  const suspendedCatalog = (await web("GET", "/v1/apps")).json().items;
  assert.equal(suspendedCatalog.length, 1);
  assert.equal(suspendedCatalog[0].availability, "SUSPENDED");
  assert.equal(
    (
      await web("POST", "/v1/threads", {
        appId: id,
        clientRequestId: "thread-while-suspended",
      })
    ).statusCode,
    404,
  );
  const replayedThread = await web("POST", "/v1/threads", {
    appId: id,
    clientRequestId: "thread-one",
  });
  assert.equal(replayedThread.statusCode, 200, replayedThread.body);
  assert.equal(replayedThread.json().id, thread.id);
  assert.equal((await web("GET", "/v1/stars")).json()[0].availability, "SUSPENDED");
  await web("DELETE", `/v1/apps/${id}/star`);
  assert.deepEqual((await web("GET", "/v1/stars")).json(), []);
  // Inject a finalized hold as an isolated test fixture. No browser/provider path
  // can create this state; the settlement worker is responsible in production.
  await db.app.update({
    where: { id },
    data: { status: "ACTIVE", lastHeartbeatAt: new Date() },
  });
  const quoted = quote.json();
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
      authorizationDigest: `0x${"1".repeat(64)}`,
      recoveredSigner: wallet.address,
      paymentPayload: {},
      state: "HELD",
    },
  });
  await db.invocationReady.create({
    data: { invocationId: quoted.invocationId, quoteId: quoted.quoteId },
  });
  assert.equal((await web("GET", `/v1/quotes/${quoted.quoteId}`)).json().quote, null);
  const workerKey = await web("POST", keys, {
    scopes: ["events:read", "events:ack", "reports:write"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(workerKey.statusCode, 201, workerKey.body);
  const worker = workerKey.json().secret;
  const workerBase = `/v1/provider/apps/${id}`;
  const ready = await app.inject({
    method: "GET",
    url: `${workerBase}/events?once=1`,
    headers: { authorization: `Bearer ${worker}` },
  });
  assert.equal(ready.statusCode, 200, ready.body);
  assert.equal(ready.json().events[0].invocationId, quoted.invocationId);
  const runId = ready.json().events[0].runId;
  const task = `${workerBase}/invocations/${quoted.invocationId}`;
  const postWorker = (
    url: string,
    payload: unknown,
    token = worker,
    contentType = "application/json",
  ) =>
    app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  assert.ok([401, 403].includes((await postWorker(`${task}/acks`, {}, "invalid")).statusCode));
  assert.equal(
    (
      await postWorker(
        `/v1/provider/apps/${otherAppId}/invocations/${quoted.invocationId}/acks`,
        {},
      )
    ).statusCode,
    401,
  );
  assert.equal(
    (await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`, undefined, otherCookie))
      .statusCode,
    404,
  );
  assert.equal(
    (await postWorker(`${task}/acks`, { eventId: quoted.invocationId })).statusCode,
    200,
  );
  assert.equal((await postWorker(`${task}/acks`, {})).statusCode, 200);
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `${workerBase}/events?once=1`,
        headers: { authorization: `Bearer ${worker}` },
      })
    ).json().events.length,
    0,
  );
  const report = (sequence: number, type: string, data: unknown = {}) => ({
    reportId: `report-${sequence}`,
    sequence,
    type,
    data,
  });
  // Exercise a real open HTTP socket: injection's once=1 snapshots cannot
  // prove that a browser EventSource stays connected for later LLM chunks.
  const listenAddress = await app.listen({ host: "127.0.0.1", port: 0 });
  const stopLive = new AbortController();
  try {
    const live = await fetch(`${listenAddress}/v1/threads/${thread.id}/ag-ui/events?after=0`, {
      headers: { origin, cookie },
      signal: stopLive.signal,
    });
    assert.equal(live.status, 200);
    const reader = live.body!.getReader();
    const welcome = await reader.read();
    assert.equal(welcome.done, false);
    assert.match(new TextDecoder().decode(welcome.value), /: connected/);
    const firstChunk = reader.read();
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal((await postWorker(`${task}/reports`, report(1, "started"))).statusCode, 200);
    const streamedChunk = await Promise.race([
      firstChunk,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SSE_LATE_EVENT_TIMEOUT")), 4000),
      ),
    ]);
    assert.equal(streamedChunk.done, false, "SSE must remain open until the client closes it");
    assert.match(new TextDecoder().decode(streamedChunk.value), /RUN_STARTED/);
  } finally {
    stopLive.abort();
  }
  const stream = `${task}/ag-ui/streams/${runId}`;
  const emit = (sequence: number, event: unknown) =>
    JSON.stringify({ streamSequence: sequence, event }) + "\n";
  const openui = (source: string) => ({
    type: "CUSTOM",
    name: "payvoke.openui",
    value: { surfaceId: surface, source },
  });
  const surface = "result";
  const ndjson = [
    emit(1, { type: "TEXT_MESSAGE_START", messageId: "answer", role: "assistant" }),
    emit(2, { type: "TEXT_MESSAGE_CONTENT", messageId: "answer", delta: "Xin " }),
    // The root streams first; its children resolve as later statements arrive.
    emit(3, openui("root = Stack([summary, score])")),
    emit(4, openui('summary = Text("Draft")')),
    emit(5, openui('score = Metric("Score", 90, "/100")')),
    emit(6, { type: "TEXT_MESSAGE_CONTENT", messageId: "answer", delta: "chào" }),
    emit(7, openui('summary = Text("Final")')),
    emit(8, { type: "TEXT_MESSAGE_END", messageId: "answer" }),
  ].join("");
  const beforeStream = (await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`)).json().cursor;
  const stopDeltas = new AbortController();
  let streamed: Response;
  let finishUpload = () => {};
  try {
    const live = await fetch(
      `${listenAddress}/v1/threads/${thread.id}/ag-ui/events?after=${beforeStream}`,
      {
        headers: { origin, cookie },
        signal: stopDeltas.signal,
      },
    );
    assert.equal(live.status, 200);
    const reader = live.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /: connected/);
    const lines = ndjson.split("\n").filter(Boolean);
    const uploadBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${lines.slice(0, 2).join("\n")}\n`));
        finishUpload = () => {
          controller.enqueue(new TextEncoder().encode(`${lines.slice(2).join("\n")}\n`));
          controller.close();
        };
      },
    });
    const upload = fetch(`${listenAddress}${stream}`, {
      method: "POST",
      headers: { authorization: `Bearer ${worker}`, "content-type": "application/x-ndjson" },
      body: uploadBody,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    let received = "";
    const timeout = AbortSignal.timeout(4000);
    while (!received.includes("TEXT_MESSAGE_CONTENT")) {
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          timeout.addEventListener("abort", () => reject(new Error("SSE_TEXT_WIDGET_TIMEOUT")), {
            once: true,
          }),
        ),
      ]);
      assert.equal(next.done, false, "SSE must remain open while the provider streams");
      received += new TextDecoder().decode(next.value);
    }
    assert.match(received, /Xin /);
    assert.equal(
      (await db.invocation.findUniqueOrThrow({ where: { id: quoted.invocationId } }))
        .executionStatus,
      "RUNNING",
    );
    // The provider upload is still open while the buyer has already received
    // the first LLM delta. Complete the same HTTP stream with OpenUI updates.
    finishUpload();
    finishUpload = () => {};
    streamed = await upload;
    const endTimeout = AbortSignal.timeout(4000);
    while (!received.includes('summary = Text(\\"Final\\")')) {
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          endTimeout.addEventListener("abort", () => reject(new Error("SSE_OPENUI_TIMEOUT")), {
            once: true,
          }),
        ),
      ]);
      assert.equal(next.done, false);
      received += new TextDecoder().decode(next.value);
    }
    assert.match(received, /openui-surface/);
    // Surface activity IDs are namespaced by run exactly once, so replays and
    // redefined statements target the same widget.
    assert.ok(received.includes(`${runId}-openui-${surface}`));
    // This live browser connection received LLM text and OpenUI before the
    // provider could submit its final result report.
    assert.equal(
      (await db.invocation.findUniqueOrThrow({ where: { id: quoted.invocationId } }))
        .executionStatus,
      "RUNNING",
    );
  } finally {
    finishUpload();
    stopDeltas.abort();
  }
  const streamedBody = await streamed.text();
  assert.equal(streamed.status, 200, streamedBody);
  assert.equal(JSON.parse(streamedBody).lastCommittedSequence, 8);
  assert.equal(
    (
      await postWorker(
        stream,
        emit(8, { type: "TEXT_MESSAGE_END", messageId: "answer" }),
        worker,
        "application/x-ndjson",
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await postWorker(
        stream,
        emit(8, { type: "TEXT_MESSAGE_END", messageId: "other" }),
        worker,
        "application/x-ndjson",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await postWorker(
        stream,
        emit(9, { type: "TOOL_CALL_START", toolCallId: "danger" }),
        worker,
        "application/x-ndjson",
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await postWorker(
        stream,
        emit(9, { type: "TEXT_MESSAGE_START", messageId: "x", role: "system" }),
        worker,
        "application/x-ndjson",
      )
    ).statusCode,
    400,
  );
  // Markup, unknown components, tool calls and partial statements never reach
  // the buyer, and a rejected patch does not consume its sequence.
  for (const [source, code] of [
    ['summary = Text("<script>x</script>")', "UNSAFE_OPENUI_VALUE"],
    ['summary = Text("https://evil.example")', "UNSAFE_OPENUI_VALUE"],
    ['summary = Iframe("x")', "UNKNOWN_OPENUI_COMPONENT"],
    ['users = Query("list_users", {})', "UNSAFE_OPENUI_VALUE"],
    ['score = Metric("Score")', "INVALID_OPENUI"],
    ['summary = Text("unterminated', "INVALID_OPENUI"],
  ]) {
    const rejected = await postWorker(
      stream,
      emit(9, openui(source)),
      worker,
      "application/x-ndjson",
    );
    assert.equal(rejected.statusCode, 400, source);
    assert.match(rejected.body, new RegExp(code), source);
  }
  const snapshot = await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`);
  assert.equal(snapshot.statusCode, 200, snapshot.body);
  assert.equal(snapshot.json().messages[0].content, "Xin chào");
  assert.equal(
    snapshot.json().surfaces[0].content.source,
    [
      "root = Stack([summary, score])",
      'summary = Text("Draft")',
      'score = Metric("Score", 90, "/100")',
      'summary = Text("Final")',
    ].join("\n"),
  );
  assert.equal(snapshot.json().surfaces[0].content.invocationId, quoted.invocationId);
  const openuiCatalog = (await web("GET", "/v1/openui/catalog")).json();
  assert.equal(openuiCatalog.root, "Stack");
  assert.match(openuiCatalog.prompt, /Metric\(label: string/);
  const streamedToBuyer = await web("GET", `/v1/threads/${thread.id}/ag-ui/events?once=1&after=0`);
  assert.equal(streamedToBuyer.statusCode, 200, streamedToBuyer.body);
  assert.match(streamedToBuyer.body, /event: ag-ui/);
  assert.match(streamedToBuyer.body, /TEXT_MESSAGE_CONTENT/);
  const resumedToBuyer = await app.inject({
    method: "GET",
    url: `/v1/threads/${thread.id}/ag-ui/events?once=1&after=0`,
    headers: { origin, cookie, "last-event-id": snapshot.json().cursor },
  });
  assert.equal(resumedToBuyer.statusCode, 200, resumedToBuyer.body);
  assert.doesNotMatch(resumedToBuyer.body, /event: ag-ui/);
  // A question ends the current run and parks the invocation in WAITING_BUYER.
  // The buyer answer is free and starts a new run for the same invocation/hold.
  const questionReport = report(2, "question", {
    questionId: "format",
    prompt: "Which format should I use?",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["format"],
      properties: { format: { type: "string", enum: ["md", "txt"] } },
    },
  });
  assert.equal((await postWorker(`${task}/reports`, questionReport)).statusCode, 200);
  assert.equal(
    (await web("GET", `/v1/invocations/${quoted.invocationId}`)).json().executionStatus,
    "WAITING_BUYER",
  );
  const questionSnapshot = await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`);
  assert.equal(questionSnapshot.json().questions.at(-1).questionId, "format");
  assert.equal(questionSnapshot.json().questions.at(-1).status, "OPEN");
  const answerBody = {
    questionId: "format",
    arguments: { format: "md" },
    clientRequestId: "answer-format",
  };
  const answered = await web("POST", `/v1/invocations/${quoted.invocationId}/answers`, answerBody);
  assert.equal(answered.statusCode, 202, answered.body);
  const continuationRun = answered.json().runId;
  assert.notEqual(continuationRun, runId);
  assert.equal(
    (await web("POST", `/v1/invocations/${quoted.invocationId}/answers`, answerBody)).statusCode,
    202,
  );
  assert.equal(
    (
      await web("POST", `/v1/invocations/${quoted.invocationId}/answers`, {
        ...answerBody,
        clientRequestId: "answer-format-2",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await web("POST", `/v1/invocations/${quoted.invocationId}/answers`, {
        questionId: "format",
        arguments: { format: "pdf" },
        clientRequestId: "answer-format-3",
      })
    ).statusCode,
    409,
  );
  const continuationEvents = await app.inject({
    method: "GET",
    url: `${workerBase}/events?once=1`,
    headers: { authorization: `Bearer ${worker}` },
  });
  const continuationEvent = continuationEvents
    .json()
    .events.find((event: { type: string }) => event.type === "invocation.answer");
  assert.equal(continuationEvent.runId, continuationRun);
  assert.deepEqual(continuationEvent.arguments, { format: "md" });
  assert.equal(
    (await postWorker(`${task}/acks`, { eventId: answered.json().answerId })).statusCode,
    200,
  );
  assert.equal((await postWorker(`${task}/reports`, report(1, "started"))).statusCode, 200);
  const continuationStream = `${task}/ag-ui/streams/${continuationRun}`;
  const continuationNdjson = [
    emit(1, { type: "TEXT_MESSAGE_START", messageId: "answer2", role: "assistant" }),
    emit(2, { type: "TEXT_MESSAGE_CONTENT", messageId: "answer2", delta: "Tiếp " }),
    emit(3, { type: "TEXT_MESSAGE_CONTENT", messageId: "answer2", delta: "tục" }),
    emit(4, { type: "TEXT_MESSAGE_END", messageId: "answer2" }),
  ].join("");
  assert.equal(
    (await postWorker(continuationStream, continuationNdjson, worker, "application/x-ndjson"))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await postWorker(
        stream,
        emit(9, { type: "TEXT_MESSAGE_END", messageId: "answer" }),
        worker,
        "application/x-ndjson",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await postWorker(
        `${task}/reports`,
        report(2, "result", { artifactVersion: 1, output: { wrong: "x" }, files: [] }),
      )
    ).statusCode,
    400,
  );
  const validResult = report(2, "result", {
    artifactVersion: 1,
    output: { summary: "Done" },
    files: [],
  });
  assert.equal((await postWorker(`${task}/reports`, validResult)).statusCode, 200);
  assert.equal((await postWorker(`${task}/reports`, validResult)).statusCode, 200);
  assert.equal(
    (
      await postWorker(`${task}/reports`, {
        ...validResult,
        data: { artifactVersion: 1, output: { summary: "Changed" }, files: [] },
      })
    ).statusCode,
    409,
  );
  const invocationStatus = await web("GET", `/v1/invocations/${quoted.invocationId}`);
  assert.equal(invocationStatus.json().executionStatus, "VERIFYING");
  const unverified = await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`);
  assert.equal(unverified.json().invocations[0].output, null);
  assert.equal(await verifyStructuredDeliveries(db), 1);
  assert.equal(await verifyStructuredDeliveries(db), 0);
  assert.equal(await db.paymentDeliveryEvidence.count(), 1);
  const delivered = await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`);
  assert.equal(delivered.json().invocations[0].executionStatus, "DELIVERED");
  assert.deepEqual(delivered.json().invocations[0].output, { summary: "Done" });
  const threadDetails = await web("GET", `/v1/threads/${thread.id}`);
  assert.equal(threadDetails.json().activeQuoteId, null);
  assert.equal(threadDetails.json().revisionPolicy.maxIncluded, 1);
  // An in-scope revision reuses the invocation/hold and starts one more run.
  const revisionBody = { reason: "Shorten the summary", clientRequestId: "revision-1" };
  const revision = await web(
    "POST",
    `/v1/invocations/${quoted.invocationId}/revisions`,
    revisionBody,
  );
  assert.equal(revision.statusCode, 202, revision.body);
  const revisionRun = revision.json().runId;
  assert.notEqual(revisionRun, continuationRun);
  assert.equal(
    (await web("POST", `/v1/invocations/${quoted.invocationId}/revisions`, revisionBody))
      .statusCode,
    202,
  );
  const revisionEvents = await app.inject({
    method: "GET",
    url: `${workerBase}/events?once=1`,
    headers: { authorization: `Bearer ${worker}` },
  });
  const revisionEvent = revisionEvents
    .json()
    .events.find((event: { type: string }) => event.type === "invocation.revision_requested");
  assert.equal(revisionEvent.runId, revisionRun);
  assert.equal(revisionEvent.targetArtifactVersion, 1);
  assert.equal(
    (await postWorker(`${task}/acks`, { eventId: revision.json().revisionId })).statusCode,
    200,
  );
  assert.equal((await postWorker(`${task}/reports`, report(1, "started"))).statusCode, 200);
  assert.equal(
    (
      await postWorker(
        `${task}/reports`,
        report(2, "result", { artifactVersion: 1, output: { summary: "Same" }, files: [] }),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await postWorker(
        `${task}/reports`,
        report(2, "result", { artifactVersion: 2, output: { summary: "Short" }, files: [] }),
      )
    ).statusCode,
    200,
  );
  assert.equal(await verifyStructuredDeliveries(db), 1);
  const revised = await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`);
  assert.equal(revised.json().invocations[0].executionStatus, "DELIVERED");
  assert.deepEqual(revised.json().invocations[0].output, { summary: "Short" });
  assert.equal(
    (
      await web("POST", `/v1/invocations/${quoted.invocationId}/revisions`, {
        reason: "Again",
        clientRequestId: "revision-2",
      })
    ).statusCode,
    409,
  );
  // Cursors older than the replay window must bootstrap from the snapshot.
  const earliest = await db.aguiStreamEvent.findMany({
    where: { threadId: thread.id },
    orderBy: { cursor: "asc" },
    take: 2,
    select: { cursor: true },
  });
  await db.aguiStreamEvent.updateMany({
    where: { cursor: { in: earliest.map((event) => event.cursor) } },
    data: { createdAt: new Date(Date.now() - 8 * 86400000) },
  });
  assert.equal(
    (await web("GET", `/v1/threads/${thread.id}/ag-ui/events?once=1&after=${earliest[0].cursor}`))
      .statusCode,
    409,
  );
  // A verified chat turn frees the admission slot while preserving its
  // original held payment and complete transcript.
  await db.app.update({ where: { id }, data: { status: "ACTIVE", lastHeartbeatAt: new Date() } });
  const nextQuote = await app.inject({
    method: "POST",
    url: "/v1/quotes",
    headers: { origin, cookie, "idempotency-key": "second-paid-turn" },
    payload: {
      threadId: thread.id,
      commandId,
      arguments: { text: "follow up" },
      contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
      clientRequestId: "second-paid-turn",
    },
  });
  assert.equal(nextQuote.statusCode, 201, nextQuote.body);
  assert.deepEqual(
    nextQuote
      .json()
      .contextManifest.messages.map(({ role, content }: { role: string; content: string }) => ({
        role,
        content,
      })),
    [
      { role: "user", content: "hello" },
      { role: "assistant", content: "Xin chào\nTiếp tục" },
    ],
  );
  assert.equal(
    (await web("GET", `/v1/threads/${thread.id}/ag-ui/snapshot`)).json().prompts.length,
    2,
  );
  const rotated = await web("POST", keys, {
    scopes: ["products:write"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(rotated.statusCode, 201, rotated.body);
  assert.equal(
    (
      await bearer("POST", `/v1/provider/apps/${id}/commands`, {
        name: "old",
        description: "No",
        options: [{ name: "text", type: "STRING", required: true }],
        grossAmount: "10000",
        terms,
      })
    ).statusCode,
    401,
  );
  const restricted = await web("POST", keys, {
    scopes: ["events:read"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(restricted.statusCode, 201, restricted.body);
  assert.equal(
    (
      await bearer(
        "POST",
        `/v1/provider/apps/${id}/commands`,
        {
          name: "denied",
          description: "No",
          options: [{ name: "text", type: "STRING", required: true }],
          grossAmount: "10000",
          terms,
        },
        restricted.json().secret,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await web("POST", `/v1/provider/apps/${id}/keys/${restricted.json().id}/revocations`))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await bearer(
        "POST",
        `/v1/provider/apps/${id}/commands`,
        {
          name: "revoked",
          description: "No",
          options: [{ name: "text", type: "STRING", required: true }],
          grossAmount: "10000",
          terms,
        },
        restricted.json().secret,
      )
    ).statusCode,
    401,
  );
});
