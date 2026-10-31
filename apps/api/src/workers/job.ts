import { setTimeout as delay } from "node:timers/promises";
import type { PrismaClient } from "#core/db";
import { pendingVerifications, verifyStructuredDelivery } from "#core/payments/delivery";
import { expireStaleUploads } from "#core/payments/files";
import { errorTag } from "#core/runtime";
import type { ObjectStorage } from "#core/storage";
import { logger } from "../logging";
import type { WorkerSignals } from "../signals";

// Re-adds verification jobs whose producer crashed between commit and enqueue,
// or whose wake-up Redis lost. It costs Redis commands only when a
// verification is actually pending.
const SWEEP_MS = 60000;

const log = logger("worker", "job");

// Keyless, idempotent jobs: host-side delivery verification (JSON and file
// results) and upload cleanup.
export async function startJobWorker(
  db: PrismaClient,
  // Null when files are disabled: file results then stay unverified, so the
  // finance worker refunds them at the delivery deadline.
  storage: ObjectStorage | null,
  { bus, jobs }: WorkerSignals,
) {
  const verifier = await bus.consume(
    "delivery",
    async (job) => {
      // New evidence can release a hold once its review window ends.
      if (job.kind === "verify" && (await verifyStructuredDelivery(db, job.invocationId, storage)))
        await jobs.wakeFinance();
    },
    {
      concurrency: 4,
      onFailed: (error) =>
        log.warn("Delivery verification failed; the sweep retries ({error})", {
          error: errorTag(error),
        }),
    },
  );

  let stopping = false;
  const loop = (async () => {
    while (!stopping) {
      try {
        for (const { invocationId, artifactVersion } of await pendingVerifications(db))
          await jobs.verifyDelivery(invocationId, artifactVersion);
        if (storage) await expireStaleUploads(db, storage);
      } catch (error) {
        log.warn("Verification sweep failed; will retry ({error})", { error: errorTag(error) });
      }
      if (!stopping) await delay(SWEEP_MS);
    }
  })();

  return {
    async close() {
      stopping = true;
      await verifier.close();
      await loop;
    },
  };
}
