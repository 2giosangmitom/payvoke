import fastify, { LogController } from "fastify";
import fp from "fastify-plugin";
import { fastifyAwilixPlugin } from "@fastify/awilix";
import { logRedaction } from "@payvoke/server";
import { createDatabase, type PrismaClient } from "@payvoke/db";
import type { Config } from "./config";
import { createAppContainer } from "./container";
import { registerHttp } from "./plugins/http";
import { authGuard } from "./modules/auth/guard";
import { authRoutes } from "./modules/auth/auth.routes";
import { catalogRoutes } from "./modules/catalog/catalog.routes";
import { quoteRoutes } from "./modules/quotes/quote.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { providerRoutes } from "./modules/provider/provider.routes";
import { openuiRoutes } from "./modules/openui/openui.routes";
import { runRoutes } from "./modules/runs/runs.routes";
import { threadRoutes } from "./modules/threads/thread.routes";

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
      // Services are app-scoped singletons; no per-request scope is disposed.
      await instance.register(fastifyAwilixPlugin, {
        container: createAppContainer(config, db, app.log),
        disposeOnClose: true,
        disposeOnResponse: false,
        strictBooleanEnforced: true,
      });
      await registerHttp(instance, config);
      await instance.register(authGuard);
      await instance.register(authRoutes);
      await instance.register(quoteRoutes);
      await instance.register(paymentRoutes);
      await instance.register(providerRoutes);
      await instance.register(catalogRoutes);
      await instance.register(threadRoutes);
      await instance.register(runRoutes);
      await instance.register(openuiRoutes);
    }),
  );
  return app;
}
