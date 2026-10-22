import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import closeWithGrace from "close-with-grace";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VaultChain } from "@payvoke/x402/chain";
import { SettlementChain } from "@payvoke/x402/settlement";
import { createDatabase } from "./database/client";
import { facilitatorDeployment } from "./facilitator/config";
import { SettlementWorker } from "./modules/payments/worker";
import { loadWorkerConfig, workerGasPolicy } from "./modules/payments/worker-config";
import { scanFinalizedHolds } from "./modules/payments/scanner";
import { scanFinancialLifecycle } from "./modules/payments/finance-ledger";

let db: ReturnType<typeof createDatabase> | undefined;
try {
  const config = loadWorkerConfig();
  if (!config.EXECUTION_ENABLED) throw new Error("Worker execution is disabled");
  const budget = workerGasPolicy(config);
  const deployment = facilitatorDeployment(config);
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
  db = createDatabase(config.DATABASE_URL);
  const database = db;
  const worker = new SettlementWorker(
    database,
    admission,
    chain,
    signer,
    new URL("/v1/invocations", config.API_ORIGIN).href,
    budget,
  );
  let stopping = false;
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  closeWithGrace(
    { delay: 150000, logger: { error: () => console.error("Settlement worker shutdown failed") } },
    async () => {
      stopping = true;
      await done;
      await database.$disconnect();
    },
  );
  try {
    while (!stopping) {
      try {
        await worker.tick();
      } catch {
        console.error("Settlement worker tick failed; durable state retained");
      }
      if (!stopping) {
        try {
          await scanFinancialLifecycle(database, chain, BigInt(config.DEPLOYMENT_START_BLOCK));
          await scanFinalizedHolds(database, chain, BigInt(config.DEPLOYMENT_START_BLOCK));
        } catch {
          console.error("Settlement backfill failed; cursor retained");
        }
      }
      if (!stopping) await delay(1000);
    }
  } finally {
    finish();
  }
} catch {
  console.error(
    "Settlement worker startup failed: check explicit execution policy, database and RPC",
  );
  await db?.$disconnect().catch(() => {});
  process.exitCode = 1;
}
