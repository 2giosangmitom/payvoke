/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import {
  createWalletClient,
  getContract,
  http,
  encodeFunctionData,
  keccak256,
  stringToHex,
  recoverTypedDataAddress,
} from "viem";
import { avalancheFuji } from "viem/chains";
import { hashSnapshot, paymentTypes, reserveHoldAbi, vaultDomain } from "@payvoke/protocol";
import { x402Client } from "@x402/core/client";
import { HTTPFacilitatorClient, resolvePaymentFlow, x402ResourceServer } from "@x402/core/server";
import {
  decodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import {
  ASSET,
  NETWORK,
  VaultClientScheme,
  VaultServerScheme,
  paymentRequirements,
  readQuote,
  readPaymentIntent,
  type AuthorizationRecord,
  type QuoteDocument,
} from "@payvoke/x402";
import { createApp } from "api/app";
import { loadConfig } from "api/config";
import { logRedaction } from "@payvoke/server";
import fastify from "fastify";
import { Writable } from "node:stream";
import { PrismaClient } from "@payvoke/db";
import { readMigrations, startTestPostgres, type TestPostgres } from "@payvoke/testkit/database";
import { SettlementJournal } from "@payvoke/payments/journal";
import { createFacilitatorApp } from "facilitator/app";
import { loadFacilitatorConfig } from "facilitator/config";
import { code, matchingHold, mockVault } from "@payvoke/testkit/vault-reader";
import { mockSettlement } from "@payvoke/testkit/settlement-reader";
import { SettlementWorker } from "@payvoke/payments/worker";
import { createSettlementService } from "@payvoke/payments/settlement";
import { scanFinalizedHolds } from "@payvoke/payments/scanner";
import { localEvm } from "@payvoke/testkit/local-evm";
import {
  paymentSession,
  preparePayment,
  submitPayment,
  pollPayment,
  verifyPayment,
  type PreparedPayment,
} from "ops/payment";
import {
  loadJson,
  prepareOperation,
  broadcastOperation,
  operationReceipt,
  type Ceremony,
  type SignedOperation,
} from "ops/fuji";
import { journalEvidence, seedCeremony } from "ops/seed";
import {
  FinanceService,
  parseDecision,
  recordPaymentDelivery,
  type FinanceApproval,
  type WireDecision,
} from "@payvoke/payments/finance";
import { scanFinancialLifecycle } from "@payvoke/payments/finance-ledger";
import { vaultFinanceAbi } from "@payvoke/protocol";

describe("quotes, x402 and isolated settlement", () => {
  const origin = "https://app.payvoke.test";
  const api = "https://api.payvoke.test";
  const vault = "0x1111111111111111111111111111111111111111";
  const provider = "0x2222222222222222222222222222222222222222";
  const feeRecipient = "0x3333333333333333333333333333333333333333";
  const wallet = privateKeyToAccount(generatePrivateKey());
  const grantSigner = privateKeyToAccount(generatePrivateKey());
  const relayerKey = generatePrivateKey();
  const relayer = privateKeyToAccount(relayerKey);
  const schema = `payment_test_${randomUUID().replaceAll("-", "")}`;
  let embedded: PGlite | undefined;
  let postgres: TestPostgres | undefined;
  let pool: Pool;
  let db: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let config: ReturnType<typeof loadConfig>;
  let cookie: string;
  let buyerId: string;
  let sessionId: string;
  let productId: string;
  let commandId: string;
  let journal: SettlementJournal;
  let preservedMigrationQuote = false;
  let privateApps: ReturnType<typeof createFacilitatorApp>[];
  const serviceToken = randomBytes(32).toString("hex");

  before(async () => {
    postgres = await startTestPostgres(
      process.env.PAYMENTS_TEST_POSTGRES === "1"
        ? "postgresql://test:test@127.0.0.1:55433/test"
        : undefined,
    );
    embedded = postgres.embedded;
    const { connectionString } = postgres;
    // Explicit Docker mode uses only the repo's local test-db endpoint, never a
    // DATABASE_URL/Neon connection. Each run owns a fresh random schema.
    pool = new Pool({
      connectionString,
      max: embedded ? 1 : 8,
      options: `-c search_path=${schema}`,
      // PGlite's socket bridge does not apply startup search_path options.
      verify(client, done) {
        client.query(`SET search_path TO "${schema}"`).then(() => done(), done);
      },
    });
    pool.setMaxListeners(50);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const entry of await readMigrations()) {
      if (entry.name === "20261021010000_settlement_journal") {
        await pool.query(`
          INSERT INTO products (id, kind) VALUES ('migration-product', 'TOOL');
          INSERT INTO usage_sessions (id, "buyerId", "productId") VALUES ('migration-session', 'migration-buyer', 'migration-product');
          INSERT INTO quotes (id, "invocationId", "buyerId", "sessionId", "clientRequestId", "requestHash", "validUntil", document)
          VALUES ('migration-quote', 'migration-invocation', 'migration-buyer', 'migration-session', 'migration-request', 'original-hash', NOW(), '{"original":"preserved"}');
        `);
      }
      await pool.query(entry.sql);
      if (entry.name === "20261021010000_settlement_journal") {
        const preserved = await pool.query(
          'SELECT "requestHash", document FROM quotes WHERE id = $1',
          ["migration-quote"],
        );
        assert.equal(preserved.rows[0].requestHash, "original-hash");
        assert.deepEqual(preserved.rows[0].document, { original: "preserved" });
        preservedMigrationQuote = true;
      }
    }
    config = loadConfig({
      DATABASE_URL: connectionString,
      API_ORIGIN: api,
      WEB_ORIGIN: origin,
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
      VAULT_ADDRESS: vault,
      LOG_LEVEL: "silent",
    });
  });
  beforeEach(async () => {
    privateApps = [];
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    journal = new SettlementJournal(db, { vault, resourceUrl: `${api}/v1/invocations` });
    await db.financeDecision.deleteMany();
    await db.financeLane.deleteMany();
    await db.paymentDeliveryEvidence.deleteMany();
    await db.vaultHoldProjection.deleteMany();
    await db.vaultFinancialEvent.deleteMany();
    await db.vaultFinancialHealth.deleteMany();
    await db.invocationReady.deleteMany();
    await db.settlementScanCursor.deleteMany();
    await db.settlementIncident.deleteMany();
    await db.settlementAttempt.deleteMany();
    await db.settlementOperation.deleteMany();
    await db.invocation.deleteMany();
    await db.relayerLane.deleteMany();
    await db.quote.deleteMany();
    await db.chatThread.deleteMany();
    await db.appCommandRevision.deleteMany();
    await db.appCommand.deleteMany();
    await db.appApiKey.deleteMany();
    await db.appStar.deleteMany();
    await db.app.deleteMany();
    await db.deploymentPolicy.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.verification.deleteMany();
    app = createApp(config, db);
    await app.ready();
    const nonce = await app.inject({
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
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/siwe/verify",
      headers: { origin, cookie: `${binding.name}=${encodeURIComponent(binding.value)}` },
      payload: { message, signature: await wallet.signMessage({ message }) },
    });
    assert.equal(login.statusCode, 200, login.body);
    const session = login.cookies.find((c) => c.name.endsWith("session_token"))!;
    cookie = `${session.name}=${encodeURIComponent(session.value)}`;
    buyerId = (await db.user.findFirstOrThrow()).id;
    productId = randomUUID();
    commandId = randomUUID();
    sessionId = randomUUID();
    await db.app.create({
      data: {
        id: productId,
        ownerId: buyerId,
        clientRequestId: randomUUID(),
        name: "Test delivery app",
        visibility: "PRIVATE",
        status: "ACTIVE",
        payoutAddress: provider,
        lastHeartbeatAt: new Date(),
      },
    });
    await db.appCommand.create({
      data: {
        id: commandId,
        appId: productId,
        name: "summarize",
        description: "Summarize text",
      },
    });
    const revision = await db.appCommandRevision.create({
      data: {
        commandId,
        options: [
          {
            name: "text",
            type: "STRING",
            required: true,
            description: "Text to summarize",
          },
        ],
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 1 },
            language: { type: "string", default: "vi" },
          },
        },
        positionalParameter: "text",
        grossAmount: "100000",
        terms: {
          deliverySeconds: 60,
          reviewSeconds: 30,
          revisionPolicy: { maxIncluded: 1, description: "One correction" },
          refundPolicy: "Refund undelivered work",
          sideEffects: "none",
          dataUse: "Only this request",
          verification: { minEvidence: "SIGN" },
        },
        deliverySeconds: 60,
        reviewSeconds: 30,
      },
    });
    await db.appCommand.update({
      where: { id: commandId },
      data: { activeRevisionId: revision.id },
    });
    await db.app.update({ where: { id: productId }, data: { defaultCommandId: commandId } });
    await db.chatThread.create({ data: { id: sessionId, buyerId, appId: productId } });
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
  });
  afterEach(async () => {
    for (const privateApp of privateApps) await privateApp.close();
    await app?.close();
  });
  after(async () => {
    if (pool) {
      try {
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await pool.end();
      }
    }
    await postgres?.stop();
  });

  function body(key = randomUUID()) {
    return {
      threadId: sessionId,
      commandId,
      arguments: { text: "hello" },
      contextSelection: {
        messageIds: [] as string[],
        briefVersionId: null,
        fileIds: [] as string[],
      },
      clientRequestId: key,
    };
  }
  async function prepare(payload = body(), headers: Record<string, string> = {}) {
    await db.app.updateMany({ data: { lastHeartbeatAt: new Date() } });
    return app.inject({
      method: "POST",
      url: "/v1/quotes",
      headers: { origin, cookie, "idempotency-key": payload.clientRequestId, ...headers },
      payload,
    });
  }
  async function quote() {
    const response = await prepare();
    assert.equal(response.statusCode, 201, response.body);
    return response.json<QuoteDocument>();
  }
  function submit(
    q: QuoteDocument,
    extra: Record<string, string> = {},
    payload: object = { quoteId: q.quoteId },
  ) {
    return app.inject({
      method: "POST",
      url: "/v1/invocations",
      headers: { origin, cookie, "idempotency-key": q.invocationId, ...extra },
      payload,
    });
  }
  function client(
    q: QuoteDocument,
    overrides: Partial<ConstructorParameters<typeof VaultClientScheme>[0]> = {},
  ) {
    return new VaultClientScheme({
      document: q,
      buyer: wallet.address,
      vault: q.vault as `0x${string}`,
      resourceUrl: `${api}/v1/invocations`,
      signer: grantSigner,
      grantId: `0x${"a".repeat(64)}`,
      grantEpoch: 1n,
      maxAmount: 100000n,
      persist: async () => {},
      ...overrides,
    });
  }

  async function payment(q: QuoteDocument) {
    const required = decodePaymentRequiredHeader(
      (await submit(q)).headers["payment-required"] as string,
    );
    // Real HTTP envelopes omit the SDK's undefined optional extension property.
    return JSON.parse(
      JSON.stringify(
        await new x402Client().register(NETWORK, client(q)).createPaymentPayload(required),
      ),
    );
  }
  async function pending(q: QuoteDocument) {
    const payload = await payment(q);
    return {
      payload,
      operation: await journal.recordIntent({
        quoteId: q.quoteId,
        buyerId,
        buyerAddress: wallet.address,
        paymentPayload: payload,
      }),
    };
  }
  const reservation = {
    relayer: relayer.address,
    nonce: 0n,
    gasLimit: 500000n,
    maxFeePerGas: 2000000000n,
    maxPriorityFeePerGas: 1000000000n,
  };
  async function signed(q: QuoteDocument, payload: unknown, overrides: object = {}) {
    const intent = await readPaymentIntent(q, payload, `${api}/v1/invocations`);
    return relayer.signTransaction({
      type: "eip1559",
      chainId: 43113,
      to: vault,
      nonce: 0,
      value: 0n,
      gas: reservation.gasLimit,
      maxFeePerGas: reservation.maxFeePerGas,
      maxPriorityFeePerGas: reservation.maxPriorityFeePerGas,
      data: encodeFunctionData({
        abi: reserveHoldAbi,
        functionName: "reserveHold",
        args: [readQuote(q.protocolQuote), intent.authorization, intent.signature],
      }),
      ...overrides,
    });
  }

  async function facilitator(q: QuoteDocument, enabled = false) {
    const mock = mockVault(readQuote(q.protocolQuote), vault, grantSigner.address, relayer.address);
    const f = createFacilitatorApp(
      loadFacilitatorConfig({
        DATABASE_URL: config.DATABASE_URL,
        API_ORIGIN: api,
        RPC_URL: "https://rpc.payvoke.test",
        FACILITATOR_TOKEN: serviceToken,
        VAULT_ADDRESS: vault,
        RELAYER_ADDRESS: relayer.address,
        EXPECTED_VAULT_CODE_HASH: keccak256(code),
        VAULT_FEE_CAP_BPS: "500",
        VAULT_MAX_QUOTE_LIFETIME_SECONDS: "3600",
        VAULT_MAX_HOLD_SECONDS: String(30 * 86400),
        LOG_LEVEL: "silent",
        SETTLEMENT_ENABLED: String(enabled),
      }),
      db,
      mock.chain,
    );
    privateApps.push(f);
    await f.ready();
    mock.calls.length = 0;
    const call = (
      operation: "verify" | "settle",
      payload: unknown,
      requirements = paymentRequirements(q),
    ) =>
      f.inject({
        method: "POST",
        url: `/${operation}`,
        headers: { authorization: `Bearer ${serviceToken}` },
        payload: { x402Version: 2, paymentPayload: payload, paymentRequirements: requirements },
      });
    return { f, call, ...mock };
  }

  const gasPolicy = {
    maxGasLimit: 1000000n,
    maxFeePerGas: 10000000000n,
    maxPriorityFeePerGas: 2000000000n,
    maxTransactionCost: 10n ** 16n,
    maxOutstandingCost: 10n ** 16n,
    windowSeconds: 3600,
    maxWindowCost: 10n ** 17n,
  };
  async function execution(q: QuoteDocument) {
    const p = await payment(q);
    const intent = await readPaymentIntent(q, p, `${api}/v1/invocations`);
    const preview = mockVault(
      readQuote(q.protocolQuote),
      vault,
      grantSigner.address,
      relayer.address,
    );
    await preview.chain.initialize();
    const settlement = mockSettlement(readQuote(q.protocolQuote), preview.chain.deployment, {
      quoteDigest: q.quoteDigest,
      authorizationDigest: intent.authorizationDigest,
      grantId: intent.authorization.grantId,
    });
    const service = createSettlementService(db, preview.chain, `${api}/v1/invocations`);
    const makeWorker = (budget = gasPolicy) =>
      new SettlementWorker(
        db,
        preview.chain,
        settlement.chain,
        relayer,
        `${api}/v1/invocations`,
        budget,
      );
    const due = async () => {
      await db.settlementOperation.updateMany({
        where: { state: "PENDING" },
        data: { nextCheckAt: new Date(0) },
      });
    };
    await assert.rejects(service(p, paymentRequirements(q)), /settlement_queued/);
    return { p, intent, preview, ...settlement, service, makeWorker, due };
  }

  it("freezes effective defaults, all snapshots and canonical EIP-712 fields", async () => {
    assert.ok(preservedMigrationQuote, "additive journal migration preserved existing quotes");
    const q = await quote();
    assert.deepEqual(q.effectiveArguments, { text: "hello", language: "vi" });
    assert.deepEqual(q.contextManifest, { messages: [], brief: null, files: [] });
    assert.equal(q.network, NETWORK);
    assert.equal(q.asset, ASSET);
    assert.equal(q.vault, vault);
    assert.equal(q.protocolQuote.productVersion, "1");
    assert.equal(q.protocolQuote.feeBps, "100");
    assert.equal(q.deliveryDeadline - q.validUntil, 60);
    assert.equal(q.releaseNotBefore - q.deliveryDeadline, 30);
    assert.equal(q.resolveBy - q.releaseNotBefore, 60);
    assert.equal(await db.quote.count(), 1);
  });

  it("replays exactly the persisted quote even after catalog/policy changes", async () => {
    const payload = body();
    const first = await prepare(payload);
    assert.equal(first.statusCode, 201, first.body);
    await db.appCommandRevision.updateMany({ data: { grossAmount: "999999", reviewSeconds: 100 } });
    await db.deploymentPolicy.updateMany({ data: { feeBps: 500 } });
    assert.deepEqual((await prepare(payload)).json(), first.json());
    assert.equal(await db.quote.count(), 1);
    const changed = await prepare({ ...payload, arguments: { text: "changed" } });
    assert.equal(changed.statusCode, 409);
  });

  it("serializes duplicate preparation and rejects a second active quote", async () => {
    const payload = body();
    const responses = await Promise.all([prepare(payload), prepare(payload)]);
    for (const response of responses) assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(responses[0].json(), responses[1].json());
    assert.equal((await prepare()).statusCode, 409);
    assert.equal(await db.quote.count(), 1);
  });

  it("enforces session ownership, suspension, Origin and idempotency before admission", async () => {
    assert.equal((await prepare(body(), { cookie: "" })).statusCode, 401);
    assert.equal((await prepare(body(), { origin: "https://evil.test" })).statusCode, 403);
    assert.equal((await prepare(body(), { "idempotency-key": "wrong" })).statusCode, 400);
    await db.chatThread.updateMany({ data: { buyerId: "another-user" } });
    assert.equal((await prepare()).statusCode, 404);
    await db.user.updateMany({ data: { status: "SUSPENDED" } });
    assert.equal((await prepare()).statusCode, 403);
    assert.equal(await db.quote.count(), 0);
  });

  it("rejects invalid args, selected unresolved context and unavailable products", async () => {
    const invalid = { ...body(), arguments: { text: 123 } };
    const response = await app.inject({
      method: "POST",
      url: "/v1/quotes",
      headers: { origin, cookie, "idempotency-key": invalid.clientRequestId },
      payload: invalid,
    });
    assert.equal(response.statusCode, 400, response.body);
    const selected = body();
    selected.contextSelection.fileIds = ["unowned-file"];
    assert.equal((await prepare(selected)).statusCode, 400);
    await db.app.updateMany({ data: { status: "SUSPENDED" } });
    assert.equal((await prepare()).statusCode, 409);
    assert.equal(await db.quote.count(), 0);
  });

  it("rejects duplicate keys, invalid Unicode and oversized JSON before hashing", async () => {
    const payload = body();
    for (const raw of [
      JSON.stringify(payload).replace('"text":"hello"', '"text":"first","text":"last"'),
      JSON.stringify(payload).replace('"hello"', '"\\ud800"'),
      JSON.stringify(payload).replace('"hello"', "1e400"),
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/quotes",
        headers: {
          origin,
          cookie,
          "content-type": "application/json",
          "idempotency-key": payload.clientRequestId,
        },
        payload: raw,
      });
      assert.equal(response.statusCode, 400, response.body);
    }
    const tooLarge = body();
    tooLarge.arguments.text = "x".repeat(33000);
    assert.equal((await prepare(tooLarge)).statusCode, 413);
    assert.equal(await db.quote.count(), 0);
  });

  it("uses SDK envelopes, signs the separate grant authorization and persists before returning", async () => {
    const q = await quote();
    const challenge = await submit(q);
    assert.equal(challenge.statusCode, 402, challenge.body);
    const required = decodePaymentRequiredHeader(challenge.headers["payment-required"] as string);
    assert.deepEqual(required.accepts, [paymentRequirements(q)]);
    assert.equal(required.resource.url, `${api}/v1/invocations`);
    assert.equal(required.accepts[0].extra.assetTransferMethod, undefined);
    assert.equal(
      resolvePaymentFlow(new VaultServerScheme(q), required.accepts[0]).paymentFlow,
      "upfront",
    );
    let persisted: AuthorizationRecord | undefined;
    const sdk = new x402Client().register(
      NETWORK,
      client(q, {
        persist: async (value) => {
          persisted = value;
        },
      }),
    );
    const payment = await sdk.createPaymentPayload(required);
    assert.ok(persisted);
    assert.deepEqual(payment.accepted, required.accepts[0]);
    const header = encodePaymentSignatureHeader(payment);
    assert.deepEqual(decodePaymentSignatureHeader(header), JSON.parse(JSON.stringify(payment)));
    const recovered = await recoverTypedDataAddress({
      domain: vaultDomain(vault),
      types: paymentTypes,
      primaryType: "DebitAuthorization",
      message: {
        quoteDigest: q.quoteDigest,
        grantId: persisted.authorization.grantId,
        grantEpoch: 1n,
      },
      signature: persisted.signature,
    });
    assert.equal(recovered, grantSigner.address);
    assert.notEqual(recovered, wallet.address);
    const blocked = await submit(q, { "payment-signature": header });
    assert.equal(blocked.statusCode, 503, blocked.body);
    assert.ok(!blocked.headers["payment-response"], "never manufacture a successful hold");
  });

  it("checks auth/body/buyer/idempotency before issuing payment requirements", async () => {
    const q = await quote();
    for (const [response, code] of [
      [await submit(q, { cookie: "" }), 401],
      [await submit(q, {}, { quoteId: q.quoteId, grossAmount: "1" }), 400],
      [await submit(q, { "idempotency-key": "wrong" }), 400],
    ] as const) {
      assert.equal(response.statusCode, code, response.body);
      assert.ok(!response.headers["payment-required"]);
    }
    await db.quote.updateMany({ data: { buyerId: "another-user" } });
    assert.equal((await submit(q)).statusCode, 404);
  });

  it("keeps payment metadata uncacheable and free of prompts, PII and signatures", async () => {
    const secret = "Nguyen Van A, 0912345678, hidden prompt";
    const prepared = await prepare({ ...body(), arguments: { text: secret } });
    assert.equal(prepared.statusCode, 201, prepared.body);
    assert.match(String(prepared.headers["cache-control"]), /no-store/);
    const q = prepared.json<QuoteDocument>();
    const unpaid = await submit(q);
    assert.equal(unpaid.statusCode, 402, unpaid.body);
    assert.match(String(unpaid.headers["cache-control"]), /no-store/);
    // PAYMENT-REQUIRED carries opaque IDs, hashes and a fixed description only.
    const required = decodePaymentRequiredHeader(unpaid.headers["payment-required"] as string);
    assert.equal(required.resource.description, "Payvoke invocation");
    assert.equal(JSON.stringify(required).includes(secret), false);
    assert.equal(String(unpaid.headers["payment-required"]).includes(secret), false);
    const signed = await payment(q);
    assert.equal(JSON.stringify(signed).includes(secret), false);
    const status = await app.inject({
      method: "GET",
      url: `/v1/invocations/${q.invocationId}`,
      headers: { origin, cookie },
    });
    assert.match(String(status.headers["cache-control"]), /no-store/);
    const intent = await app.inject({
      method: "POST",
      url: `/v1/invocations/${q.invocationId}/financial-intents`,
      headers: { origin, cookie },
      payload: { action: "reclaim" },
    });
    assert.match(String(intent.headers["cache-control"]), /no-store/);
    // The production redaction policy removes payment headers, cookies and bodies.
    const lines: string[] = [];
    const logger = fastify({
      logger: {
        level: "trace",
        redact: logRedaction,
        stream: new Writable({
          write(chunk, _encoding, done) {
            lines.push(String(chunk));
            done();
          },
        }),
      },
    });
    const signature = JSON.stringify(signed);
    logger.log.info(
      {
        req: {
          headers: { "payment-signature": signature, cookie, authorization: "Bearer pvk_x" },
          body: { arguments: { text: secret } },
        },
        signature,
      },
      "payment request",
    );
    await logger.close();
    const output = lines.join("");
    assert.match(output, /payment request/);
    for (const leaked of [secret, signature, cookie, "pvk_x"])
      assert.equal(output.includes(leaked), false, leaked);
  });

  it("keeps requirements stable over retries and does not trust Host", async () => {
    const q = await quote();
    const first = await submit(q);
    const second = await submit(q, { host: "attacker.test" });
    assert.equal(first.headers["payment-required"], second.headers["payment-required"]);
    assert.match(first.headers["cache-control"] as string, /no-store/);
    assert.match(first.headers["access-control-expose-headers"] as string, /PAYMENT-REQUIRED/i);
  });

  it("client rejects altered economics, snapshots, resource, expiry and spend caps before persistence", async () => {
    const q = await quote();
    let saved = 0;
    const persist = async () => {
      saved++;
    };
    for (const field of ["amount", "payTo", "asset", "network"] as const) {
      const altered = { ...paymentRequirements(q), [field]: "wrong" };
      await assert.rejects(client(q, { persist }).createPaymentPayload(2, altered));
    }
    const alteredDocument = structuredClone(q);
    alteredDocument.effectiveArguments = { text: "tampered" };
    await assert.rejects(
      client(alteredDocument, { persist }).createPaymentPayload(2, paymentRequirements(q)),
    );
    await assert.rejects(
      client(q, { persist, maxAmount: 99999n }).createPaymentPayload(2, paymentRequirements(q)),
    );
    await assert.rejects(
      client(q, { persist, now: () => q.validUntil }).createPaymentPayload(
        2,
        paymentRequirements(q),
      ),
    );
    const required = decodePaymentRequiredHeader(
      (await submit(q)).headers["payment-required"] as string,
    );
    required.resource.url = "https://evil.test/v1/invocations";
    await assert.rejects(
      new x402Client().register(NETWORK, client(q, { persist })).createPaymentPayload(required),
    );
    assert.equal(saved, 0);
  });

  it("client does not return a payment if durable authorization persistence fails", async () => {
    const q = await quote();
    await assert.rejects(
      client(q, {
        persist: async () => {
          throw new Error("disk unavailable");
        },
      }).createPaymentPayload(2, paymentRequirements(q)),
      /disk unavailable/,
    );
  });

  it("rejects noncanonical and overflowing on-wire integers", async () => {
    const q = await quote();
    for (const value of ["01", "-1", "1e2", (1n << 64n).toString()]) {
      assert.throws(() => readQuote({ ...q.protocolQuote, productVersion: value }));
    }
    assert.throws(() => readQuote({ ...q.protocolQuote, feeBps: "65536" }));
  });

  it("expires unpaid quotes without extending deadlines on replay", async () => {
    await db.deploymentPolicy.updateMany({ data: { quoteLifetimeSeconds: 2 } });
    const payload = body();
    const response = await prepare(payload);
    assert.equal(response.statusCode, 201, response.body);
    const q = response.json<QuoteDocument>();
    await delay(Math.max(0, q.validUntil * 1000 - Date.now() + 20));
    assert.equal((await prepare(payload)).statusCode, 410);
    assert.equal((await submit(q)).statusCode, 410);
    const next = await prepare();
    assert.equal(next.statusCode, 201, next.body);
    assert.notEqual(next.json().invocationId, q.invocationId);
    const stored = (await db.quote.findUniqueOrThrow({ where: { id: q.quoteId } }))
      .document as unknown as QuoteDocument;
    assert.equal(stored.validUntil, q.validUntil);
  });

  it("blocks emergency product suspension before advertising a prepared quote", async () => {
    const q = await quote();
    await db.app.updateMany({ data: { status: "SUSPENDED" } });
    const response = await submit(q);
    assert.equal(response.statusCode, 409);
    assert.ok(!response.headers["payment-required"]);
  });

  it("uses core to build requirements and rejects incompatible facilitator capabilities", async () => {
    const q = await quote();
    const expected = paymentRequirements(q);
    const kind = {
      x402Version: 2,
      scheme: "payvoke-vault",
      network: NETWORK,
      extra: { vault, schemeVersion: "1" },
    };
    const facilitator = {
      async getSupported() {
        return { kinds: [kind], extensions: [], signers: { "eip155:*": [provider] } };
      },
      async verify(): Promise<never> {
        throw new Error("Must not verify during quote creation");
      },
      async settle(): Promise<never> {
        throw new Error("Must not settle during quote creation");
      },
    };
    const core = new x402ResourceServer(facilitator).register(NETWORK, new VaultServerScheme(q));
    await core.initialize();
    const requirements = await core.buildPaymentRequirements({
      scheme: expected.scheme,
      network: NETWORK,
      payTo: vault,
      price: { amount: q.grossAmount, asset: ASSET },
      maxTimeoutSeconds: q.quoteLifetimeSeconds,
      extra: expected.extra,
    });
    assert.deepEqual(requirements, [expected]);
    const bad = new x402ResourceServer({
      ...facilitator,
      async getSupported() {
        return {
          kinds: [{ ...kind, extra: { ...kind.extra, vault: provider } }],
          extensions: [],
          signers: {},
        };
      },
    }).register(NETWORK, new VaultServerScheme(q));
    await assert.rejects(bad.initialize(), /capability/i);
    await assert.rejects(new VaultServerScheme(q).parsePrice("$0.10", NETWORK));
  });

  it("journals one immutable intent and invocation under duplicate admission", async () => {
    const q = await quote();
    const payload = await payment(q);
    const input = {
      quoteId: q.quoteId,
      buyerId,
      buyerAddress: wallet.address,
      paymentPayload: payload,
    };
    const operations = await Promise.all([
      journal.recordIntent(input),
      journal.recordIntent(input),
    ]);
    assert.equal(operations[0].authorizationDigest, operations[1].authorizationDigest);
    assert.equal(operations[0].state, "PENDING");
    assert.equal(operations[0].recoveredSigner, grantSigner.address.toLowerCase());
    assert.equal(await db.invocation.count(), 1);
    assert.equal(await db.settlementOperation.count(), 1);
    assert.equal(await db.settlementAttempt.count(), 0);
    assert.equal((await db.invocation.findFirstOrThrow()).executionStatus, "NOT_STARTED");
  });

  it("rejects altered envelopes and cross-buyer intents without persisting", async () => {
    const q = await quote();
    const payload = await payment(q);
    const input = {
      quoteId: q.quoteId,
      buyerId,
      buyerAddress: wallet.address,
      paymentPayload: payload,
    };
    await assert.rejects(
      journal.recordIntent({ ...input, buyerId: "someone-else" }),
      /QUOTE_NOT_FOUND/,
    );
    const mutations = [
      (p: typeof payload) => {
        p.accepted.amount = "1";
      },
      (p: typeof payload) => {
        p.resource.method = "GET";
      },
      (p: typeof payload) => {
        p.payload.authorization.grantEpoch = "01";
      },
      (p: typeof payload) => {
        p.payload.signature = "0x";
      },
      (p: typeof payload) => {
        p.payload.authorization.quoteDigest = `0x${"0".repeat(64)}`;
      },
      (p: typeof payload) => {
        p.payload.extra = "unbound";
      },
    ];
    for (const mutate of mutations) {
      const altered = structuredClone(payload);
      mutate(altered);
      await assert.rejects(
        journal.recordIntent({ ...input, paymentPayload: altered }),
        /INVALID_PAYMENT/,
      );
    }
    assert.equal(await db.invocation.count(), 0);
    assert.equal(await db.settlementOperation.count(), 0);
  });

  it("conflicts on a different authorization for the same invocation", async () => {
    const q = await quote();
    await pending(q);
    const challenge = decodePaymentRequiredHeader(
      (await submit(q)).headers["payment-required"] as string,
    );
    const changed = await new x402Client()
      .register(NETWORK, client(q, { grantId: `0x${"b".repeat(64)}` }))
      .createPaymentPayload(challenge);
    await assert.rejects(
      journal.recordIntent({
        quoteId: q.quoteId,
        buyerId,
        buyerAddress: wallet.address,
        paymentPayload: JSON.parse(JSON.stringify(changed)),
      }),
      /INVOCATION_CONFLICT/,
    );
    assert.equal(await db.settlementOperation.count(), 1);
  });

  it("claims once, renews with database time and fences a replaced worker", async () => {
    const q = await quote();
    await pending(q);
    const leases = await Promise.all([
      journal.claim(q.invocationId, "a"),
      journal.claim(q.invocationId, "b"),
    ]);
    assert.equal(leases.filter(Boolean).length, 1);
    const old = leases.find((l) => l !== null)!;
    await journal.renew(old);
    assert.equal(await journal.claim(q.invocationId, "c"), null);
    await db.settlementOperation.update({
      where: { invocationId: q.invocationId },
      data: { leaseExpiresAt: new Date(0) },
    });
    const replacement = await journal.claim(q.invocationId, "c");
    assert.ok(replacement);
    assert.ok(replacement.epoch > old.epoch);
    await assert.rejects(journal.renew(old), /LEASE_LOST/);
    await assert.rejects(journal.reserveAttempt(old, reservation), /LEASE_LOST/);
    assert.equal(await db.relayerLane.count(), 0, "failed reservation rolled back the lane");
    await assert.rejects(journal.rejectUnattempted(old, "invalid_grant"), /LEASE_LOST/);
    await journal.renew(replacement);
  });

  it("persists exact signed bytes before broadcast and restores them after client restart", async () => {
    const q = await quote();
    const { payload } = await pending(q);
    const lease = (await journal.claim(q.invocationId, "worker"))!;
    const first = await journal.reserveAttempt(lease, reservation);
    const second = await journal.reserveAttempt(lease, reservation);
    assert.equal(first.id, second.id);
    await assert.rejects(
      journal.recordBroadcast(lease, `0x${"a".repeat(64)}`),
      /TRANSACTION_MISMATCH/,
    );
    const raw = await signed(q, payload);
    const stored = await journal.persistSigned(lease, raw);
    assert.equal(stored.state, "SIGNED");
    assert.equal(stored.signedTransaction, raw);
    assert.equal(stored.transactionHash, keccak256(raw));
    const restarted = new SettlementJournal(db, { vault, resourceUrl: `${api}/v1/invocations` });
    assert.equal((await restarted.persistSigned(lease, raw)).id, stored.id);
    await restarted.recordBroadcast(lease, keccak256(raw));
    await restarted.markUnknown(lease, keccak256(raw), "rpc_timeout");
    const recovered = await db.settlementAttempt.findFirstOrThrow();
    assert.equal(recovered.state, "UNKNOWN");
    assert.equal(recovered.signedTransaction, raw);
    assert.equal(await db.settlementAttempt.count(), 1);
    await assert.rejects(
      restarted.rejectUnattempted(lease, "quote_expired"),
      /ATTEMPT_REQUIRES_RECONCILIATION/,
    );
  });

  it("rejects signed transactions for a different chain, calldata, destination, nonce, value or fees", async () => {
    const q = await quote();
    const { payload } = await pending(q);
    const lease = (await journal.claim(q.invocationId, "worker"))!;
    await journal.reserveAttempt(lease, reservation);
    for (const override of [
      { chainId: 1 },
      { to: provider },
      { data: "0x" },
      { nonce: 1 },
      { value: 1n },
      { gas: 499999n },
      { maxFeePerGas: 3000000000n },
    ])
      await assert.rejects(
        journal.persistSigned(lease, await signed(q, payload, override)),
        /TRANSACTION_MISMATCH/,
      );
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "RESERVED");
    await journal.persistSigned(lease, await signed(q, payload));
    await assert.rejects(
      journal.reserveAttempt(lease, { ...reservation, nonce: 1n }),
      /ATTEMPT_CONFLICT/,
    );
  });

  it("does not free an ambiguous transaction lane when its worker lease expires", async () => {
    const q = await quote();
    const { payload } = await pending(q);
    const lease = (await journal.claim(q.invocationId, "old"))!;
    await journal.reserveAttempt(lease, reservation);
    const raw = await signed(q, payload);
    await journal.persistSigned(lease, raw);
    await journal.markUnknown(lease, keccak256(raw), "rpc_timeout");
    await db.settlementOperation.update({
      where: { invocationId: q.invocationId },
      data: { leaseExpiresAt: new Date(0) },
    });
    const otherSession = await db.chatThread.create({ data: { buyerId, appId: productId } });
    const response = await prepare({ ...body(), threadId: otherSession.id });
    assert.equal(response.statusCode, 201, response.body);
    const otherQuote = response.json<QuoteDocument>();
    await pending(otherQuote);
    const otherLease = (await journal.claim(otherQuote.invocationId, "other"))!;
    await assert.rejects(
      journal.reserveAttempt(otherLease, { ...reservation, nonce: 1n }),
      /RELAYER_BUSY/,
    );
    const next = (await journal.claim(q.invocationId, "recovery"))!;
    assert.equal((await journal.reserveAttempt(next, reservation)).signedTransaction, raw);
    await assert.rejects(journal.persistSigned(lease, raw), /LEASE_LOST/);
    assert.equal(await db.settlementAttempt.count(), 1);
  });

  it("serializes concurrent reservations on a relayer and enforces nonce uniqueness in SQL", async () => {
    const first = await quote();
    await pending(first);
    const otherSession = await db.chatThread.create({ data: { buyerId, appId: productId } });
    const response = await prepare({ ...body(), threadId: otherSession.id });
    assert.equal(response.statusCode, 201, response.body);
    const second = response.json<QuoteDocument>();
    await pending(second);
    const leases = [
      (await journal.claim(first.invocationId, "worker-one"))!,
      (await journal.claim(second.invocationId, "worker-two"))!,
    ];
    const results = await Promise.allSettled(
      leases.map((lease) => journal.reserveAttempt(lease, reservation)),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failure = results.find((r) => r.status === "rejected");
    assert.ok(
      failure && failure.status === "rejected" && /RELAYER_BUSY/.test(failure.reason.message),
    );
    const winner = await db.settlementAttempt.findFirstOrThrow();
    const loser = winner.invocationId === first.invocationId ? second : first;
    if (embedded) {
      // The PGlite socket bridge can leave its extended-query connection broken
      // after a constraint error. Exercise the same SQL constraint directly in
      // its engine; the Docker branch also proves Prisma's P2002 mapping.
      await assert.rejects(
        embedded.query(
          `INSERT INTO "${schema}".settlement_attempts
          (id, "invocationId", network, relayer, nonce, "gasLimit", "maxFeePerGas", "maxPriorityFeePerGas", "updatedAt")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
          [
            randomUUID(),
            loser.invocationId,
            NETWORK,
            winner.relayer,
            winner.nonce.toString(),
            winner.gasLimit.toString(),
            winner.maxFeePerGas.toFixed(0),
            winner.maxPriorityFeePerGas.toFixed(0),
          ],
        ),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "23505",
      );
    } else
      await assert.rejects(
        db.settlementAttempt.create({
          data: {
            invocationId: loser.invocationId,
            network: NETWORK,
            relayer: winner.relayer,
            nonce: winner.nonce,
            gasLimit: winner.gasLimit,
            maxFeePerGas: winner.maxFeePerGas,
            maxPriorityFeePerGas: winner.maxPriorityFeePerGas,
          },
        }),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "P2002",
      );
    assert.equal(await db.settlementAttempt.count(), 1);
    assert.equal((await db.relayerLane.findFirstOrThrow()).activeInvocationId, winner.invocationId);
  });

  it("keeps an expired quote's UNKNOWN operation in the session slot; polling is free and private", async () => {
    await db.deploymentPolicy.updateMany({ data: { quoteLifetimeSeconds: 2 } });
    const q = await quote();
    const { payload } = await pending(q);
    const lease = (await journal.claim(q.invocationId, "worker"))!;
    await journal.reserveAttempt(lease, reservation);
    const raw = await signed(q, payload);
    await journal.persistSigned(lease, raw);
    await journal.markUnknown(lease, keccak256(raw), "rpc_timeout");
    await delay(Math.max(0, q.validUntil * 1000 - Date.now() + 20));
    const blocked = await prepare();
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.equal(
      (
        await journal.recordIntent({
          quoteId: q.quoteId,
          buyerId,
          buyerAddress: wallet.address,
          paymentPayload: payload,
        })
      ).state,
      "PENDING",
    );
    const status = await app.inject({
      url: `/v1/invocations/${q.invocationId}`,
      headers: { cookie },
    });
    assert.equal(status.statusCode, 200, status.body);
    assert.equal(status.json().paymentStatus, "UNKNOWN");
    assert.equal(status.json().executionStatus, "NOT_STARTED");
    assert.equal(status.json().transaction, keccak256(raw));
    assert.ok(!status.body.includes(raw));
    assert.ok(!status.body.includes(payload.payload.signature));
    assert.equal((await app.inject({ url: `/v1/invocations/${q.invocationId}` })).statusCode, 401);
    await db.invocation.updateMany({ data: { buyerId: "different-user" } });
    assert.equal(
      (await app.inject({ url: `/v1/invocations/${q.invocationId}`, headers: { cookie } }))
        .statusCode,
      404,
    );
    assert.equal(await db.settlementAttempt.count(), 1);
  });

  it("rejects an unattempted intent permanently, without creating a retry attempt", async () => {
    await db.deploymentPolicy.updateMany({ data: { quoteLifetimeSeconds: 2 } });
    const q = await quote();
    const { payload } = await pending(q);
    const lease = (await journal.claim(q.invocationId, "worker"))!;
    await journal.rejectUnattempted(lease, "invalid_grant");
    const replayed = await journal.recordIntent({
      quoteId: q.quoteId,
      buyerId,
      buyerAddress: wallet.address,
      paymentPayload: payload,
    });
    assert.equal(replayed.state, "REJECTED");
    assert.equal(await journal.claim(q.invocationId, "retry"), null);
    assert.equal((await prepare()).statusCode, 409, "the old authorization has not expired yet");
    const busyThread = await app.inject({
      method: "GET",
      url: `/v1/threads/${sessionId}`,
      headers: { origin, cookie },
    });
    assert.equal(busyThread.statusCode, 200, busyThread.body);
    assert.equal(busyThread.json().activeQuoteId, q.quoteId);
    await delay(Math.max(0, q.validUntil * 1000 - Date.now() + 20));
    const freeThread = await app.inject({
      method: "GET",
      url: `/v1/threads/${sessionId}`,
      headers: { origin, cookie },
    });
    assert.equal(freeThread.statusCode, 200, freeThread.body);
    assert.equal(freeThread.json().activeQuoteId, null);
    assert.equal(
      (
        await journal.recordIntent({
          quoteId: q.quoteId,
          buyerId,
          buyerAddress: wallet.address,
          paymentPayload: payload,
        })
      ).state,
      "REJECTED",
    );
    const next = await prepare();
    assert.equal(next.statusCode, 201, next.body);
    assert.notEqual(next.json().invocationId, q.invocationId);
    assert.equal(await db.settlementAttempt.count(), 0);
  });

  it("allows at most one claim across independent Docker PostgreSQL worker processes", async (t) => {
    if (embedded) return t.skip("Run test:payments:postgres for real cross-process concurrency");
    const q = await quote();
    await pending(q);
    const run = promisify(execFile);
    const cwd = fileURLToPath(new URL("..", import.meta.url));
    const outputs = await Promise.all(
      ["one", "two"].map((owner) =>
        run(
          process.execPath,
          ["--import", "tsx", "test/fixtures/claim.ts", schema, q.invocationId, owner],
          { cwd },
        ),
      ),
    );
    const claims = outputs.map((o) => JSON.parse(o.stdout));
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await db.settlementOperation.findFirstOrThrow()).leaseEpoch, 1n);
  });

  it("protects every facilitator endpoint with service auth, not a browser cookie", async () => {
    const q = await quote();
    const { f, calls } = await facilitator(q);
    for (const url of ["/supported", "/verify", "/settle"]) {
      for (const headers of [{ cookie }, { authorization: "Bearer wrong" }, {}]) {
        const response = await f.inject({
          method: url === "/supported" ? "GET" : "POST",
          url,
          headers,
          payload: url === "/supported" ? undefined : {},
        });
        assert.equal(response.statusCode, 401, response.body);
        assert.match(response.headers["cache-control"] as string, /no-store/);
      }
    }
    assert.equal(calls.length, 0);
    const supported = await f.inject({
      url: "/supported",
      headers: { authorization: `Bearer ${serviceToken}` },
    });
    assert.equal(supported.statusCode, 200, supported.body);
    assert.deepEqual(supported.json().kinds, [
      {
        x402Version: 2,
        scheme: "payvoke-vault",
        network: NETWORK,
        extra: { vault, schemeVersion: "1" },
      },
    ]);
    assert.deepEqual(supported.json().signers, { "eip155:*": [relayer.address] });
    assert.ok(!supported.headers["access-control-allow-origin"]);
  });

  it("verifies through the SDK facilitator without any journal side effects; settle revalidates", async () => {
    const q = await quote();
    const p = await payment(q);
    const f = await facilitator(q);
    const verified = await f.call("verify", p);
    assert.equal(verified.statusCode, 200, verified.body);
    assert.equal(verified.json().isValid, true);
    assert.equal(verified.json().extra.admission, "preview");
    assert.equal(verified.json().extra.classification, "new-admission");
    assert.equal(await db.settlementOperation.count(), 0);
    assert.equal(await db.relayerLane.count(), 0);
    f.state.grant.revoked = true;
    const rejected = await f.call("settle", p);
    assert.equal(rejected.statusCode, 422, rejected.body);
    assert.equal(rejected.json().error, "grant_revoked");
    f.state.grant.revoked = false;
    f.calls.length = 0;
    const unavailable = await f.call("settle", p);
    assert.equal(unavailable.statusCode, 503, unavailable.body);
    assert.deepEqual(unavailable.json(), { error: "settlement_unavailable" });
    assert.ok(f.calls.some((c) => c.method === "simulate"));
    assert.equal(await db.settlementOperation.count(), 0);
    assert.equal(await db.settlementAttempt.count(), 0);
    assert.ok(!unavailable.headers["payment-response"]);
  });

  it("rejects malformed, duplicate-key and oversized private requests before RPC", async () => {
    const q = await quote();
    const p = await payment(q);
    const { f, calls, call } = await facilitator(q);
    const altered = structuredClone(p);
    altered.accepted.amount = "1";
    const invalid = await call("verify", altered);
    assert.equal(invalid.statusCode, 200, invalid.body);
    assert.equal(invalid.json().invalidReason, "invalid_payment");
    assert.equal(
      (await call("verify", p, { ...paymentRequirements(q), network: "eip155:1" })).statusCode,
      400,
    );
    for (const raw of [
      '{"x402Version":2,"x402Version":1}',
      JSON.stringify({ padding: "x".repeat(9000) }),
    ]) {
      const response = await f.inject({
        method: "POST",
        url: "/verify",
        headers: { authorization: `Bearer ${serviceToken}`, "content-type": "application/json" },
        payload: raw,
      });
      assert.ok([400, 413].includes(response.statusCode), response.body);
    }
    assert.equal(calls.length, 0);
  });

  it("treats unresolved attempts and missing-journal holds as recovery, not new admission", async () => {
    const q = await quote();
    const p = await payment(q);
    const f = await facilitator(q);
    const intent = await readPaymentIntent(q, p, `${api}/v1/invocations`);
    f.state.hold = matchingHold(
      readQuote(q.protocolQuote),
      intent.authorizationDigest,
      q.quoteDigest,
      intent.authorization.grantId,
    );
    const orphan = await f.call("verify", p);
    assert.equal(orphan.statusCode, 503, orphan.body);
    assert.equal(orphan.json().error, "recovery_required");
    await journal.recordIntent({
      quoteId: q.quoteId,
      buyerId,
      buyerAddress: wallet.address,
      paymentPayload: p,
    });
    f.state.paused = true;
    f.state.grant.revoked = true;
    f.state.role = false;
    f.state.now = BigInt(q.resolveBy + 1);
    await db.app.updateMany({ data: { status: "SUSPENDED" } });
    const replay = await f.call("verify", p);
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().extra.classification, "existing-hold");
    assert.ok(!replay.body.includes('"success":true'));
    assert.ok(!f.calls.some((c) => c.method === "simulate"));
  });

  it("does not reject or re-admit an existing attempt by checking a freshly revoked grant", async () => {
    const q = await quote();
    const { payload } = await pending(q);
    const f = await facilitator(q);
    await journal.reserveAttempt((await journal.claim(q.invocationId, "worker"))!, reservation);
    f.state.grant.revoked = true;
    const result = await f.call("verify", payload);
    assert.equal(result.statusCode, 503, result.body);
    assert.equal(result.json().error, "reconciliation_required");
    assert.ok(!f.calls.some((c) => c.method === "getGrant" || c.method === "simulate"));
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "PENDING");
  });

  it("rejects a different authorization digest before any chain reads", async () => {
    const q = await quote();
    const { payload } = await pending(q);
    const f = await facilitator(q);
    const changed = structuredClone(payload);
    changed.payload.authorization.grantEpoch = "2";
    const result = await f.call("verify", changed);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().invalidReason, "invocation_conflict");
    assert.equal(f.calls.length, 0);
    assert.equal(await db.settlementOperation.count(), 1);
  });

  it("refuses facilitator readiness when the active deployment policy exceeds vault caps", async () => {
    const q = await quote();
    await db.deploymentPolicy.updateMany({ data: { feeBps: 501 } });
    await assert.rejects(facilitator(q), /deployment_policy_mismatch/);
  });

  it("checks buyer suspension and product availability only for new onchain admission", async () => {
    const q = await quote();
    const p = await payment(q);
    const f = await facilitator(q);
    await db.user.updateMany({ data: { status: "SUSPENDED" } });
    const suspended = await f.call("verify", p);
    assert.equal(suspended.json().invalidReason, "account_suspended");
    await db.user.updateMany({ data: { status: "ACTIVE" } });
    await db.app.updateMany({ data: { status: "SUSPENDED" } });
    const disabled = await f.call("verify", p);
    assert.equal(disabled.json().invalidReason, "admission_unavailable");
    assert.ok(!f.calls.some((c) => c.method === "simulate"));
  });

  it("works with HTTPFacilitatorClient auth and error parsing without manufacturing a transaction hash", async (t) => {
    const q = await quote();
    const p = await payment(q);
    const { f, state } = await facilitator(q);
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((v, k) => {
          headers[k] = v;
        });
        const response = await f.inject({
          method: init?.method === "POST" ? "POST" : "GET",
          url: new URL(String(input)).pathname,
          headers,
          payload: init?.body as string | undefined,
        });
        return new Response(response.body, {
          status: response.statusCode,
          headers: { "content-type": "application/json" },
        });
      },
    );
    const client = new HTTPFacilitatorClient({
      url: "https://private-facilitator.test",
      timeoutMs: 1000,
      createAuthHeaders: async () => {
        const auth = { Authorization: `Bearer ${serviceToken}` };
        return { verify: auth, settle: auth, supported: auth };
      },
    });
    assert.equal((await client.getSupported()).kinds[0].scheme, "payvoke-vault");
    const resourceServer = new x402ResourceServer(client).register(
      NETWORK,
      new VaultServerScheme(q),
    );
    await resourceServer.initialize();
    assert.equal((await client.verify(p, paymentRequirements(q))).isValid, true);
    await assert.rejects(client.settle(p, paymentRequirements(q)), /503.*settlement_unavailable/);
    state.rpcError = true;
    const error = await f.inject({
      method: "POST",
      url: "/verify",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: { x402Version: 2, paymentPayload: p, paymentRequirements: paymentRequirements(q) },
    });
    assert.equal(error.statusCode, 503);
    assert.deepEqual(error.json(), { error: "rpc_unavailable" });
    assert.ok(!error.body.includes("secret-rpc"));
    assert.ok(!error.body.includes(serviceToken));
  });

  it("settles a durable intent once, commits HELD + ready atomically, and replays the receipt", async () => {
    const q = await quote();
    const f = await execution(q);
    const worker = f.makeWorker();
    await worker.tick();
    assert.equal(f.state.sent.length, 1);
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "BROADCAST");
    const pendingReceipt = await f.service(f.p, paymentRequirements(q));
    assert.equal(pendingReceipt.success, false);
    assert.equal(pendingReceipt.errorReason, "settlement_pending");
    assert.equal(await db.invocationReady.count(), 0);
    await f.due();
    await worker.tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "HELD");
    assert.equal((await db.invocation.findFirstOrThrow()).executionStatus, "QUEUED");
    assert.equal(await db.invocationReady.count(), 1);
    assert.equal((await db.relayerLane.findFirstOrThrow()).activeInvocationId, null);
    assert.ok((await db.settlementAttempt.findFirstOrThrow()).actualGasCost);
    f.preview.state.grant.revoked = true;
    f.preview.state.now = BigInt(q.resolveBy + 1);
    await db.app.updateMany({ data: { status: "SUSPENDED" } });
    const replay = await f.service(f.p, paymentRequirements(q));
    assert.equal(replay.success, true);
    assert.equal(replay.transaction, pendingReceipt.transaction);
    await f.makeWorker().tick();
    assert.equal(f.state.sent.length, 1);
    assert.equal(await db.invocationReady.count(), 1);
    const status = await app.inject({
      url: `/v1/invocations/${q.invocationId}`,
      headers: { cookie },
    });
    assert.equal(status.json().receipt.success, true);
  });

  it("recovers a send timeout after chain execution without another broadcast", async () => {
    const q = await quote();
    const f = await execution(q);
    f.state.sendMode = "timeout-after";
    await f.makeWorker().tick();
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "UNKNOWN");
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "HELD");
    assert.equal(f.state.sent.length, 1);
    assert.equal(await db.invocationReady.count(), 1);
  });

  it("retries exactly the persisted bytes after a timeout before send, even after revocation", async () => {
    const q = await quote();
    const f = await execution(q);
    f.state.sendMode = "timeout-before";
    await f.makeWorker().tick();
    const first = await db.settlementAttempt.findFirstOrThrow();
    f.preview.state.grant.revoked = true;
    f.state.sendMode = "accept";
    await f.due();
    await f.makeWorker().tick();
    assert.equal(f.state.sent.length, 2);
    assert.equal(f.state.sent[0], f.state.sent[1]);
    assert.equal(
      (await db.settlementAttempt.findFirstOrThrow()).transactionHash,
      first.transactionHash,
    );
    assert.equal(await db.settlementAttempt.count(), 1);
  });

  it("does not queue before finality, then handles a pre-finality reorg without replacing the transaction", async () => {
    const q = await quote();
    const f = await execution(q);
    f.state.finalized = false;
    await f.makeWorker().tick();
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "CONFIRMED");
    assert.equal(await db.invocationReady.count(), 0);
    f.state.receipt = null;
    f.state.nonce = 0;
    f.state.pendingNonce = 0;
    f.state.sendMode = "timeout-before";
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "UNKNOWN");
    assert.equal(f.state.sent[0], f.state.sent[1]);
    assert.equal(await db.invocationReady.count(), 0);
  });

  it("records finalized revert and spent gas, never a ready event or second attempt", async () => {
    const q = await quote();
    const f = await execution(q);
    f.state.sendMode = "revert";
    await f.makeWorker().tick();
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "REJECTED");
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "REVERTED");
    assert.equal(await db.invocationReady.count(), 0);
    assert.equal((await db.relayerLane.findFirstOrThrow()).activeInvocationId, null);
    const thread = await app.inject({
      method: "GET",
      url: `/v1/threads/${sessionId}`,
      headers: { origin, cookie },
    });
    assert.equal(thread.statusCode, 200, thread.body);
    assert.equal(thread.json().activeQuoteId, null);
    await assert.rejects(f.service(f.p, paymentRequirements(q)), /transaction_reverted/);
    await f.makeWorker().tick();
    assert.equal(await db.settlementAttempt.count(), 1);
    const next = await prepare();
    assert.equal(next.statusCode, 201, next.body);
    assert.notEqual(next.json().invocationId, q.invocationId);
  });

  it("quarantines a successful receipt with a mismatched hold and retains the lane", async () => {
    const q = await quote();
    const f = await execution(q);
    await f.makeWorker().tick();
    f.state.hold.gross++;
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "QUARANTINED");
    assert.equal((await db.relayerLane.findFirstOrThrow()).activeInvocationId, q.invocationId);
    assert.equal(await db.invocationReady.count(), 0);
  });

  it("records a late/closed hold as paid but never queues an expired delivery", async () => {
    const q = await quote();
    const f = await execution(q);
    await f.makeWorker().tick();
    f.state.now = BigInt(q.deliveryDeadline);
    await f.due();
    await f.makeWorker().tick();
    const op = await db.settlementOperation.findFirstOrThrow();
    assert.equal(op.state, "HELD");
    assert.equal(op.errorReason, "hold_not_executable");
    assert.equal((await db.invocation.findFirstOrThrow()).executionStatus, "NOT_STARTED");
    assert.equal(await db.invocationReady.count(), 0);
    assert.equal((await f.service(f.p, paymentRequirements(q))).success, true);
  });

  it("rejects revoked admission before reserving and does not confuse RPC failure with rejection", async () => {
    const q = await quote();
    const f = await execution(q);
    f.preview.state.rpcError = true;
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "PENDING");
    f.preview.state.rpcError = false;
    f.preview.state.grant.revoked = true;
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "REJECTED");
    assert.equal(await db.settlementAttempt.count(), 0);
    assert.equal(f.state.sent.length, 0);
  });

  it("fails closed on fee/gas/balance/nonce limits before signing", async () => {
    const q = await quote();
    const f = await execution(q);
    f.state.pendingNonce = 1;
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "QUARANTINED");
    assert.equal(await db.settlementAttempt.count(), 0);
  });

  it("retains an unspent operation on insufficient gas or gas budget, with no signature", async () => {
    const q = await quote();
    const f = await execution(q);
    f.state.balance = 0n;
    await f.makeWorker().tick();
    assert.equal(
      (await db.settlementOperation.findFirstOrThrow()).errorReason,
      "insufficient_relayer_gas",
    );
    f.state.balance = 10n ** 18n;
    await f.due();
    await f.makeWorker({ ...gasPolicy, maxGasLimit: 1n }).tick();
    assert.equal(
      (await db.settlementOperation.findFirstOrThrow()).errorReason,
      "gas_policy_exceeded",
    );
    assert.equal(await db.settlementAttempt.count(), 0);
    assert.equal(f.state.sent.length, 0);
  });

  it("backfills finalized logs idempotently and records orphan holds without fabricating jobs", async () => {
    const q = await quote();
    const f = await execution(q);
    await f.makeWorker().tick();
    await scanFinalizedHolds(db, f.chain, 1n);
    assert.equal((await db.settlementScanCursor.findFirstOrThrow()).blockNumber, 12n);
    assert.equal(await db.invocationReady.count(), 0);
    await scanFinalizedHolds(db, f.chain, 1n);
    assert.equal(await db.settlementIncident.count(), 0);
    await db.settlementScanCursor.deleteMany();
    f.state.logs[0].args.holdId = `0x${"f".repeat(64)}`;
    await scanFinalizedHolds(db, f.chain, 1n);
    assert.equal(await db.settlementIncident.count(), 1);
    assert.equal(await db.invocationReady.count(), 0);
  });

  it("rolls back HELD, lane release and outbox if the handoff insert fails", async (t) => {
    const q = await quote();
    const f = await execution(q);
    await f.makeWorker().tick();
    // Force a real database failure *inside* finalize, not a mock transaction.
    await db.invocationReady.create({ data: { invocationId: q.invocationId, quoteId: q.quoteId } });
    if (embedded) {
      // PGlite's socket bridge cannot recover from extended-query constraint errors.
      await db.invocationReady.deleteMany();
      t.skip("Atomic SQL rollback is exercised on Docker PostgreSQL");
      return;
    }
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "PENDING");
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "BROADCAST");
    assert.equal((await db.relayerLane.findFirstOrThrow()).activeInvocationId, q.invocationId);
    await db.invocationReady.deleteMany();
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "HELD");
    assert.equal(await db.invocationReady.count(), 1);
    assert.equal(f.state.sent.length, 1);
  });

  it("runs SDK upfront through authenticated gateway, preserving pending/finalized receipts and expired replay", async (t) => {
    const q = await quote();
    const p = await payment(q);
    const f = await facilitator(q, true);
    let settleCalls = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://private-facilitator.test");
        if (url.pathname === "/settle") settleCalls++;
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((v, k) => {
          headers[k] = v;
        });
        const response = await f.f.inject({
          method: init?.method === "POST" ? "POST" : "GET",
          url: url.pathname,
          headers,
          payload: init?.body as string | undefined,
        });
        return new Response(response.body, {
          status: response.statusCode,
          headers: { "content-type": "application/json" },
        });
      },
    );
    await app.close();
    app = createApp(
      {
        ...config,
        PAYMENTS_ENABLED: true,
        FACILITATOR_URL: "https://private-facilitator.test",
        FACILITATOR_TOKEN: serviceToken,
      },
      db,
    );
    await app.ready();
    const bad = await submit(q, {
      cookie: "",
      "payment-signature": encodePaymentSignatureHeader(p),
    });
    assert.equal(bad.statusCode, 401);
    assert.equal(settleCalls, 0);
    const queued = await submit(q, { "payment-signature": encodePaymentSignatureHeader(p) });
    assert.equal(queued.statusCode, 503, queued.body);
    assert.equal(
      queued.headers["payment-response"],
      undefined,
      "no synthetic empty-hash receipt from core",
    );
    assert.equal(await db.settlementOperation.count(), 1);
    const intent = await readPaymentIntent(q, p, `${api}/v1/invocations`);
    const mock = mockSettlement(readQuote(q.protocolQuote), f.chain.deployment, {
      quoteDigest: q.quoteDigest,
      authorizationDigest: intent.authorizationDigest,
      grantId: intent.authorization.grantId,
    });
    const worker = new SettlementWorker(
      db,
      f.chain,
      mock.chain,
      relayer,
      `${api}/v1/invocations`,
      gasPolicy,
    );
    await worker.tick();
    const pending = await submit(q, { "payment-signature": encodePaymentSignatureHeader(p) });
    assert.equal(pending.statusCode, 402, pending.body);
    const pendingReceipt = JSON.parse(
      Buffer.from(pending.headers["payment-response"] as string, "base64").toString(),
    );
    assert.equal(pendingReceipt.success, false);
    assert.equal(pendingReceipt.errorReason, "settlement_pending");
    assert.equal(mock.state.sent.length, 1);
    assert.equal(await db.settlementAttempt.count(), 1);
    await db.settlementOperation.updateMany({ data: { nextCheckAt: new Date(0) } });
    await worker.tick();
    const before = settleCalls;
    const held = await submit(q, { "payment-signature": encodePaymentSignatureHeader(p) });
    assert.equal(held.statusCode, 202, held.body);
    assert.equal(held.json().executionStatus, "QUEUED");
    assert.equal(settleCalls - before, 1, "echo upfront receipt without settling twice");
    const receipt = JSON.parse(
      Buffer.from(held.headers["payment-response"] as string, "base64").toString(),
    );
    assert.equal(receipt.success, true);
    assert.equal(receipt.transaction, pendingReceipt.transaction);
    await db.app.updateMany({ data: { status: "SUSPENDED" } });
    await db.chatThread.updateMany({ data: { archivedAt: new Date() } });
    const replay = await submit(q, { "payment-signature": encodePaymentSignatureHeader(p) });
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal(await db.invocationReady.count(), 1);
    assert.equal(mock.state.sent.length, 1);
  });

  it("resumes after crashing with an unsigned reservation or persisted signature", async (t) => {
    const q = await quote();
    const f = await execution(q);
    const persist = SettlementJournal.prototype.persistSigned;
    let crashed = false;
    t.mock.method(
      SettlementJournal.prototype,
      "persistSigned",
      async function (this: SettlementJournal, ...args: Parameters<typeof persist>) {
        const stored = await persist.apply(this, args);
        if (!crashed) {
          crashed = true;
          throw new Error("Worker died after signature persistence");
        }
        return stored;
      },
    );
    await f.makeWorker().tick();
    const attempt = await db.settlementAttempt.findFirstOrThrow();
    assert.equal(attempt.state, "SIGNED");
    assert.equal(f.state.sent.length, 0);
    await f.due();
    await f.makeWorker().tick();
    assert.equal(f.state.sent[0], attempt.signedTransaction);
    assert.equal(await db.settlementAttempt.count(), 1);
  });

  it("fences a stale signer when a replacement worker resumes the same reservation", async (t) => {
    const q = await quote();
    const f = await execution(q);
    const sign = relayer.signTransaction.bind(relayer);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    t.mock.method(relayer, "signTransaction", async (args: Parameters<typeof sign>[0]) => {
      if (first) {
        first = false;
        entered();
        await blocked;
      }
      return sign(args);
    });
    const oldTick = f.makeWorker().tick();
    await waiting;
    await db.settlementOperation.updateMany({
      data: { leaseExpiresAt: new Date(0), nextCheckAt: new Date(0) },
    });
    try {
      await f.makeWorker().tick();
    } finally {
      release();
    }
    await oldTick;
    assert.equal(f.state.sent.length, 1);
    assert.equal(await db.settlementAttempt.count(), 1);
    assert.equal((await db.settlementAttempt.findFirstOrThrow()).state, "BROADCAST");
  });

  it("keeps the lane after bounded same-byte rebroadcasts are exhausted", async () => {
    const q = await quote();
    const f = await execution(q);
    f.state.sendMode = "timeout-before";
    for (let i = 0; i < 5; i++) {
      await f.due();
      await f.makeWorker().tick();
    }
    const attempt = await db.settlementAttempt.findFirstOrThrow();
    assert.equal(attempt.broadcastCount, 3);
    assert.equal(f.state.sent.length, 3);
    assert.equal(new Set(f.state.sent).size, 1);
    assert.equal(
      (await db.settlementOperation.findFirstOrThrow()).errorReason,
      "broadcast_limit_reached",
    );
    assert.equal((await db.relayerLane.findFirstOrThrow()).activeInvocationId, q.invocationId);
  });

  it("accounts finalized gas against the durable rolling budget before the next signature", async () => {
    const q = await quote();
    const f = await execution(q);
    await f.makeWorker().tick();
    await f.due();
    await f.makeWorker().tick();
    sessionId = randomUUID();
    await db.chatThread.create({ data: { id: sessionId, buyerId, appId: productId } });
    const second = await quote();
    const next = await execution(second);
    next.state.nonce = 1;
    next.state.pendingNonce = 1;
    // Each tx envelope fits; prior actual cost + new liability exceeds window.
    const cost = 480000n * next.state.maxFee;
    await next.makeWorker({ ...gasPolicy, maxTransactionCost: cost, maxWindowCost: cost }).tick();
    assert.equal(
      (
        await db.settlementOperation.findUniqueOrThrow({
          where: { invocationId: second.invocationId },
        })
      ).errorReason,
      "gas_budget_exceeded",
    );
    assert.equal(next.state.sent.length, 0);
    assert.equal(await db.settlementAttempt.count(), 1);
  });

  const corruptions = [
    [
      "wrong event vault",
      (state: ReturnType<typeof mockSettlement>["state"]) => {
        state.receipt.logs[0].address = provider;
      },
    ],
    [
      "wrong event digest",
      (state: ReturnType<typeof mockSettlement>["state"]) => {
        state.receipt.logs[0].data = `0x${"f".repeat(192)}`;
      },
    ],
    [
      "wrong sender",
      (state: ReturnType<typeof mockSettlement>["state"]) => {
        state.transaction.from = provider;
      },
    ],
    [
      "wrong calldata",
      (state: ReturnType<typeof mockSettlement>["state"]) => {
        state.transaction.input = "0x12345678";
      },
    ],
    [
      "wrong receipt block",
      (state: ReturnType<typeof mockSettlement>["state"]) => {
        state.receipt.blockHash = `0x${"f".repeat(64)}`;
      },
    ],
  ] as const;
  for (const [label, corrupt] of corruptions)
    it(`does not dispatch on ${label}`, async () => {
      const q = await quote();
      const f = await execution(q);
      await f.makeWorker().tick();
      corrupt(f.state);
      await f.due();
      await f.makeWorker().tick();
      assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "QUARANTINED");
      assert.equal(await db.invocationReady.count(), 0);
      assert.equal(f.state.sent.length, 1);
    });

  it("does not finalize a changed snapshot or sign when finalized RPC is unavailable", async (t) => {
    const q = await quote();
    const f = await execution(q);
    const finalized = f.chain.finalized.bind(f.chain);
    const fail = t.mock.method(f.chain, "finalized", async () => {
      throw new Error("finalized tag not supported");
    });
    await f.makeWorker().tick();
    assert.equal(await db.settlementAttempt.count(), 0);
    fail.mock.restore();
    await f.due();
    await f.makeWorker().tick();
    f.state.snapshotChanged = true;
    await f.due();
    await f.makeWorker().tick();
    assert.equal((await db.settlementOperation.findFirstOrThrow()).state, "PENDING");
    assert.equal(await db.invocationReady.count(), 0);
    // Scanner must also retain its previous cursor when canonicality fails.
    await assert.rejects(scanFinalizedHolds(db, f.chain, 1n), /snapshot_changed/);
    assert.equal((await db.settlementScanCursor.findFirstOrThrow()).blockNumber, 0n);
    assert.ok(await finalized());
  });

  it("holds real local USDC through HTTP/SDK + worker + finalized receipt and durable backfill", async (t) => {
    if (process.env.PAYMENTS_TEST_EVM !== "1") {
      t.skip("Run test:payments:evm for isolated real-EVM settlement");
      return;
    }
    const evm = await localEvm(wallet.address, relayer.address, grantSigner.address);
    t.after(evm.stop);
    const buyerClient = createWalletClient({
      account: wallet,
      chain: avalancheFuji,
      transport: http(evm.rpc),
    });
    const buyerVault = getContract({
      address: evm.vault,
      abi: evm.vaultArtifact.abi,
      client: { public: evm.client, wallet: buyerClient },
    });
    const buyerUsdc = getContract({
      address: ASSET,
      abi: evm.token.abi,
      client: { public: evm.client, wallet: buyerClient },
    });
    await buyerUsdc.write.approve([evm.vault, 10000000n]);
    await buyerVault.write.deposit([10000000n]);
    await buyerVault.write.registerGrant([`0x${"a".repeat(64)}`, evm.grant]);
    await db.deploymentPolicy.updateMany({ data: { vault: evm.vault } });
    const privateConfig = loadFacilitatorConfig({
      DATABASE_URL: config.DATABASE_URL,
      API_ORIGIN: api,
      RPC_URL: evm.rpc,
      FACILITATOR_TOKEN: serviceToken,
      VAULT_ADDRESS: evm.vault,
      RELAYER_ADDRESS: relayer.address,
      EXPECTED_VAULT_CODE_HASH: evm.admission.deployment.expectedCodeHash,
      VAULT_FEE_CAP_BPS: "500",
      VAULT_MAX_QUOTE_LIFETIME_SECONDS: "3600",
      VAULT_MAX_HOLD_SECONDS: String(30 * 86400),
      LOG_LEVEL: "silent",
      SETTLEMENT_ENABLED: "true",
    });
    const privateApp = createFacilitatorApp(privateConfig, db, evm.admission);
    privateApps.push(privateApp);
    await privateApp.ready();
    const originalFetch = globalThis.fetch;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.origin !== "https://local-facilitator.test") return originalFetch(input, init);
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((v, k) => {
          headers[k] = v;
        });
        const response = await privateApp.inject({
          method: init?.method === "POST" ? "POST" : "GET",
          url: url.pathname,
          headers,
          payload: init?.body as string | undefined,
        });
        return new Response(response.body, {
          status: response.statusCode,
          headers: { "content-type": "application/json" },
        });
      },
    );
    await app.close();
    app = createApp(
      {
        ...config,
        VAULT_ADDRESS: evm.vault,
        PAYMENTS_ENABLED: true,
        FACILITATOR_URL: "https://local-facilitator.test",
        FACILITATOR_TOKEN: serviceToken,
      },
      db,
    );
    await app.ready();
    const q = await quote();
    const p = await payment(q);
    const headers = { "payment-signature": encodePaymentSignatureHeader(p) };
    const queued = await submit(q, headers);
    assert.equal(queued.statusCode, 503, queued.body);
    const worker = new SettlementWorker(
      db,
      evm.admission,
      evm.settlement,
      relayer,
      `${api}/v1/invocations`,
      gasPolicy,
    );
    if (!embedded) {
      const args = [
        fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)),
        fileURLToPath(new URL("./fixtures/worker-tick.ts", import.meta.url)),
        schema,
        evm.rpc,
        evm.vault,
        evm.admission.deployment.expectedCodeHash,
        relayerKey,
      ];
      const run = promisify(execFile);
      await Promise.all([run(process.execPath, args), run(process.execPath, args)]);
    } else await worker.tick();
    const attempt = await db.settlementAttempt.findFirstOrThrow();
    assert.equal(attempt.state, "BROADCAST");
    assert.equal(await evm.contract.read.totalHeld(), 100000n);
    assert.equal(await evm.contract.read.availableBalance([wallet.address]), 9900000n);
    assert.equal(await db.invocationReady.count(), 0);
    // Backfill must wake reconciliation without help from a browser request.
    await scanFinalizedHolds(db, evm.settlement, evm.startBlock);
    await worker.tick();
    const operation = await db.settlementOperation.findFirstOrThrow();
    assert.equal(operation.state, "HELD", operation.errorReason ?? "");
    assert.equal(await db.invocationReady.count(), 1);
    assert.ok((await db.settlementAttempt.findFirstOrThrow()).finalizedBlockHash);
    const result = await submit(q, headers);
    assert.equal(result.statusCode, 202, result.body);
    const receipt = JSON.parse(
      Buffer.from(result.headers["payment-response"] as string, "base64").toString(),
    );
    assert.equal(receipt.success, true);
    assert.equal(receipt.transaction, attempt.transactionHash);
    const status = await app.inject({
      url: `/v1/invocations/${q.invocationId}`,
      headers: { cookie },
    });
    assert.equal(status.json().receipt.transaction, attempt.transactionHash);
    await buyerVault.write.revokeGrant([`0x${"a".repeat(64)}`]);
    const replay = await submit(q, headers);
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal(await evm.contract.read.totalHeld(), 100000n);
    assert.equal(await db.settlementAttempt.count(), 1);
    assert.equal(await db.invocationReady.count(), 1);

    // Real revoke-after-preview race: the reserved transaction is mined reverted,
    // including when Hardhat reports send as an RPC error after executing it.
    const grantB = `0x${"b".repeat(64)}` as const;
    await buyerVault.write.registerGrant([grantB, evm.grant]);
    sessionId = randomUUID();
    await db.chatThread.create({ data: { id: sessionId, buyerId, appId: productId } });
    const second = await quote();
    const challenge = decodePaymentRequiredHeader(
      (await submit(second)).headers["payment-required"] as string,
    );
    const secondPayment = await new x402Client()
      .register(NETWORK, client(second, { grantId: grantB }))
      .createPaymentPayload(challenge);
    const secondHeaders = { "payment-signature": encodePaymentSignatureHeader(secondPayment) };
    assert.equal((await submit(second, secondHeaders)).statusCode, 503);
    const sign = relayer.signTransaction.bind(relayer);
    const signHook = t.mock.method(
      relayer,
      "signTransaction",
      async (args: Parameters<typeof sign>[0]) => {
        const serialized = await sign(args);
        await buyerVault.write.revokeGrant([grantB]);
        return serialized;
      },
    );
    await worker.tick();
    signHook.mock.restore();
    await db.settlementOperation.updateMany({
      where: { state: "PENDING" },
      data: { nextCheckAt: new Date(0) },
    });
    await worker.tick();
    const rejected = await db.settlementOperation.findUniqueOrThrow({
      where: { invocationId: second.invocationId },
      include: { attempt: true },
    });
    assert.equal(rejected.state, "REJECTED", rejected.errorReason ?? "");
    assert.equal(rejected.attempt?.state, "REVERTED");
    assert.equal(await db.invocationReady.count(), 1);
    assert.equal(await evm.contract.read.totalHeld(), 100000n);

    // Exercise the exact operator recovery tooling against the real held funds.
    const directory = await mkdtemp("/tmp/opencode/fuji-reclaim-");
    t.after(() => rm(directory, { recursive: true }));
    const ceremony: Ceremony = {
      admin: evm.adminWallet.account.address,
      relayer: relayer.address,
      buyer: wallet.address,
      grantSigner: grantSigner.address,
      adminDelay: 100,
      feeCapBps: 500,
      maxQuoteLifetimeSeconds: 3600,
      maxHoldSeconds: 30 * 86400,
      vault: evm.vault,
      expectedCodeHash: evm.admission.deployment.expectedCodeHash,
      deploymentBlock: evm.startBlock.toString(),
      maxGas: "1000000",
      maxFeePerGas: "10000000000",
      maxPriorityFeePerGas: "1000000000",
      maxTransactionCost: "10000000000000000",
    };
    const prepared: PreparedPayment = {
      quote: q,
      paymentPayload: p,
      run: {
        apiOrigin: api,
        webOrigin: origin,
        vault: evm.vault,
        buyer: wallet.address,
        threadId: q.sessionId,
        commandId,
        clientRequestId: randomUUID(),
        arguments: { text: "hello" },
        grantId: `0x${"a".repeat(64)}`,
        grantEpoch: "1",
        maxAmount: "100000",
      },
    };
    const proof = await verifyPayment(
      evm.client,
      ceremony,
      prepared,
      attempt.transactionHash as `0x${string}`,
    );
    assert.equal(proof.outcome, "held");
    assert.equal(
      (await journalEvidence(db, prepared, attempt.transactionHash!)).readyEventCount,
      1,
    );
    await assert.rejects(
      prepareOperation(
        evm.client,
        ceremony,
        { kind: "reclaim", holdId: q.protocolQuote.invocationKey as `0x${string}` },
        wallet,
        `${directory}/early.json`,
      ),
    );
    await evm.test.setNextBlockTimestamp({ timestamp: BigInt(q.resolveBy) });
    await evm.test.mine({ blocks: 1 });
    for (const action of [
      { kind: "reclaim" as const, holdId: q.protocolQuote.invocationKey as `0x${string}` },
      { kind: "withdraw" as const, amount: "10000000" },
    ]) {
      const path = `${directory}/${action.kind}.json`;
      const signed = await prepareOperation(evm.client, ceremony, action, wallet, path);
      const op = await loadJson<SignedOperation>(path);
      await broadcastOperation(evm.client, op, path, signed.transactionHash);
      assert.equal((await operationReceipt(evm.client, op)).status, "success");
    }
    assert.equal(await evm.contract.read.totalHeld(), 0n);
    assert.equal(await evm.contract.read.availableBalance([wallet.address]), 0n);
    assert.equal(await evm.usdc.read.balanceOf([wallet.address]), 10000000n);
  });

  it("operator runner authenticates, persists authorization, submits and polls through real HTTP handlers", async (t) => {
    const directory = await mkdtemp("/tmp/opencode/fuji-runner-");
    t.after(() => rm(directory, { recursive: true }));
    let privateApp: ReturnType<typeof createFacilitatorApp> | undefined;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const target =
          url.origin === api
            ? app
            : url.origin === "https://runner-facilitator.test"
              ? privateApp
              : undefined;
        assert.ok(target, "runner may only call explicitly configured origins");
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((v, k) => {
          headers[k] = v;
        });
        const response = await target.inject({
          method: init?.method === "POST" ? "POST" : "GET",
          url: url.pathname,
          headers,
          payload: init?.body as string | undefined,
        });
        const result = new Headers();
        for (const [k, v] of Object.entries(response.headers)) {
          if (v !== undefined)
            for (const value of Array.isArray(v) ? v : [String(v)]) result.append(k, value);
        }
        return new Response(response.body, { status: response.statusCode, headers: result });
      },
    );
    const run = {
      apiOrigin: api,
      webOrigin: origin,
      vault: vault as `0x${string}`,
      buyer: wallet.address,
      threadId: sessionId,
      commandId,
      clientRequestId: randomUUID(),
      arguments: { text: "hello" },
      grantId: `0x${"a".repeat(64)}` as `0x${string}`,
      grantEpoch: "1",
      maxAmount: "100000",
    };
    const session = await paymentSession(run, wallet);
    try {
      const summary = await preparePayment(session, run, grantSigner, `${directory}/payment.json`);
      assert.equal(await db.settlementOperation.count(), 0, "preparation never submits payment");
      const prepared = await loadJson<PreparedPayment>(`${directory}/payment.json`);
      const f = await facilitator(prepared.quote, true);
      privateApp = f.f;
      await app.close();
      app = createApp(
        {
          ...config,
          PAYMENTS_ENABLED: true,
          FACILITATOR_URL: "https://runner-facilitator.test",
          FACILITATOR_TOKEN: serviceToken,
        },
        db,
      );
      await app.ready();
      await assert.rejects(submitPayment(session, prepared, `0x${"0".repeat(64)}`), /Approve/);
      const submission = await submitPayment(session, prepared, summary.authorizationDigest);
      assert.equal(submission.status, 503);
      assert.equal(submission.paymentResponse, null);
      const state = await pollPayment(session, prepared);
      assert.equal(state.paymentStatus, "PENDING");
      assert.equal(state.invocationId, summary.invocationId);
      const replay = await submitPayment(session, prepared, summary.authorizationDigest);
      assert.equal(replay.status, 503);
      assert.equal(await db.settlementOperation.count(), 1);
    } finally {
      await session.close();
    }
  });

  it("seeds a fresh ceremony catalog without overwriting an existing deployment policy", async () => {
    await db.chatThread.deleteMany();
    await db.appCommandRevision.deleteMany();
    await db.appCommand.deleteMany();
    await db.app.deleteMany();
    await db.deploymentPolicy.deleteMany();
    const seed = {
      buyerId,
      productId,
      policyVersion: "fuji-test",
      provider,
      feeRecipient,
      feeBps: 100,
      quoteLifetimeSeconds: 120,
      maxHoldSeconds: 600,
      resolutionGraceSeconds: 60,
      deliverySeconds: 60,
      reviewSeconds: 30,
      grossAmount: "100000",
      minGrossAmount: "1000",
      run: {
        apiOrigin: api,
        webOrigin: origin,
        vault: vault as `0x${string}`,
        buyer: wallet.address,
        threadId: sessionId,
        commandId,
        clientRequestId: randomUUID(),
        arguments: { text: "hello" },
        grantId: `0x${"a".repeat(64)}` as `0x${string}`,
        grantEpoch: "1",
        maxAmount: "100000",
      },
    };
    await seedCeremony(db, seed);
    const q = await quote();
    assert.equal(q.grossAmount, "100000");
    await assert.rejects(seedCeremony(db, seed), /Fresh ceremony/);
    assert.equal(await db.deploymentPolicy.count(), 1);
  });

  it("completes financial lifecycle on real local USDC with approval separation, recovery and finalized projections", async (t) => {
    if (process.env.PAYMENTS_TEST_EVM !== "1") {
      t.skip("Run isolated financial lifecycle EVM test");
      return;
    }
    const evm = await localEvm(wallet.address, relayer.address, grantSigner.address);
    t.after(evm.stop);
    const executor = privateKeyToAccount(generatePrivateKey()),
      approver = privateKeyToAccount(generatePrivateKey());
    const providerWallet = privateKeyToAccount(generatePrivateKey()),
      platformWallet = privateKeyToAccount(generatePrivateKey());
    await evm.test.setBalance({ address: executor.address, value: 10n ** 20n });
    await evm.test.setBalance({ address: providerWallet.address, value: 10n ** 20n });
    await evm.test.setBalance({ address: platformWallet.address, value: 10n ** 20n });
    const buyerClient = createWalletClient({
      account: wallet,
      chain: avalancheFuji,
      transport: http(evm.rpc),
    });
    const buyerVault = getContract({
      address: evm.vault,
      abi: evm.vaultArtifact.abi,
      client: { public: evm.client, wallet: buyerClient },
    });
    const buyerUsdc = getContract({
      address: ASSET,
      abi: evm.token.abi,
      client: { public: evm.client, wallet: buyerClient },
    });
    await buyerUsdc.write.approve([evm.vault, 10000000n]);
    await buyerVault.write.deposit([10000000n]);
    await buyerVault.write.registerGrant([`0x${"a".repeat(64)}`, evm.grant]);
    for (const [role, account] of [
      ["FINANCE_EXECUTOR_ROLE", executor.address],
      ["REFUND_APPROVER_ROLE", approver.address],
      ["RELEASE_APPROVER_ROLE", approver.address],
      ["DISPUTE_RESOLVER_ROLE", approver.address],
      ["PAUSER_ROLE", evm.adminWallet.account.address],
    ] as const) {
      await evm.contract.write.grantRole([keccak256(stringToHex(role)), account]);
    }
    await db.deploymentPolicy.updateMany({
      data: { vault: evm.vault, feeRecipient: platformWallet.address },
    });
    await db.app.updateMany({ data: { payoutAddress: providerWallet.address } });
    await app.close();
    app = createApp({ ...config, VAULT_ADDRESS: evm.vault }, db);
    await app.ready();
    journal = new SettlementJournal(db, { vault: evm.vault, resourceUrl: `${api}/v1/invocations` });
    const worker = new SettlementWorker(
      db,
      evm.admission,
      evm.settlement,
      relayer,
      `${api}/v1/invocations`,
      gasPolicy,
    );
    async function held() {
      sessionId = randomUUID();
      await db.chatThread.create({ data: { id: sessionId, buyerId, appId: productId } });
      const q = await quote();
      await pending(q);
      await worker.tick();
      await db.settlementOperation.updateMany({
        where: { state: "PENDING" },
        data: { nextCheckAt: new Date(0) },
      });
      await worker.tick();
      assert.equal(
        (
          await db.settlementOperation.findUniqueOrThrow({
            where: { invocationId: q.invocationId },
          })
        ).state,
        "HELD",
      );
      return q;
    }
    // Prepare all quotes before local time advancement; production never time-travels.
    const first = await held(),
      second = await held(),
      third = await held(),
      fourth = await held(),
      fifth = await held(),
      sixth = await held(),
      seventh = await held();
    // A revision promising REC evidence: schema-signed (SIGN) output cannot release it.
    const signOnly = await db.appCommandRevision.findFirstOrThrow({ where: { commandId } });
    await db.appCommandRevision.update({
      where: { id: signOnly.id },
      data: {
        terms: {
          ...(signOnly.terms as Record<string, unknown>),
          verification: { minEvidence: "REC" },
        },
      },
    });
    const eighth = await held();
    await db.appCommandRevision.update({
      where: { id: signOnly.id },
      data: { terms: signOnly.terms as object },
    });
    assert.equal(
      (eighth.termsSnapshot as { definition: { verification: { minEvidence: string } } }).definition
        .verification.minEvidence,
      "REC",
    );
    const sync = () => scanFinancialLifecycle(db, evm.settlement, evm.startBlock);
    await sync();
    assert.equal(await db.vaultHoldProjection.count(), 8);
    const service = () => new FinanceService(db, evm.settlement, executor.address, gasPolicy);
    assert.throws(
      () => new FinanceService(db, evm.settlement, relayer.address, gasPolicy),
      /dedicated/,
    );
    async function approvalFor(
      q: QuoteDocument,
      refund: string,
      release = false,
      evidenceId: string | null = null,
      resolve = false,
    ): Promise<FinanceApproval> {
      const hold = await evm.client.readContract({
        address: evm.vault,
        abi: vaultFinanceAbi,
        functionName: "getHold",
        args: [q.protocolQuote.invocationKey as `0x${string}`],
      });
      const decision: WireDecision = {
        holdId: q.protocolQuote.invocationKey,
        decisionId: `0x${randomBytes(32).toString("hex")}`,
        expectedVersion: hold.version.toString(),
        refundAmount: refund,
        releaseRemainder: release,
        resolveDispute: resolve,
        validUntil: String(q.resolveBy - 1),
      };
      const signature = await approver.signTypedData({
        domain: vaultDomain(evm.vault),
        types: paymentTypes,
        primaryType: "ResolutionDecision",
        message: {
          ...decision,
          holdId: decision.holdId as `0x${string}`,
          decisionId: decision.decisionId as `0x${string}`,
          expectedVersion: BigInt(decision.expectedVersion),
          refundAmount: BigInt(decision.refundAmount),
          validUntil: Number(decision.validUntil),
        },
      });
      return {
        decision,
        approver: approver.address,
        signature,
        evidenceId,
        reason: "Controlled financial lifecycle verification",
      };
    }
    async function finish(a: FinanceApproval) {
      await service().enqueue(a);
      await service().tick(a.decision.decisionId, executor);
      await db.financeDecision.updateMany({
        where: { id: a.decision.decisionId },
        data: { nextCheckAt: new Date(0) },
      });
      await service().tick(a.decision.decisionId, executor);
      const row = await db.financeDecision.findUniqueOrThrow({
        where: { id: a.decision.decisionId },
      });
      assert.equal(row.state, "FINALIZED", row.errorReason ?? "");
      assert.ok(row.actualGasCost);
      assert.ok(row.receipt);
      assert.equal((await db.financeLane.findFirstOrThrow()).activeDecisionId, null);
      await sync();
      return row;
    }
    const partial = await approvalFor(first, "20000");
    await Promise.all([service().enqueue(partial), service().enqueue(partial)]);
    await assert.rejects(service().enqueue({ ...partial, reason: "Changed reason" }), /conflict/);
    const noSendBudget = new FinanceService(db, evm.settlement, executor.address, {
      ...gasPolicy,
      maxGasLimit: 1n,
    });
    await noSendBudget.tick(partial.decision.decisionId, executor);
    assert.equal(
      (await db.financeDecision.findUniqueOrThrow({ where: { id: partial.decision.decisionId } }))
        .signedTransaction,
      null,
    );
    await db.financeDecision.updateMany({ data: { nextCheckAt: new Date(0) } });
    const send = evm.client.sendRawTransaction.bind(evm.client);
    const timeout = t.mock.method(
      evm.client,
      "sendRawTransaction",
      async (args: Parameters<typeof send>[0]) => {
        await send(args);
        throw new Error("timeout after chain execution");
      },
    );
    await service().tick(partial.decision.decisionId, executor);
    timeout.mock.restore();
    assert.equal(
      (await db.financeDecision.findUniqueOrThrow({ where: { id: partial.decision.decisionId } }))
        .state,
      "UNKNOWN",
    );
    if (!embedded) {
      await db.$executeRawUnsafe(
        `ALTER TABLE finance_decisions ADD CONSTRAINT test_finance_finalize_failure CHECK (state <> 'FINALIZED')`,
      );
      try {
        await db.financeDecision.updateMany({
          where: { id: partial.decision.decisionId },
          data: { nextCheckAt: new Date(0) },
        });
        await service().tick(partial.decision.decisionId, executor);
        const retained = await db.financeDecision.findUniqueOrThrow({
          where: { id: partial.decision.decisionId },
        });
        assert.equal(retained.state, "UNKNOWN");
        assert.equal(retained.finalizedAt, null);
        assert.equal(
          (await db.financeLane.findFirstOrThrow()).activeDecisionId,
          partial.decision.decisionId,
        );
      } finally {
        await db.$executeRawUnsafe(
          `ALTER TABLE finance_decisions DROP CONSTRAINT test_finance_finalize_failure`,
        );
      }
    }
    await finish(partial);
    assert.equal(
      (await db.financeDecision.findUniqueOrThrow({ where: { id: partial.decision.decisionId } }))
        .broadcastCount,
      1,
    );
    assert.equal(
      (
        await db.vaultHoldProjection.findUniqueOrThrow({
          where: { holdId: first.protocolQuote.invocationKey },
        })
      ).status,
      "PARTIALLY_REFUNDED",
    );
    const fencedRefund = await approvalFor(fifth, "100000");
    await service().enqueue(fencedRefund);
    const sign = executor.signTransaction.bind(executor);
    let entered!: () => void, releaseSigner!: () => void;
    const signing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseSigner = resolve;
    });
    let firstSigner = true;
    const blockedSign = t.mock.method(
      executor,
      "signTransaction",
      async (args: Parameters<typeof sign>[0]) => {
        if (firstSigner) {
          firstSigner = false;
          entered();
          await blocked;
        }
        return sign(args);
      },
    );
    const stale = service().tick(fencedRefund.decision.decisionId, executor);
    await signing;
    await db.financeDecision.update({
      where: { id: fencedRefund.decision.decisionId },
      data: { leaseExpiresAt: new Date(0), nextCheckAt: new Date(0) },
    });
    try {
      await service().tick(fencedRefund.decision.decisionId, executor);
    } finally {
      releaseSigner();
    }
    await stale;
    blockedSign.mock.restore();
    await finish(fencedRefund);
    assert.equal(
      (
        await db.financeDecision.findUniqueOrThrow({
          where: { id: fencedRefund.decision.decisionId },
        })
      ).broadcastCount,
      1,
    );
    const revoked = await approvalFor(sixth, "100000");
    await service().enqueue(revoked);
    const refundRole = keccak256(stringToHex("REFUND_APPROVER_ROLE"));
    const revokeDuringSend = t.mock.method(
      evm.client,
      "sendRawTransaction",
      async (args: Parameters<typeof send>[0]) => {
        await evm.contract.write.revokeRole([refundRole, approver.address]);
        return send(args);
      },
    );
    await service().tick(revoked.decision.decisionId, executor);
    revokeDuringSend.mock.restore();
    await db.financeDecision.update({
      where: { id: revoked.decision.decisionId },
      data: { nextCheckAt: new Date(0) },
    });
    await service().tick(revoked.decision.decisionId, executor);
    const reverted = await db.financeDecision.findUniqueOrThrow({
      where: { id: revoked.decision.decisionId },
    });
    assert.equal(reverted.state, "REVERTED");
    assert.ok(reverted.actualGasCost);
    assert.equal((await db.financeLane.findFirstOrThrow()).activeDecisionId, null);
    assert.equal(await service().tick(revoked.decision.decisionId, executor), false);
    await evm.contract.write.grantRole([refundRole, approver.address]);
    await finish(await approvalFor(sixth, "100000"));
    await assert.rejects(
      service().enqueue(await approvalFor(first, "0", true)),
      /verified_delivery/,
    );
    const evidence = await recordPaymentDelivery(db, {
      id: "verified-first-result",
      invocationId: first.invocationId,
      artifactVersion: 1,
      outputHash: `0x${"1".repeat(64)}`,
      verifier: "isolated-test-output-verifier",
      accessInterruptionSeconds: 0,
      evidenceLevel: "SIGN" as const,
    });
    assert.equal(
      (
        await recordPaymentDelivery(db, {
          id: evidence.id,
          invocationId: first.invocationId,
          artifactVersion: 1,
          outputHash: `0x${"1".repeat(64)}`,
          verifier: "isolated-test-output-verifier",
          accessInterruptionSeconds: 0,
          evidenceLevel: "SIGN" as const,
        })
      ).id,
      evidence.id,
    );
    await assert.rejects(
      service().enqueue(await approvalFor(first, "0", true, evidence.id)),
      /business_review/,
    );
    await evm.test.setNextBlockTimestamp({
      timestamp: BigInt(
        Math.max(
          first.releaseNotBefore,
          second.releaseNotBefore,
          third.releaseNotBefore,
          fourth.releaseNotBefore,
        ),
      ),
    });
    await evm.test.mine({ blocks: 1 });
    const signed = await recordPaymentDelivery(db, {
      id: "eighth-schema-only",
      invocationId: eighth.invocationId,
      artifactVersion: 1,
      outputHash: `0x${"2".repeat(64)}`,
      verifier: "isolated-test-output-verifier",
      accessInterruptionSeconds: 0,
      evidenceLevel: "SIGN" as const,
    });
    await assert.rejects(
      service().enqueue(await approvalFor(eighth, "0", true, signed.id)),
      /evidence_below_minimum/,
    );
    const witnessed = await recordPaymentDelivery(db, {
      id: "eighth-buyer-witness",
      invocationId: eighth.invocationId,
      artifactVersion: 1,
      outputHash: `0x${"2".repeat(64)}`,
      verifier: "isolated-test-output-verifier",
      accessInterruptionSeconds: 0,
      evidenceLevel: "WIT" as const,
    });
    // WIT and REC are incomparable: buyer agreement does not prove file receipt.
    await assert.rejects(
      service().enqueue(await approvalFor(eighth, "0", true, witnessed.id)),
      /evidence_below_minimum/,
    );
    const staleRelease = await approvalFor(first, "0", true, evidence.id);
    await service().enqueue(staleRelease);
    const correctedEvidence = await recordPaymentDelivery(db, {
      id: "verified-first-access-correction",
      invocationId: first.invocationId,
      artifactVersion: 1,
      outputHash: `0x${"1".repeat(64)}`,
      verifier: "isolated-test-output-verifier",
      accessInterruptionSeconds: 1,
      evidenceLevel: "SIGN" as const,
    });
    await service().tick(staleRelease.decision.decisionId, executor);
    const rejectedRelease = await db.financeDecision.findUniqueOrThrow({
      where: { id: staleRelease.decision.decisionId },
    });
    assert.equal(rejectedRelease.state, "REJECTED");
    assert.equal(rejectedRelease.transactionHash, null);
    const release = await approvalFor(first, "0", true, correctedEvidence.id);
    await finish(release);
    assert.equal(
      (
        await db.vaultHoldProjection.findUniqueOrThrow({
          where: { holdId: first.protocolQuote.invocationKey },
        })
      ).status,
      "RELEASED",
    );
    assert.equal(await evm.contract.read.providerClaimable([providerWallet.address]), 79200n);
    assert.equal(await evm.contract.read.platformClaimable([platformWallet.address]), 800n);
    assert.equal(await service().tick(release.decision.decisionId, executor), false);
    await finish(await approvalFor(second, "100000"));
    assert.equal(
      (
        await db.vaultHoldProjection.findUniqueOrThrow({
          where: { holdId: second.protocolQuote.invocationKey },
        })
      ).status,
      "REFUNDED",
    );
    const disputeIntent = await app.inject({
      method: "POST",
      url: `/v1/invocations/${third.invocationId}/financial-intents`,
      headers: { cookie, origin },
      payload: { action: "dispute", evidenceHash: `0x${"d".repeat(64)}` },
    });
    assert.equal(disputeIntent.statusCode, 200, disputeIntent.body);
    assert.equal(disputeIntent.json().status, "UNSUBMITTED");
    await buyerClient.sendTransaction({ to: evm.vault, data: disputeIntent.json().data });
    await sync();
    assert.equal(
      (
        await db.vaultHoldProjection.findUniqueOrThrow({
          where: { holdId: third.protocolQuote.invocationKey },
        })
      ).status,
      "DISPUTED",
    );
    await assert.rejects(service().enqueue(await approvalFor(third, "100000")), /hold_disputed/);
    await finish(await approvalFor(third, "100000", false, null, true));
    const corrupted = await approvalFor(seventh, "100000");
    await service().enqueue(corrupted);
    const offline = t.mock.method(evm.client, "sendRawTransaction", async () => {
      throw new Error("connection failed before send");
    });
    await service().tick(corrupted.decision.decisionId, executor);
    offline.mock.restore();
    const wrongBytes = (
      await db.financeDecision.findUniqueOrThrow({ where: { id: partial.decision.decisionId } })
    ).signedTransaction!;
    await db.financeDecision.update({
      where: { id: corrupted.decision.decisionId },
      data: { signedTransaction: wrongBytes, nextCheckAt: new Date(0) },
    });
    const noResend = t.mock.method(evm.client, "sendRawTransaction", async () => {
      throw new Error("must not send mismatched bytes");
    });
    await service().tick(corrupted.decision.decisionId, executor);
    assert.equal(noResend.mock.callCount(), 0);
    noResend.mock.restore();
    assert.equal(
      (await db.financeDecision.findUniqueOrThrow({ where: { id: corrupted.decision.decisionId } }))
        .state,
      "QUARANTINED",
    );
    assert.equal(
      (await db.financeLane.findFirstOrThrow()).activeDecisionId,
      corrupted.decision.decisionId,
    );
    const readyCount = await db.invocationReady.count();
    assert.equal(readyCount, 8);
    const providerClient = createWalletClient({
      account: providerWallet,
      chain: avalancheFuji,
      transport: http(evm.rpc),
    });
    const platformClient = createWalletClient({
      account: platformWallet,
      chain: avalancheFuji,
      transport: http(evm.rpc),
    });
    await getContract({
      address: evm.vault,
      abi: evm.vaultArtifact.abi,
      client: { public: evm.client, wallet: providerClient },
    }).write.withdrawProvider([79200n]);
    await getContract({
      address: evm.vault,
      abi: evm.vaultArtifact.abi,
      client: { public: evm.client, wallet: platformClient },
    }).write.withdrawPlatform([800n]);
    assert.equal(await evm.usdc.read.balanceOf([providerWallet.address]), 79200n);
    assert.equal(await evm.usdc.read.balanceOf([platformWallet.address]), 800n);
    await evm.test.setNextBlockTimestamp({
      timestamp: BigInt(Math.max(fourth.resolveBy, seventh.resolveBy, eighth.resolveBy)),
    });
    await evm.test.mine({ blocks: 1 });
    await evm.contract.write.pause();
    const reclaim = await app.inject({
      method: "POST",
      url: `/v1/invocations/${fourth.invocationId}/financial-intents`,
      headers: { cookie, origin },
      payload: { action: "reclaim" },
    });
    assert.equal(reclaim.statusCode, 200, reclaim.body);
    await buyerClient.sendTransaction({ to: evm.vault, data: reclaim.json().data });
    await buyerVault.write.reclaim([seventh.protocolQuote.invocationKey]);
    // Evidence never reached the promised REC floor before resolveBy: the buyer
    // reclaims instead of the provider being paid on weaker evidence.
    await buyerVault.write.reclaim([eighth.protocolQuote.invocationKey]);
    await buyerVault.write.withdrawAvailable([9920000n]);
    await sync();
    assert.equal(
      (
        await db.vaultHoldProjection.findUniqueOrThrow({
          where: { holdId: fourth.protocolQuote.invocationKey },
        })
      ).status,
      "RECLAIMED",
    );
    assert.equal(await evm.contract.read.totalHeld(), 0n);
    assert.equal(await evm.contract.read.availableBalance([wallet.address]), 0n);
    const count = await db.vaultFinancialEvent.count();
    await sync();
    assert.equal(await db.vaultFinancialEvent.count(), count);
    assert.equal(await db.invocationReady.count(), readyCount);
    const status = await app.inject({
      url: `/v1/invocations/${first.invocationId}`,
      headers: { cookie },
    });
    assert.equal(
      status.json().paymentStatus,
      "HELD",
      "original payment receipt remains true after payout",
    );
    assert.equal(status.json().financial.status, "RELEASED");
    assert.equal(status.json().receipt.success, true);
    const grant = (await evm.contract.read.getGrant([wallet.address, `0x${"a".repeat(64)}`])) as {
      spentTotal: bigint;
    };
    assert.equal(grant.spentTotal, 800000n, "refund/reclaim never resets grant spend");
    const cursor = await db.settlementScanCursor.findUniqueOrThrow({
      where: { id: `finance:43113:${evm.vault.toLowerCase()}` },
    });
    await evm.test.mine({ blocks: 1 });
    const read = evm.client.readContract.bind(evm.client);
    const inconsistentRead = t.mock.method(evm.client, "readContract", ((
      args: Parameters<typeof read>[0],
    ) =>
      args.functionName === "totalHeld"
        ? Promise.resolve(1n)
        : read(args)) as typeof evm.client.readContract);
    await assert.rejects(sync(), /vault_insolvent/);
    inconsistentRead.mock.restore();
    assert.equal(
      (await db.settlementScanCursor.findUniqueOrThrow({ where: { id: cursor.id } })).blockNumber,
      cursor.blockNumber,
    );
    assert.equal(
      (
        await db.vaultFinancialHealth.findUniqueOrThrow({
          where: { id: `43113:${evm.vault.toLowerCase()}` },
        })
      ).blocked,
      true,
    );
    await sync();
    assert.equal(
      (
        await db.vaultFinancialHealth.findUniqueOrThrow({
          where: { id: `43113:${evm.vault.toLowerCase()}` },
        })
      ).blocked,
      true,
      "successful scans never silently clear an incident",
    );
  });

  it("closes finance crash and deadline race gaps on real local USDC", async (t) => {
    if (process.env.PAYMENTS_TEST_EVM !== "1") {
      t.skip("Run isolated financial lifecycle EVM test");
      return;
    }
    const evm = await localEvm(wallet.address, relayer.address, grantSigner.address);
    t.after(evm.stop);
    const approver = privateKeyToAccount(generatePrivateKey());
    const buyerClient = createWalletClient({
      account: wallet,
      chain: avalancheFuji,
      transport: http(evm.rpc),
    });
    const buyerVault = getContract({
      address: evm.vault,
      abi: evm.vaultArtifact.abi,
      client: { public: evm.client, wallet: buyerClient },
    });
    const buyerUsdc = getContract({
      address: ASSET,
      abi: evm.token.abi,
      client: { public: evm.client, wallet: buyerClient },
    });
    await buyerUsdc.write.approve([evm.vault, 10000000n]);
    await buyerVault.write.deposit([10000000n]);
    await buyerVault.write.registerGrant([`0x${"a".repeat(64)}`, evm.grant]);
    for (const role of ["REFUND_APPROVER_ROLE", "RELEASE_APPROVER_ROLE", "DISPUTE_RESOLVER_ROLE"])
      await evm.contract.write.grantRole([keccak256(stringToHex(role)), approver.address]);
    await db.deploymentPolicy.updateMany({ data: { vault: evm.vault } });
    await app.close();
    app = createApp({ ...config, VAULT_ADDRESS: evm.vault }, db);
    await app.ready();
    journal = new SettlementJournal(db, { vault: evm.vault, resourceUrl: `${api}/v1/invocations` });
    const worker = new SettlementWorker(
      db,
      evm.admission,
      evm.settlement,
      relayer,
      `${api}/v1/invocations`,
      gasPolicy,
    );
    const quotes: QuoteDocument[] = [];
    for (let i = 0; i < 11; i++) {
      sessionId = randomUUID();
      await db.chatThread.create({ data: { id: sessionId, buyerId, appId: productId } });
      const q = await quote();
      await pending(q);
      await worker.tick();
      await db.settlementOperation.updateMany({
        where: { state: "PENDING" },
        data: { nextCheckAt: new Date(0) },
      });
      await worker.tick();
      assert.equal(
        (
          await db.settlementOperation.findUniqueOrThrow({
            where: { invocationId: q.invocationId },
          })
        ).state,
        "HELD",
      );
      quotes.push(q);
    }
    const due = (id: string) =>
      db.financeDecision.update({ where: { id }, data: { nextCheckAt: new Date(0) } });
    const row = (id: string) => db.financeDecision.findUniqueOrThrow({ where: { id } });
    async function fixture(q: QuoteDocument, signer = privateKeyToAccount(generatePrivateKey())) {
      await evm.test.setBalance({ address: signer.address, value: 10n ** 20n });
      await evm.contract.write.grantRole([
        keccak256(stringToHex("FINANCE_EXECUTOR_ROLE")),
        signer.address,
      ]);
      const service = () => new FinanceService(db, evm.settlement, signer.address, gasPolicy);
      const hold = await evm.client.readContract({
        address: evm.vault,
        abi: vaultFinanceAbi,
        functionName: "getHold",
        args: [q.protocolQuote.invocationKey as `0x${string}`],
      });
      const decision: WireDecision = {
        holdId: q.protocolQuote.invocationKey,
        decisionId: `0x${randomBytes(32).toString("hex")}`,
        expectedVersion: hold.version.toString(),
        refundAmount: "100000",
        releaseRemainder: false,
        resolveDispute: false,
        validUntil: String(q.resolveBy),
      };
      const approval: FinanceApproval = {
        decision,
        approver: approver.address,
        signature: await approver.signTypedData({
          domain: vaultDomain(evm.vault),
          types: paymentTypes,
          primaryType: "ResolutionDecision",
          message: parseDecision(decision),
        }),
        evidenceId: null,
        reason: "Local crash/race acceptance proof",
      };
      await service().enqueue(approval);
      const tick = async () => {
        await due(decision.decisionId);
        await service().tick(decision.decisionId, signer);
        return row(decision.decisionId);
      };
      const lane = () =>
        db.financeLane.findUniqueOrThrow({
          where: { id: `43113:${signer.address.toLowerCase()}` },
        });
      return { signer, service, approval, id: decision.decisionId, tick, lane };
    }
    const scenario = async (name: string, run: () => Promise<void>) => {
      t.diagnostic(name);
      await run();
    };
    await scenario(
      "concurrent decisions and duplicate ticks finalize only one version",
      async () => {
        const a = await fixture(quotes[0]);
        const decision = {
          ...a.approval.decision,
          decisionId: `0x${randomBytes(32).toString("hex")}`,
        };
        const b = {
          ...a.approval,
          decision,
          signature: await approver.signTypedData({
            domain: vaultDomain(evm.vault),
            types: paymentTypes,
            primaryType: "ResolutionDecision",
            message: parseDecision(decision),
          }),
        };
        await a.service().enqueue(b);
        // Independent services/connections contend on durable leases and sender lane.
        await Promise.all([
          a.service().tick(a.id, a.signer),
          a.service().tick(a.id, a.signer),
          a.service().tick(decision.decisionId, a.signer),
        ]);
        const attempts = await db.financeDecision.findMany({
          where: { id: { in: [a.id, decision.decisionId] } },
        });
        const sent = attempts.filter((r) => r.signedTransaction);
        assert.equal(sent.length, 1);
        const winner = sent[0].id,
          loser = attempts.find((r) => r.id !== winner)!.id;
        await due(winner);
        await a.service().tick(winner, a.signer);
        await due(loser);
        await a.service().tick(loser, a.signer);
        assert.equal((await row(winner)).state, "FINALIZED");
        assert.equal((await row(winner)).broadcastCount, 1);
        assert.equal((await row(loser)).state, "REJECTED");
        assert.equal((await row(loser)).nonce, null);
        assert.equal((await a.lane()).activeDecisionId, null);
      },
    );
    await scenario(
      "restart after unsigned reservation preserves nonce and fee ceilings",
      async () => {
        const f = await fixture(quotes[1]);
        const failed = t.mock.method(f.signer, "signTransaction", async () => {
          throw new Error("signer unavailable");
        });
        await f.tick();
        failed.mock.restore();
        const reserved = await row(f.id);
        assert.equal(reserved.state, "RESERVED");
        assert.equal(reserved.signedTransaction, null);
        assert.equal((await f.lane()).activeDecisionId, f.id);
        await f.tick();
        const signed = await row(f.id);
        assert.equal(signed.nonce, reserved.nonce);
        assert.equal(signed.gasLimit, reserved.gasLimit);
        assert.equal(signed.maxFeePerGas!.toFixed(0), reserved.maxFeePerGas!.toFixed(0));
        assert.equal((await f.tick()).state, "FINALIZED");
        const cost = (await row(f.id)).actualGasCost!;
        assert.ok(BigInt(cost.toFixed(0)) > 0n);
        const next = await fixture(quotes[8], f.signer);
        const stopSigning = t.mock.method(f.signer, "signTransaction", async () => {
          throw new Error("signer unavailable");
        });
        await next.tick();
        stopSigning.mock.restore();
        const held = await row(next.id);
        const ceiling = held.gasLimit! * BigInt(held.maxFeePerGas!.toFixed(0));
        const windowLimited = new FinanceService(db, evm.settlement, f.signer.address, {
          ...gasPolicy,
          maxTransactionCost: ceiling,
          maxWindowCost: ceiling,
        });
        await due(next.id);
        await windowLimited.tick(next.id, f.signer);
        assert.equal((await row(next.id)).errorReason, "finance_gas_budget_exceeded");
        assert.equal((await row(next.id)).signedTransaction, null);
        assert.equal((await next.lane()).activeDecisionId, next.id);
        await next.tick();
        assert.equal((await next.tick()).state, "FINALIZED");
      },
    );
    await scenario(
      "persisted signature survives RPC loss; bounded retries never sign replacements",
      async () => {
        const f = await fixture(quotes[2]);
        const finalized = evm.settlement.finalized.bind(evm.settlement);
        const sign = f.signer.signTransaction.bind(f.signer);
        let signed = false;
        const counted = t.mock.method(
          f.signer,
          "signTransaction",
          async (args: Parameters<typeof sign>[0]) => {
            signed = true;
            return sign(args);
          },
        );
        const outage = t.mock.method(evm.settlement, "finalized", async () => {
          if (signed) throw new Error("RPC unavailable");
          return finalized();
        });
        await f.tick();
        outage.mock.restore();
        const persisted = await row(f.id);
        assert.equal(persisted.state, "SIGNED");
        assert.equal(persisted.broadcastCount, 0);
        assert.ok(persisted.signedTransaction);
        assert.ok(persisted.transactionHash);
        const failedSend = t.mock.method(
          evm.client,
          "sendRawTransaction",
          async (args: Parameters<typeof evm.client.sendRawTransaction>[0]) => {
            assert.equal(args.serializedTransaction, persisted.signedTransaction);
            throw new Error("timeout before network send");
          },
        );
        for (let i = 0; i < 4; i++) await f.tick();
        assert.equal(failedSend.mock.callCount(), 3);
        failedSend.mock.restore();
        assert.equal(counted.mock.callCount(), 1);
        counted.mock.restore();
        assert.equal((await row(f.id)).broadcastCount, 3);
        assert.equal((await row(f.id)).errorReason, "finance_broadcast_limit_reached");
        assert.equal((await f.lane()).activeDecisionId, f.id);
        // Local recovery evidence only: mine the original bytes, not a new attempt.
        await evm.client.sendRawTransaction({
          serializedTransaction: persisted.signedTransaction as `0x02${string}`,
        });
        assert.equal((await f.tick()).state, "FINALIZED");
        assert.equal((await row(f.id)).transactionHash, persisted.transactionHash);
      },
    );
    await scenario("mined receipt cannot release lane before finalized RPC recovers", async () => {
      const f = await fixture(quotes[3]);
      const head = await evm.settlement.finalized();
      await f.tick();
      const persisted = await row(f.id);
      const lag = t.mock.method(evm.settlement, "finalized", async () => head);
      await f.tick();
      lag.mock.restore();
      assert.equal((await row(f.id)).finalizedAt, null);
      assert.equal((await f.lane()).activeDecisionId, f.id);
      const unavailable = t.mock.method(evm.client, "getTransactionReceipt", async () => {
        throw new Error("receipt RPC unavailable");
      });
      await f.tick();
      unavailable.mock.restore();
      assert.equal((await row(f.id)).broadcastCount, 1);
      assert.equal((await row(f.id)).transactionHash, persisted.transactionHash);
      assert.equal((await f.tick()).state, "FINALIZED");
    });
    await scenario(
      "dispute executed between signing and sending wins; no automatic resolver retry",
      async () => {
        const f = await fixture(quotes[4]);
        const send = evm.client.sendRawTransaction.bind(evm.client);
        const race = t.mock.method(
          evm.client,
          "sendRawTransaction",
          async (args: Parameters<typeof send>[0]) => {
            await buyerVault.write.openDispute([
              quotes[4].protocolQuote.invocationKey,
              `0x${"e".repeat(64)}`,
            ]);
            return send(args);
          },
        );
        await f.tick();
        race.mock.restore();
        assert.equal((await f.tick()).state, "REVERTED");
        assert.equal((await row(f.id)).broadcastCount, 1);
        assert.equal(await f.service().tick(f.id, f.signer), false);
        await scanFinancialLifecycle(db, evm.settlement, evm.startBlock);
        assert.equal(
          (
            await db.vaultHoldProjection.findUniqueOrThrow({
              where: { holdId: quotes[4].protocolQuote.invocationKey },
            })
          ).status,
          "DISPUTED",
        );
      },
    );
    await scenario(
      "pre-finality reorg recovers the original signed transaction and scanner rollback is atomic",
      async () => {
        const f = await fixture(quotes[7]);
        const head = await evm.settlement.finalized();
        const snapshot = await evm.test.snapshot();
        const sign = f.signer.signTransaction.bind(f.signer);
        const counted = t.mock.method(f.signer, "signTransaction", sign);
        const lag = t.mock.method(evm.settlement, "finalized", async () => head);
        await f.tick();
        const original = await row(f.id);
        await f.tick();
        assert.equal((await row(f.id)).finalizedAt, null);
        await evm.test.revert({ id: snapshot });
        await evm.test.mine({ blocks: 1 });
        await f.tick();
        lag.mock.restore();
        assert.equal((await row(f.id)).transactionHash, original.transactionHash);
        assert.equal((await row(f.id)).signedTransaction, original.signedTransaction);
        assert.equal((await row(f.id)).broadcastCount, 2);
        assert.equal(counted.mock.callCount(), 1);
        counted.mock.restore();
        assert.equal((await f.tick()).state, "FINALIZED");
        const cursorId = `finance:43113:${evm.vault.toLowerCase()}`;
        const before = await db.settlementScanCursor.findUniqueOrThrow({ where: { id: cursorId } });
        const count = await db.vaultFinancialEvent.count();
        if (!embedded) {
          await db.$executeRawUnsafe(
            `ALTER TABLE vault_financial_events ADD CONSTRAINT test_finance_scan_failure CHECK (name <> 'DecisionApplied') NOT VALID`,
          );
          try {
            await assert.rejects(scanFinancialLifecycle(db, evm.settlement, evm.startBlock));
            assert.equal(
              (await db.settlementScanCursor.findUniqueOrThrow({ where: { id: cursorId } }))
                .blockNumber,
              before.blockNumber,
            );
            assert.equal(await db.vaultFinancialEvent.count(), count);
            assert.equal(
              (
                await db.vaultHoldProjection.findUniqueOrThrow({
                  where: { holdId: quotes[7].protocolQuote.invocationKey },
                })
              ).status,
              "HELD",
            );
          } finally {
            await db.$executeRawUnsafe(
              `ALTER TABLE vault_financial_events DROP CONSTRAINT test_finance_scan_failure`,
            );
          }
        }
        await scanFinancialLifecycle(db, evm.settlement, evm.startBlock);
        assert.equal(
          (
            await db.vaultHoldProjection.findUniqueOrThrow({
              where: { holdId: quotes[7].protocolQuote.invocationKey },
            })
          ).status,
          "REFUNDED",
        );
      },
    );
    await scenario(
      "contradictory transaction block identity quarantines without freeing liability",
      async () => {
        const f = await fixture(quotes[5]);
        await f.tick();
        const read = evm.client.getTransaction.bind(evm.client);
        const mismatch = t.mock.method(
          evm.client,
          "getTransaction",
          async (args: Parameters<typeof read>[0]) => {
            const tx = await read(args);
            return { ...tx, blockNumber: tx.blockNumber! - 1n };
          },
        );
        await f.tick();
        mismatch.mock.restore();
        assert.equal((await row(f.id)).state, "QUARANTINED");
        assert.equal((await row(f.id)).actualGasCost, null);
        assert.equal((await f.lane()).activeDecisionId, f.id);
      },
    );
    await scenario(
      "externally consumed nonce quarantines the unresolved original transaction",
      async () => {
        const f = await fixture(quotes[9]);
        const stopSend = t.mock.method(evm.client, "sendRawTransaction", async () => {
          throw new Error("timeout before send");
        });
        await f.tick();
        stopSend.mock.restore();
        const original = await row(f.id);
        // Deliberate local misuse of the dedicated sender to prove incident handling.
        await createWalletClient({
          account: f.signer,
          chain: avalancheFuji,
          transport: http(evm.rpc),
        }).sendTransaction({ to: f.signer.address, value: 0n });
        await f.tick();
        assert.equal((await row(f.id)).state, "QUARANTINED");
        assert.equal((await row(f.id)).errorReason, "finance_nonce_consumed");
        assert.equal((await row(f.id)).transactionHash, original.transactionHash);
        assert.equal((await row(f.id)).broadcastCount, 1);
        assert.equal((await f.lane()).activeDecisionId, f.id);
      },
    );
    await scenario(
      "successful receipt without the matching decision event cannot finalize",
      async () => {
        const f = await fixture(quotes[10]);
        await f.tick();
        const receipt = evm.client.getTransactionReceipt.bind(evm.client);
        const missingEvent = t.mock.method(
          evm.client,
          "getTransactionReceipt",
          async (args: Parameters<typeof receipt>[0]) => ({ ...(await receipt(args)), logs: [] }),
        );
        await f.tick();
        missingEvent.mock.restore();
        assert.equal((await row(f.id)).state, "QUARANTINED");
        assert.equal((await row(f.id)).errorReason, "finance_evidence_inconsistent");
        assert.equal((await row(f.id)).receipt, null);
        assert.equal((await f.lane()).activeDecisionId, f.id);
      },
    );
    await scenario(
      "at resolveBy an already signed decision cannot capture reclaimed funds",
      async () => {
        const q = quotes[6],
          f = await fixture(q);
        const sign = f.signer.signTransaction.bind(f.signer);
        const advance = t.mock.method(
          f.signer,
          "signTransaction",
          async (args: Parameters<typeof sign>[0]) => {
            const bytes = await sign(args);
            await evm.test.setNextBlockTimestamp({ timestamp: BigInt(q.resolveBy) });
            await evm.test.mine({ blocks: 1 });
            return bytes;
          },
        );
        const noSend = t.mock.method(evm.client, "sendRawTransaction", async () => {
          throw new Error("must not broadcast expired decision");
        });
        await f.tick();
        advance.mock.restore();
        assert.equal(noSend.mock.callCount(), 0);
        noSend.mock.restore();
        const expired = await row(f.id);
        assert.equal(expired.state, "SIGNED");
        assert.equal(expired.errorReason, "resolution_expired");
        assert.equal(expired.broadcastCount, 0);
        assert.equal((await f.lane()).activeDecisionId, f.id);
        await buyerVault.write.reclaim([q.protocolQuote.invocationKey]);
        await f.tick();
        assert.equal((await row(f.id)).transactionHash, expired.transactionHash);
        assert.equal((await row(f.id)).broadcastCount, 0);
        // Ambiguous signed reservations are not silently freed even after hold recovery.
        assert.equal((await f.lane()).activeDecisionId, f.id);
        await scanFinancialLifecycle(db, evm.settlement, evm.startBlock);
        assert.equal(
          (
            await db.vaultHoldProjection.findUniqueOrThrow({
              where: { holdId: q.protocolQuote.invocationKey },
            })
          ).status,
          "RECLAIMED",
        );
      },
    );
    assert.equal(await db.invocationReady.count(), 11);
    assert.equal(await db.settlementAttempt.count(), 11);
  });

  it("blocks new payment admission on a financial incident without hiding an existing receipt", async () => {
    const q = await quote(),
      f = await execution(q);
    await f.makeWorker().tick();
    await f.due();
    await f.makeWorker().tick();
    await db.vaultFinancialHealth.create({
      data: { id: `43113:${vault.toLowerCase()}`, blocked: true, reason: "vault_insolvent" },
    });
    assert.equal((await f.service(f.p, paymentRequirements(q))).success, true);
    sessionId = randomUUID();
    await db.chatThread.create({ data: { id: sessionId, buyerId, appId: productId } });
    const next = await quote();
    const p = await payment(next);
    const preview = await facilitator(next);
    const response = await preview.f.inject({
      method: "POST",
      url: "/verify",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: {
        x402Version: 2,
        paymentPayload: p,
        paymentRequirements: paymentRequirements(next),
      },
    });
    assert.equal(response.statusCode, 503, response.body);
    assert.equal(await db.settlementAttempt.count(), 1);
  });

  it("records immutable verifier observations and returns unsigned buyer recovery intents only to the owner", async () => {
    const q = await quote(),
      f = await execution(q);
    await assert.rejects(
      recordPaymentDelivery(db, {
        id: "unpaid",
        invocationId: q.invocationId,
        artifactVersion: 1,
        outputHash: `0x${"1".repeat(64)}`,
        verifier: "trusted-test-verifier",
        accessInterruptionSeconds: 0,
        evidenceLevel: "SIGN" as const,
      }),
      /payment_not_held/,
    );
    await f.makeWorker().tick();
    await f.due();
    await f.makeWorker().tick();
    const input = {
      id: "evidence-1",
      invocationId: q.invocationId,
      artifactVersion: 1,
      outputHash: `0x${"1".repeat(64)}` as `0x${string}`,
      verifier: "trusted-test-verifier",
      accessInterruptionSeconds: 0,
      evidenceLevel: "SIGN" as const,
    };
    const stored = await recordPaymentDelivery(db, input);
    const replayed = await recordPaymentDelivery(db, input);
    // The Evidence Envelope hash is reproducible from the stored envelope and stable on replay.
    assert.equal(replayed.envelopeHash, stored.envelopeHash);
    assert.equal(hashSnapshot(stored.envelope as never), stored.envelopeHash);
    assert.equal((stored.envelope as { outputHash: string }).outputHash, input.outputHash);
    assert.equal((stored.envelope as { evidenceLevel: string }).evidenceLevel, "SIGN");
    await assert.rejects(
      recordPaymentDelivery(db, { ...input, accessInterruptionSeconds: 60 }),
      /evidence_conflict/,
    );
    await assert.rejects(
      recordPaymentDelivery(db, { ...input, evidenceLevel: "WIT" }),
      /evidence_conflict/,
    );
    await assert.rejects(
      recordPaymentDelivery(db, { ...input, id: "self-report", evidenceLevel: "SELF" as never }),
      /invalid_delivery_evidence/,
    );
    assert.equal(await db.paymentDeliveryEvidence.count(), 1);
    const endpoint = `/v1/invocations/${q.invocationId}/financial-intents`;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: endpoint,
          headers: { origin },
          payload: { action: "reclaim" },
        })
      ).statusCode,
      401,
    );
    const intent = await app.inject({
      method: "POST",
      url: endpoint,
      headers: { cookie, origin },
      payload: { action: "reclaim" },
    });
    assert.equal(intent.statusCode, 200, intent.body);
    assert.equal(intent.json().status, "UNSUBMITTED");
    assert.equal(intent.json().requiresWalletSignature, true);
    // Without an explicit hash, a dispute references the latest Evidence Envelope.
    const dispute = await app.inject({
      method: "POST",
      url: endpoint,
      headers: { cookie, origin },
      payload: { action: "dispute" },
    });
    assert.equal(dispute.statusCode, 200, dispute.body);
    assert.equal(dispute.json().evidenceHash, stored.envelopeHash);
    assert.equal(
      dispute.json().data,
      encodeFunctionData({
        abi: vaultFinanceAbi,
        functionName: "openDispute",
        args: [
          q.protocolQuote.invocationKey as `0x${string}`,
          stored.envelopeHash as `0x${string}`,
        ],
      }),
    );
    const status = await app.inject({
      method: "GET",
      url: `/v1/invocations/${q.invocationId}`,
      headers: { cookie, origin },
    });
    assert.equal(status.json().delivery.evidenceLevel, "SIGN");
    assert.equal(status.json().delivery.envelopeHash, stored.envelopeHash);
    assert.equal(await db.vaultFinancialEvent.count(), 0);
    assert.equal(await db.settlementAttempt.count(), 1);
    assert.equal(await db.financeDecision.count(), 0);
  });
});
