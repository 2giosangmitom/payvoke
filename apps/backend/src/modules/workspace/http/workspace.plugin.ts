import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { EventEncoder } from "@ag-ui/encoder";
import type { BaseEvent } from "@ag-ui/core";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import type { WorkspaceResult, ConversationTurn } from "../domain/conversation.js";
import { ApiHttpError } from "../../identity/http/identity-http.js";
import { ApiErrorSchema } from "../../identity/http/identity.schemas.js";
import { principalOf, requireAuth } from "../../identity/http/require-auth.js";
import { toAgUiEvent, toAgUiMessages } from "./ag-ui.js";
import {
  AgentInput,
  BriefSchema,
  ConversationView,
  CreateSchema,
  HistoryView,
  IdParams,
  Pagination,
  WorkspaceView,
} from "./workspace.schemas.js";

const security = [{ bearer: [] }];
const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  429: ApiErrorSchema,
};
function view<T extends { createdAt: Date }>(entity: T) {
  return { ...entity, createdAt: entity.createdAt.toISOString() };
}
function value<T>(result: WorkspaceResult<T>): T {
  if (result.isErr()) {
    const status = { NOT_FOUND: 404, CONFLICT: 409, LIMIT_REACHED: 429, INVALID_INPUT: 400 }[
      result.error.code
    ];
    throw new ApiHttpError({ code: result.error.code, message: result.error.message }, status);
  }
  return result.value;
}

const encoder = new EventEncoder({ accept: "text/event-stream" });
function* frames(turn: ConversationTurn, conversationId: string, after: number): Generator<string> {
  for (let index = after; index < turn.events.length; index++) {
    yield `id: ${index + 1}\n${encoder.encode(toAgUiEvent(turn.events[index]!, conversationId, turn.runId))}`;
  }
}

export const workspaceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    "/v1/workspaces",
    {
      preHandler: requireAuth,
      schema: {
        security,
        querystring: Pagination,
        response: { 200: Type.Array(WorkspaceView), ...errors },
      },
    },
    async (req) =>
      (
        await req.diScope
          .resolve("workspaceService")
          .list(principalOf(req).accountId, req.query.offset)
      ).map(view),
  );

  app.post(
    "/v1/workspaces",
    {
      preHandler: requireAuth,
      schema: {
        security,
        body: CreateSchema,
        response: { 200: WorkspaceView, ...errors },
      },
    },
    async (req) =>
      view(
        value(
          await req.diScope
            .resolve("workspaceService")
            .create(principalOf(req).accountId, req.body.id, req.body.title),
        ),
      ),
  );

  app.patch(
    "/v1/workspaces/:id/brief",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: IdParams,
        body: BriefSchema,
        response: { 200: WorkspaceView, ...errors },
      },
    },
    async (req) =>
      view(
        value(
          await req.diScope
            .resolve("workspaceService")
            .updateBrief(
              principalOf(req).accountId,
              req.params.id,
              req.body.brief,
              req.body.revision,
            ),
        ),
      ),
  );

  app.get(
    "/v1/workspaces/:id/conversations",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: IdParams,
        querystring: Pagination,
        response: { 200: Type.Array(ConversationView), ...errors },
      },
    },
    async (req) =>
      value(
        await req.diScope
          .resolve("workspaceService")
          .conversations(principalOf(req).accountId, req.params.id, req.query.offset),
      ).map(view),
  );

  app.post(
    "/v1/workspaces/:id/conversations",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: IdParams,
        body: CreateSchema,
        response: { 200: ConversationView, ...errors },
      },
    },
    async (req) =>
      view(
        value(
          await req.diScope
            .resolve("workspaceService")
            .createConversation(
              principalOf(req).accountId,
              req.params.id,
              req.body.id,
              req.body.title,
            ),
        ),
      ),
  );

  app.get(
    "/v1/conversations/:id",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: IdParams,
        response: { 200: HistoryView, ...errors },
      },
    },
    async (req) => {
      const { conversation, turns } = value(
        await req.diScope
          .resolve("workspaceService")
          .history(principalOf(req).accountId, req.params.id),
      );
      return {
        conversation: view(conversation),
        messages: toAgUiMessages(turns.flatMap((turn) => turn.messages)),
        responder: "development" as const,
      };
    },
  );

  // Commands and subscriptions are separate: POST commits once; GET only replays.
  app.post(
    "/v1/conversations/:id/runs",
    {
      bodyLimit: 1_048_576,
      preHandler: requireAuth,
      schema: {
        security,
        params: IdParams,
        body: AgentInput,
        response: { 200: Type.Object({ runId: Type.String() }), ...errors },
      },
    },
    async (req) => {
      const message = req.body.messages.at(-1)!;
      if (
        req.body.threadId !== req.params.id ||
        message.role !== "user" ||
        typeof message.content !== "string"
      ) {
        throw new ApiHttpError(
          {
            code: "INVALID_INPUT",
            message: "Send a plain-text user message to this conversation.",
          },
          400,
        );
      }
      const turn = value(
        await req.diScope
          .resolve("workspaceService")
          .submit(principalOf(req).accountId, req.params.id, {
            runId: req.body.runId,
            messageId: message.id,
            text: message.content,
          }),
      );
      return { runId: turn.runId };
    },
  );

  // Per-process subscription cap complements bounded streams. No in-memory source of truth.
  const subscriptions = new Map<string, number>();
  app.get(
    "/v1/conversations/:id/runs/:runId/events",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: Type.Object({
          id: Type.String({ format: "uuid" }),
          runId: Type.String({ pattern: "^[\\w-]{1,100}$" }),
        }),
        querystring: Type.Object({
          after: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
        }),
        response: {
          200: Type.Unsafe<Readable>({
            description: "AG-UI events; SSE id is the replay cursor.",
            content: { "text/event-stream": { schema: Type.String() } },
          }),
          ...errors,
        },
      },
    },
    async (req, reply) => {
      const ownerId = principalOf(req).accountId;
      const replay = value(
        await req.diScope
          .resolve("workspaceService")
          .replay(ownerId, req.params.id, req.params.runId, req.query.after ?? 0),
      );
      if ((subscriptions.get(ownerId) ?? 0) >= 3) {
        throw new ApiHttpError(
          { code: "LIMIT_REACHED", message: "Too many open subscriptions." },
          429,
        );
      }
      subscriptions.set(ownerId, (subscriptions.get(ownerId) ?? 0) + 1);
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 30_000);
      const release = () => {
        if (abort.signal.aborted) return;
        abort.abort();
      };
      reply.raw.once("close", release);
      const output = replay.reset
        ? [
            { type: "RUN_STARTED", threadId: req.params.id, runId: replay.turn.runId },
            {
              type: "MESSAGES_SNAPSHOT",
              messages: toAgUiMessages(replay.turns.flatMap((turn) => turn.messages)),
            },
            { type: "RUN_FINISHED", threadId: req.params.id, runId: replay.turn.runId },
          ].map((event, index) => `id: ${index + 1}\n${encoder.encode(event as BaseEvent)}`)
        : frames(replay.turn, req.params.id, replay.after);
      async function* stream() {
        try {
          yield ": connected\n\n";
          for (const frame of output) {
            if (abort.signal.aborted) return;
            yield frame;
            await delay(25, undefined, { signal: abort.signal });
          }
        } catch (error) {
          if (!abort.signal.aborted) throw error;
        } finally {
          clearTimeout(timeout);
          reply.raw.off("close", release);
          subscriptions.set(ownerId, Math.max(0, (subscriptions.get(ownerId) ?? 1) - 1));
          if (subscriptions.get(ownerId) === 0) subscriptions.delete(ownerId);
        }
      }
      return reply
        .code(200)
        .header("Content-Type", "text/event-stream")
        .header("X-Accel-Buffering", "no")
        .header("X-Stream-Reset", String(replay.reset))
        .header("Cache-Control", "no-store, no-transform")
        .send(Readable.from(stream(), { signal: abort.signal }));
    },
  );
};
