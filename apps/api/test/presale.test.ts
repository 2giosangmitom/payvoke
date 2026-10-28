/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "@/core/db";
import { hashSnapshot, type Json } from "@payvoke/shared/protocol";
import { readMigrations, startTestPostgres, type TestPostgres } from "@test/kit/database";

const origin = "https://app.payvoke.test";
const schema = `presale_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const LIMIT = 4;
let postgres: TestPostgres;
let pool: Pool;
let db: PrismaClient;
let app: ReturnType<typeof createApp>;

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
  const config = loadConfig({
    DATABASE_URL: connectionString,
    // Unused: the test passes in-process signals.
    REDIS_URL: "redis://127.0.0.1:1",
    WEB_ORIGIN: origin,
    API_ORIGIN: "https://api.payvoke.test",
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
    LOG_LEVEL: "silent",
    VAULT_ADDRESS: wallet.address,
    PRESALE_MESSAGE_LIMIT: String(LIMIT),
  });
  app = createApp(config, db);
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

const terms = {
  deliverySeconds: 600,
  reviewSeconds: 3600,
  revisionPolicy: { maxIncluded: 0, description: "None" },
  refundPolicy: "Refund undelivered",
  sideEffects: "none",
  dataUse: "This request",
};
const options = [
  { name: "brief", type: "STRING", required: true },
  { name: "pages", type: "INTEGER", required: false },
];

// Two apps with worker keys and an active policy: "agent" caps its command at
// 50000, "tool" has no cap. Holds are fixtures, as in the catalog test.
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
  const provider = async (label: string, extra: Record<string, unknown>) => {
    const created = await web("POST", "/v1/provider/apps", {
      name: `${label} ${randomUUID().slice(0, 6)}`,
      payoutAddress: wallet.address,
      clientRequestId: randomUUID(),
    });
    assert.equal(created.statusCode, 201, created.body);
    const appId = created.json().id as string;
    const command = await web("POST", `/v1/provider/apps/${appId}/commands`, {
      name: "write",
      description: "Writes a document",
      options,
      positionalParameter: "brief",
      terms,
      ...extra,
    });
    assert.equal(command.statusCode, 201, command.body);
    const commandId = command.json().id as string;
    await web("POST", `/v1/provider/apps/${appId}/commands/${commandId}/default`, {});
    await db.app.update({ where: { id: appId }, data: { lastHeartbeatAt: new Date() } });
    const key = await web("POST", `/v1/provider/apps/${appId}/keys`, {});
    assert.equal(key.statusCode, 201, key.body);
    const worker = (method: string, url: string, payload?: unknown, secret = key.json().secret) =>
      app.inject({
        method: method as "GET",
        url: `/v1/provider/apps/${appId}${url}`,
        headers: { authorization: `Bearer ${secret}` },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      });
    const thread = async () =>
      (await web("POST", "/v1/threads", { appId, clientRequestId: randomUUID() })).json()
        .id as string;
    return { appId, commandId, worker, thread, key: key.json().secret as string };
  };
  const agent = await provider("Agent", { maxAmount: "50000" });
  const tool = await provider("Tool", {});
  const quote = (payload: Record<string, unknown>, userCookie = cookie, id = randomUUID()) =>
    app.inject({
      method: "POST",
      url: "/v1/quotes",
      headers: { origin, cookie: userCookie, "idempotency-key": id },
      payload: {
        contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
        clientRequestId: id,
        ...payload,
      },
    });
  const say = (threadId: string, body: Record<string, unknown>, userCookie = cookie) =>
    web(
      "POST",
      `/v1/threads/${threadId}/messages`,
      { clientRequestId: randomUUID(), ...body },
      userCookie,
    );
  const offer = (threadId: string, body: Record<string, unknown> = {}) =>
    agent.worker("POST", `/threads/${threadId}/offers`, {
      clientRequestId: randomUUID(),
      arguments: { brief: "A two page summary" },
      grossAmount: "20000",
      summary: "Two-page summary of your brief, delivered as JSON.",
      ...body,
    });
  const buyer = await db.walletAddress.findFirstOrThrow({
    where: { address: { equals: wallet.address, mode: "insensitive" } },
  });
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
  return { web, cookie, otherCookie, agent, tool, quote, say, offer, hold };
}

it("talks to every app, prices only by offer and takes one answer per bot form", async () => {
  const { web, agent, tool, quote, say, offer } = await marketplace();
  // Commands carry no price of their own; pricing fields are rejected.
  const define = (extra: Record<string, unknown>) =>
    web("POST", `/v1/provider/apps/${tool.appId}/commands`, {
      name: `c${randomUUID().slice(0, 6)}`,
      description: "x",
      options,
      terms,
      ...extra,
    });
  for (const extra of [
    { pricing: { mode: "fixed", amount: "10000" } },
    { grossAmount: "10000" },
    { outputSchema: { type: "object" } },
  ])
    assert.equal((await define(extra)).json().error, "INVALID_COMMAND");
  assert.equal((await define({ maxAmount: "1.5" })).json().error, "INVALID_MAX_AMOUNT");
  assert.equal((await define({ maxAmount: "999" })).json().error, "PRICE_BELOW_FLOOR");

  const listed = (await web("GET", `/v1/apps/${agent.appId}`)).json();
  assert.equal(listed.priceCap, "50000");
  assert.equal(listed.commands[0].revision.maxGrossAmount, "50000");
  assert.equal((await web("GET", `/v1/apps/${tool.appId}`)).json().priceCap, null);

  // Every app takes interactions; a quote always needs the bot's offer.
  const toolThread = await tool.thread();
  assert.equal((await say(toolThread, { content: "hi" })).statusCode, 201);
  const byCommand = await quote({
    threadId: toolThread,
    commandId: tool.commandId,
    arguments: { brief: "x" },
  });
  assert.equal(byCommand.statusCode, 400, byCommand.body);
  assert.equal(
    (await quote({ threadId: toolThread, offerId: randomUUID() })).json().error,
    "OFFER_NOT_FOUND",
  );
  const agentThread = await agent.thread();
  assert.equal((await offer(agentThread)).json().error, "NO_BUYER_REQUEST");

  // A bot form takes exactly one validated answer from the thread's buyer.
  const form = {
    title: "Scope",
    description: "Tell us the length",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["pages"],
      properties: { pages: { type: "integer", minimum: 1, maximum: 50, title: "Pages" } },
    },
  };
  const asked = await tool.worker("POST", `/threads/${toolThread}/messages`, {
    content: "How long should it be?",
    form,
    clientRequestId: randomUUID(),
  });
  assert.equal(asked.statusCode, 201, asked.body);
  assert.deepEqual(asked.json().form, form);
  const reply = (args: unknown, extra: Record<string, unknown> = {}) =>
    say(toolThread, { content: "Answer", replyToId: asked.json().id, arguments: args, ...extra });
  assert.equal((await reply({ pages: 0 })).json().error, "INVALID_ARGUMENTS");
  assert.equal(
    (await reply({ pages: 2 }, { commandId: tool.commandId })).json().error,
    "INVALID_MESSAGE",
  );
  const plain = await say(toolThread, { content: "plain" });
  assert.equal(
    (await say(toolThread, { content: "x", replyToId: plain.json().id, arguments: {} })).json()
      .error,
    "FORM_NOT_FOUND",
  );
  const answered = await reply({ pages: 3 });
  assert.equal(answered.statusCode, 201, answered.body);
  assert.deepEqual(answered.json().arguments, { pages: 3 });
  assert.equal((await reply({ pages: 4 })).json().error, "FORM_ALREADY_ANSWERED");
  const snapshot = (await web("GET", `/v1/threads/${toolThread}/ag-ui/snapshot`)).json();
  assert.equal(
    snapshot.conversation.find((m: { id: string }) => m.id === answered.json().id).replyToId,
    asked.json().id,
  );

  // The bot prices freely above the floor on an uncapped command.
  const priced = await tool.worker("POST", `/threads/${toolThread}/offers`, {
    clientRequestId: randomUUID(),
    arguments: { brief: "Three pages" },
    grossAmount: "900000000",
    summary: "Three pages",
  });
  assert.equal(priced.statusCode, 201, priced.body);
  const accepted = await quote({ threadId: toolThread, offerId: priced.json().id });
  assert.equal(accepted.statusCode, 201, accepted.body);
  assert.equal(accepted.json().grossAmount, "900000000");
  assert.equal(accepted.json().inputSnapshot.schemaVersion, 2);
  assert.equal(accepted.json().termsSnapshot.schemaVersion, 2);
});

it("delivers free pre-sale messages to the provider feed with bounded abuse", async () => {
  const { web, otherCookie, agent, tool, say } = await marketplace();
  const threadId = await agent.thread();

  const clientRequestId = randomUUID();
  const first = await say(threadId, { content: "  Need a summary  ", clientRequestId });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().content, "Need a summary");
  assert.equal(first.json().seq, 1);
  const replay = await say(threadId, { content: "Need a summary", clientRequestId });
  assert.equal(replay.json().id, first.json().id);
  assert.equal(
    (await say(threadId, { content: "changed", clientRequestId })).json().error,
    "IDEMPOTENCY_CONFLICT",
  );
  // Slash commands are validated against the command schema; nothing is quoted.
  assert.equal(
    (await say(threadId, { content: "/write", commandId: agent.commandId, arguments: {} })).json()
      .error,
    "INVALID_ARGUMENTS",
  );
  const slash = await say(threadId, {
    content: "/write cats",
    commandId: agent.commandId,
    arguments: { brief: "cats" },
  });
  assert.equal(slash.statusCode, 201, slash.body);
  assert.equal(
    (await say(threadId, { content: "hi" }, otherCookie)).json().error,
    "THREAD_NOT_FOUND",
  );
  assert.equal(
    (await say(threadId, { content: "x".repeat(4001) })).json().error,
    "INVALID_MESSAGE",
  );

  const feed = await agent.worker("GET", "/events?once=1");
  const events = feed.json().events.filter((e: { type: string }) => e.type === "thread.message");
  assert.equal(events.length, 2);
  assert.equal(events[1].threadId, threadId);
  assert.deepEqual(events[1].arguments, { brief: "cats" });
  assert.deepEqual(
    events[1].conversation.map((m: { seq: number }) => m.seq),
    [1, 2],
  );
  // Other apps neither see nor acknowledge this thread's messages.
  const foreign = await tool.worker("GET", "/events?once=1");
  assert.equal(foreign.json().events.length, 0);
  assert.equal(
    (await tool.worker("POST", `/threads/${threadId}/messages/${events[0].id}/acks`)).statusCode,
    404,
  );
  const ack = await agent.worker("POST", `/threads/${threadId}/messages/${events[0].id}/acks`);
  assert.equal(ack.statusCode, 200, ack.body);
  const remaining = (await agent.worker("GET", "/events?once=1")).json().events;
  assert.deepEqual(
    remaining.map((e: { id: string }) => e.id),
    [events[1].id],
  );

  // Provider replies are plain text and cannot flood a silent buyer.
  for (let n = 0; n < 5; n++) {
    const reply = await agent.worker("POST", `/threads/${threadId}/messages`, {
      content: `Question ${n}`,
      clientRequestId: randomUUID(),
    });
    assert.equal(reply.statusCode, 201, reply.body);
    assert.equal(reply.json().role, "PROVIDER");
  }
  assert.equal(
    (
      await agent.worker("POST", `/threads/${threadId}/messages`, {
        content: "One more",
        clientRequestId: randomUUID(),
      })
    ).json().error,
    "PROVIDER_MESSAGE_LIMIT",
  );

  const detail = (await web("GET", `/v1/threads/${threadId}`)).json();
  assert.deepEqual(detail.presale, { limit: LIMIT, remaining: LIMIT - 2 });
  await say(threadId, { content: "third" });
  await say(threadId, { content: "fourth" });
  assert.equal((await say(threadId, { content: "fifth" })).json().error, "PRESALE_LIMIT_REACHED");

  // Browsers open this stream cross-origin with credentials.
  const stream = await web("GET", `/v1/threads/${threadId}/ag-ui/events?once=1`);
  assert.equal(stream.headers["access-control-allow-origin"], origin);
  assert.equal(stream.headers["access-control-allow-credentials"], "true");

  const snapshot = (await web("GET", `/v1/threads/${threadId}/ag-ui/snapshot`)).json();
  assert.equal(snapshot.conversation.length, 9);
  assert.deepEqual(snapshot.conversation.map((m: { role: string }) => m.role).slice(0, 3), [
    "BUYER",
    "BUYER",
    "PROVIDER",
  ]);
});

it("turns exactly one open offer into a quote that freezes the negotiation", async () => {
  const { web, cookie, otherCookie, agent, quote, say, offer, hold } = await marketplace();
  const threadId = await agent.thread();
  await say(threadId, { content: "Summarize my brief in two pages" });

  // Offers stay inside the published range, policy and registered terms.
  for (const [body, error] of [
    [{ grossAmount: "999" }, "PRICE_BELOW_FLOOR"],
    [{ grossAmount: "50001" }, "PRICE_ABOVE_MAX"],
    [{ deliverySeconds: 601 }, "INVALID_DELIVERY_SECONDS"],
    [{ arguments: { pages: 2 } }, "INVALID_ARGUMENTS"],
    [{ summary: "" }, "INVALID_OFFER"],
    [{ validForSeconds: 10 }, "INVALID_OFFER"],
  ] as const)
    assert.equal((await offer(threadId, body)).json().error, error, JSON.stringify(body));
  const narrow = await web("POST", `/v1/provider/apps/${agent.appId}/keys`, {
    scopes: ["events:read"],
  });
  assert.equal(narrow.statusCode, 201, narrow.body);
  // Issuing a key revokes the previous one; re-issue a full key afterwards.
  const scoped = await agent.worker(
    "POST",
    `/threads/${threadId}/offers`,
    { clientRequestId: randomUUID(), arguments: {}, grossAmount: "1", summary: "x" },
    narrow.json().secret,
  );
  assert.equal(scoped.json().error, "INSUFFICIENT_SCOPE");
  const full = (await web("POST", `/v1/provider/apps/${agent.appId}/keys`, {})).json().secret;
  const offerAs = (body: Record<string, unknown> = {}) =>
    agent.worker(
      "POST",
      `/threads/${threadId}/offers`,
      {
        clientRequestId: randomUUID(),
        arguments: { brief: "A two page summary" },
        grossAmount: "20000",
        summary: "Two-page summary of your brief.",
        ...body,
      },
      full,
    );

  const first = await offerAs({ grossAmount: "30000" });
  assert.equal(first.statusCode, 201, first.body);
  const second = await offerAs({ deliverySeconds: 300 });
  assert.equal(second.statusCode, 201, second.body);
  const accept = (offerId: string, userCookie = cookie, id = randomUUID()) =>
    quote({ threadId, offerId }, userCookie, id);
  // A new offer supersedes the open one; only the latest can be accepted.
  assert.equal((await accept(first.json().id)).json().error, "OFFER_NOT_OPEN");
  assert.equal((await accept(second.json().id, otherCookie)).json().error, "THREAD_NOT_FOUND");

  const requestId = randomUUID();
  const quoted = await accept(second.json().id, cookie, requestId);
  assert.equal(quoted.statusCode, 201, quoted.body);
  const document = quoted.json();
  assert.equal(document.grossAmount, "20000");
  assert.equal(document.inputSnapshot.schemaVersion, 2);
  assert.equal(document.termsSnapshot.definition.deliverySeconds, 300);
  assert.equal(document.deliveryDeadline - document.validUntil, 300);
  assert.deepEqual(document.inputSnapshot.arguments, { brief: "A two page summary" });
  const frozen = document.inputSnapshot.offer;
  assert.equal(frozen.offerId, second.json().id);
  assert.equal(frozen.conversation[0].content, "Summarize my brief in two pages");
  assert.equal(frozen.conversationHash, hashSnapshot(frozen.conversation as Json));
  // Single use: a replay returns the same quote, a new request is refused.
  assert.equal(
    (await accept(second.json().id, cookie, requestId)).json().quoteId,
    document.quoteId,
  );
  assert.equal((await accept(second.json().id)).json().error, "THREAD_BUSY");
  // Even with the thread slot free again, an accepted offer is spent.
  await db.chatThread.update({ where: { id: threadId }, data: { activeQuoteId: null } });
  assert.equal((await accept(second.json().id)).json().error, "OFFER_NOT_OPEN");
  await db.chatThread.update({
    where: { id: threadId },
    data: { activeQuoteId: document.quoteId },
  });
  const stored = await db.offer.findUniqueOrThrow({ where: { id: second.json().id } });
  assert.equal(stored.status, "ACCEPTED");
  assert.equal(stored.quoteId, document.quoteId);

  await hold(document);
  const ready = (await agent.worker("GET", "/events?once=1", undefined, full))
    .json()
    .events.find((e: { type: string }) => e.type === "invocation.ready");
  assert.equal(ready.input.offer.offerId, second.json().id);
  // A paid invocation resets the free message allowance.
  const detail = (await web("GET", `/v1/threads/${threadId}`)).json();
  assert.deepEqual(detail.presale, { limit: LIMIT, remaining: LIMIT });

  const activity = await web("GET", "/v1/invocations");
  assert.equal(activity.statusCode, 200, activity.body);
  const row = activity
    .json()
    .items.find((item: { invocationId: string }) => item.invocationId === document.invocationId);
  assert.equal(row.grossAmount, "20000");
  assert.equal(row.commandName, "write");
  assert.equal(row.paymentStatus, "HELD");
  assert.equal(
    (await web("GET", "/v1/invocations", undefined, otherCookie))
      .json()
      .items.some((item: { invocationId: string }) => item.invocationId === document.invocationId),
    false,
  );
});

it("closes offers by withdrawal, decline and expiry", async () => {
  const { web, otherCookie, agent, quote, say, offer } = await marketplace();
  const threadId = await agent.thread();
  await say(threadId, { content: "Quote me" });

  const withdrawn = (await offer(threadId)).json();
  const withdrawal = await agent.worker(
    "POST",
    `/threads/${threadId}/offers/${withdrawn.id}/withdrawals`,
  );
  assert.equal(withdrawal.json().status, "WITHDRAWN");
  assert.equal((await quote({ threadId, offerId: withdrawn.id })).json().error, "OFFER_NOT_OPEN");

  const declined = (await offer(threadId)).json();
  assert.equal(
    (await web("POST", `/v1/threads/${threadId}/offers/${declined.id}/declines`, {}, otherCookie))
      .statusCode,
    404,
  );
  const decline = await web("POST", `/v1/threads/${threadId}/offers/${declined.id}/declines`, {});
  assert.equal(decline.json().status, "DECLINED");
  assert.equal(
    (await web("POST", `/v1/threads/${threadId}/offers/${declined.id}/declines`, {})).json().error,
    "OFFER_NOT_OPEN",
  );

  const expired = (await offer(threadId)).json();
  await db.offer.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  assert.equal((await quote({ threadId, offerId: expired.id })).json().error, "OFFER_NOT_OPEN");

  const snapshot = (await web("GET", `/v1/threads/${threadId}/ag-ui/snapshot`)).json();
  assert.deepEqual(
    snapshot.offers.map((o: { status: string }) => o.status),
    ["WITHDRAWN", "DECLINED", "EXPIRED"],
  );
});
