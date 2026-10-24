import fastify, { LogController } from "fastify";
import fp from "fastify-plugin";
import { type Config, logRedaction } from "./config";
import { createDatabase } from "./database/client";
import { registerAuth } from "./modules/auth";
import { registerQuotes } from "./modules/quotes";
import { registerPaymentStatus } from "./modules/payments";
import { registerProvider } from "./modules/provider";
import { registerCatalog } from "./modules/catalog";
import { registerAgui } from "./modules/agui";
import { registerHttp } from "./plugins/http";
import type { PrismaClient } from "./generated/prisma/client";

export function createApp(config: Config, database?: PrismaClient) {
  if (
    config.PAYMENTS_ENABLED &&
    (!config.FACILITATOR_URL || !config.FACILITATOR_TOKEN || !config.VAULT_ADDRESS)
  )
    throw new Error("Payments require explicit private facilitator configuration");
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
      await registerProvider(instance, db);
      await registerCatalog(instance, db);
      await registerAgui(instance, db, config.AGUI_CURSOR_RETENTION_SECONDS);
    }),
  );
  return app;
}
