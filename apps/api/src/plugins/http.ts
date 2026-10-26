import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { FastifyInstance } from "fastify";
import type { Redis } from "@payvoke/queue";
import type { Config } from "../config";
import { registerErrorHandler } from "../http/errors";

export async function registerHttp(app: FastifyInstance, config: Config, redis?: Redis) {
  registerErrorHandler(app);
  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "Location"],
  });
  await app.register(cookie);
  // Limits are shared through Redis when given, so they hold across API
  // replicas; a Redis error lets the request through rather than failing it.
  // No proxy headers are trusted by the app.
  await app.register(rateLimit, {
    global: false,
    ...(redis ? { redis, nameSpace: "payvoke-rl:", skipOnError: true } : {}),
  });
}
