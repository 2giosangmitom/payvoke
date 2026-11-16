/// <reference types="emscripten" />
/// <reference types="bun" />
import { inject } from "#test/kit/http";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, onTestFinished } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { keccak256, stringToHex, type Hex } from "viem";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  NETWORK,
  SCHEME,
  ASSET,
  paymentRequirements,
  quoteResource,
  readPaymentIntent,
  readQuote,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import { x402Pay, type X402Response } from "@payvoke/shared/x402/client";
import type { VaultChain } from "@payvoke/shared/x402/chain";
import { createApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { PrismaClient } from "#core/db";
import { readMigrations, startTestPostgres, type TestPostgres } from "#test/kit/database";
import { createFacilitator } from "#core/facilitator";
import { MemoryJobs } from "#core/queue";
import { code, mockVault } from "#test/kit/vault-reader";
import { mockSettlement } from "#test/kit/settlement-reader";
import { localEvm } from "#test/kit/local-evm";
import { SettlementWorker } from "#core/payments/worker";
import { verifyStructuredDeliveries } from "#core/payments/delivery";
import { FinanceService } from "#core/payments/finance";
import { scanFinancialLifecycle } from "#core/payments/finance-ledger";
import { AutoFinance } from "#core/payments/finance-policy";
import { MemoryStorage } from "#core/storage";
import { expireUnboundStaged } from "../../src/workers/cleanup";

// Instant (fixed-price) commands: the standard x402 402 -> sign -> retry
// round trip on the command's own URL, with no chat, into the per-job escrow.
describe("x402 instant commands", () => {
  const origin = "https://app.payvoke.test";
  const api = "https://api.payvoke.test";
  const vault = "0x1111111111111111111111111111111111111111";
  const feeRecipient = "0x3333333333333333333333333333333333333333";
  const wallet = privateKeyToAccount(generatePrivateKey());
  const grantSigner = privateKeyToAccount(generatePrivateKey());
  const relayer = privateKeyToAccount(generatePrivateKey());
  const grantId = `0x${"a".repeat(64)}` as Hex;
  const schema = `x402_test_${randomUUID().replaceAll("-", "")}`;
  let postgres: TestPostgres;
  let pool: Pool;
  let db: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let config: ReturnType<typeof loadConfig>;
  let cookie: string;
  let appId: string;

  const terms = {
    deliverySeconds: 60,
    reviewSeconds: 30,
    revisionPolicy: { maxIncluded: 0, description: "No revisions" },
    refundPolicy: "Refund undelivered work",
    sideEffects: "none",
    dataUse: "Only this request",
  };
  const quickReview = (extra: Record<string, unknown> = {}) => ({
    name: "quick_review",
    description: "Reviews a CV in one pass",
    options: [
      { name: "cv_text", type: "STRING", required: true, maxLength: 12000 },
      { name: "goal", type: "STRING" },
    ],
    maxAmount: "1000000",
    instantAmount: "500000",
    terms,
    ...extra,
  });
  const chatOnly = {
    name: "deep_review",
    description: "Reviews a CV after a chat",
    options: [{ name: "brief", type: "STRING", required: true }],
    maxAmount: "5000000",
    terms,
  };
  const instantUrl = (command = "quick_review", id = appId) =>
    `${api}/v1/x402/apps/${id}/commands/${command}`;
  const gasPolicy = {
    maxGasLimit: 1000000n,
    maxFeePerGas: 10000000000n,
    maxPriorityFeePerGas: 2000000000n,
    maxTransactionCost: 10n ** 16n,
    maxOutstandingCost: 10n ** 16n,
    windowSeconds: 3600,
    maxWindowCost: 10n ** 17n,
  };
  const facilitatorOptions = (overrides: Record<string, unknown> = {}) => ({
    API_ORIGIN: api,
    RPC_URL: "https://rpc.payvoke.test",
    VAULT_ADDRESS: vault,
    RELAYER_ADDRESS: relayer.address,
    EXPECTED_VAULT_CODE_HASH: keccak256(code),
    VAULT_FEE_CAP_BPS: 500,
    VAULT_MAX_QUOTE_LIFETIME_SECONDS: 3600,
    VAULT_MAX_HOLD_SECONDS: 30 * 86400,
    SETTLEMENT_ENABLED: true,
    ...overrides,
  });

  const web = (method: string, url: string, payload?: unknown, headers = {}) =>
    inject(app, {
      method,
      url,
      headers: { origin, cookie, ...headers },
      ...(payload === undefined ? {} : { payload }),
    });
  // One instant request, as an x402 client sends it.
  const buy = (
    key: string,
    args: Record<string, unknown>,
    headers: Record<string, string> = {},
    command = "quick_review",
  ) =>
    inject(app, {
      method: "POST",
      url: `/v1/x402/apps/${appId}/commands/${command}`,
      headers: { origin, cookie, "idempotency-key": key, ...headers },
      payload: { arguments: args },
    });
  const adapt = (response: Awaited<ReturnType<typeof inject>>): X402Response => {
    let body: unknown = null;
    try {
      body = response.json();
    } catch {
      /* not JSON */
    }
    return {
      status: response.statusCode,
      header: (name) => response.headers[name.toLowerCase()] as string | undefined,
      body,
    };
  };
  const signature = (envelope: unknown) => btoa(JSON.stringify(envelope));

  beforeAll(async () => {
    postgres = await startTestPostgres();
    const { connectionString } = postgres;
    pool = new Pool({
      connectionString,
      max: postgres.embedded ? 1 : 8,
      options: `-c search_path=${schema}`,
      verify(client, done) {
        client.query(`SET search_path TO "${schema}"`).then(() => done(), done);
      },
    });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const entry of await readMigrations()) await pool.query(entry.sql);
    config = loadConfig({
      MAX_APPS_PER_OWNER: "1000",
      APP_CREATES_PER_DAY: "1000",
      DATABASE_URL: connectionString,
      REDIS_URL: "redis://127.0.0.1:1",
      API_ORIGIN: api,
      WEB_ORIGIN: origin,
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
      VAULT_ADDRESS: vault,
      LOG_LEVEL: "silent",
    });
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    await db.deploymentPolicy.create({
      data: {
        version: "policy-1",
        activeSlot: "active",
        vault,
        feeBps: 100,
        feeRecipient,
        quoteLifetimeSeconds: 120,
        maxHoldSeconds: 600,
        resolutionGraceSeconds: 60,
        minGrossAmount: "1000",
      },
    });
    app = createApp(config, db);
    await app.ready();
    const nonce = await inject(app, {
      method: "POST",
      url: "/v1/auth/siwe/nonce",
      headers: { origin },
      payload: {},
    });
    const binding = nonce.cookies.find((c) => c.name.endsWith("payvoke_siwe"))!;
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
    const login = await inject(app, {
      method: "POST",
      url: "/v1/auth/siwe/verify",
      headers: { origin, cookie: `${binding.name}=${encodeURIComponent(binding.value)}` },
      payload: { message, signature: await wallet.signMessage({ message }) },
    });
    assert.equal(login.statusCode, 200, login.body);
    const session = login.cookies.find((c) => c.name.endsWith("session_token"))!;
    cookie = `${session.name}=${encodeURIComponent(session.value)}`;
  });
  beforeEach(async () => {
    // A fresh public agent with one instant and one chat-only command.
    const created = await web("POST", "/v1/provider/apps", {
      name: `CV desk ${randomBytes(3).toString("hex")}`,
      clientRequestId: randomUUID(),
    });
    assert.equal(created.statusCode, 201, created.body);
    appId = created.json().id;
    const synced = await web("PUT", `/v1/provider/apps/${appId}/commands`, [
      quickReview(),
      chatOnly,
    ]);
    assert.equal(synced.statusCode, 200, synced.body);
    await db.app.update({
      where: { id: appId },
      data: { visibility: "PUBLIC", lastHeartbeatAt: new Date() },
    });
  });
  afterEach(async () => {
    await app?.close();
    app = createApp(config, db);
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool?.end();
    await postgres?.stop();
  });

  // The app again, now with an in-process facilitator over a mock vault that
  // admits this quote's grant debit, plus the worker that puts it on chain.
  async function payable(q: QuoteDocument) {
    const mock = mockVault(readQuote(q.protocolQuote), vault, grantSigner.address, relayer.address);
    const f = createFacilitator(facilitatorOptions(), db, new MemoryJobs(), mock.chain);
    await f.ready();
    await app.close();
    app = createApp({ ...config, PAYMENTS_ENABLED: true }, db, undefined, undefined, f);
    await app.ready();
    return { f, mock };
  }
  const pay = (key: string, args: Record<string, unknown>, extra = {}) =>
    x402Pay({
      resourceUrl: instantUrl(),
      send: async (headers) => adapt(await buy(key, args, headers)),
      buyer: wallet.address,
      vault,
      signer: grantSigner,
      funding: { mode: "grant", grantId, grantEpoch: 1n },
      maxAmount: 500000n,
      ...extra,
    });

  it("validates instant prices and inputs at command registration", async () => {
    const put = (list: unknown[]) => web("PUT", `/v1/provider/apps/${appId}/commands`, list);
    const code = async (list: unknown[]) => {
      const response = await put(list);
      return [response.statusCode, response.json().error];
    };
    assert.deepEqual(await code([quickReview({ instantAmount: "999" })]), [
      422,
      "PRICE_BELOW_FLOOR",
    ]);
    assert.deepEqual(await code([quickReview({ instantAmount: "1000001" })]), [
      400,
      "INVALID_INSTANT_AMOUNT",
    ]);
    for (const bad of ["0", "01", "1.5", "abc", 500000, ""])
      assert.deepEqual(
        await code([quickReview({ instantAmount: bad })]),
        [400, "INVALID_INSTANT_AMOUNT"],
        String(bad),
      );
    // A required file is fine: instant buyers upload it beforehand.
    const files = await put([
      quickReview({
        options: [
          { name: "cv_text", type: "STRING", required: true },
          { name: "cv", type: "FILE", required: true },
        ],
      }),
    ]);
    assert.equal(files.statusCode, 200, files.body);
    assert.equal(files.json()[0].revision.instantGrossAmount, "500000");
    assert.deepEqual(files.json()[0].revision.instantTiers, []);
    // Floor <= instant <= max, and an unchanged list keeps its revision.
    const set = await put([quickReview({ instantAmount: "1000000" })]);
    assert.equal(set.statusCode, 200, set.body);
    assert.equal(set.json()[0].revision.instantGrossAmount, "1000000");
    const same = await put([quickReview({ instantAmount: "1000000" })]);
    assert.equal(same.json()[0].revision.id, set.json()[0].revision.id);
    const repriced = await put([quickReview({ instantAmount: "1000" })]);
    assert.notEqual(repriced.json()[0].revision.id, set.json()[0].revision.id);
    assert.equal(repriced.json()[0].revision.instantGrossAmount, "1000");
  });

  it("lists only public, active, instant commands in the public catalog", async () => {
    // A private agent and an archived command never show.
    const hidden = await web("POST", "/v1/provider/apps", {
      name: "Private desk",
      clientRequestId: randomUUID(),
    });
    await web("PUT", `/v1/provider/apps/${hidden.json().id}/commands`, [quickReview()]);
    const response = await inject(app, { method: "GET", url: "/v1/x402/catalog" });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers["cache-control"], "public, max-age=30");
    const catalog = response.json();
    assert.equal(catalog.x402Version, 2);
    assert.equal(catalog.scheme, SCHEME);
    assert.equal(catalog.network, NETWORK);
    assert.equal(catalog.asset, ASSET);
    assert.equal(catalog.vault.toLowerCase(), vault);
    const mine = catalog.items.filter((item: { appId: string }) => item.appId === appId);
    assert.equal(mine.length, 1);
    assert.deepEqual(Object.keys(mine[0]).sort(), [
      "amount",
      "appId",
      "appName",
      "available",
      "command",
      "deliverySeconds",
      "description",
      "inputSchema",
      "resource",
      "reviewSeconds",
      "tiers",
    ]);
    assert.equal(mine[0].command, "quick_review");
    assert.equal(mine[0].amount, "500000");
    assert.equal(mine[0].deliverySeconds, 60);
    assert.equal(mine[0].reviewSeconds, 30);
    assert.equal(mine[0].resource, instantUrl());
    assert.equal(mine[0].available, true);
    assert.deepEqual(mine[0].inputSchema.required, ["cv_text"]);
    assert.ok(catalog.items.every((item: { appId: string }) => item.appId !== hidden.json().id));
    await web("PUT", `/v1/provider/apps/${appId}/commands`, [chatOnly]);
    const after = (await inject(app, { method: "GET", url: "/v1/x402/catalog" })).json();
    assert.ok(after.items.every((item: { appId: string }) => item.appId !== appId));
  });

  it("answers an unpaid request with a 402 carrying the quote, idempotently", async () => {
    const key = randomUUID();
    const args = { cv_text: "Ten years of TypeScript." };
    const first = await buy(key, args);
    assert.equal(first.statusCode, 402, first.body);
    // The header is the standard PaymentRequired; only the body carries the quote.
    const header = decodePaymentRequiredHeader(first.headers["payment-required"] as string);
    assert.equal(header.extensions, undefined);
    assert.deepEqual(header.resource, {
      url: instantUrl(),
      method: "POST",
      description: "Payvoke invocation",
      mimeType: "application/json",
    } as never);
    const body = first.json();
    const q = body.extensions.payvoke.quote as QuoteDocument;
    assert.deepEqual(body.accepts, header.accepts);
    assert.deepEqual(body.accepts, [paymentRequirements(q)]);
    assert.equal(quoteResource(q), instantUrl());
    assert.equal(q.grossAmount, "500000");
    assert.deepEqual(q.effectiveArguments, args);
    assert.deepEqual(q.contextManifest, { messages: [], brief: null, files: [] });
    // The job lives in its own DIRECT thread, priced by a system offer.
    const thread = await db.chatThread.findUniqueOrThrow({ where: { id: q.sessionId } });
    assert.equal(thread.kind, "DIRECT");
    const offer = await db.offer.findFirstOrThrow({ where: { threadId: thread.id } });
    assert.equal(offer.status, "ACCEPTED");
    assert.equal(offer.quoteId, q.quoteId);
    // Same key and body: the same quote. Different body: a conflict.
    const replay = await buy(key, args);
    assert.equal(replay.statusCode, 402);
    assert.equal(replay.json().extensions.payvoke.quote.quoteId, q.quoteId);
    assert.equal((await buy(key, { cv_text: "Other" })).json().error, "IDEMPOTENCY_CONFLICT");
    // The approval page gets what it needs to resend this exact request.
    const restored = await inject(app, {
      method: "GET",
      url: `/v1/quotes/${q.quoteId}`,
      headers: { origin, cookie },
    });
    assert.equal(restored.statusCode, 200, restored.body);
    assert.deepEqual(restored.json().instant, {
      appId,
      command: "quick_review",
      arguments: args,
      key,
    });
    assert.equal(await db.chatThread.count({ where: { kind: "DIRECT", appId } }), 1);
    // Every gate answers before any quote exists.
    const refused = async (response: Awaited<ReturnType<typeof inject>>) => [
      response.statusCode,
      response.json().error,
    ];
    assert.deepEqual(await refused(await buy("not-a-uuid", args)), [
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
    ]);
    assert.deepEqual(await refused(await buy(randomUUID(), {})), [400, "INVALID_ARGUMENTS"]);
    assert.deepEqual(await refused(await buy(randomUUID(), { cv_text: "x".repeat(12001) })), [
      400,
      "INVALID_ARGUMENTS",
    ]);
    assert.deepEqual(await refused(await buy(randomUUID(), { brief: "x" }, {}, "deep_review")), [
      404,
      "COMMAND_NOT_FOUND",
    ]);
    assert.deepEqual(await refused(await buy(randomUUID(), args, {}, "missing")), [
      404,
      "COMMAND_NOT_FOUND",
    ]);
    const extra = await inject(app, {
      method: "POST",
      url: `/v1/x402/apps/${appId}/commands/quick_review`,
      headers: { origin, cookie, "idempotency-key": randomUUID() },
      payload: { arguments: args, price: "1" },
    });
    assert.deepEqual(await refused(extra), [400, "INVALID_INSTANT_REQUEST"]);
    const anonymous = await inject(app, {
      method: "POST",
      url: `/v1/x402/apps/${appId}/commands/quick_review`,
      headers: { origin, "idempotency-key": randomUUID() },
      payload: { arguments: args },
    });
    assert.equal(anonymous.statusCode, 401);
    // A signature for a request that never had a quote.
    assert.deepEqual(
      await refused(await buy(randomUUID(), args, { "payment-signature": "e30=" })),
      [404, "QUOTE_NOT_FOUND"],
    );
    // An offline agent cannot be hired.
    await db.app.update({ where: { id: appId }, data: { lastHeartbeatAt: null } });
    assert.deepEqual(await refused(await buy(randomUUID(), args)), [409, "APP_OFFLINE"]);
    assert.equal(await db.chatThread.count({ where: { kind: "DIRECT", appId } }), 1);
  });

  it("pays at the instant URL, holds the escrow and hands the agent invocation.ready", async () => {
    const key = randomUUID();
    const args = { cv_text: "Ten years of TypeScript.", goal: "Staff engineer" };
    const unpaid = await buy(key, args);
    const q = unpaid.json().extensions.payvoke.quote as QuoteDocument;
    const { f, mock } = await payable(q);
    const { response, payment } = await pay(key, args, {
      approve: (offered: QuoteDocument) => assert.equal(offered.quoteId, q.quoteId),
    });
    // Journaled, not yet on chain: 202 PENDING, poll the invocation.
    assert.equal(response.status, 202, JSON.stringify(response.body));
    assert.deepEqual(response.body, {
      invocationId: q.invocationId,
      paymentStatus: "PENDING",
      nextActions: ["poll"],
    });
    assert.equal(response.header("retry-after"), "5");
    assert.equal(response.header("location"), `/v1/invocations/${q.invocationId}`);
    const intent = await readPaymentIntent(q, payment!.paymentPayload, `${api}/v1/invocations`);
    const settlement = mockSettlement(readQuote(q.protocolQuote), mock.chain.deployment, {
      quoteDigest: q.quoteDigest,
      authorizationDigest: intent.authorizationDigest,
      grantId,
    });
    const worker = new SettlementWorker(
      db,
      mock.chain as VaultChain,
      settlement.chain,
      relayer,
      `${api}/v1/invocations`,
      gasPolicy,
    );
    // The instant URL is this deployment's, so its worker picks the payment up.
    await worker.tick();
    assert.equal(
      (await db.settlementAttempt.findFirstOrThrow({ where: { invocationId: q.invocationId } }))
        .state,
      "BROADCAST",
    );
    await db.settlementOperation.updateMany({ data: { nextCheckAt: new Date(0) } });
    await worker.tick();
    const held = await buy(key, args, payment!.headers);
    assert.equal(held.statusCode, 202, held.body);
    assert.equal(held.json().paymentStatus, "HELD");
    assert.equal(held.json().executionStatus, "QUEUED");
    const receipt = JSON.parse(
      Buffer.from(held.headers["payment-response"] as string, "base64").toString(),
    );
    assert.equal(receipt.success, true);
    assert.equal(receipt.extra.invocationId, q.invocationId);
    assert.equal(f && typeof f.settle, "function");

    // The agent gets the job directly, in the DIRECT thread, without a chat.
    const worker401 = await web("POST", `/v1/provider/apps/${appId}/keys`, {
      scopes: ["events:read", "events:ack", "reports:write"],
    });
    assert.equal(worker401.statusCode, 201, worker401.body);
    const agent = { authorization: `Bearer ${worker401.json().secret}` };
    const feed = await inject(app, {
      url: `/v1/provider/apps/${appId}/events?once=1`,
      headers: agent,
    });
    assert.equal(feed.statusCode, 200, feed.body);
    const ready = feed.json().events;
    assert.equal(ready.length, 1);
    assert.equal(ready[0].type, "invocation.ready");
    assert.equal(ready[0].invocationId, q.invocationId);
    assert.equal(ready[0].threadId, q.sessionId);
    const command = await db.appCommand.findFirstOrThrow({
      where: { appId, name: "quick_review" },
    });
    assert.equal(ready[0].input.commandId, command.id);
    assert.deepEqual(ready[0].input.arguments, args);
    assert.deepEqual(ready[0].input.context.files, []);

    // The buyer reads the job by its invocation and thread; it is not a chat.
    const status = await web("GET", `/v1/invocations/${q.invocationId}`);
    assert.equal(status.json().threadId, q.sessionId);
    assert.equal(status.json().paymentStatus, "HELD");
    const chats = (await web("GET", "/v1/threads")).json().items;
    assert.ok(chats.every((chat: { id: string }) => chat.id !== q.sessionId));
    assert.equal((await web("GET", `/v1/threads/${q.sessionId}`)).json().kind, "DIRECT");
    const message = await web("POST", `/v1/threads/${q.sessionId}/messages`, {
      content: "hello",
      clientRequestId: randomUUID(),
      fileIds: [],
    });
    assert.equal(message.statusCode, 404, message.body);

    // Ack, deliver, verify: the result shows on the DIRECT thread.
    const task = `/v1/provider/apps/${appId}/invocations/${q.invocationId}`;
    const post = (url: string, payload: unknown) =>
      inject(app, {
        method: "POST",
        url,
        headers: { ...agent, "content-type": "application/json" },
        payload: JSON.stringify(payload),
      });
    assert.equal((await post(`${task}/acks`, { eventId: q.invocationId })).statusCode, 200);
    assert.equal(
      (await post(`${task}/reports`, { reportId: "r-1", sequence: 1, type: "started", data: {} }))
        .statusCode,
      200,
    );
    const result = await post(`${task}/reports`, {
      reportId: "r-2",
      sequence: 2,
      type: "result",
      data: { artifactVersion: 1, output: { score: 8, notes: "Strong" }, files: [] },
    });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(await verifyStructuredDeliveries(db), 1);
    const delivered = await web("GET", `/v1/invocations/${q.invocationId}`);
    assert.equal(delivered.json().executionStatus, "DELIVERED");
    assert.equal(delivered.json().delivery.artifactVersion, 1);
    const timeline = await web("GET", `/v1/threads/${q.sessionId}/timeline`);
    assert.equal(timeline.statusCode, 200, timeline.body);
  });

  it("accepts a signature only at the URL that issued its quote", async () => {
    const key = randomUUID();
    const args = { cv_text: "Replay me." };
    const q = (await buy(key, args)).json().extensions.payvoke.quote as QuoteDocument;
    const { f } = await payable(q);
    // A real payment for the instant quote, captured instead of sent.
    let captured: Record<string, string> = {};
    await pay(key, args, {
      send: async (headers: Record<string, string>) => {
        if (headers["PAYMENT-SIGNATURE"]) {
          captured = headers;
          return { status: 418, header: () => null, body: null };
        }
        return adapt(await buy(key, args));
      },
    });
    const envelope = JSON.parse(
      Buffer.from(captured["PAYMENT-SIGNATURE"], "base64").toString("utf8"),
    );
    assert.equal(envelope.resource.url, instantUrl());
    // Replayed as a chat payment at /v1/invocations: refused before the gateway settles.
    const chat = (headers: Record<string, string> = {}) =>
      inject(app, {
        method: "POST",
        url: "/v1/invocations",
        headers: { origin, cookie, "idempotency-key": q.invocationId, ...headers },
        payload: { quoteId: q.quoteId },
      });
    const replayed = await chat(captured);
    assert.equal(replayed.statusCode, 409, replayed.body);
    assert.equal(replayed.json().error, "QUOTE_RESOURCE_MISMATCH");
    assert.equal((await chat()).json().error, "QUOTE_RESOURCE_MISMATCH");
    // The same signature re-addressed to /v1/invocations, sent to the instant URL.
    const moved = { ...envelope, resource: { ...envelope.resource, url: `${api}/v1/invocations` } };
    const readdressed = await buy(key, args, { "payment-signature": signature(moved) });
    assert.equal(readdressed.statusCode, 400, readdressed.body);
    assert.equal(readdressed.json().error, "INVALID_PAYMENT");
    // ... or to another command's URL.
    const other = { ...envelope, resource: { ...envelope.resource, url: instantUrl("other") } };
    assert.equal((await buy(key, args, { "payment-signature": signature(other) })).statusCode, 400);
    // The facilitator applies the same binding on its own.
    assert.deepEqual(await f.verify(moved, paymentRequirements(q)), {
      isValid: false,
      invalidReason: "invalid_payment",
    });
    // The same request under another key is a different quote: no reuse.
    const different = await buy(randomUUID(), args, {
      "payment-signature": captured["PAYMENT-SIGNATURE"],
    });
    assert.equal(different.statusCode, 404, different.body);
    assert.equal(
      await db.settlementOperation.count({ where: { invocationId: q.invocationId } }),
      0,
    );
    // The original signature still pays at its own URL.
    const paid = await buy(key, args, captured);
    assert.equal(paid.statusCode, 202, paid.body);
    assert.equal(paid.json().paymentStatus, "PENDING");
  });

  it("still pays chat quotes at /v1/invocations, bound to that resource", async () => {
    const thread = await web("POST", "/v1/threads", { appId, clientRequestId: randomUUID() });
    const command = await db.appCommand.findFirstOrThrow({
      where: { appId, name: "deep_review" },
      include: { activeRevision: true },
    });
    const { offerFixture } = await import("#test/offer-fixture");
    const offer = await offerFixture(db, {
      threadId: thread.json().id,
      commandId: command.id,
      arguments: { brief: "Review my CV" },
      grossAmount: "200000",
    });
    const clientRequestId = randomUUID();
    const prepared = await web(
      "POST",
      "/v1/quotes",
      {
        threadId: thread.json().id,
        offerId: offer.id,
        contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
        clientRequestId,
      },
      { "idempotency-key": clientRequestId },
    );
    assert.equal(prepared.statusCode, 201, prepared.body);
    const q = prepared.json() as QuoteDocument;
    assert.equal(quoteResource(q), `${api}/v1/invocations`);
    await payable(q);
    const { response } = await x402Pay({
      resourceUrl: `${api}/v1/invocations`,
      send: async (headers) =>
        adapt(
          await inject(app, {
            method: "POST",
            url: "/v1/invocations",
            headers: { origin, cookie, "idempotency-key": q.invocationId, ...headers },
            payload: { quoteId: q.quoteId },
          }),
        ),
      buyer: wallet.address,
      vault,
      signer: grantSigner,
      funding: { mode: "grant", grantId, grantEpoch: 1n },
      maxAmount: 200000n,
      quote: q,
    });
    assert.equal(response.status, 202, JSON.stringify(response.body));
    assert.equal((response.body as { paymentStatus: string }).paymentStatus, "PENDING");
    // Chat quotes never reach the instant route: it only reads its own keys.
    assert.equal(
      (await buy(clientRequestId, { cv_text: "x" }, { "payment-signature": "e30=" })).statusCode,
      404,
    );
  });

  it.skipIf(process.env.PAYMENTS_TEST_EVM !== "1")(
    "hires an instant command on real local USDC: release on delivery, refund on failure",
    async () => {
      const evm = await localEvm(wallet.address, relayer.address, grantSigner.address);
      onTestFinished(evm.stop);
      const executor = privateKeyToAccount(generatePrivateKey()),
        approver = privateKeyToAccount(generatePrivateKey()),
        providerWallet = privateKeyToAccount(generatePrivateKey());
      await evm.test.setBalance({ address: executor.address, value: 10n ** 20n });
      for (const [role, account] of [
        ["FINANCE_EXECUTOR_ROLE", executor.address],
        ["REFUND_APPROVER_ROLE", approver.address],
        ["RELEASE_APPROVER_ROLE", approver.address],
      ] as const)
        await evm.contract.write.grantRole([keccak256(stringToHex(role)), account]);
      await db.deploymentPolicy.updateMany({ data: { vault: evm.vault } });
      onTestFinished(() => db.deploymentPolicy.updateMany({ data: { vault } }).then(() => {}));
      await db.app.update({
        where: { id: appId },
        data: { payoutAddress: providerWallet.address },
      });
      const local = createFacilitator(
        {
          ...facilitatorOptions({ RPC_URL: evm.rpc }),
          VAULT_ADDRESS: evm.vault,
          EXPECTED_VAULT_CODE_HASH: evm.admission.deployment.expectedCodeHash,
        },
        db,
        new MemoryJobs(),
        evm.admission as VaultChain,
      );
      await app.close();
      app = createApp(
        { ...config, VAULT_ADDRESS: evm.vault, PAYMENTS_ENABLED: true },
        db,
        undefined,
        undefined,
        local,
      );
      await app.ready();
      const worker = new SettlementWorker(
        db,
        evm.admission,
        evm.settlement,
        relayer,
        `${api}/v1/invocations`,
        gasPolicy,
      );
      const key = await web("POST", `/v1/provider/apps/${appId}/keys`, {
        scopes: ["events:read", "events:ack", "reports:write"],
      });
      const agent = { authorization: `Bearer ${key.json().secret}` };
      const post = (url: string, payload: unknown) =>
        inject(app, {
          method: "POST",
          url,
          headers: { ...agent, "content-type": "application/json" },
          payload: JSON.stringify(payload),
        });
      // The buyer's own wallet signs one USDC authorization per job (x402).
      async function hire(cv: string) {
        const idempotencyKey = randomUUID();
        const args = { cv_text: cv };
        const { response, payment } = await x402Pay({
          resourceUrl: instantUrl(),
          send: async (headers) => adapt(await buy(idempotencyKey, args, headers)),
          buyer: wallet.address,
          vault: evm.vault,
          signer: wallet,
          funding: { mode: "authorization" },
          maxAmount: 500000n,
        });
        assert.equal(response.status, 202, JSON.stringify(response.body));
        assert.equal((response.body as { paymentStatus: string }).paymentStatus, "PENDING");
        const q = payment!.quote;
        await worker.tick();
        await db.settlementOperation.updateMany({
          where: { state: "PENDING" },
          data: { nextCheckAt: new Date(0) },
        });
        await worker.tick();
        const held = await buy(idempotencyKey, args, payment!.headers);
        assert.equal(held.statusCode, 202, held.body);
        assert.equal(held.json().paymentStatus, "HELD");
        // The agent is handed the job and starts it.
        const events = (
          await inject(app, { url: `/v1/provider/apps/${appId}/events?once=1`, headers: agent })
        ).json().events;
        const ready = events.find(
          (event: { invocationId: string }) => event.invocationId === q.invocationId,
        );
        assert.equal(ready.type, "invocation.ready");
        assert.equal(ready.threadId, q.sessionId);
        assert.deepEqual(ready.input.arguments, args);
        const task = `/v1/provider/apps/${appId}/invocations/${q.invocationId}`;
        assert.equal((await post(`${task}/acks`, { eventId: q.invocationId })).statusCode, 200);
        return { q, task };
      }
      const delivered = await hire("Delivered CV");
      const failed = await hire("Failed CV");
      for (const job of [delivered, failed])
        assert.equal(
          (
            await post(`${job.task}/reports`, {
              reportId: "r-0",
              sequence: 1,
              type: "started",
              data: {},
            })
          ).statusCode,
          200,
        );
      assert.equal(await evm.contract.read.totalHeld(), 1000000n);
      assert.equal(await evm.usdc.read.balanceOf([wallet.address]), 9000000n);
      const result = await post(`${delivered.task}/reports`, {
        reportId: "r-1",
        sequence: 2,
        type: "result",
        data: { artifactVersion: 1, output: { score: 8 }, files: [] },
      });
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(await verifyStructuredDeliveries(db), 1);
      const failure = await post(`${failed.task}/reports`, {
        reportId: "r-1",
        sequence: 2,
        type: "failed",
        data: { reason: "Could not parse the CV" },
      });
      assert.equal(failure.statusCode, 200, failure.body);

      const sync = () => scanFinancialLifecycle(db, evm.settlement, evm.startBlock);
      const status = async (q: QuoteDocument) =>
        (
          await db.vaultHoldProjection.findUniqueOrThrow({
            where: { holdId: q.protocolQuote.invocationKey },
          })
        ).status;
      await sync();
      const auto = new AutoFinance(
        new FinanceService(db, evm.settlement, executor.address, gasPolicy),
        approver,
        executor,
      );
      async function settle() {
        for (let i = 0; i < 8; i++) {
          await auto.execute();
          await db.financeDecision.updateMany({ data: { nextCheckAt: new Date(0) } });
        }
        await sync();
      }
      // The failed job is refunded at once; the delivered one waits for review.
      assert.equal(await auto.propose(), 1);
      await settle();
      assert.equal(await status(failed.q), "REFUNDED");
      assert.equal(await status(delivered.q), "HELD");
      assert.equal(await evm.usdc.read.balanceOf([wallet.address]), 9500000n);
      await evm.test.setNextBlockTimestamp({
        timestamp: BigInt(delivered.q.releaseNotBefore),
      });
      await evm.test.mine({ blocks: 1 });
      assert.equal(await auto.propose(), 1);
      await settle();
      assert.equal(await status(delivered.q), "RELEASED");
      // 0.50 USDC less the 1% fee went to the agent; nothing is left in escrow.
      assert.equal(await evm.usdc.read.balanceOf([providerWallet.address]), 495000n);
      assert.equal(await evm.contract.read.totalHeld(), 0n);
    },
  );

  it("prices instant commands by input size with tiers", async () => {
    const put = (list: unknown[]) => web("PUT", `/v1/provider/apps/${appId}/commands`, list);
    const tiers = [
      { minInputBytes: 100, amount: "700000" },
      { minInputBytes: 1000, amount: "900000" },
    ];
    for (const bad of [
      [{ minInputBytes: 100, amount: "500000" }], // not above the base price
      [{ minInputBytes: 100, amount: "1000001" }], // above maxAmount
      [tiers[1], tiers[0]], // not rising
      [{ minInputBytes: 0, amount: "700000" }],
      [{ minInputBytes: 100, amount: "700000", extra: 1 }],
      Array.from({ length: 6 }, (_, i) => ({ minInputBytes: i + 1, amount: `${600000 + i}` })),
      [],
      "tiers",
    ]) {
      const response = await put([quickReview({ instantTiers: bad })]);
      assert.deepEqual(
        [response.statusCode, response.json().error],
        [400, "INVALID_INSTANT_TIERS"],
      );
    }
    // Tiers need a base instant price.
    const orphan = await put([quickReview({ instantAmount: null, instantTiers: tiers })]);
    assert.equal(orphan.json().error, "INVALID_INSTANT_TIERS");
    const set = await put([quickReview({ instantTiers: tiers }), chatOnly]);
    assert.equal(set.statusCode, 200, set.body);
    assert.deepEqual(set.json()[0].revision.instantTiers, tiers);
    const same = await put([quickReview({ instantTiers: tiers }), chatOnly]);
    assert.equal(same.json()[0].revision.id, set.json()[0].revision.id);
    // The catalog shows the base price and the tiers.
    const catalog = (await inject(app, { method: "GET", url: "/v1/x402/catalog" })).json();
    const item = catalog.items.find((entry: { appId: string }) => entry.appId === appId);
    assert.equal(item.amount, "500000");
    assert.deepEqual(item.tiers, tiers);
    // The 402 prices this input: UTF-8 bytes of every string argument.
    const price = async (args: Record<string, unknown>) => {
      const response = await buy(randomUUID(), args);
      assert.equal(response.statusCode, 402, response.body);
      return response.json().extensions.payvoke.quote.grossAmount;
    };
    assert.equal(await price({ cv_text: "x".repeat(99) }), "500000");
    assert.equal(await price({ cv_text: "x".repeat(60), goal: "y".repeat(40) }), "700000");
    assert.equal(await price({ cv_text: "é".repeat(50) }), "700000"); // 100 bytes
    assert.equal(await price({ cv_text: "x".repeat(1000) }), "900000");
  });

  it("takes files uploaded beforehand, bound once to the purchase", async () => {
    const storage = new MemoryStorage();
    await app.close();
    app = createApp(config, db, undefined, storage);
    await app.ready();
    const synced = await web("PUT", `/v1/provider/apps/${appId}/commands`, [
      {
        name: "scan",
        description: "Reviews a PDF CV",
        options: [
          { name: "cv", type: "FILE", required: true, accept: ["application/pdf"], maxBytes: 5000 },
        ],
        maxAmount: "1000000",
        instantAmount: "500000",
        instantTiers: [{ minInputBytes: 1000, amount: "800000" }],
        terms,
      },
    ]);
    assert.equal(synced.statusCode, 200, synced.body);
    // A staged upload: no thread yet.
    const stage = async (body: string, name = "cv.pdf") => {
      const requested = await web("POST", "/v1/files", {
        name,
        contentType: "application/pdf",
        size: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        clientRequestId: randomUUID(),
      });
      assert.equal(requested.statusCode, 200, requested.body);
      const { file } = requested.json();
      assert.equal(file.threadId, null);
      storage.put(`staging/${file.id}`, body);
      const done = await web("POST", `/v1/files/${file.id}/completions`);
      assert.equal(done.json().status, "READY", done.body);
      return file.id as string;
    };
    const fileId = await stage("%PDF-".padEnd(1500, "x"));
    const first = await buy(randomUUID(), { cv: fileId }, {}, "scan");
    assert.equal(first.statusCode, 402, first.body);
    const q = first.json().extensions.payvoke.quote as QuoteDocument;
    // Priced by the file's size, frozen into the quote like a chat attachment.
    assert.equal(q.grossAmount, "800000");
    assert.deepEqual(
      (q.contextManifest as { files: { fileId: string }[] }).files.map((f) => f.fileId),
      [fileId],
    );
    const bound = await db.fileAsset.findUniqueOrThrow({ where: { id: fileId } });
    assert.equal(bound.threadId, q.sessionId);
    // Bound once: another purchase cannot reuse it, and leaves nothing behind.
    const threads = await db.chatThread.count({ where: { kind: "DIRECT", appId } });
    const again = await buy(randomUUID(), { cv: fileId }, {}, "scan");
    assert.deepEqual([again.statusCode, again.json().error], [400, "INVALID_ARGUMENT_FILES"]);
    assert.equal(await db.chatThread.count({ where: { kind: "DIRECT", appId } }), threads);
    // A small file stays at the base price; a wrong type is refused.
    const small = await stage("%PDF-small");
    const cheap = await buy(randomUUID(), { cv: small }, {}, "scan");
    assert.equal(cheap.json().extensions.payvoke.quote.grossAmount, "500000");
    const picture = await web("POST", "/v1/files", {
      name: "cv.png",
      contentType: "image/png",
      size: 3,
      sha256: createHash("sha256").update("png").digest("hex"),
      clientRequestId: randomUUID(),
    });
    storage.put(`staging/${picture.json().file.id}`, "png");
    await web("POST", `/v1/files/${picture.json().file.id}/completions`);
    const wrong = await buy(randomUUID(), { cv: picture.json().file.id }, {}, "scan");
    assert.deepEqual([wrong.statusCode, wrong.json().error], [400, "INVALID_ARGUMENT_FILES"]);
    // Staged files nobody bound expire after a day; bound ones stay.
    await db.fileAsset.updateMany({
      where: { purpose: "BUYER_INPUT" },
      data: { readyAt: new Date(Date.now() - 2 * 86400000) },
    });
    assert.equal(await expireUnboundStaged(db), 1);
    const expired = await db.fileAsset.findUniqueOrThrow({ where: { id: picture.json().file.id } });
    assert.deepEqual([expired.status, expired.objectKey], ["EXPIRED", null]);
    assert.equal((await db.fileAsset.findUniqueOrThrow({ where: { id: fileId } })).status, "READY");
  });
});
