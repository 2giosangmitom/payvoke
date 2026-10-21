import fastify, { LogController } from "fastify";
import fp from "fastify-plugin";
import { type Config, logRedaction } from "./config";
import { createDatabase } from "./database/client";
import { registerAuth } from "./modules/auth";
import { registerQuotes } from "./modules/quotes";
import { registerPaymentStatus } from "./modules/payments";
import { registerHttp } from "./plugins/http";
import type { PrismaClient } from "./generated/prisma/client";

export function createApp(config: Config, database?: PrismaClient) {
  // No path may enable real spending before durable settlement/finality ships.
  if (config.PAYMENTS_ENABLED)
    throw new Error("Settlement worker is not implemented; payments must remain disabled");
  const app = fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    logger: { level: config.LOG_LEVEL, redact: logRedaction },
    // Do not log raw URLs/query strings, which can contain bearer URLs/tokens.
    logController: new LogController({ disableRequestLogging: true }),
  });
  const db = database ?? createDatabase(config.DATABASE_URL);
  app.addHook("onClose", async () => {
    await db.$disconnect();
  });
  app.register(
    fp(async (instance) => {
      await registerHttp(instance, config);
      await registerAuth(instance, config, db);
      await instance.register(async (scope) => registerQuotes(scope, config, db));
      await registerPaymentStatus(instance, db);
    }),
  );
  return app;
}
