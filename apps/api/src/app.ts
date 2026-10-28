import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { honoLogger } from "@logtape/hono";
import { createDatabase, type PrismaClient } from "#core/db";
import { createFacilitator, type Facilitator } from "#core/facilitator";
import { createStorage, type ObjectStorage } from "#core/storage";
import { deploymentConfig, type Config } from "./config";
import { createAppContainer } from "./container";
import type { AppEnv } from "./http/context";
import { logger } from "./logging";
import { errorHandler, notFound } from "./http/errors";
import { defaultBodyLimit, memoryRateStore, redisRateStore } from "./http/limits";
import { accessTokenRoutes } from "./modules/auth/access-token.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { originGuard } from "./modules/auth/guard";
import { catalogRoutes } from "./modules/catalog/catalog.routes";
import { fileRoutes } from "./modules/files/file.routes";
import { mcpRoutes } from "./modules/mcp/mcp.routes";
import { openuiRoutes } from "./modules/openui/openui.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { presaleRoutes } from "./modules/presale/presale.routes";
import { providerRoutes } from "./modules/provider/provider.routes";
import { quoteRoutes } from "./modules/quotes/quote.routes";
import { runRoutes } from "./modules/runs/runs.routes";
import { threadRoutes } from "./modules/threads/thread.routes";
import { memorySignals, type Signals } from "./signals";

// Every route, chained so the RPC client (`hc<AppType>`) sees their types.
export const routes = new Hono<AppEnv>()
  .route("/", authRoutes)
  .route("/", accessTokenRoutes)
  .route("/", quoteRoutes)
  .route("/", paymentRoutes)
  .route("/", providerRoutes)
  .route("/", catalogRoutes)
  .route("/", threadRoutes)
  .route("/", runRoutes)
  .route("/", openuiRoutes)
  .route("/", fileRoutes)
  .route("/", presaleRoutes);

export type AppType = typeof routes;

// The limit for a route that sets none; most set a tighter one.
const DEFAULT_BODY_LIMIT = 1048576;

// The server passes Redis-backed signals; tests default to in-process ones.
// Storage comes from the S3_* settings and the facilitator from the vault
// deployment settings, unless a test injects them.
export function createApp(
  config: Config,
  database?: PrismaClient,
  signals: Signals = memorySignals(),
  storage: ObjectStorage | null = createStorage(config),
  facilitator?: Facilitator | null,
) {
  const log = logger("api");
  const db = database ?? createDatabase(config.DATABASE_URL);
  const payments =
    facilitator !== undefined
      ? facilitator
      : config.PAYMENTS_ENABLED
        ? createFacilitator(
            { ...deploymentConfig(config), SETTLEMENT_ENABLED: config.SETTLEMENT_ENABLED },
            db,
            signals.jobs,
          )
        : null;
  // Limits are shared through Redis when given, so they hold across replicas.
  const rateStore = signals.redis ? redisRateStore(signals.redis) : memoryRateStore();
  const container = createAppContainer(config, db, log, signals, storage, payments, rateStore);
  const cradle = container.cradle;

  // MCP tools call back into this app, bound once it exists.
  let self: (request: Request) => Response | Promise<Response> = () => {
    throw new Error("App not ready");
  };
  const app = new Hono<AppEnv>()
    // One access record per request, with a request ID (x-request-id) that
    // every log record written while handling it carries. The path only:
    // query strings can carry bearer URLs or tokens.
    .use(
      honoLogger({
        category: ["payvoke", "http"],
        format: (c, responseTime) => ({
          method: c.req.method,
          // The message template reads `url`; it is the path here too.
          url: c.req.path,
          path: c.req.path,
          status: c.res.status,
          responseTime,
        }),
        // Expected failures (4xx) reach the error handler too; only 5xx is an error.
        completionLevel: (_c, { status }) => (status >= 500 ? "error" : "info"),
        context: true,
      }),
    )
    .use(async (c, next) => {
      c.set("cradle", cradle);
      c.set("account", null);
      await next();
    })
    .use(secureHeaders())
    .use(
      cors({
        origin: new URL(config.WEB_ORIGIN).origin,
        credentials: true,
        exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "Location"],
      }),
    )
    .use(defaultBodyLimit(DEFAULT_BODY_LIMIT))
    .use(originGuard(config.WEB_ORIGIN))
    .route("/", routes)
    // Outside `routes`: MCP is not part of the RPC client.
    .route("/", mcpRoutes((request) => self(request)));
  self = (request) => app.fetch(request);
  app.onError(errorHandler(log));
  app.notFound(notFound);

  let started: Promise<void> | undefined;
  return {
    hono: app,
    cradle,
    log,
    fetch: app.fetch,
    request: app.request,
    // Refuses to serve payments against a facilitator that does not settle
    // this scheme for the configured vault and approved policy.
    ready() {
      started ??= cradle.paymentGateway.verifyCapabilities();
      return started;
    },
    async close() {
      await container.dispose();
      await db.$disconnect();
    },
  };
}

export type App = ReturnType<typeof createApp>;
