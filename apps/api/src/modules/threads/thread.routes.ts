import { Hono } from "hono";
import { channels } from "#core/queue";
import type { AppEnv } from "../../http/context";
import { maxBody } from "../../http/limits";
import { eventStream } from "../../http/sse";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import { eventsQuery, newThreadBody, renameBody, threadQuery } from "./thread.schemas";
import { runMessageId } from "./timeline.service";

// Rings wake the stream at once; the backstop bounds latency if one is lost.
const BACKSTOP_MS = 5000;
const KEEP_ALIVE_MS = 15000;
const TIMELINE_INTERVAL_MS = 250;

export const threadRoutes = new Hono<AppEnv>()
  .post(
    "/v1/threads",
    maxBody(4096),
    validate("json", newThreadBody, "INVALID_THREAD"),
    requireAccount,
    async (c) => {
      const { created, thread } = await c.var.cradle.threadService.create(
        c.var.account.id,
        c.req.valid("json"),
      );
      return c.json(thread, created ? 201 : 200);
    },
  )
  .get(
    "/v1/threads",
    validate("query", threadQuery, "INVALID_THREAD_QUERY"),
    requireAccount,
    async (c) =>
      c.json(await c.var.cradle.threadService.list(c.var.account.id, c.req.valid("query"))),
  )
  .get("/v1/threads/:threadId", requireAccount, async (c) =>
    c.json(await c.var.cradle.threadService.get(c.var.account.id, c.req.param("threadId"))),
  )
  .patch(
    "/v1/threads/:threadId",
    maxBody(2048),
    validate("json", renameBody, "INVALID_TITLE"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.threadService.rename(
          c.var.account.id,
          c.req.param("threadId"),
          c.req.valid("json").title,
        ),
      ),
  )
  .post("/v1/threads/:threadId/archive", requireAccount, async (c) =>
    c.json(await c.var.cradle.threadService.archive(c.var.account.id, c.req.param("threadId"))),
  )
  .get("/v1/threads/:threadId/timeline", requireAccount, async (c) => {
    const { threadService, timelineService } = c.var.cradle;
    await threadService.owned(c.var.account.id, c.req.param("threadId"));
    return c.json(await timelineService.build(c.req.param("threadId")));
  })
  // Live view of one thread. A `timeline` event carries the whole projection:
  // first on connect, then whenever anything but streamed text changes. Text
  // tokens arrive as `delta` events addressed to a part of a run message. Each
  // event id is the stream cursor the client state is fenced at.
  .get(
    "/v1/threads/:threadId/events",
    validate("query", eventsQuery, "INVALID_QUERY"),
    requireAccount,
    async (c) => {
      const { threadService: threads, timelineService: timelines, doorbell } = c.var.cradle;
      const threadId = c.req.param("threadId");
      await threads.owned(c.var.account.id, threadId);
      const once = c.req.valid("query").once === "1";
      return eventStream(c, "no-store, no-transform", async (stream) => {
        // Listen before the first read so a commit racing it is not slept through.
        const listener = once ? undefined : doorbell.listen(channels.thread(threadId));
        try {
          let lastKeepAlive = Date.now();
          let lastTimeline = 0;
          let cursor = await timelines.cursor(threadId);
          let mark = await threads.mark(threadId);
          const sendTimeline = async (fence: bigint) => {
            lastTimeline = Date.now();
            return stream.send(fence, "timeline", await timelines.build(threadId, fence));
          };
          if (!(await sendTimeline(cursor))) return;
          do {
            const rows = await threads.eventsAfter(threadId, cursor);
            const next = await threads.mark(threadId);
            const structural = next !== mark || rows.some((row) => !isTextDelta(row.event));
            if (structural) {
              // Coalesce bursts (OpenUI patches, step updates) into one rebuild.
              const wait = TIMELINE_INTERVAL_MS - (Date.now() - lastTimeline);
              if (wait > 0) {
                await Bun.sleep(wait);
                continue;
              }
              mark = next;
              cursor = rows.at(-1)?.cursor ?? cursor;
              if (!(await sendTimeline(cursor))) break;
              continue;
            }
            for (const row of rows) {
              const event = row.event as { messageId: string; delta: string };
              const delta = {
                messageId: runMessageId(row.invocationId),
                partId: event.messageId,
                delta: event.delta,
              };
              if (!stream.send(row.cursor, "delta", delta)) break;
              cursor = row.cursor;
            }
            if (rows.length) continue;
            if (!listener) break;
            if (Date.now() - lastKeepAlive > KEEP_ALIVE_MS) {
              stream.comment("keep-alive");
              lastKeepAlive = Date.now();
            }
            await listener.wait(BACKSTOP_MS);
          } while (stream.open);
        } finally {
          listener?.close();
        }
      });
    },
  );

const isTextDelta = (event: unknown) =>
  !!event &&
  typeof event === "object" &&
  (event as { type?: unknown }).type === "TEXT_MESSAGE_CONTENT";
