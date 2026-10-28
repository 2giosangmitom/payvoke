import { Hono } from "hono";
import { channels } from "#core/queue";
import { BadRequestError } from "../../errors";
import type { AppEnv } from "../../http/context";
import { maxBody } from "../../http/limits";
import { eventStream } from "../../http/sse";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import { eventsQuery, newThreadBody, renameBody, threadQuery } from "./thread.schemas";

// Rings wake the stream at once; the backstop bounds latency if one is lost.
const BACKSTOP_MS = 5000;
const KEEP_ALIVE_MS = 15000;

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
  .get("/v1/threads/:threadId/ag-ui/snapshot", requireAccount, async (c) => {
    const { threadService } = c.var.cradle;
    await threadService.owned(c.var.account.id, c.req.param("threadId"));
    return c.json(await threadService.snapshot(c.req.param("threadId")));
  })
  .get(
    "/v1/threads/:threadId/ag-ui/events",
    validate("query", eventsQuery, "INVALID_CURSOR"),
    requireAccount,
    async (c) => {
      const { threadService: threads, doorbell } = c.var.cradle;
      const threadId = c.req.param("threadId");
      await threads.owned(c.var.account.id, threadId);
      const query = c.req.valid("query");
      const raw = c.req.header("last-event-id") ?? query.after ?? "0";
      if (!/^[0-9]{1,20}$/.test(raw)) throw new BadRequestError("INVALID_CURSOR");
      let cursor = BigInt(raw);
      await threads.assertReplayable(threadId, cursor);
      const once = query.once === "1";
      return eventStream(c, "no-store, no-transform", async (stream) => {
        // Listen before the first read so a commit racing it is not slept through.
        const listener = once ? undefined : doorbell.listen(channels.thread(threadId));
        try {
          let lastKeepAlive = Date.now();
          let mark = await threads.conversationMark(threadId);
          do {
            for (const row of await threads.eventsAfter(threadId, cursor)) {
              if (!stream.send(row.cursor, "ag-ui", row.event)) break;
              cursor = row.cursor;
            }
            const next = await threads.conversationMark(threadId);
            if (next !== mark) {
              mark = next;
              // Same id: the replay cursor only ever follows AG-UI events.
              if (!stream.send(cursor, "conversation", { changedAt: next })) break;
            }
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
