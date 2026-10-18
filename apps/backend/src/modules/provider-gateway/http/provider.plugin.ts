import { randomUUID } from "node:crypto";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { ApiErrorSchema } from "../../identity/http/identity.schemas.js";
import { principalOf, requireAuth } from "../../identity/http/require-auth.js";
import { digest, ProviderError, type GatewayPrincipal } from "../domain/provider.js";
import { MikroOrmProviderRepository } from "../infrastructure/mikro-orm-provider.repository.js";
import {
  ApplicationParams,
  ApplicationView,
  Commands,
  GatewayFrame,
  InvocationParams,
  InvocationView,
  KeyParams,
  KeyView,
  RevisionView,
  Scope,
  Uuid,
  ConversationCommandView,
} from "./provider.schemas.js";

const security = [{ bearer: [] }];
const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  429: ApiErrorSchema,
};
const applicationView = (value: import("../domain/provider.js").ProviderApplication) => ({
  id: value.id,
  name: value.name,
  currentRevisionId: value.currentRevisionId,
  createdAt: value.createdAt.toISOString(),
  gatewayConnected:
    !!value.sessionId && !!value.sessionExpiresAt && value.sessionExpiresAt > new Date(),
});
const keyView = (value: import("../domain/provider.js").ProviderApiKey) => ({
  id: value.id,
  label: value.label,
  prefix: value.prefix,
  scopes: value.scopes,
  expiresAt: value.expiresAt.toISOString(),
  revokedAt: value.revokedAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
});
const revisionView = (value: import("../domain/provider.js").CommandRevision) => ({
  id: value.id,
  digest: value.digest,
  commands: value.commands,
  createdAt: value.createdAt.toISOString(),
});
const invocationView = (value: import("../domain/provider.js").CommandInvocation) => ({
  id: value.id,
  applicationId: value.applicationId,
  conversationId: value.conversationId,
  listingVersionId: value.listingVersionId,
  revisionId: value.revisionId,
  command: value.command,
  input: value.input,
  state: value.state,
  progress: value.progress,
  result: value.result,
  deadlineAt: value.deadlineAt.toISOString(),
  createdAt: value.createdAt.toISOString(),
  developmentOnly: true as const,
});
function bearer(authorization: string | undefined) {
  if (
    !authorization ||
    authorization.length > 256 ||
    !/^Bearer ane_[A-Za-z0-9_-]{43}$/.test(authorization)
  )
    throw new ProviderError("INVALID_KEY", "A provider API key is required.");
  return authorization.slice(7);
}

export const providerRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.get(
    "/v1/conversations/:id/commands",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: Type.Object({ id: Uuid }),
        response: { 200: Type.Array(ConversationCommandView), ...errors },
      },
    },
    async (req) =>
      req.diScope
        .resolve("providerService")
        .conversationCommands(principalOf(req).accountId, req.params.id),
  );
  app.get(
    "/v1/conversations/:id/command-invocations",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: Type.Object({ id: Uuid }),
        response: { 200: Type.Array(InvocationView), ...errors },
      },
    },
    async (req) =>
      (
        await req.diScope
          .resolve("providerService")
          .conversationInvocations(principalOf(req).accountId, req.params.id)
      ).map(invocationView),
  );
  app.post(
    "/v1/conversations/:id/command-invocations",
    {
      preHandler: requireAuth,
      bodyLimit: 65536,
      schema: {
        security,
        params: Type.Object({ id: Uuid }),
        body: Type.Object(
          {
            id: Uuid,
            listingId: Uuid,
            versionId: Uuid,
            command: Type.String({ maxLength: 32 }),
            input: Type.Record(Type.String(), Type.String({ maxLength: 8000 }), {
              maxProperties: 10,
            }),
            confirmModelExpense: Type.Literal(true),
          },
          { additionalProperties: false },
        ),
        response: { 200: InvocationView, ...errors },
      },
    },
    async (req) =>
      invocationView(
        await req.diScope
          .resolve("providerService")
          .invokeConversation(
            principalOf(req).accountId,
            req.params.id,
            req.body.id,
            req.body.listingId,
            req.body.versionId,
            req.body.command,
            req.body.input,
          ),
      ),
  );
  app.get(
    "/v1/provider/applications/:applicationId/dev-invocations",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: ApplicationParams,
        querystring: Type.Object({
          offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
        }),
        response: { 200: Type.Array(InvocationView), ...errors },
      },
    },
    async (req) =>
      (
        await req.diScope
          .resolve("providerService")
          .invocations(principalOf(req).accountId, req.params.applicationId, req.query.offset ?? 0)
      ).map(invocationView),
  );
  app.post(
    "/v1/provider/applications",
    {
      preHandler: requireAuth,
      schema: {
        security,
        body: Type.Object(
          { id: Uuid, name: Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }) },
          { additionalProperties: false },
        ),
        response: { 200: ApplicationView, ...errors },
      },
    },
    async (req) =>
      applicationView(
        await req.diScope
          .resolve("providerService")
          .createApplication(principalOf(req).accountId, req.body.id, req.body.name),
      ),
  );
  app.get(
    "/v1/provider/applications",
    {
      preHandler: requireAuth,
      schema: { security, response: { 200: Type.Array(ApplicationView), ...errors } },
    },
    async (req) =>
      (await req.diScope.resolve("providerService").applications(principalOf(req).accountId)).map(
        applicationView,
      ),
  );
  app.post(
    "/v1/provider/applications/:applicationId/keys",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: ApplicationParams,
        body: Type.Object(
          {
            label: Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
            scopes: Type.Array(Scope, { minItems: 1, maxItems: 2, uniqueItems: true }),
          },
          { additionalProperties: false },
        ),
        response: { 200: Type.Object({ key: KeyView, secret: Type.String() }), ...errors },
      },
    },
    async (req) => {
      const result = await req.diScope
        .resolve("providerService")
        .createKey(
          principalOf(req).accountId,
          req.params.applicationId,
          req.body.label,
          req.body.scopes,
        );
      return { key: keyView(result.key), secret: result.secret };
    },
  );
  app.get(
    "/v1/provider/applications/:applicationId/keys",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: ApplicationParams,
        response: { 200: Type.Array(KeyView), ...errors },
      },
    },
    async (req) =>
      (
        await req.diScope
          .resolve("providerService")
          .keys(principalOf(req).accountId, req.params.applicationId)
      ).map(keyView),
  );
  app.delete(
    "/v1/provider/applications/:applicationId/keys/:keyId",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: KeyParams,
        response: { 200: Type.Object({ revoked: Type.Literal(true) }), ...errors },
      },
    },
    async (req) => {
      await req.diScope
        .resolve("providerService")
        .revokeKey(principalOf(req).accountId, req.params.applicationId, req.params.keyId);
      return { revoked: true as const };
    },
  );
  app.get(
    "/v1/provider/applications/:applicationId/commands",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: ApplicationParams,
        response: { 200: Type.Union([RevisionView, Type.Null()]), ...errors },
      },
    },
    async (req) => {
      const revision = await req.diScope
        .resolve("providerService")
        .commands(principalOf(req).accountId, req.params.applicationId);
      return revision ? revisionView(revision) : null;
    },
  );
  app.put(
    "/v1/provider/applications/:applicationId/commands",
    {
      bodyLimit: 65536,
      schema: {
        security,
        params: ApplicationParams,
        body: Type.Object({ commands: Commands }, { additionalProperties: false }),
        response: { 200: RevisionView, ...errors },
      },
    },
    async (req) => {
      const service = req.diScope.resolve("providerService");
      const principal = await service.authenticate(
        bearer(req.headers.authorization),
        "commands:write",
      );
      if (principal.applicationId !== req.params.applicationId)
        throw new ProviderError("NOT_FOUND", "Application not found.");
      return revisionView(await service.register(principal, req.body.commands));
    },
  );
  // Owner-only sandbox. Does not create an order, grant spending authority or enable catalog execution.
  app.post(
    "/v1/provider/applications/:applicationId/dev-invocations",
    {
      preHandler: requireAuth,
      bodyLimit: 65536,
      schema: {
        security,
        params: ApplicationParams,
        body: Type.Object(
          {
            id: Uuid,
            revisionId: Uuid,
            command: Type.String({ maxLength: 32 }),
            input: Type.Record(Type.String(), Type.String({ maxLength: 8000 }), {
              maxProperties: 10,
            }),
          },
          { additionalProperties: false },
        ),
        response: { 200: InvocationView, ...errors },
      },
    },
    async (req) =>
      invocationView(
        await req.diScope
          .resolve("providerService")
          .invoke(
            principalOf(req).accountId,
            req.params.applicationId,
            req.body.id,
            req.body.revisionId,
            req.body.command,
            req.body.input,
          ),
      ),
  );
  app.get(
    "/v1/provider/applications/:applicationId/dev-invocations/:invocationId",
    {
      preHandler: requireAuth,
      schema: { security, params: InvocationParams, response: { 200: InvocationView, ...errors } },
    },
    async (req) =>
      invocationView(
        await req.diScope
          .resolve("providerService")
          .invocation(
            principalOf(req).accountId,
            req.params.applicationId,
            req.params.invocationId,
          ),
      ),
  );

  app.get(
    "/v1/provider/gateway",
    {
      websocket: true,
      schema: { hide: true }, // WebSocket frames are documented separately, not as a REST operation.
      preValidation: async (req) => {
        // Non-browser SDK endpoint: never accept ambient browser credentials or query-string keys.
        if (req.headers.origin || Object.keys(req.query as object).length)
          throw new ProviderError("FORBIDDEN", "Use a server SDK and an Authorization header.");
        await req.diScope
          .resolve("providerService")
          .authenticate(bearer(req.headers.authorization), "gateway:connect");
      },
    },
    (socket, req) => {
      const sessionId = randomUUID();
      let principal: GatewayPrincipal | undefined;
      let executorId: string | undefined;
      let sentId: string | undefined;
      let closed = false;
      let busy = false;
      let pending = 0;
      let lastPong = Date.now();
      const identifyDeadline = Date.now() + 10_000;
      let serial: Promise<void> = Promise.resolve();
      const repository = () =>
        new MikroOrmProviderRepository(app.diContainer.resolve("orm").em.fork());
      const send = (frame: unknown) => {
        if (closed || socket.readyState !== socket.OPEN) return;
        if (socket.bufferedAmount > 65536) {
          socket.close(1013, "Slow consumer");
          return;
        }
        socket.send(JSON.stringify(frame));
      };
      const fail = (error: unknown) => {
        send({
          type: "error",
          code: error instanceof ProviderError ? error.code : "INTERNAL_ERROR",
          message: error instanceof ProviderError ? error.message : "Gateway unavailable.",
        });
        socket.close(
          !(error instanceof ProviderError)
            ? 1011
            : error.code === "GATEWAY_BUSY"
              ? 4429
              : error instanceof ProviderError && error.code === "SESSION_EXPIRED"
                ? 4408
                : error instanceof ProviderError && error.code === "INVALID_KEY"
                  ? 4401
                  : 4409,
          "Reconnect after resolving the error",
        );
      };
      const pump = async () => {
        if (closed || busy || !principal || !executorId) return;
        busy = true;
        try {
          const next = await repository().next(principal, sessionId, executorId);
          if (next && next.invocation.id !== sentId) {
            sentId = next.invocation.id;
            send({
              type: "command.invoked",
              eventId: next.invocation.id,
              invocation: invocationView(next.invocation),
              definition: next.definition,
            });
          }
        } finally {
          busy = false;
        }
      };
      const timer = setInterval(() => {
        if ((!executorId && Date.now() > identifyDeadline) || Date.now() - lastPong > 30_000) {
          socket.close(4408, "Identify or heartbeat timeout");
          return;
        }
        socket.ping();
        void pump().catch(fail);
      }, 1000);
      timer.unref();
      socket.on("pong", () => {
        lastPong = Date.now();
      });
      socket.on("error", () => {
        socket.close();
      });
      socket.on("close", () => {
        closed = true;
        clearInterval(timer);
        void serial
          .finally(async () => {
            if (principal) await repository().disconnect(principal.applicationId, sessionId);
          })
          .catch(() => {});
      });
      socket.on("message", (raw) => {
        if (++pending > 16) {
          socket.close(1008, "Too many pending frames");
          return;
        }
        serial = serial
          .then(async () => {
            if (closed) return;
            let frame: unknown;
            try {
              frame = JSON.parse(raw.toString());
            } catch {
              throw new ProviderError("INVALID_INPUT", "Invalid JSON frame.");
            }
            if (!Check(GatewayFrame, frame))
              throw new ProviderError("INVALID_INPUT", "Invalid Gateway frame.");
            if (frame.type === "identify") {
              if (executorId) throw new ProviderError("CONFLICT", "Already identified.");
              principal = await repository().authenticate(
                digest(bearer(req.headers.authorization)),
                "gateway:connect",
              );
              await repository().connect(principal, sessionId);
              executorId = frame.executorId;
              send({ type: "ready", protocol: "provider-gateway-v1", sessionId, capacity: 1 });
              await pump();
            } else {
              if (!principal || !executorId)
                throw new ProviderError("FORBIDDEN", "Identify before sending events.");
              if (
                frame.type !== "accepted" &&
                (typeof frame.text !== "string" ||
                  frame.text.length === 0 ||
                  (frame.type === "progress" && frame.text.length > 2000))
              )
                throw new ProviderError("INVALID_INPUT", "A bounded text value is required.");
              await repository().receive(
                principal,
                sessionId,
                executorId,
                frame.invocationId,
                frame.type,
                frame.text,
              );
              send({ type: "ack", requestId: frame.requestId, invocationId: frame.invocationId });
              await pump();
            }
          })
          .catch(fail)
          .finally(() => {
            pending--;
          });
      });
      send({
        type: "hello",
        protocol: "provider-gateway-v1",
        heartbeatIntervalMs: 1000,
        identifyTimeoutMs: 10000,
      });
    },
  );
};
