import closeWithGrace from "close-with-grace";
import { errorTag } from "#core/runtime";
import { throttled } from "#core/queue";
import { createApp, type App } from "./app";
import { loadConfig } from "./config";
import { configureLogging, logger } from "./logging";
import { connectSignals } from "./signals";
import { startWorkers } from "./workers";

const log = logger("server");

// SSE streams send a keep-alive every 15 seconds; idle sockets close after 120.
const IDLE_TIMEOUT_SECONDS = 120;

let app: App | undefined;
let signals: Awaited<ReturnType<typeof connectSignals>> | undefined;
let workers: Awaited<ReturnType<typeof startWorkers>> | undefined;
try {
  const config = loadConfig();
  await configureLogging(config.LOG_LEVEL);
  // Redis must be reachable at startup; later outages are logged and tolerated.
  signals = await connectSignals(
    config.REDIS_URL,
    throttled(
      (error) => log.warn("Redis signal failed ({error})", { error: errorTag(error) }),
      errorTag,
    ),
  );
  app = createApp(config, undefined, signals);
  await app.ready();
  const running = app;
  workers = await startWorkers(config, running.cradle.db, running.cradle.storage);
  const server = Bun.serve({
    hostname: config.HOST,
    port: config.PORT,
    idleTimeout: IDLE_TIMEOUT_SECONDS,
    fetch: running.fetch,
  });
  log.info("Server listening on {url}", { url: server.url.href });

  const opened = { signals, workers };
  closeWithGrace(
    // Settlement and finance finish an in-flight transaction before exiting.
    { delay: 150000, logger: { error: () => log.error("Graceful shutdown failed") } },
    async ({ signal, err }) => {
      if (err) log.error("Server closing after an unhandled error");
      else log.info("Server closing on {signal}", { signal });
      await server.stop();
      await opened.workers.close();
      await running.close();
      await opened.signals.close();
    },
  );
} catch {
  // Release workers, Redis and the app so the process exits and a supervisor
  // can retry. Startup errors can contain connection strings: print no detail.
  await workers?.close().catch(() => {});
  await app?.close().catch(() => {});
  await signals?.close().catch(() => {});
  console.error("Backend startup failed: check configuration, database, RPC and Redis");
  process.exitCode = 1;
}
