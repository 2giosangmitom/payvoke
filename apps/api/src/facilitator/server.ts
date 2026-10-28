import closeWithGrace from "close-with-grace";
import { connectRedis, QueueJobs, throttled } from "@/core/queue";
import { errorTag } from "@/core/runtime";
import { createFacilitatorApp } from "./app";
import { loadFacilitatorConfig } from "./config";

let app: ReturnType<typeof createFacilitatorApp> | undefined;
try {
  const config = loadFacilitatorConfig();
  const onError = throttled(
    (error) => app?.log.warn({ error: errorTag(error) }, "Settlement wake-up failed"),
    errorTag,
  );
  const redis = await connectRedis(config.REDIS_URL, "producer", onError);
  const jobs = new QueueJobs(redis, onError);
  app = createFacilitatorApp(config, undefined, undefined, jobs);
  app.addHook("onClose", async () => {
    await jobs.close();
    redis.disconnect();
  });
  await app.listen({ host: config.HOST, port: config.PORT });
  const running = app;
  closeWithGrace(
    { logger: { error: () => running.log.error("Facilitator shutdown failed") } },
    async ({ err }) => {
      if (err) running.log.error("Facilitator closing after an unhandled error");
      await running.close();
    },
  );
} catch {
  await app?.close().catch(() => {});
  console.error("Facilitator startup failed: check configuration, database and RPC");
  process.exitCode = 1;
}
