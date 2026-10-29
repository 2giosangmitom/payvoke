import { setTimeout as delay } from "node:timers/promises";
import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "#core/db";
import { pendingVerifications, verifyStructuredDelivery } from "#core/payments/delivery";
import { expireStaleUploads } from "#core/payments/files";
import { connectRedis, idleWorker, queues, QueueJobs, throttled, type InvocationJob } from "#core/queue";
import { errorTag } from "#core/runtime";
import type { ObjectStorage } from "#core/storage";
import type { Config } from "../config";
import { logger } from "../logging";

// Re-adds verification jobs whose producer crashed between commit and enqueue.
// A plain loop, not a BullMQ scheduler: it costs Redis commands only when a
// verification is actually pending.
const SWEEP_MS = 60000;

const log = logger("worker", "job");

// Keyless, idempotent jobs: host-side delivery verification (JSON and file
// results) and upload cleanup.
export async function startJobWorker(
  config: Config,
  db: PrismaClient,
  // Null when files are disabled: file results then stay unverified, so the
  // finance worker refunds them at the delivery deadline.
  storage: ObjectStorage | null,
) {
  const onError = throttled(
    (error) => log.error("Job worker Redis error ({error})", { error: errorTag(error) }),
    errorTag,
  );
  const consumer = await connectRedis(config.REDIS_URL, "consumer", onError);
  const producer = await connectRedis(config.REDIS_URL, "producer", onError);
  const jobs = new QueueJobs(producer, onError);

  const verifier = new Worker<Partial<InvocationJob>>(
    queues.delivery,
    async (job) => {
      // New evidence can release a hold once its review window ends.
      if (
        job.data.invocationId &&
        (await verifyStructuredDelivery(db, job.data.invocationId, storage))
      )
        await jobs.wakeFinance();
    },
    { connection: consumer, concurrency: 4, ...idleWorker },
  );
  verifier.on("failed", (_job, error) =>
    log.warn("Delivery verification failed; will retry ({error})", { error: errorTag(error) }),
  );
  verifier.on("error", onError);
  const delivery = new Queue(queues.delivery, { connection: producer });
  delivery.on("error", onError);
  // Drops the repeating job an earlier version registered.
  await delivery.removeJobScheduler("verify-sweep").catch(onError);

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
      await Promise.all([delivery.close(), jobs.close()]);
      consumer.disconnect();
      producer.disconnect();
    },
  };
}
