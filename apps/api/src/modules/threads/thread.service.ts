import type { Cradle } from "../../container";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors";
import { availabilityLabel, threadSlotReleased } from "../apps/schema";
import { imageUrl, serializeCommand } from "../apps/serializers";
import { revisionPolicy } from "../runs/run-rules";
import { reputation } from "../stats/reputation";

export type NewThreadBody = { appId: string; clientRequestId: string; title?: string };
export type ThreadQuery = { q?: string; cursor?: string; archived?: string };

const PAGE = 50;
const validTitle = (title: unknown): title is string =>
  typeof title === "string" && title.trim().length >= 1 && title.length <= 160;

// Buyer chat threads. Their messages are projected by TimelineService.
export class ThreadService {
  private readonly db: Cradle["db"];
  private readonly presale: Cradle["presaleService"];

  constructor({ db, presaleService }: Cradle) {
    this.db = db;
    this.presale = presaleService;
  }

  async owned(buyerId: string, threadId: string) {
    const thread = await this.db.chatThread.findFirst({ where: { id: threadId, buyerId } });
    if (!thread) throw new NotFoundError("THREAD_NOT_FOUND");
    return thread;
  }

  // Idempotent on (buyer, clientRequestId). Replay an earlier success before
  // checking current app visibility or status: a lost response must stay
  // idempotent across suspend/archive.
  async create(buyerId: string, body: Partial<NewThreadBody> | undefined) {
    const { appId, clientRequestId, title } = body ?? {};
    if (
      typeof appId !== "string" ||
      appId.length > 128 ||
      typeof clientRequestId !== "string" ||
      !/^[\w-]{1,128}$/.test(clientRequestId) ||
      (title !== undefined && !validTitle(title))
    )
      throw new BadRequestError("INVALID_THREAD");
    const serialize = (thread: {
      id: string;
      appId: string;
      title: string | null;
      createdAt: Date;
    }) => ({
      id: thread.id,
      appId: thread.appId,
      title: thread.title,
      createdAt: thread.createdAt,
    });
    const prior = await this.db.chatThread.findUnique({
      where: { buyerId_clientRequestId: { buyerId, clientRequestId } },
    });
    if (prior) {
      if (prior.appId !== appId) throw new ConflictError("IDEMPOTENCY_CONFLICT");
      return { created: false, thread: serialize(prior) };
    }
    const app = await this.db.app.findFirst({
      where: {
        id: appId,
        status: "ACTIVE",
        archivedAt: null,
        OR: [{ visibility: "PUBLIC" }, { ownerId: buyerId }],
      },
    });
    if (!app) throw new NotFoundError("APP_NOT_FOUND");
    const thread = await this.db.chatThread.create({
      data: { buyerId, appId, clientRequestId, title: title?.trim() || null },
    });
    return { created: true, thread: serialize(thread) };
  }

  async list(buyerId: string, { q, cursor, archived }: ThreadQuery) {
    if ((q && q.length > 100) || (cursor && cursor.length > 128))
      throw new BadRequestError("INVALID_THREAD_QUERY");
    const rows = await this.db.chatThread.findMany({
      where: {
        buyerId,
        // Instant x402 jobs live in DIRECT threads: they show as jobs, not chats.
        kind: "CHAT",
        ...(archived === "1" ? { archivedAt: { not: null } } : { archivedAt: null }),
        ...(q
          ? {
              OR: [
                { title: { contains: q.trim(), mode: "insensitive" as const } },
                { app: { name: { contains: q.trim(), mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            defaultCommandId: true,
            lastHeartbeatAt: true,
            imageKey: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: PAGE + 1,
    });
    return {
      items: rows.slice(0, PAGE).map((row) => ({
        id: row.id,
        title: row.title,
        app: {
          id: row.app.id,
          name: row.app.name,
          description: row.app.description,
          imageUrl: imageUrl(row.app),
          availability: availabilityLabel(row.app),
        },
        lastMessageAt: row.lastMessageAt,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: rows.length > PAGE ? rows[PAGE - 1].id : null,
    };
  }

  async get(buyerId: string, threadId: string) {
    const thread = await this.db.chatThread.findFirst({
      where: { id: threadId, buyerId },
      include: {
        app: {
          include: {
            commands: {
              where: { archivedAt: null, activeRevisionId: { not: null } },
              include: { activeRevision: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
    if (!thread) throw new NotFoundError("THREAD_NOT_FOUND");
    const active = thread.activeQuoteId
      ? await this.db.quote.findUnique({
          where: { id: thread.activeQuoteId },
          select: {
            validUntil: true,
            invocation: {
              select: {
                executionStatus: true,
                settlement: {
                  select: { state: true, attempt: { select: { state: true, finalizedAt: true } } },
                },
              },
            },
          },
        })
      : null;
    // Mirrors quote admission.
    const resolved = Boolean(active) && threadSlotReleased(active);
    const commands = thread.app.commands;
    const defaultCommand =
      commands.find((c) => c.id === thread.app.defaultCommandId) ?? commands[0] ?? null;
    const revision = defaultCommand?.activeRevision;
    return {
      id: thread.id,
      appId: thread.appId,
      // DIRECT: one instant x402 job, with no chat to continue.
      kind: thread.kind as "CHAT" | "DIRECT",
      title: thread.title,
      archivedAt: thread.archivedAt,
      app: {
        id: thread.app.id,
        name: thread.app.name,
        description: thread.app.description,
        visibility: thread.app.visibility,
        status: thread.app.status,
        imageUrl: imageUrl(thread.app),
        availability: availabilityLabel(thread.app),
        // Shown beside every offer, so the buyer sees the record before paying.
        reputation: (await reputation(this.db, [thread.app.id])).get(thread.app.id)!,
      },
      activeQuoteId: resolved ? null : thread.activeQuoteId,
      defaultCommandId: defaultCommand?.id ?? null,
      chatTextParameter: revision?.positionalParameter ?? null,
      revisionPolicy: revisionPolicy(revision?.terms),
      commands: commands.map(serializeCommand),
      // Free pre-sale messages left before the next paid invocation.
      presale: await this.presale.allowance(thread.id),
    };
  }

  async rename(buyerId: string, threadId: string, title: unknown) {
    if (!validTitle(title)) throw new BadRequestError("INVALID_TITLE");
    const changed = await this.db.chatThread.updateMany({
      where: { id: threadId, buyerId },
      data: { title: title.trim() },
    });
    if (!changed.count) throw new NotFoundError("THREAD_NOT_FOUND");
    return { title: title.trim() };
  }

  async archive(buyerId: string, threadId: string) {
    const changed = await this.db.chatThread.updateMany({
      where: { id: threadId, buyerId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!changed.count) throw new NotFoundError("THREAD_NOT_FOUND");
    return { archived: true };
  }

  // Changes whenever anything the timeline shows changes outside the run
  // stream: pre-sale messages, offers, payment and execution state, tool
  // results and revisions. The live stream rebuilds the timeline on a change.
  async mark(threadId: string) {
    const [thread, quotes] = await Promise.all([
      this.db.chatThread.findUnique({ where: { id: threadId }, select: { lastMessageAt: true } }),
      this.db.quote.findMany({
        where: { threadId },
        select: {
          id: true,
          invocation: {
            select: {
              executionStatus: true,
              settlement: { select: { state: true } },
              _count: { select: { toolResults: true, revisions: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return JSON.stringify([thread?.lastMessageAt.getTime() ?? 0, quotes]);
  }

  async eventsAfter(threadId: string, cursor: bigint) {
    return this.db.aguiStreamEvent.findMany({
      where: { threadId, cursor: { gt: cursor } },
      orderBy: { cursor: "asc" },
      take: 100,
      select: { cursor: true, invocationId: true, event: true },
    });
  }
}
