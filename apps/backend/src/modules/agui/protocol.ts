import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client";

export const A2UI_CATALOG = "https://payvoke.dev/a2ui/catalog/v1";
export const A2UI_VERSION = "v0.9.1";

export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const safeKey = (key: string) =>
  /^[A-Za-z0-9_-]{1,80}$/.test(key) && !["__proto__", "prototype", "constructor"].includes(key);
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
    value.name === "payvoke.a2ui" &&
    Object.keys(value).every((k) => ["type", "name", "value"].includes(k))
  ) {
    validateA2ui(value.value);
    return value;
  }
  throw new Error("INVALID_AGUI_EVENT");
}

export function validateA2ui(value: unknown): asserts value is Record<string, unknown> {
  if (!object(value) || value.version !== A2UI_VERSION) throw new Error("INVALID_A2UI");
  const actionKeys = Object.keys(value).filter((key) => key !== "version");
  if (actionKeys.length !== 1) throw new Error("INVALID_A2UI");
  const action = actionKeys[0];
  const payload = value[action];
  if (!object(payload) || !identifier(payload.surfaceId)) throw new Error("INVALID_A2UI");
  if (action === "createSurface") {
    if (
      payload.catalogId !== A2UI_CATALOG ||
      Object.keys(payload).some((k) => !["surfaceId", "catalogId"].includes(k))
    )
      throw new Error("UNKNOWN_A2UI_CATALOG");
    return;
  }
  if (action === "deleteSurface" && Object.keys(payload).length === 1) return;
  if (action === "updateDataModel") {
    if (
      typeof payload.path !== "string" ||
      payload.path.length > 100 ||
      !payload.path.startsWith("/") ||
      !payload.path.slice(1).split("/").every(safeKey) ||
      Object.keys(payload).some((k) => !["surfaceId", "path", "value"].includes(k))
    )
      throw new Error("INVALID_A2UI");
    safeData(payload.value);
    return;
  }
  if (
    action === "updateComponents" &&
    Array.isArray(payload.components) &&
    payload.components.length <= 50 &&
    Object.keys(payload).every((k) => ["surfaceId", "components"].includes(k))
  ) {
    for (const component of payload.components) {
      if (
        !object(component) ||
        !identifier(component.id) ||
        !["Text", "Card", "Table", "Metric", "Chart", "QuestionForm"].includes(
          String(component.component),
        )
      )
        throw new Error("UNKNOWN_A2UI_COMPONENT");
      // A2UI supports declarative parent/child composition. Child references
      // are IDs only; providers never supply a component implementation.
      for (const ref of [
        component.child,
        ...(Array.isArray(component.children) ? component.children : []),
      ]) {
        if (ref !== undefined && !identifier(ref)) throw new Error("INVALID_A2UI");
      }
      if (component.component === "QuestionForm" && !identifier(component.questionId))
        throw new Error("INVALID_A2UI");
      safeData(component);
    }
    return;
  }
  throw new Error("INVALID_A2UI");
}

// No markup, scripts, URL fetches or open-ended actions in provider-supplied UI.
function safeData(value: unknown, depth = 0): void {
  if (depth > 7) throw new Error("INVALID_A2UI");
  if (typeof value === "string") {
    if (value.length > 2000 || /<\/?[a-z][^>]*>|javascript:|data:|https?:\/\//i.test(value))
      throw new Error("UNSAFE_A2UI_VALUE");
    return;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (Array.isArray(value) && value.length <= 100) {
    for (const item of value) safeData(item, depth + 1);
    return;
  }
  if (object(value) && Object.keys(value).length <= 40) {
    for (const [key, item] of Object.entries(value)) {
      if (
        !safeKey(key) ||
        ["html", "script", "src", "href", "url", "onClick", "onLoad", "action"].includes(key)
      )
        throw new Error("UNSAFE_A2UI_VALUE");
      safeData(item, depth + 1);
    }
    return;
  }
  throw new Error("INVALID_A2UI");
}
