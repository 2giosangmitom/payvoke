import "dotenv/config";
import closeWithGrace from "close-with-grace";
import type { FastifyBaseLogger } from "fastify";
import { errorTag } from "@payvoke/server";
import { throttled } from "@payvoke/queue";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { connectSignals } from "./signals";

try {
  const config = loadConfig();
  // Redis must be reachable at startup; later outages are logged and tolerated.
  // The logger exists only once the app does.
  const late: { log?: FastifyBaseLogger } = {};
  const signals = await connectSignals(
    config.REDIS_URL,
    throttled(
      (error) => late.log?.warn({ error: errorTag(error) }, "Redis signal failed"),
      errorTag,
    ),
  );
  const app = createApp(config, undefined, signals);
  late.log = app.log;
  app.addHook("onClose", () => signals.close());
  await app.listen({ host: config.HOST, port: config.PORT });

  closeWithGrace(
    { logger: { error: () => app.log.error("Graceful shutdown failed") } },
    async ({ signal, err }) => {
      if (err) app.log.error("Server closing after an unhandled error");
      else app.log.info({ signal }, "Server closing");
      await app.close();
    },
  );
} catch {
  // Startup errors can contain connection strings. Fail without printing secrets.
  console.error("Backend startup failed: check configuration and listen address");
  process.exitCode = 1;
}
