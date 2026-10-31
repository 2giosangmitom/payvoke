/// <reference types="emscripten" />
/// <reference types="bun" />
import { inject } from "#test/kit/http";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, it } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "#core/db";
import { hashSnapshot, type Json } from "@payvoke/shared/protocol";
import { readMigrations, startTestPostgres, type TestPostgres } from "#test/kit/database";

const origin = "https://app.payvoke.test";
const schema = `people_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const LIMIT = 4;
let postgres: TestPostgres;
let pool: Pool;
let db: PrismaClient;
let app: ReturnType<typeof createApp>;

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
      inject(app, {
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
    inject(app, {
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

it("streams a provider reply in sequence and closes it once", async () => {
  const { agent, say } = await marketplace();
  const threadId = await agent.thread();
  await say(threadId, { content: "Hello" });
  const opened = await agent.worker("POST", `/threads/${threadId}/messages`, {
    clientRequestId: "reply-1",
    streaming: true,
  });
  assert.equal(opened.statusCode, 201, opened.body);
  assert.equal(opened.json().streaming, true);
  const id = opened.json().id as string;
  const delta = (body: Record<string, unknown>) =>
    agent.worker("POST", `/threads/${threadId}/messages/${id}/deltas`, body);

  assert.equal((await delta({ sequence: 2, delta: "late" })).json().error, "STREAM_SEQUENCE_GAP");
  assert.equal((await delta({ sequence: 1, delta: "Hi " })).json().content, "Hi ");
  // A retried delta is applied once.
  assert.equal((await delta({ sequence: 1, delta: "Hi " })).json().content, "Hi ");
  const live = (await db.threadMessage.findUniqueOrThrow({ where: { id } })).streaming;
  assert.equal(live, true);
  const timeline = await inject(app, {
    method: "GET",
    url: `/v1/threads/${threadId}/timeline`,
    headers: { origin, cookie: await login(wallet) },
  });
  const reply = timeline.json().messages.find((m: { id: string }) => m.id === id);
  assert.equal(reply.status, "running");
  assert.equal(reply.parts[0].streaming, true);

  const closed = await delta({ sequence: 2, delta: "there.", done: true });
  assert.equal(closed.json().content, "Hi there.");
  assert.equal(closed.json().streaming, false);
  assert.equal((await delta({ sequence: 3, delta: "more" })).json().error, "MESSAGE_CLOSED");
  // Reopening with the same request id names the same message.
  const again = await agent.worker("POST", `/threads/${threadId}/messages`, {
    clientRequestId: "reply-1",
    streaming: true,
  });
  assert.equal(again.json().id, id);
});

it("rates agents only after a paid job, and shows owners, usage and profiles", async () => {
  const { web, cookie, otherCookie, agent, quote, offer } = await marketplace();
  const otherUser = await db.walletAddress.findFirstOrThrow({
    where: { address: { equals: other.address, mode: "insensitive" } },
  });

  // Profiles: a display name and bio, shown as the owner of the agent.
  const named = await web("PATCH", "/v1/profile", { displayName: "  Ada  ", bio: "Builds agents" });
  assert.equal(named.statusCode, 200, named.body);
  assert.equal(named.json().name, "Ada");
  assert.equal(
    (await web("PATCH", "/v1/profile", { displayName: "x".repeat(61) })).json().error,
    "INVALID_DISPLAY_NAME",
  );
  const otherProfile = await web("GET", "/v1/profile", undefined, otherCookie);
  assert.match(otherProfile.json().name, /^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/);

  const rate = (score: number, userCookie: string, comment?: string) =>
    web("PUT", `/v1/apps/${agent.appId}/rating`, { score, comment }, userCookie);
  assert.equal((await rate(5, cookie)).json().error, "CANNOT_RATE_OWN_APP");
  assert.equal((await rate(4, otherCookie)).json().error, "RATING_REQUIRES_JOB");
  const before = await web("GET", `/v1/apps/${agent.appId}/ratings`, undefined, otherCookie);
  assert.equal(before.json().reason, "HIRE_FIRST");

  // The other wallet hires the agent once; its payment is held.
  const threadId = (
    await web("POST", "/v1/threads", { appId: agent.appId, clientRequestId: randomUUID() }, otherCookie)
  ).json().id as string;
  await web(
    "POST",
    `/v1/threads/${threadId}/messages`,
    { clientRequestId: randomUUID(), content: "Summarize" },
    otherCookie,
  );
  const priced = await offer(threadId);
  assert.equal(priced.statusCode, 201, priced.body);
  const quoted = (await quote({ threadId, offerId: priced.json().id }, otherCookie)).json();
  await db.invocation.create({
    data: { id: quoted.invocationId, quoteId: quoted.quoteId, buyerId: otherUser.userId },
  });
  await db.settlementOperation.create({
    data: {
      invocationId: quoted.invocationId,
      invocationKey: quoted.protocolQuote.invocationKey,
      quoteDigest: quoted.quoteDigest,
      authorizationDigest: `0x${randomBytes(32).toString("hex")}`,
      recoveredSigner: other.address,
      paymentPayload: {},
      state: "HELD",
    },
  });

  assert.equal((await rate(0, otherCookie)).json().error, "INVALID_RATING");
  const rated = await rate(4, otherCookie, "Fast and clear");
  assert.equal(rated.statusCode, 200, rated.body);
  assert.equal(rated.json().average, 4);
  assert.deepEqual(rated.json().distribution, [0, 0, 0, 1, 0]);
  assert.equal(rated.json().items[0].comment, "Fast and clear");
  assert.equal(rated.json().items[0].mine, true);
  // Rating again replaces the first one.
  assert.equal((await rate(2, otherCookie)).json().count, 1);

  const listed = await web("GET", `/v1/apps?owner=${otherUser.userId}`);
  assert.equal(listed.json().items.length, 0);
  const detail = (await web("GET", `/v1/apps/${agent.appId}`)).json();
  assert.equal(detail.owner.name, "Ada");
  assert.equal(detail.jobs, 1);
  assert.equal(detail.users, 1);
  assert.deepEqual(detail.rating, { average: 2, count: 1 });

  const developer = (await web("GET", `/v1/developers/${detail.ownerId}`)).json();
  assert.equal(developer.name, "Ada");
  assert.equal(developer.bio, "Builds agents");
  assert.ok(developer.totals.jobs >= 1);

  // Earnings go to the owner, spending to the buyer, on today's date.
  const earned = (await web("GET", "/v1/stats")).json();
  const own = earned.provider.apps.find((item: { id: string }) => item.id === agent.appId);
  assert.equal(own.held, "20000");
  assert.equal(own.series.at(-1).jobs, 1);
  const spent = (await web("GET", "/v1/stats", undefined, otherCookie)).json();
  assert.equal(spent.provider, null);
  assert.equal(spent.buyer.held, "20000");
  assert.equal(spent.buyer.topApps[0].id, agent.appId);
});
