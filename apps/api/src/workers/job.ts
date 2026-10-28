import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "#core/db";
import { pendingVerifications, verifyStructuredDelivery } from "#core/payments/delivery";
import { expireStaleUploads } from "#core/payments/files";
import { connectRedis, queues, QueueJobs, throttled, type InvocationJob } from "#core/queue";
import { errorTag } from "#core/runtime";
import type { ObjectStorage } from "#core/storage";
import type { Config } from "../config";
import type { Logger } from "../http/context";

// Re-adds verification jobs whose producer crashed between commit and enqueue.
const SWEEP_MS = 60000;

// Keyless, idempotent jobs: host-side delivery verification (JSON and file
// results) and upload cleanup.
export async function startJobWorker(
  config: Config,
  db: PrismaClient,
  // Null when files are disabled: file results then stay unverified, so the
  // finance worker refunds them at the delivery deadline.
  storage: ObjectStorage | null,
  log: Logger,
) {
  const onError = throttled(
    (error) => log.error({ error: errorTag(error) }, "Job worker Redis error"),
    errorTag,
  );
  const consumer = await connectRedis(config.REDIS_URL, "consumer", onError);
  const producer = await connectRedis(config.REDIS_URL, "producer", onError);
  const jobs = new QueueJobs(producer, onError);

  const verifier = new Worker<Partial<InvocationJob>>(
    queues.delivery,
    async (job) => {
      if (job.name === "sweep") {
        for (const { invocationId, artifactVersion } of await pendingVerifications(db))
          await jobs.verifyDelivery(invocationId, artifactVersion);
        if (storage) await expireStaleUploads(db, storage);
        return;
      }
      // New evidence can release a hold once its review window ends.
      if (
        job.data.invocationId &&
        (await verifyStructuredDelivery(db, job.data.invocationId, storage))
      )
        await jobs.wakeFinance();
    },
    { connection: consumer, concurrency: 4 },
  );
  verifier.on("failed", (_job, error) =>
    log.warn({ error: errorTag(error) }, "Delivery verification failed; will retry"),
  );
  verifier.on("error", onError);
  const delivery = new Queue(queues.delivery, { connection: producer });
  delivery.on("error", onError);
  await delivery.upsertJobScheduler(
    "verify-sweep",
    { every: SWEEP_MS },
    { name: "sweep", opts: { removeOnComplete: true, removeOnFail: true } },
  );

  return {
    async close() {
      await verifier.close();
      await Promise.all([delivery.close(), jobs.close()]);
      consumer.disconnect();
      producer.disconnect();
    },
  };
}
