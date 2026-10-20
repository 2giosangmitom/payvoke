import fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import { type Config, logRedaction } from "./config";

export function createApp(config: Config) {
  const app = fastify({
    logger: { level: config.LOG_LEVEL, redact: logRedaction },
    // Do not log raw URLs/query strings, which can contain bearer URLs/tokens.
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  return app;
}
