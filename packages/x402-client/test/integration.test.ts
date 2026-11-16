// The SDK against the real Payvoke API, in process: Hono's `app.request` is
// the fetch, PGlite the database, a mock vault the chain. SIWE, the 402, the
// signed USDC authorization, the settlement worker, the agent's delivery and
// the timeline result are all the production code paths.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { keccak256, zeroHash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { FUNDING_SOURCE, hashReceiveAuthorization } from "@payvoke/shared/protocol";
import { readQuote, type QuoteDocument } from "@payvoke/shared/x402";
import type { VaultChain } from "@payvoke/shared/x402/chain";
import { createApp } from "../../../apps/api/src/app";
import { loadConfig } from "../../../apps/api/src/config";
import { createDatabase, type PrismaClient } from "../../../apps/api/src/core/db";
import { createFacilitator } from "../../../apps/api/src/core/facilitator";
import { MemoryJobs } from "../../../apps/api/src/core/queue";
import { SettlementWorker } from "../../../apps/api/src/core/payments/worker";
import { verifyStructuredDeliveries } from "../../../apps/api/src/core/payments/delivery";
import {
  readMigrations,
  startTestPostgres,
  type TestPostgres,
} from "../../../apps/api/test/kit/database";
import { code, mockVault } from "../../../apps/api/test/kit/vault-reader";
import { mockSettlement } from "../../../apps/api/test/kit/settlement-reader";
import { createPayvoke, type FetchLike, type HireEvent } from "../src";

const origin = "https://app.payvoke.test";
const api = "https://api.payvoke.test";
const vault = "0x1111111111111111111111111111111111111111";
const relayer = privateKeyToAccount(generatePrivateKey());
const grantSigner = privateKeyToAccount(generatePrivateKey());
const terms = {
  deliverySeconds: 60,
  reviewSeconds: 30,
  revisionPolicy: { maxIncluded: 0, description: "No revisions" },
  refundPolicy: "Refund undelivered work",
  sideEffects: "none",
  dataUse: "Only this request",
};
const gasPolicy = {
  maxGasLimit: 1000000n,
  maxFeePerGas: 10000000000n,
  maxPriorityFeePerGas: 2000000000n,
  maxTransactionCost: 10n ** 16n,
  maxOutstandingCost: 10n ** 16n,
  windowSeconds: 3600,
  maxWindowCost: 10n ** 17n,
};

let postgres: TestPostgres;
let db: PrismaClient;
let config: ReturnType<typeof loadConfig>;
let app: ReturnType<typeof createApp>;
const apps: ReturnType<typeof createApp>[] = [];
// Every SDK request goes to whichever app instance is current.
const fetch: FetchLike = async (input, init) => {
  await app.ready();
  return app.request(input instanceof Request ? input : input.toString(), init);
};

beforeAll(async () => {
  postgres = await startTestPostgres();
  for (const entry of await readMigrations()) await postgres.embedded!.exec(entry.sql);
  config = loadConfig({
    MAX_APPS_PER_OWNER: "1000",
    APP_CREATES_PER_DAY: "1000",
    DATABASE_URL: postgres.connectionString,
    REDIS_URL: "redis://127.0.0.1:1",
    API_ORIGIN: api,
    WEB_ORIGIN: origin,
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
    VAULT_ADDRESS: vault,
    LOG_LEVEL: "silent",
  });
  db = createDatabase(postgres.connectionString, 1);
  await db.deploymentPolicy.create({
    data: {
      version: "policy-1",
      activeSlot: "active",
      vault,
      feeBps: 100,
      feeRecipient: "0x3333333333333333333333333333333333333333",
      quoteLifetimeSeconds: 120,
      maxHoldSeconds: 600,
      resolutionGraceSeconds: 60,
      minGrossAmount: "1000",
    },
  });
  app = createApp(config, db);
  await app.ready();
}, 60_000);

afterAll(async () => {
  for (const instance of [...apps, app]) await instance?.close().catch(() => {});
  await db?.$disconnect();
  await postgres?.stop();
});

test("hires an instant command end to end through the real API", async () => {
  // The provider: signs in with the same SDK, then uses its session for Studio.
  const providerWallet = privateKeyToAccount(generatePrivateKey());
  const provider = createPayvoke({
    baseUrl: api,
    webOrigin: origin,
    account: providerWallet,
    fetch,
  });
  await provider.signIn();
  // x402Fetch passes non-402 answers through untouched: a plain session fetch.
  const studio = provider.x402Fetch({ maxAmount: 1n });
  const write = async (method: string, path: string, body: unknown, headers = {}) => {
    const response = await studio(`${api}${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const parsed = await response.json();
    expect(response.status).toBeLessThan(300);
    return parsed;
  };
  const created = await write("POST", "/v1/provider/apps", {
    name: `CV desk ${randomBytes(3).toString("hex")}`,
    clientRequestId: randomUUID(),
  });
  const appId: string = created.id;
  await write("PUT", `/v1/provider/apps/${appId}/commands`, [
    {
      name: "quick_review",
      description: "Reviews a CV in one pass",
      options: [
        { name: "cv_text", type: "STRING", required: true, maxLength: 12000 },
        { name: "goal", type: "STRING" },
      ],
      maxAmount: "1000000",
      instantAmount: "500000",
      terms,
    },
  ]);
  await db.app.update({
    where: { id: appId },
    data: { visibility: "PUBLIC", lastHeartbeatAt: new Date() },
  });
  const key = await write("POST", `/v1/provider/apps/${appId}/keys`, {
    scopes: ["events:read", "events:ack", "reports:write"],
  });
  const agent = (path: string, body: unknown) =>
    app.request(`${api}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key.secret}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // The buyer: a fresh wallet, SIWE through the SDK.
  const buyer = createPayvoke({
    baseUrl: api,
    webOrigin: origin,
    account: privateKeyToAccount(generatePrivateKey()),
    fetch,
    pollIntervalMs: 1,
  });
  const { items } = await buyer.catalog();
  const item = items.find((entry) => entry.appId === appId)!;
  expect(item).toMatchObject({ command: "quick_review", amount: "500000", available: true });

  let worker: SettlementWorker | null = null;
  let quote: QuoteDocument | null = null;
  const events: HireEvent[] = [];
  const job = await buyer.hire({
    appId,
    command: "quick_review",
    arguments: { cv_text: "Ten years of TypeScript.", goal: "Staff engineer" },
    maxAmount: 1_000_000n,
    timeoutMs: 30_000,
    onEvent: async (event) => {
      events.push(event);
      if (event.type === "challenge") {
        // Payments on: a facilitator over a mock vault that admits this quote.
        quote = event.quote;
        const q = readQuote(quote.protocolQuote);
        const mock = mockVault(q, vault, grantSigner.address, relayer.address);
        const facilitator = createFacilitator(
          {
            API_ORIGIN: api,
            RPC_URL: "https://rpc.payvoke.test",
            VAULT_ADDRESS: vault,
            RELAYER_ADDRESS: relayer.address,
            EXPECTED_VAULT_CODE_HASH: keccak256(code),
            VAULT_FEE_CAP_BPS: 500,
            VAULT_MAX_QUOTE_LIFETIME_SECONDS: 3600,
            VAULT_MAX_HOLD_SECONDS: 30 * 86400,
            SETTLEMENT_ENABLED: true,
          },
          db,
          new MemoryJobs(),
          mock.chain,
        );
        await facilitator.ready();
        // The old instance stays open: closing an app disconnects the shared
        // database client, which an adapter-owned pool cannot reopen.
        apps.push(app);
        app = createApp(
          { ...config, PAYMENTS_ENABLED: true },
          db,
          undefined,
          undefined,
          facilitator,
        );
        const settlement = mockSettlement(
          q,
          mock.chain.deployment,
          {
            quoteDigest: quote.quoteDigest,
            authorizationDigest: hashReceiveAuthorization(vault, q, quote.quoteDigest),
            grantId: zeroHash,
          },
          FUNDING_SOURCE.authorization,
        );
        worker = new SettlementWorker(
          db,
          mock.chain as VaultChain,
          settlement.chain,
          relayer,
          `${api}/v1/invocations`,
          gasPolicy,
        );
      }
      if (event.type === "pending" && event.transaction === null) {
        // The relayer puts the hold on chain and waits for finality.
        await worker!.tick();
        await db.settlementOperation.updateMany({ data: { nextCheckAt: new Date(0) } });
        await worker!.tick();
      }
      if (event.type === "held") {
        // The agent takes the job and delivers; Payvoke verifies it.
        const id = event.invocationId;
        const task = `/v1/provider/apps/${appId}/invocations/${id}`;
        expect((await agent(`${task}/acks`, { eventId: id })).status).toBe(200);
        await agent(`${task}/reports`, { reportId: "r-1", sequence: 1, type: "started", data: {} });
        const result = await agent(`${task}/reports`, {
          reportId: "r-2",
          sequence: 2,
          type: "result",
          data: { artifactVersion: 1, output: "## Quick review\nStrong CV.", files: [] },
        });
        expect(result.status).toBe(200);
        expect(await verifyStructuredDeliveries(db)).toBe(1);
      }
    },
  });

  expect(quote).not.toBeNull();
  expect(job).toMatchObject({
    invocationId: quote!.invocationId,
    threadId: quote!.sessionId,
    paymentStatus: "HELD",
    executionStatus: "DELIVERED",
    amount: "500000",
  });
  expect(job.transaction).toMatch(/^0x[0-9a-f]{64}$/);
  const read = buyer.x402Fetch({ maxAmount: 1n });
  // The DIRECT thread has no conversation; its timeline is the offer and run.
  const timeline = await (await read(`${api}/v1/threads/${job.threadId}/timeline`)).json();
  expect(timeline.messages.length).toBeGreaterThan(0);
  expect(job.result).toMatchObject({ artifactVersion: 1, text: "## Quick review\nStrong CV." });
  expect((await buyer.job(job.invocationId)).result?.text).toBe("## Quick review\nStrong CV.");
  const types = events.map((event) => event.type);
  expect(types[0]).toBe("challenge");
  expect(types[1]).toBe("signed");
  expect(types).toContain("pending");
  expect(types.slice(-1)).toEqual(["delivered"]);
  expect(types.indexOf("held")).toBeGreaterThan(types.indexOf("pending"));
  expect((await buyer.job(job.invocationId)).executionStatus).toBe("DELIVERED");
}, 60_000);
