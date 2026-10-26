import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import closeWithGrace from "close-with-grace";
import { Worker } from "bullmq";
import { createPublicClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SettlementChain } from "@payvoke/x402/settlement";
import { createDatabase } from "@payvoke/db";
import { connectRedis, queues, serial, throttled } from "@payvoke/queue";
import { errorTag, vaultDeployment } from "@payvoke/server";
import { FinanceService } from "@payvoke/payments/finance";
import { AutoFinance } from "@payvoke/payments/finance-policy";
import { financeGasPolicy, loadFinanceWorkerConfig } from "./config";

// Jobs wake finance on new evidence, failed runs and hold deadlines; the sweep
// only backs up wake-ups Redis lost.
const SWEEP_MS = 30000;

let db: ReturnType<typeof createDatabase> | undefined;
try {
  const config = loadFinanceWorkerConfig();
  if (!config.EXECUTION_ENABLED) throw new Error("Worker execution is disabled");
  const budget = financeGasPolicy(config);
  const deployment = vaultDeployment(config);
  const key = (value: string) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("Invalid signer configuration");
    return privateKeyToAccount(value as Hex);
  };
  const approver = key(config.FINANCE_APPROVER_PRIVATE_KEY);
  const executor = key(config.FINANCE_EXECUTOR_PRIVATE_KEY);
  // The vault rejects approver == executor; fail at startup instead of per decision.
  if (getAddress(approver.address) === getAddress(executor.address))
    throw new Error("Approver and executor must differ");
  const client = createPublicClient({
    transport: http(config.RPC_URL, { timeout: 10000, retryCount: 0 }),
  });
  const chain = new SettlementChain(client, deployment);
  await chain.finalized();
  const onError = throttled(
    (error) => console.error(`Finance worker Redis error (${errorTag(error)})`),
    errorTag,
  );
  const consumer = await connectRedis(config.REDIS_URL, "consumer", onError);
  db = createDatabase(config.DATABASE_URL);
  const database = db;
  const auto = new AutoFinance(
    new FinanceService(database, chain, executor.address, budget),
    approver,
    executor,
  );
  let stopping = false;
  // One executor lane: a job and the sweep never send decisions concurrently.
  const lane = serial();
  const cycle = () =>
    lane(async () => {
      await auto.propose();
      if (!stopping) await auto.execute();
    });
  const waker = new Worker(queues.finance, () => cycle(), { connection: consumer, concurrency: 1 });
  waker.on("failed", (_job, error) =>
    console.error(`Finance job failed (${errorTag(error)}); durable state retained`),
  );
  waker.on("error", onError);
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  closeWithGrace(
    { delay: 150000, logger: { error: () => console.error("Finance worker shutdown failed") } },
    async () => {
      stopping = true;
      await waker.close();
      await done;
      consumer.disconnect();
      await database.$disconnect();
    },
  );
  try {
    while (!stopping) {
      try {
        await cycle();
      } catch (error) {
        console.error(`Finance worker tick failed (${errorTag(error)}); durable state retained`);
      }
      if (!stopping) await delay(SWEEP_MS);
    }
  } finally {
    finish();
  }
} catch {
  console.error(
    "Finance worker startup failed: check execution policy, signer keys, database, RPC and Redis",
  );
  await db?.$disconnect().catch(() => {});
  process.exitCode = 1;
}
