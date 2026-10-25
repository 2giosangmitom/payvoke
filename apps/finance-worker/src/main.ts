import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import closeWithGrace from "close-with-grace";
import { createPublicClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SettlementChain } from "@payvoke/x402/settlement";
import { createDatabase } from "@payvoke/db";
import { vaultDeployment } from "@payvoke/server";
import { FinanceService } from "@payvoke/payments/finance";
import { AutoFinance } from "@payvoke/payments/finance-policy";
import { financeGasPolicy, loadFinanceWorkerConfig } from "./config";

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
  db = createDatabase(config.DATABASE_URL);
  const database = db;
  const auto = new AutoFinance(
    new FinanceService(database, chain, executor.address, budget),
    approver,
    executor,
  );
  let stopping = false;
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  closeWithGrace(
    { delay: 150000, logger: { error: () => console.error("Finance worker shutdown failed") } },
    async () => {
      stopping = true;
      await done;
      await database.$disconnect();
    },
  );
  try {
    while (!stopping) {
      try {
        await auto.propose();
        if (!stopping) await auto.execute();
      } catch {
        console.error("Finance worker tick failed; durable state retained");
      }
      if (!stopping) await delay(5000);
    }
  } finally {
    finish();
  }
} catch {
  console.error(
    "Finance worker startup failed: check execution policy, signer keys, database and RPC",
  );
  await db?.$disconnect().catch(() => {});
  process.exitCode = 1;
}
