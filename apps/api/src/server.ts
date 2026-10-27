import "dotenv/config";
import closeWithGrace from "close-with-grace";
import type { FastifyBaseLogger } from "fastify";
import { errorTag } from "@payvoke/server";
import { throttled } from "@payvoke/queue";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { connectSignals } from "./signals";

let app: ReturnType<typeof createApp> | undefined;
let signals: Awaited<ReturnType<typeof connectSignals>> | undefined;
try {
  const config = loadConfig();
  // Redis must be reachable at startup; later outages are logged and tolerated.
  // The logger exists only once the app does.
  const late: { log?: FastifyBaseLogger } = {};
  signals = await connectSignals(
    config.REDIS_URL,
    throttled(
      (error) => late.log?.warn({ error: errorTag(error) }, "Redis signal failed"),
      errorTag,
    ),
  );
  const opened = signals;
  app = createApp(config, undefined, opened);
  late.log = app.log;
  app.addHook("onClose", () => opened.close());
  await app.listen({ host: config.HOST, port: config.PORT });
  const running = app;

  closeWithGrace(
    { logger: { error: () => running.log.error("Graceful shutdown failed") } },
    async ({ signal, err }) => {
      if (err) running.log.error("Server closing after an unhandled error");
      else running.log.info({ signal }, "Server closing");
      await running.close();
    },
  );
} catch {
  // Release Redis and the app so the process exits and a supervisor can retry.
  if (app) await app.close().catch(() => {});
  else await signals?.close().catch(() => {});
  // Startup errors can contain connection strings. Fail without printing secrets.
  console.error("Backend startup failed: check configuration and listen address");
  process.exitCode = 1;
}
