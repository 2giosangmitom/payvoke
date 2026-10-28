import { setTimeout as delay } from "node:timers/promises";
import { Worker } from "bullmq";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VaultChain } from "@payvoke/shared/x402/chain";
import { SettlementChain } from "@payvoke/shared/x402/settlement";
import type { PrismaClient } from "#core/db";
import { scanFinancialLifecycle } from "#core/payments/finance-ledger";
import { scanFinalizedHolds } from "#core/payments/scanner";
import { SettlementWorker, validateGasPolicy } from "#core/payments/worker";
import { channels, connectRedis, queues, QueueJobs, ring, serial, throttled } from "#core/queue";
import { errorTag, vaultDeployment } from "#core/runtime";
import type { InvocationJob } from "#core/queue";
import { deploymentConfig, gasBudget, type Config } from "../config";
import type { Logger } from "../http/context";

// `settle` jobs wake the worker as soon as the facilitator journals an intent;
// the sweep still finds deferred operations and any job Redis lost.
const SWEEP_MS = 5000;

// Signs and sends reserveHold. The only code path that uses RELAYER_PRIVATE_KEY.
export async function startSettlementWorker(config: Config, db: PrismaClient, log: Logger) {
  const budget = gasBudget(config, "SETTLEMENT");
  validateGasPolicy(budget);
  const deployment = vaultDeployment(deploymentConfig(config));
  const key = config.RELAYER_PRIVATE_KEY ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Invalid signer configuration");
  const start = BigInt(config.DEPLOYMENT_START_BLOCK ?? "0");
  if (start < 1n) throw new Error("Invalid deployment start block");
  const signer = privateKeyToAccount(key as Hex);
  const client = createPublicClient({
    transport: http(config.RPC_URL, { timeout: 10000, retryCount: 0 }),
  });
  const admission = new VaultChain(client, deployment);
  const chain = new SettlementChain(client, deployment);
  // Role revocation must stop admission, not receipt recovery for old attempts.
  await admission.initialize({ requireRelayerRole: false });
  await chain.finalized();
  const onError = throttled(
    (error) => log.error({ error: errorTag(error) }, "Settlement worker Redis error"),
    errorTag,
  );
  const consumer = await connectRedis(config.REDIS_URL, "consumer", onError);
  const producer = await connectRedis(config.REDIS_URL, "producer", onError);
  const jobs = new QueueJobs(producer, onError);
  const worker = new SettlementWorker(
    db,
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
    log.error({ error: errorTag(error) }, "Settlement job failed; durable state retained"),
  );
  settler.on("error", onError);

  let stopping = false;
  const loop = (async () => {
    while (!stopping) {
      let busy = false;
      try {
        busy = await lane(() => worker.tick());
      } catch (error) {
        log.error({ error: errorTag(error) }, "Settlement tick failed; durable state retained");
      }
      if (!stopping) {
        try {
          const lifecycle = await scanFinancialLifecycle(db, chain, start);
          // Finance acts at each hold's deadlines; schedule a wake-up for both.
          for (const hold of lifecycle.open) {
            await jobs.financeDue(hold.invocationId, hold.deliveryDeadline, lifecycle.chainTime);
            await jobs.financeDue(hold.invocationId, hold.releaseNotBefore, lifecycle.chainTime);
          }
          if (lifecycle.open.length) await jobs.wakeFinance();
          await scanFinalizedHolds(db, chain, start);
          // Keep scanning without a pause while finalized blocks are still behind.
          if (!lifecycle.caughtUp && !("reason" in lifecycle)) busy = true;
        } catch (error) {
          log.error({ error: errorTag(error) }, "Settlement backfill failed; cursor retained");
        }
      }
      if (!stopping && !busy) await delay(SWEEP_MS);
    }
  })();

  return {
    async close() {
      stopping = true;
      await settler.close();
      await loop;
      await jobs.close();
      consumer.disconnect();
      producer.disconnect();
    },
  };
}
