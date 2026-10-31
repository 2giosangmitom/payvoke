import { Hono } from "hono";
import { channels } from "#core/queue";
import type { AppEnv, RouteContext } from "../../http/context";
import { maxBody } from "../../http/limits";
import { builderRoute } from "../../http/openapi";
import { eventStream } from "../../http/sse";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import type { KeyScope } from "../provider/provider.validation";
import {
  ackBody,
  ackView,
  feedEvent,
  feedQuery,
  feedSnapshot,
  reportAck,
  reportBody,
  reportDoc,
  revisionBody,
  streamCursor,
  streamLine,
} from "./runs.schemas";

const base = "/v1/provider/apps/:appId";
const work = `${base}/invocations/:id`;
const stream = `${work}/ag-ui/streams/:runId`;

// Feed items are rung on commit; the backstop also keeps the heartbeat well
// inside the 45-second availability window.
const FEED_BACKSTOP_MS = 15000;

// Provider worker routes accept only an app key with the given scope.
async function providerWork(c: RouteContext, scope: KeyScope) {
  const { providerKeyService, providerRunService } = c.var.cradle;
  const appId = c.req.param("appId")!;
  await providerKeyService.authenticate(c.req.header("authorization"), appId, scope);
  return providerRunService.work(appId, c.req.param("id")!);
}

export const runRoutes = new Hono<AppEnv>()
  // `?once=1` returns the pending feed as JSON; otherwise an SSE stream that
  // re-sends unacknowledged events and doubles as the provider heartbeat.
  .get(
    `${base}/events`,
    validate("query", feedQuery, "INVALID_FEED_QUERY"),
    builderRoute({
      operationId: "readEvents",
      tag: "Events",
      summary: "Read the event feed",
      description: [
        "The app's work queue: buyer messages, paid invocations and run continuations, oldest first. Keep this stream open: it doubles as the agent's heartbeat. An app counts as available only while it has read the feed in the last 45 seconds.",
        "",
        "By default this is a Server-Sent Events stream. Each frame has `id:` (the event id to acknowledge), `event:` (the event type) and `data:` (the event JSON), and `: keep-alive` comments arrive between batches. Events stay in the feed, and are sent again on every batch, until acknowledged. With `?once=1` the route answers the pending events as one JSON object instead.",
      ].join("\n"),
      scope: "events:read",
      responses: {
        200: {
          description: "SSE stream, or the pending events with `once=1`",
          content: {
            "text/event-stream": { schema: feedEvent },
            "application/json": { schema: feedSnapshot },
          },
        },
      },
      errors: { 400: ["INVALID_FEED_QUERY"] },
    }),
    async (c) => {
      const { providerKeyService, providerRunService: runs, doorbell } = c.var.cradle;
      const appId = c.req.param("appId");
      await providerKeyService.authenticate(c.req.header("authorization"), appId, "events:read");
      await runs.heartbeat(appId);
      if (c.req.valid("query").once === "1")
        return c.json({
          events: (await runs.feed(appId)).map(({ id, event }) => ({ id, ...event })),
        });
      return eventStream(c, "no-store", async (sse) => {
        const listener = doorbell.listen(channels.app(appId));
        try {
          while (sse.open) {
            await runs.heartbeat(appId);
            for (const row of await runs.feed(appId))
              if (!sse.send(row.id, String(row.event.type), row.event)) break;
            sse.comment("keep-alive");
            await listener.wait(FEED_BACKSTOP_MS);
          }
        } finally {
          listener.close();
        }
      });
    },
  )
  .post(
    `${work}/acks`,
    maxBody(2048),
    validate("json", ackBody, "INVALID_EVENT_ID"),
    builderRoute({
      operationId: "acknowledgeRun",
      tag: "Events",
      summary: "Acknowledge a run event",
      description:
        "Claims the run named by an `invocation.ready`, `invocation.tool_result` or `invocation.revision_requested` event and removes it from the feed. Send the event id as `eventId`; without it the invocation's current run is claimed. Idempotent for the same run.",
      scope: "events:ack",
      responses: { 200: { description: "The claimed run", schema: ackView } },
      errors: {
        400: ["INVALID_EVENT_ID"],
        404: ["INVOCATION_NOT_READY", "EVENT_NOT_FOUND"],
        409: ["STALE_RUN", "RUN_NOT_QUEUEABLE"],
      },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerRunService.acknowledge(
          await providerWork(c, "events:ack"),
          c.req.valid("json").eventId,
        ),
      ),
  )
  .post(
    `${work}/reports`,
    maxBody(64000),
    validate("json", reportBody, "INVALID_REPORT"),
    builderRoute({
      operationId: "sendReport",
      tag: "Runs",
      summary: "Report run progress or a result",
      description: [
        "Moves an acknowledged run forward, one sequenced report at a time:",
        "",
        "- `started`: the run began (the invocation becomes RUNNING).",
        "- `progress`: a step of the visible plan; a later report with the same `stepId` replaces it.",
        "- `tool_call`: opens a built-in tool and ends the run; the buyer's answer arrives as `invocation.tool_result` with a new run.",
        "- `result`: delivers text, JSON and/or files. Payvoke verifies the delivery, then releases payment after the review window.",
        "- `failed`: gives up; the buyer is refunded.",
        "",
        "Close any open text message on the stream before `tool_call`, `result` or `failed`.",
      ].join("\n"),
      scope: "reports:write",
      body: reportDoc,
      responses: { 200: { description: "Committed", schema: reportAck } },
      errors: {
        400: [
          "INVALID_REPORT",
          "INVALID_PROGRESS",
          "INVALID_TOOL_CALL",
          "INVALID_RESULT",
          "INVALID_RESULT_OUTPUT",
          "ARTIFACT_VERSION_NOT_INCREMENTED",
        ],
        404: ["INVOCATION_NOT_READY"],
        409: [
          "RUN_NOT_ACKED",
          "RUN_ALREADY_STARTED",
          "RUN_NOT_RUNNING",
          "MESSAGE_NOT_CLOSED",
          "REPORT_SEQUENCE_GAP",
          "REPORT_SEQUENCE_CONFLICT",
          "TOOL_CALL_ALREADY_OPEN",
          "TOOL_CALL_ID_REUSED",
        ],
      },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerRunService.report(
          await providerWork(c, "reports:write"),
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    `${stream}/cursor`,
    builderRoute({
      operationId: "readStreamCursor",
      tag: "Runs",
      summary: "Read the stream cursor",
      description:
        "The last committed stream sequence of a run. Resume streaming from the line after it.",
      scope: "reports:write",
      responses: { 200: { description: "The cursor", schema: streamCursor } },
      errors: { 404: ["INVOCATION_NOT_READY", "RUN_NOT_FOUND"] },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerRunService.cursor(
          await providerWork(c, "reports:write"),
          c.req.param("runId"),
        ),
      ),
  )
  // NDJSON AG-UI stream, read incrementally; the service bounds its size.
  .post(
    stream,
    builderRoute({
      operationId: "streamRun",
      tag: "Runs",
      summary: "Stream AG-UI events",
      description:
        "Streams display-only output into the buyer's thread while the run is RUNNING: text messages and OpenUI surfaces. The body is `application/x-ndjson`, one `{ streamSequence, event }` object per line (16 KiB per line, 512 KiB per request). Lines are committed as they arrive; a retransmitted line must match the committed one byte for byte. Streamed text is not the delivery: send a `result` report for that.",
      scope: "reports:write",
      requestContent: { "application/x-ndjson": { schema: streamLine } },
      responses: { 200: { description: "The committed cursor", schema: streamCursor } },
      errors: {
        400: ["INVALID_NDJSON", "INVALID_SEQUENCE", "INVALID_AGUI_EVENT", "INVALID_OPENUI"],
        404: ["INVOCATION_NOT_READY"],
        409: [
          "RUN_NOT_RUNNING",
          "STREAM_SEQUENCE_GAP",
          "STREAM_SEQUENCE_CONFLICT",
          "MESSAGE_ALREADY_OPEN",
          "MESSAGE_NOT_OPEN",
        ],
        413: ["STREAM_TOO_LARGE", "EVENT_TOO_LARGE"],
        415: ["NDJSON_REQUIRED"],
      },
    }),
    async (c) => {
      const invocation = await providerWork(c, "reports:write");
      const ndjson = c.req.header("content-type")?.split(";")[0].trim() === "application/x-ndjson";
      return c.json(
        await c.var.cradle.providerRunService.ingest(
          invocation,
          c.req.param("runId"),
          ndjson ? c.req.raw.body : null,
        ),
      );
    },
  )
  // Buyer continuation; tool results go through the thread.
  .post(
    "/v1/invocations/:id/revisions",
    maxBody(8192),
    validate("json", revisionBody, "INVALID_REVISION"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.continuationService.requestRevision(
          c.var.account.id,
          c.req.param("id"),
          c.req.valid("json"),
        ),
        202,
      ),
  );
