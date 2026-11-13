/// <reference types="emscripten" />
/// <reference types="bun" />
import { inject } from "#test/kit/http";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, it } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "#core/db";
import type { GrantReader } from "../src/modules/payments/autopay.service";
import { tokenSigner } from "../src/modules/auth/token-signer";
import { readMigrations, startTestPostgres, type TestPostgres } from "#test/kit/database";

const origin = "https://app.payvoke.test";
const api = "https://api.payvoke.test";
const schema = `mcp_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
let postgres: TestPostgres;
let pool: Pool;
let db: PrismaClient;
let app: ReturnType<typeof createApp>;

// The vault as the API reads it: one autopay grant for the API key's derived
// signer, 5 USDC a job and 100 a day, with `spentToday` already spent.
const USDC = 1_000_000n;
const vault = { spentToday: 0n, signer: stranger.address as Address };
const grantReader: GrantReader = {
  grant: async () => ({
    config: {
      signer: vault.signer,
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      maxPerCall: 5n * USDC,
      periodSeconds: 86400,
      maxPerPeriod: 100n * USDC,
      maxTotal: 500n * USDC,
    },
    epoch: 1n,
    spentTotal: vault.spentToday,
    spentInPeriod: vault.spentToday,
    currentPeriod: BigInt(Math.floor(Date.now() / 1000 / 86400)),
    revoked: false,
  }),
  wallet: async () => ({ balance: 1000n * USDC, allowance: 500n * USDC }),
  nonce: async () => 0n,
  verify: async () => true,
  simulate: async () => null,
};

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
    MAX_APPS_PER_OWNER: "1000",
    APP_CREATES_PER_DAY: "1000",
    DATABASE_URL: connectionString,
    // Unused: the test passes in-process signals.
    REDIS_URL: "redis://127.0.0.1:1",
    WEB_ORIGIN: origin,
    API_ORIGIN: api,
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
    LOG_LEVEL: "silent",
    VAULT_ADDRESS: wallet.address,
  });
  app = createApp(config, db, undefined, undefined, undefined, grantReader);
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  await postgres?.stop();
});

async function login() {
  const nonce = await inject(app, {
    method: "POST",
    url: "/v1/auth/siwe/nonce",
    headers: { origin },
    payload: {},
  });
  const binding = nonce.cookies.find((cookie) => cookie.name.endsWith("payvoke_siwe"))!;
  const issuedAt = new Date();
  const message = createSiweMessage({
    address: wallet.address,
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
    payload: { message, signature: await wallet.signMessage({ message }) },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  const session = verified.cookies.find((cookie) => cookie.name.endsWith("session_token"))!;
  return `${session.name}=${encodeURIComponent(session.value)}`;
}

async function connect(token: string) {
  const client = new Client({ name: "test-host", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", api), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: (url, init) => Promise.resolve(app.request(String(url), init)),
    }),
  );
  return client;
}

const json = (result: unknown) => {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return JSON.parse(content[0].text);
};

it("issues buyer access tokens to sessions only and revokes them", async () => {
  const cookie = await login();
  const web = (method: string, url: string, payload?: unknown, headers = {}) =>
    inject(app, {
      method: method as "GET",
      url,
      headers: { origin, cookie, ...headers },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  const issued = await web("POST", "/v1/access-tokens", { name: "Laptop", expiresInDays: 30 });
  assert.equal(issued.statusCode, 201, issued.body);
  const { id, secret } = issued.json();
  assert.match(secret, /^pvb_[a-f0-9]{16}\.[a-f0-9]{64}$/);
  const listed = (await web("GET", "/v1/access-tokens")).json();
  assert.deepEqual(
    listed.map((token: { id: string; name: string }) => [token.id, token.name]),
    [[id, "Laptop"]],
  );
  assert.equal(JSON.stringify(listed).includes(secret), false);

  const bearer = { authorization: `Bearer ${secret}` };
  // A token reads buyer routes without a cookie or an Origin...
  const threads = await inject(app, { method: "GET", url: "/v1/threads", headers: bearer });
  assert.equal(threads.statusCode, 200, threads.body);
  // ...but cannot mint tokens, sign in or act in Studio.
  for (const url of ["/v1/access-tokens", "/v1/provider/apps", "/v1/me"]) {
    const refused = await inject(app, { method: "GET", url, headers: bearer });
    assert.equal(refused.statusCode, 403, url);
  }

  assert.equal((await web("DELETE", `/v1/access-tokens/${id}`)).statusCode, 200);
  const revoked = await inject(app, { method: "GET", url: "/v1/threads", headers: bearer });
  assert.equal(revoked.statusCode, 401);
  const forged = await inject(app, {
    method: "GET",
    url: "/v1/threads",
    headers: { authorization: `Bearer pvb_${"0".repeat(16)}.${"0".repeat(64)}` },
  });
  assert.equal(forged.statusCode, 401);
});

it("lets an MCP host find an agent, chat and pay with its API key alone", async () => {
  const cookie = await login();
  const web = (method: string, url: string, payload?: unknown) =>
    inject(app, {
      method: method as "GET",
      url,
      headers: { origin, cookie },
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
  const name = `Reviewer ${randomUUID().slice(0, 6)}`;
  const created = await web("POST", "/v1/provider/apps", {
    name,
    payoutAddress: wallet.address,
    clientRequestId: randomUUID(),
  });
  assert.equal(created.statusCode, 201, created.body);
  const appId = created.json().id as string;
  const command = await web("POST", `/v1/provider/apps/${appId}/commands`, {
    name: "review",
    description: "Reviews a pull request",
    options: [{ name: "brief", type: "STRING", required: true }],
    positionalParameter: "brief",
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
  const commandId = command.json().id as string;
  await web("POST", `/v1/provider/apps/${appId}/commands/${commandId}/default`, {});
  await web("PATCH", `/v1/provider/apps/${appId}`, { visibility: "PUBLIC" });
  await db.app.update({
    where: { id: appId },
    data: { lastHeartbeatAt: new Date(), visibility: "PUBLIC" },
  });
  const key = (await web("POST", `/v1/provider/apps/${appId}/keys`, {})).json().secret as string;

  // No token, no MCP.
  const anonymous = await inject(app, { method: "POST", url: "/mcp", payload: {} });
  assert.equal(anonymous.statusCode, 401);
  assert.match(String(anonymous.headers["www-authenticate"]), /^Bearer/);

  // An API key's grant signer is derived from its secret; Payvoke keeps
  // only the address. Its spending limit is a vault grant for that signer.
  const issued = await web("POST", "/v1/access-tokens", { name: "Claude Code" });
  assert.equal(issued.statusCode, 201, issued.body);
  const token = issued.json().secret as string;
  const tokenId = issued.json().id as string;
  assert.equal(issued.json().signer, tokenSigner(token).address);
  vault.signer = issued.json().signer;
  const grantId = `0x${randomBytes(32).toString("hex")}` as Hex;
  const foreign = await web("PUT", `/v1/access-tokens/${tokenId}/grant`, {
    grantId,
    buyer: stranger.address,
  });
  assert.equal(foreign.statusCode, 403);
  const linked = await web("PUT", `/v1/access-tokens/${tokenId}/grant`, {
    grantId,
    buyer: wallet.address,
  });
  assert.equal(linked.statusCode, 200, linked.body);
  const listed = (await web("GET", "/v1/access-tokens")).json();
  assert.equal(listed[0].autopay.grantId, grantId);
  assert.equal(listed[0].autopay.signer, listed[0].signer);
  assert.equal(JSON.stringify(listed).includes(token), false);

  // Extending only moves the expiry later.
  assert.equal(
    (await web("PATCH", `/v1/access-tokens/${tokenId}`, { expiresInDays: 120 })).statusCode,
    200,
  );
  assert.equal(
    (await web("PATCH", `/v1/access-tokens/${tokenId}`, { expiresInDays: 1 })).statusCode,
    409,
  );
  const host = await connect(token);
  const { tools } = await host.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "answer_tool",
    "decline_offer",
    "get_agent",
    "get_job",
    "get_spending_limits",
    "list_jobs",
    "pay_offer",
    "prepare_reclaim",
    "read_chat",
    "request_payment",
    "search_agents",
    "send_message",
    "start_chat",
  ]);

  const found = json(await host.callTool({ name: "search_agents", arguments: { query: name } }));
  assert.equal(found.items[0].id, appId);
  const agent = json(await host.callTool({ name: "get_agent", arguments: { appId } }));
  assert.equal(agent.agent.id, appId);

  const thread = json(await host.callTool({ name: "start_chat", arguments: { appId } }));
  const sent = await host.callTool({
    name: "send_message",
    arguments: {
      threadId: thread.id,
      content: "/review Review PR #128",
      commandId,
      arguments: { brief: "Review PR #128" },
    },
  });
  assert.equal(sent.isError, undefined, JSON.stringify(sent));
  const offer = await inject(app, {
    method: "POST",
    url: `/v1/provider/apps/${appId}/threads/${thread.id}/offers`,
    headers: { authorization: `Bearer ${key}` },
    payload: {
      clientRequestId: randomUUID(),
      arguments: { brief: "Review PR #128" },
      grossAmount: "600000",
      summary: "Seven-point review of PR #128.",
    },
  });
  assert.equal(offer.statusCode, 201, offer.body);
  const offerId = offer.json().id as string;

  const chat = json(await host.callTool({ name: "read_chat", arguments: { threadId: thread.id } }));
  const parts = chat.messages.flatMap(
    (message: { parts: { toolName?: string; toolCallId?: string; status?: string }[] }) =>
      message.parts,
  );
  assert.ok(
    parts.some(
      (part: { toolName?: string; toolCallId?: string; status?: string }) =>
        part.toolName === "offer" && part.toolCallId === offerId && part.status === "open",
    ),
  );

  // The host reads its limits but cannot record a grant itself.
  const limits = json(await host.callTool({ name: "get_spending_limits", arguments: {} }));
  assert.equal(limits.autopay, true);
  assert.equal(limits.perJob, "5 USDC");
  assert.equal(limits.leftToday, "100 USDC");
  const byToken = await inject(app, {
    method: "POST",
    url: "/v1/grants",
    headers: { authorization: `Bearer ${token}` },
    payload: { grantId, buyer: wallet.address, signer: stranger.address, name: "x" },
  });
  assert.equal(byToken.statusCode, 403);

  // Within the limits, Payvoke signs with the key's derived signer and pays.
  // This app has no facilitator, so the payment cannot settle; the host sees
  // the API's error rather than a success.
  const paid = await host.callTool({
    name: "pay_offer",
    arguments: { threadId: thread.id, offerId },
  });
  assert.equal(paid.isError, true);
  assert.deepEqual(json(paid), { status: 503, error: "SETTLEMENT_NOT_AVAILABLE" });

  async function openOffer(brief: string) {
    const chat = json(await host.callTool({ name: "start_chat", arguments: { appId } }));
    await host.callTool({ name: "send_message", arguments: { threadId: chat.id, content: brief } });
    const created = await inject(app, {
      method: "POST",
      url: `/v1/provider/apps/${appId}/threads/${chat.id}/offers`,
      headers: { authorization: `Bearer ${key}` },
      payload: {
        clientRequestId: randomUUID(),
        arguments: { brief },
        grossAmount: "600000",
        summary: brief,
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    return { threadId: chat.id as string, offerId: created.json().id as string };
  }

  // Over today's limit: the user gets an approval link instead.
  vault.spentToday = 99_500_000n;
  const over = json(
    await host.callTool({ name: "pay_offer", arguments: await openOffer("PR #129") }),
  );
  assert.equal(over.mode, "approve");
  assert.match(over.reason, /today's autopay limit/);
  assert.equal(over.approvalUrl, `${origin}/console/approve/${over.quoteId}`);

  // The user can always ask to approve a payment themselves.
  vault.spentToday = 0n;
  const requested = json(
    await host.callTool({ name: "request_payment", arguments: await openOffer("PR #130") }),
  );
  assert.equal(requested.approvalUrl, `${origin}/console/approve/${requested.quoteId}`);

  // A key made before keys paid by themselves has no derived signer: it
  // always asks, and the console offers to recreate it.
  await db.buyerAccessToken.update({ where: { id: tokenId }, data: { signer: null } });
  const legacy = json(await host.callTool({ name: "get_spending_limits", arguments: {} }));
  assert.equal(legacy.usable, false);
  const asked = json(
    await host.callTool({ name: "pay_offer", arguments: await openOffer("PR #131") }),
  );
  assert.equal(asked.mode, "approve");
  assert.match(asked.reason, /made before keys could pay/);

  // Revoking the token takes its spending policy with it.
  assert.equal((await web("DELETE", `/v1/access-tokens/${tokenId}`)).statusCode, 200);
  assert.equal(await db.vaultGrant.count({ where: { grantId } }), 0);
  await host.close();
});
