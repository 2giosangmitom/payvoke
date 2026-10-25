import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "@payvoke/db";
import { checkOpenUIPatch } from "../openui/validator";

export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// API keys are scoped to provider apps. Browser cookies cannot impersonate a worker.
export async function providerKey(
  app: FastifyInstance,
  db: PrismaClient,
  request: FastifyRequest,
  appId: string,
  scope: "events:read" | "events:ack" | "reports:write",
) {
  const match = /^Bearer (pvk_([a-f0-9]{16})\.[a-f0-9]{64})$/.exec(
    request.headers.authorization ?? "",
  );
  if (!match) throw app.httpErrors.unauthorized("INVALID_PROVIDER_KEY");
  const key = await db.appApiKey.findUnique({
    where: { prefix: match[2] },
    include: { app: true },
  });
  const left = Buffer.from(createHash("sha256").update(match[1]).digest("hex"), "hex");
  const right = Buffer.from(key?.secretHash ?? "0".repeat(64), "hex");
  if (
    !timingSafeEqual(left, right) ||
    !key ||
    key.appId !== appId ||
    key.app.status !== "ACTIVE" ||
    key.app.archivedAt ||
    key.revokedAt ||
    key.expiresAt <= new Date()
  )
    throw app.httpErrors.unauthorized("INVALID_PROVIDER_KEY");
  if (!key.scopes.includes(scope)) throw app.httpErrors.forbidden("INSUFFICIENT_SCOPE");
}

export function validateEvent(value: unknown): Record<string, unknown> {
  if (!object(value)) throw new Error("INVALID_AGUI_EVENT");
  const { type, messageId } = value;
  if (
    type === "TEXT_MESSAGE_START" &&
    identifier(messageId) &&
    value.role === "assistant" &&
    Object.keys(value).every((k) => ["type", "messageId", "role"].includes(k))
  )
    return value;
  if (
    type === "TEXT_MESSAGE_CONTENT" &&
    identifier(messageId) &&
    typeof value.delta === "string" &&
    value.delta.length > 0 &&
    value.delta.length <= 4096 &&
    Object.keys(value).every((k) => ["type", "messageId", "delta"].includes(k))
  )
    return value;
  if (
    type === "TEXT_MESSAGE_END" &&
    identifier(messageId) &&
    Object.keys(value).every((k) => ["type", "messageId"].includes(k))
  )
    return value;
  if (
    type === "CUSTOM" &&
    value.name === "payvoke.openui" &&
    Object.keys(value).every((k) => ["type", "name", "value"].includes(k))
  ) {
    validateOpenUI(value.value);
    return value;
  }
  throw new Error("INVALID_AGUI_EVENT");
}

// One OpenUI Lang patch for one surface. Stateless checks only; the gateway
// validates the patch against the accumulated program inside the commit.
export function validateOpenUI(
  value: unknown,
): asserts value is { surfaceId: string; source: string } {
  if (
    !object(value) ||
    !identifier(value.surfaceId) ||
    Object.keys(value).some((k) => !["surfaceId", "source"].includes(k))
  )
    throw new Error("INVALID_OPENUI");
  checkOpenUIPatch(value.source);
}
