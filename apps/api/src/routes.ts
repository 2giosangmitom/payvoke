import { Hono } from "hono";
import type { AppEnv } from "./http/context";
import { accessTokenRoutes } from "./modules/auth/access-token.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { catalogRoutes } from "./modules/catalog/catalog.routes";
import { fileRoutes } from "./modules/files/file.routes";
import { openuiRoutes } from "./modules/openui/openui.routes";
import { grantRoutes } from "./modules/payments/grant.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { peopleRoutes } from "./modules/people/people.routes";
import { presaleRoutes } from "./modules/presale/presale.routes";
import { providerRoutes } from "./modules/provider/provider.routes";
import { quoteRoutes } from "./modules/quotes/quote.routes";
import { runRoutes } from "./modules/runs/runs.routes";
import { threadRoutes } from "./modules/threads/thread.routes";

// Every route, chained so the RPC client (`hc<AppType>`) sees their types.
// Kept apart from app.ts so the docs generator can read the routes without
// building the app.
export const routes = new Hono<AppEnv>()
  .route("/", authRoutes)
  .route("/", accessTokenRoutes)
  .route("/", quoteRoutes)
  .route("/", paymentRoutes)
  .route("/", grantRoutes)
  .route("/", providerRoutes)
  .route("/", catalogRoutes)
  .route("/", threadRoutes)
  .route("/", runRoutes)
  .route("/", openuiRoutes)
  .route("/", fileRoutes)
  .route("/", presaleRoutes)
  .route("/", peopleRoutes);

export type AppType = typeof routes;
