import type { PrismaClient } from "#core/db";
import type { ObjectStorage } from "#core/storage";
import type { Config } from "../config";
import { startFinanceWorker } from "./finance";
import { startJobWorker } from "./job";
import { startSettlementWorker } from "./settlement";

type Running = { close(): Promise<void> };

// Starts the workers the configuration enables. A worker that is enabled but
// misconfigured fails startup; one that is disabled is never constructed, so
// its keys are never read.
export async function startWorkers(
  config: Config,
  db: PrismaClient,
  storage: ObjectStorage | null,
) {
  const running: Running[] = [];
  const close = async () => {
    // Settlement and finance may be mid-transaction; each waits for its lane.
    await Promise.all(running.map((worker) => worker.close()));
  };
  try {
    if (config.JOB_WORKER_ENABLED) running.push(await startJobWorker(config, db, storage));
    if (config.SETTLEMENT_WORKER_ENABLED) running.push(await startSettlementWorker(config, db));
    if (config.FINANCE_WORKER_ENABLED) running.push(await startFinanceWorker(config, db));
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
  return { close };
}
