import { Hono } from "hono";
import { channels } from "#core/queue";
import type { AppEnv, RouteContext } from "../../http/context";
import { maxBody } from "../../http/limits";
import { eventStream } from "../../http/sse";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import type { KeyScope } from "../provider/provider.validation";
import { ackBody, answerBody, feedQuery, reportBody, revisionBody } from "./runs.schemas";

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
  .get(`${base}/events`, validate("query", feedQuery, "INVALID_FEED_QUERY"), async (c) => {
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
  })
  .post(`${work}/acks`, maxBody(2048), validate("json", ackBody, "INVALID_EVENT_ID"), async (c) =>
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
    async (c) =>
      c.json(
        await c.var.cradle.providerRunService.report(
          await providerWork(c, "reports:write"),
          c.req.valid("json"),
        ),
      ),
  )
  .get(`${stream}/cursor`, async (c) =>
    c.json(
      await c.var.cradle.providerRunService.cursor(
        await providerWork(c, "reports:write"),
        c.req.param("runId"),
      ),
    ),
  )
  // NDJSON AG-UI stream, read incrementally; the service bounds its size.
  .post(stream, async (c) => {
    const invocation = await providerWork(c, "reports:write");
    const ndjson = c.req.header("content-type")?.split(";")[0].trim() === "application/x-ndjson";
    return c.json(
      await c.var.cradle.providerRunService.ingest(
        invocation,
        c.req.param("runId"),
        ndjson ? c.req.raw.body : null,
      ),
    );
  })
  // Buyer continuations.
  .post(
    "/v1/invocations/:id/answers",
    maxBody(32768),
    validate("json", answerBody, "INVALID_ANSWER"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.continuationService.answer(
          c.var.account.id,
          c.req.param("id"),
          c.req.valid("json"),
        ),
        202,
      ),
  )
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
