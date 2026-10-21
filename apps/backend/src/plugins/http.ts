import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config";
import { registerErrorHandler } from "../http/errors";

export async function registerHttp(app: FastifyInstance, config: Config) {
  registerErrorHandler(app);
  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await app.register(cookie);
  // MVP limits are process-local. No proxy headers are trusted by the app.
  await app.register(rateLimit, { global: false });
}
