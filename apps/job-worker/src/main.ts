import "dotenv/config";
import closeWithGrace from "close-with-grace";
import { Queue, Worker } from "bullmq";
import { createDatabase } from "@payvoke/db";
import { pendingVerifications, verifyStructuredDelivery } from "@payvoke/payments/delivery";
import { expireStaleUploads } from "@payvoke/payments/files";
import { connectRedis, queues, QueueJobs, throttled, type InvocationJob } from "@payvoke/queue";
import { errorTag } from "@payvoke/server";
import { createStorage } from "@payvoke/storage";
import { loadJobWorkerConfig } from "./config";

// Re-adds verification jobs whose producer crashed between commit and enqueue.
const SWEEP_MS = 60000;

let db: ReturnType<typeof createDatabase> | undefined;
try {
  const config = loadJobWorkerConfig();
  const onError = throttled(
    (error) => console.error(`Job worker Redis error (${errorTag(error)})`),
    errorTag,
  );
  const consumer = await connectRedis(config.REDIS_URL, "consumer", onError);
  const producer = await connectRedis(config.REDIS_URL, "producer", onError);
  db = createDatabase(config.DATABASE_URL);
  const database = db;
  // Null when files are disabled: file results then stay unverified, so the
  // finance worker refunds them at the delivery deadline.
  const storage = createStorage(config);
  const jobs = new QueueJobs(producer, onError);

  const verifier = new Worker<Partial<InvocationJob>>(
    queues.delivery,
    async (job) => {
      if (job.name === "sweep") {
        for (const { invocationId, artifactVersion } of await pendingVerifications(database))
          await jobs.verifyDelivery(invocationId, artifactVersion);
        if (storage) await expireStaleUploads(database, storage);
        return;
      }
      // New evidence can release a hold once its review window ends.
      if (
        job.data.invocationId &&
        (await verifyStructuredDelivery(database, job.data.invocationId, storage))
      )
        await jobs.wakeFinance();
    },
    { connection: consumer, concurrency: 4 },
  );
  verifier.on("failed", (_job, error) =>
    console.error(`Delivery verification failed (${errorTag(error)}); will retry`),
  );
  verifier.on("error", onError);
  const delivery = new Queue(queues.delivery, { connection: producer });
  delivery.on("error", onError);
  await delivery.upsertJobScheduler(
    "verify-sweep",
    { every: SWEEP_MS },
    { name: "sweep", opts: { removeOnComplete: true, removeOnFail: true } },
  );

  closeWithGrace(
    { delay: 30000, logger: { error: () => console.error("Job worker shutdown failed") } },
    async () => {
      await verifier.close();
      await Promise.all([delivery.close(), jobs.close()]);
      consumer.disconnect();
      producer.disconnect();
      await database.$disconnect();
    },
  );
} catch {
  console.error("Job worker startup failed: check database and Redis");
  await db?.$disconnect().catch(() => {});
  process.exitCode = 1;
}
