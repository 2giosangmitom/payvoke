/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { recoverTypedDataAddress } from "viem";
import { paymentTypes, vaultDomain } from "@payvoke/protocol";
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
  type AuthorizationRecord,
  type QuoteDocument,
} from "@payvoke/x402";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "../src/generated/prisma/client";

describe("immutable quotes and SDK x402 handshake (no real settlement)", () => {
  const origin = "https://app.payvoke.test";
  const api = "https://api.payvoke.test";
  const vault = "0x1111111111111111111111111111111111111111";
  const provider = "0x2222222222222222222222222222222222222222";
  const feeRecipient = "0x3333333333333333333333333333333333333333";
  const wallet = privateKeyToAccount(generatePrivateKey());
  const grantSigner = privateKeyToAccount(generatePrivateKey());
  let embedded: PGlite;
  let socket: PGLiteSocketServer;
  let pool: Pool;
  let db: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let config: ReturnType<typeof loadConfig>;
  let cookie: string;
  let buyerId: string;
  let sessionId: string;
  let productId: string;
  let commandId: string;

  before(async () => {
    embedded = await PGlite.create();
    socket = new PGLiteSocketServer({ db: embedded, port: 0, host: "127.0.0.1" });
    await socket.start();
    const connectionString = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
    pool = new Pool({ connectionString, max: 1 });
    pool.setMaxListeners(50);
    const directory = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .filter((v) => v.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await pool.query(await readFile(new URL(`${entry.name}/migration.sql`, directory), "utf8"));
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
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
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
    await pool?.end();
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

  it("freezes effective defaults, all snapshots and canonical EIP-712 fields", async () => {
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

  it("expires unpaid quotes without extending deadlines on replay", async (t) => {
    const payload = body();
    const response = await prepare(payload);
    assert.equal(response.statusCode, 201, response.body);
    const q = response.json<QuoteDocument>();
    t.mock.method(Date, "now", () => (q.validUntil + 1) * 1000);
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
});
