import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SettlementChain } from "@payvoke/shared/x402/settlement";
import type { PrismaClient } from "#core/db";
import { FinanceService } from "#core/payments/finance";
import { AutoFinance } from "#core/payments/finance-policy";
import { validateGasPolicy } from "#core/payments/worker";
import { serial } from "#core/queue";
import { errorTag, vaultDeployment } from "#core/runtime";
import { deploymentConfig, gasBudget, type Config } from "../config";
import { logger } from "../logging";
import type { WorkerSignals } from "../signals";

// Jobs wake finance on new evidence, failed runs and hold deadlines; the sweep
// only backs up wake-ups Redis lost.
const SWEEP_MS = 30000;

const log = logger("worker", "finance");

// Automatic refunds of undelivered, failed or late invocations and releases of
// verified deliveries after the review window.
export async function startFinanceWorker(config: Config, db: PrismaClient, { bus }: WorkerSignals) {
  const budget = gasBudget(config, "FINANCE");
  validateGasPolicy(budget);
  const deployment = vaultDeployment(deploymentConfig(config));
  const key = (value = "") => {
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
  const auto = new AutoFinance(
    new FinanceService(db, chain, executor.address, budget),
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
  const waker = await bus.consume("finance", () => cycle(), {
    concurrency: 1,
    onFailed: (error) =>
      log.error("Finance job failed; durable state retained ({error})", { error: errorTag(error) }),
  });
  const loop = (async () => {
    while (!stopping) {
      try {
        await cycle();
      } catch (error) {
        log.error("Finance tick failed; durable state retained ({error})", {
          error: errorTag(error),
        });
      }
      if (!stopping) await delay(SWEEP_MS);
    }
  })();

  return {
    async close() {
      stopping = true;
      await waker.close();
      await loop;
    },
  };
}
