/// <reference types="bun" />
import { inject } from "#test/kit/http";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, it } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "#core/db";
import { readMigrations, startTestPostgres, type TestPostgres } from "#test/kit/database";
import { REPUTATION_WINDOW, reputation } from "../src/modules/stats/reputation";

const schema = `reputation_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
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
  app = createApp(
    loadConfig({
      DATABASE_URL: connectionString,
      // Unused: the test passes in-process signals.
      REDIS_URL: "redis://127.0.0.1:1",
      WEB_ORIGIN: "https://app.payvoke.test",
      API_ORIGIN: "https://api.payvoke.test",
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
      LOG_LEVEL: "silent",
      VAULT_ADDRESS: wallet.address,
    }),
    db,
  );
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  await postgres?.stop();
});

async function agent() {
  const ownerId = randomUUID();
  const created = await db.app.create({
    data: {
      ownerId,
      clientRequestId: randomUUID(),
      name: `Agent ${randomUUID().slice(0, 6)}`,
      payoutAddress: wallet.address,
    },
  });
  return { appId: created.id, ownerId };
}

type Job = {
  outcome?: "RELEASED" | "REFUNDED" | "RECLAIMED";
  // Seconds from payment to the first verified result; none when undelivered.
  deliveredAfter?: number;
  // Seconds the buyer allowed for delivery.
  deliverySeconds?: number;
  buyerId?: string;
};

// A paid job: a held payment, its first delivery and its closed outcome.
async function job(appId: string, spec: Job, startedAt: Date) {
  const buyerId = spec.buyerId ?? randomUUID();
  const thread = await db.chatThread.create({ data: { buyerId, appId } });
  const invocationId = randomUUID();
  const invocationKey = `0x${randomBytes(32).toString("hex")}`;
  const deadline = Math.floor(startedAt.getTime() / 1000) + (spec.deliverySeconds ?? 600);
  const quote = await db.quote.create({
    data: {
      id: randomUUID(),
      invocationId,
      buyerId,
      threadId: thread.id,
      appId,
      clientRequestId: randomUUID(),
      requestHash: `0x${"0".repeat(64)}`,
      validUntil: startedAt,
      document: { grossAmount: "10000", deliveryDeadline: deadline },
    },
  });
  await db.invocation.create({
    data: { id: invocationId, quoteId: quote.id, buyerId, createdAt: startedAt },
  });
  await db.settlementOperation.create({
    data: {
      invocationId,
      invocationKey,
      quoteDigest: `0x${"1".repeat(64)}`,
      authorizationDigest: `0x${"2".repeat(64)}`,
      fundingMode: "GRANT",
      recoveredSigner: wallet.address,
      paymentPayload: {},
      state: "HELD",
    },
  });
  if (spec.deliveredAfter !== undefined)
    await db.paymentDeliveryEvidence.create({
      data: {
        id: randomUUID(),
        invocationId,
        artifactVersion: 1,
        outputHash: `0x${"4".repeat(64)}`,
        verifier: "test",
        observedAt: new Date(startedAt.getTime() + spec.deliveredAfter * 1000),
        accessInterruptionSeconds: 0,
        evidenceLevel: "SIGN",
        envelope: {},
        envelopeHash: `0x${"5".repeat(64)}`,
      },
    });
  if (spec.outcome)
    await db.vaultHoldProjection.create({
      data: {
        holdId: invocationKey,
        vault: wallet.address,
        invocationId,
        status: spec.outcome,
        snapshot: {},
        version: 1n,
        blockNumber: 1n,
        blockHash: `0x${"3".repeat(64)}`,
      },
    });
}

async function jobs(appId: string, specs: Job[]) {
  const base = Date.now() - specs.length * 60_000;
  for (const [index, spec] of specs.entries())
    await job(appId, spec, new Date(base + index * 60_000));
}

it("hides rates until enough jobs have closed and marks new agents", async () => {
  const fresh = await agent();
  const busy = await agent();
  await jobs(fresh.appId, [{ outcome: "RELEASED", deliveredAfter: 60 }, { outcome: "REFUNDED" }]);
  // Six paid jobs, but only four closed: still too few for rates.
  await jobs(busy.appId, [
    { outcome: "RELEASED", deliveredAfter: 60 },
    { outcome: "RELEASED", deliveredAfter: 60 },
    { outcome: "RELEASED", deliveredAfter: 60 },
    { outcome: "REFUNDED" },
    { deliveredAfter: 60 },
    {},
  ]);
  const track = await reputation(db, [fresh.appId, busy.appId, randomUUID()]);
  assert.deepEqual(track.get(fresh.appId), {
    paidJobs: 2,
    sample: 2,
    successRate: null,
    onTimeRate: null,
    refundRate: null,
    medianDeliverySeconds: null,
    isNew: true,
  });
  const busyTrack = track.get(busy.appId)!;
  assert.equal(busyTrack.paidJobs, 6);
  assert.equal(busyTrack.isNew, false);
  assert.equal(busyTrack.sample, 4);
  assert.equal(busyTrack.successRate, null);
});

it("rates success, refunds, on-time delivery and speed over closed jobs", async () => {
  const { appId, ownerId } = await agent();
  await jobs(appId, [
    // On time: delivered after 120s of a 600s window.
    { outcome: "RELEASED", deliveredAfter: 120 },
    { outcome: "RELEASED", deliveredAfter: 300 },
    // Released under a late policy: a success, but not on time.
    { outcome: "RELEASED", deliveredAfter: 610 },
    { outcome: "RECLAIMED" },
    { outcome: "REFUNDED", deliveredAfter: 700 },
    // The owner buying their own agent counts for nothing.
    { outcome: "RELEASED", deliveredAfter: 10, buyerId: ownerId },
    { outcome: "RELEASED", deliveredAfter: 10, buyerId: ownerId },
  ]);
  const track = (await reputation(db, [appId])).get(appId)!;
  assert.deepEqual(track, {
    paidJobs: 5,
    sample: 5,
    successRate: 60,
    onTimeRate: 40,
    refundRate: 40,
    medianDeliverySeconds: 455,
    isNew: false,
  });
});

it("rates only the most recent closed jobs", async () => {
  const { appId } = await agent();
  // Old failures, then a full window of on-time successes.
  await jobs(appId, [
    ...Array.from({ length: 5 }, () => ({ outcome: "REFUNDED" as const })),
    ...Array.from({ length: REPUTATION_WINDOW }, () => ({
      outcome: "RELEASED" as const,
      deliveredAfter: 60,
    })),
  ]);
  const track = (await reputation(db, [appId])).get(appId)!;
  assert.equal(track.paidJobs, REPUTATION_WINDOW + 5);
  assert.equal(track.sample, REPUTATION_WINDOW);
  assert.equal(track.successRate, 100);
  assert.equal(track.onTimeRate, 100);
  assert.equal(track.medianDeliverySeconds, 60);
});

it("shows the track record on the public agent page", async () => {
  const { appId } = await agent();
  await jobs(
    appId,
    Array.from({ length: 5 }, () => ({ outcome: "RELEASED" as const, deliveredAfter: 90 })),
  );
  const page = await inject(app, { method: "GET", url: `/v1/apps/${appId}` });
  assert.equal(page.statusCode, 200, page.body);
  assert.deepEqual(page.json().reputation, {
    paidJobs: 5,
    sample: 5,
    successRate: 100,
    onTimeRate: 100,
    refundRate: 0,
    medianDeliverySeconds: 90,
    isNew: false,
  });
});
