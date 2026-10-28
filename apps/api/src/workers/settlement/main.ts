import { setTimeout as delay } from "node:timers/promises";
import closeWithGrace from "close-with-grace";
import { Worker } from "bullmq";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VaultChain } from "@payvoke/shared/x402/chain";
import { SettlementChain } from "@payvoke/shared/x402/settlement";
import { createDatabase } from "@/core/db";
import {
  channels,
  connectRedis,
  queues,
  QueueJobs,
  ring,
  serial,
  throttled,
  type InvocationJob,
} from "@/core/queue";
import { errorTag, vaultDeployment } from "@/core/runtime";
import { SettlementWorker } from "@/core/payments/worker";
import { loadWorkerConfig, workerGasPolicy } from "./config";
import { scanFinalizedHolds } from "@/core/payments/scanner";
import { scanFinancialLifecycle } from "@/core/payments/finance-ledger";

// `settle` jobs wake the worker as soon as the facilitator journals an intent;
// the sweep still finds deferred operations and any job Redis lost.
const SWEEP_MS = 5000;

let db: ReturnType<typeof createDatabase> | undefined;
try {
  const config = loadWorkerConfig();
  if (!config.EXECUTION_ENABLED) throw new Error("Worker execution is disabled");
  const budget = workerGasPolicy(config);
  const deployment = vaultDeployment(config);
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.RELAYER_PRIVATE_KEY))
    throw new Error("Invalid signer configuration");
  const signer = privateKeyToAccount(config.RELAYER_PRIVATE_KEY as Hex);
  const client = createPublicClient({
    transport: http(config.RPC_URL, { timeout: 10000, retryCount: 0 }),
  });
  const admission = new VaultChain(client, deployment);
  const chain = new SettlementChain(client, deployment);
  // Role revocation must stop admission, not receipt recovery for old attempts.
  await admission.initialize({ requireRelayerRole: false });
  await chain.finalized();
  const onError = throttled(
    (error) => console.error(`Settlement worker Redis error (${errorTag(error)})`),
    errorTag,
  );
  const consumer = await connectRedis(config.REDIS_URL, "consumer", onError);
  const producer = await connectRedis(config.REDIS_URL, "producer", onError);
  const jobs = new QueueJobs(producer, onError);
  db = createDatabase(config.DATABASE_URL);
  const database = db;
  const worker = new SettlementWorker(
    database,
    admission,
    chain,
    signer,
    new URL("/v1/invocations", config.API_ORIGIN).href,
    budget,
    // The hold committed with an invocation.ready item on the provider feed.
    ({ appId }) => ring(producer, channels.app(appId), onError),
  );
  // One relayer, one nonce lane: jobs and the sweep never run concurrently.
  const lane = serial();
  const settler = new Worker<InvocationJob>(
    queues.settlement,
    (job) => lane(() => worker.handle(job.data.invocationId)),
    { connection: consumer, concurrency: 1 },
  );
  settler.on("failed", (_job, error) =>
    console.error(`Settlement job failed (${errorTag(error)}); durable state retained`),
  );
  settler.on("error", onError);
  const start = BigInt(config.DEPLOYMENT_START_BLOCK);

  let stopping = false;
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  closeWithGrace(
    { delay: 150000, logger: { error: () => console.error("Settlement worker shutdown failed") } },
    async () => {
      stopping = true;
      await settler.close();
      await done;
      await jobs.close();
      consumer.disconnect();
      producer.disconnect();
      await database.$disconnect();
    },
  );
  try {
    while (!stopping) {
      let busy = false;
      try {
        busy = await lane(() => worker.tick());
      } catch (error) {
        console.error(`Settlement worker tick failed (${errorTag(error)}); durable state retained`);
      }
      if (!stopping) {
        try {
          const lifecycle = await scanFinancialLifecycle(database, chain, start);
          // Finance acts at each hold's deadlines; schedule a wake-up for both.
          for (const hold of lifecycle.open) {
            await jobs.financeDue(hold.invocationId, hold.deliveryDeadline, lifecycle.chainTime);
            await jobs.financeDue(hold.invocationId, hold.releaseNotBefore, lifecycle.chainTime);
          }
          if (lifecycle.open.length) await jobs.wakeFinance();
          await scanFinalizedHolds(database, chain, start);
          // Keep scanning without a pause while finalized blocks are still behind.
          if (!lifecycle.caughtUp && !("reason" in lifecycle)) busy = true;
        } catch (error) {
          console.error(`Settlement backfill failed (${errorTag(error)}); cursor retained`);
        }
      }
      if (!stopping && !busy) await delay(SWEEP_MS);
    }
  } finally {
    finish();
  }
} catch {
  console.error(
    "Settlement worker startup failed: check explicit execution policy, database, RPC and Redis",
  );
  await db?.$disconnect().catch(() => {});
  process.exitCode = 1;
}
