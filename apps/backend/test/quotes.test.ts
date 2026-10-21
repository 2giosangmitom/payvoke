/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, readdir } from "node:fs/promises";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { encodeFunctionData, keccak256, recoverTypedDataAddress } from "viem";
import { paymentTypes, reserveHoldAbi, vaultDomain } from "@payvoke/protocol";
import { x402Client } from "@x402/core/client";
import { resolvePaymentFlow, x402ResourceServer } from "@x402/core/server";
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
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { SettlementJournal } from "../src/modules/payments/journal";

describe("immutable quotes and SDK x402 handshake (no real settlement)", () => {
  const origin = "https://app.payvoke.test";
  const api = "https://api.payvoke.test";
  const vault = "0x1111111111111111111111111111111111111111";
  const provider = "0x2222222222222222222222222222222222222222";
  const feeRecipient = "0x3333333333333333333333333333333333333333";
  const wallet = privateKeyToAccount(generatePrivateKey());
  const grantSigner = privateKeyToAccount(generatePrivateKey());
  const relayer = privateKeyToAccount(generatePrivateKey());
  const schema = `payment_test_${randomUUID().replaceAll("-", "")}`;
  let embedded: PGlite | undefined;
  let socket: PGLiteSocketServer | undefined;
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

  before(async () => {
    let connectionString = "postgresql://test:test@127.0.0.1:55433/test";
    if (process.env.PAYMENTS_TEST_POSTGRES !== "1") {
      embedded = await PGlite.create();
      socket = new PGLiteSocketServer({ db: embedded, port: 0, host: "127.0.0.1" });
      await socket.start();
      connectionString = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
    }
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
    const directory = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .filter((v) => v.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "20261021010000_settlement_journal") {
        await pool.query(`
          INSERT INTO products (id, kind) VALUES ('migration-product', 'TOOL');
          INSERT INTO usage_sessions (id, "buyerId", "productId") VALUES ('migration-session', 'migration-buyer', 'migration-product');
          INSERT INTO quotes (id, "invocationId", "buyerId", "sessionId", "clientRequestId", "requestHash", "validUntil", document)
          VALUES ('migration-quote', 'migration-invocation', 'migration-buyer', 'migration-session', 'migration-request', 'original-hash', NOW(), '{"original":"preserved"}');
        `);
      }
      await pool.query(
        (await readFile(new URL(`${entry.name}/migration.sql`, directory), "utf8")).replace(
          'CREATE SCHEMA IF NOT EXISTS "public";',
          "",
        ),
      );
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
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    journal = new SettlementJournal(db, { vault, resourceUrl: `${api}/v1/invocations` });
    await db.settlementAttempt.deleteMany();
    await db.settlementOperation.deleteMany();
    await db.invocation.deleteMany();
    await db.relayerLane.deleteMany();
    await db.quote.deleteMany();
    await db.usageSession.deleteMany();
    await db.commandVersion.deleteMany();
    await db.productVersion.deleteMany();
    await db.product.deleteMany();
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
    const message = createSiweMessage({
      address: wallet.address,
      chainId: 43113,
      domain: new URL(origin).host,
      uri: origin,
      version: "1",
      nonce: nonce.json().nonce,
      issuedAt: new Date(),
      expirationTime: new Date(Date.now() + 300000),
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
    await db.product.create({
      data: {
        id: productId,
        kind: "TOOL",
        status: "PUBLISHED",
        activeVersion: 1,
        versions: { create: { number: 1, status: "APPROVED", payoutAddress: provider } },
      },
    });
    await db.commandVersion.create({
      data: {
        productId,
        productVersion: 1,
        commandId,
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 1 },
            language: { type: "string", default: "vi" },
          },
        },
        grossAmount: "100000",
        terms: {
          deliverySeconds: 60,
          reviewSeconds: 30,
          revisionPolicy: { maxIncluded: 1, description: "One correction" },
          refundPolicy: "Refund undelivered work",
          sideEffects: "none",
          dataUse: "Only this request",
        },
        deliverySeconds: 60,
        reviewSeconds: 30,
      },
    });
    await db.usageSession.create({ data: { id: sessionId, buyerId, productId } });
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
      },
    });
  });
  afterEach(async () => {
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
    await socket?.stop();
    await embedded?.close();
  });

  function body(key = randomUUID()) {
    return {
      sessionId,
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
  function prepare(payload = body(), headers: Record<string, string> = {}) {
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
      vault,
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
    await db.commandVersion.updateMany({ data: { grossAmount: "999999", reviewSeconds: 100 } });
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
    await db.usageSession.updateMany({ data: { buyerId: "another-user" } });
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
    await db.product.updateMany({ data: { status: "SUSPENDED" } });
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
    await db.product.updateMany({ data: { status: "SUSPENDED" } });
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
    const otherSession = await db.usageSession.create({ data: { buyerId, productId } });
    const response = await prepare({ ...body(), sessionId: otherSession.id });
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
    const otherSession = await db.usageSession.create({ data: { buyerId, productId } });
    const response = await prepare({ ...body(), sessionId: otherSession.id });
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
    await delay(Math.max(0, q.validUntil * 1000 - Date.now() + 20));
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
});
