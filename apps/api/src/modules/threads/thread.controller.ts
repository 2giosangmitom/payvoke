import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";
import { BadRequestError } from "../../errors";
import { eventStream, pause } from "../../http/sse";
import type { NewThreadBody, ThreadQuery } from "./thread.service";

export type ThreadRoute = { Params: { threadId: string } };
export type CreateThreadRoute = { Body?: Partial<NewThreadBody> };
export type ListThreadsRoute = { Querystring: ThreadQuery };
export type RenameThreadRoute = ThreadRoute & { Body?: { title?: unknown } };
export type ThreadEventsRoute = ThreadRoute & { Querystring: { after?: string; once?: string } };

const POLL_MS = 600;
const KEEP_ALIVE_MS = 15000;

export class ThreadController {
  private readonly threads: Cradle["threadService"];

  constructor({ threadService }: Cradle) {
    this.threads = threadService;
  }

  create = async (request: FastifyRequest<CreateThreadRoute>, reply: FastifyReply) => {
    const { created, thread } = await this.threads.create(request.account!.id, request.body);
    return reply.code(created ? 201 : 200).send(thread);
  };

  list = async (request: FastifyRequest<ListThreadsRoute>) =>
    this.threads.list(request.account!.id, request.query);

  get = async (request: FastifyRequest<ThreadRoute>) =>
    this.threads.get(request.account!.id, request.params.threadId);

  rename = async (request: FastifyRequest<RenameThreadRoute>) =>
    this.threads.rename(request.account!.id, request.params.threadId, request.body?.title);

  archive = async (request: FastifyRequest<ThreadRoute>) =>
    this.threads.archive(request.account!.id, request.params.threadId);

  snapshot = async (request: FastifyRequest<ThreadRoute>) => {
    await this.threads.owned(request.account!.id, request.params.threadId);
    return this.threads.snapshot(request.params.threadId);
  };

  // Native EventSource reconnects with Last-Event-ID even when the original
  // bootstrap URL still contains an older ?after= cursor.
  events = async (request: FastifyRequest<ThreadEventsRoute>, reply: FastifyReply) => {
    const { threadId } = request.params;
    await this.threads.owned(request.account!.id, threadId);
    const raw = request.headers["last-event-id"] ?? request.query.after ?? "0";
    if (typeof raw !== "string" || !/^[0-9]{1,20}$/.test(raw))
      throw new BadRequestError("INVALID_CURSOR");
    let cursor = BigInt(raw);
    await this.threads.assertReplayable(threadId, cursor);
    const once = request.query.once === "1";
    return eventStream(reply, "no-store, no-transform", async (stream) => {
      let lastKeepAlive = Date.now();
      do {
        for (const row of await this.threads.eventsAfter(threadId, cursor)) {
          if (!stream.send(row.cursor, "ag-ui", row.event)) break;
          cursor = row.cursor;
        }
        if (once) break;
        if (Date.now() - lastKeepAlive > KEEP_ALIVE_MS) {
          stream.comment("keep-alive");
          lastKeepAlive = Date.now();
        }
        await pause(POLL_MS);
      } while (stream.open);
    });
  };
}
