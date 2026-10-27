import type { Cradle } from "@fastify/awilix";
import type { Prisma } from "@payvoke/db";
import { parseManifest } from "@payvoke/payments/files";
import { BadRequestError, ConflictError, NotFoundError, PayloadTooLargeError } from "../../errors";
import { availabilityLabel, threadSlotReleased } from "../apps/schema";
import { serializeCommand } from "../apps/serializers";
import { promptText } from "../quotes/transcript";
import { object } from "../runs/protocol";
import { revisionPolicy } from "../runs/run-rules";

export type NewThreadBody = { appId: string; clientRequestId: string; title?: string };
export type ThreadQuery = { q?: string; cursor?: string; archived?: string };

const PAGE = 50;
const HISTORY_LIMIT = 100000;
const validTitle = (title: unknown): title is string =>
  typeof title === "string" && title.trim().length >= 1 && title.length <= 160;

// Buyer chat threads and their AG-UI history.
export class ThreadService {
  private readonly db: Cradle["db"];
  private readonly retentionSeconds: number;
  private readonly presale: Cradle["presaleService"];

  constructor({ db, config, presaleService }: Cradle) {
    this.db = db;
    this.retentionSeconds = config.AGUI_CURSOR_RETENTION_SECONDS;
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
            kind: true,
            status: true,
            defaultCommandId: true,
            lastHeartbeatAt: true,
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
          kind: row.app.kind,
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
      title: thread.title,
      archivedAt: thread.archivedAt,
      app: {
        id: thread.app.id,
        name: thread.app.name,
        description: thread.app.description,
        kind: thread.app.kind,
        visibility: thread.app.visibility,
        status: thread.app.status,
        availability: availabilityLabel(thread.app),
      },
      activeQuoteId: resolved ? null : thread.activeQuoteId,
      defaultCommandId: defaultCommand?.id ?? null,
      chatTextParameter: revision?.positionalParameter ?? null,
      revisionPolicy: revisionPolicy(revision?.terms),
      commands: commands.map(serializeCommand),
      // Free pre-sale messages left before the next paid invocation.
      presale: thread.app.kind === "AGENT" ? await this.presale.allowance(thread.id) : null,
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

  // Fenced at a single high-water cursor: events after the fence are picked up
  // by the SSE subscriber, never lost between the two requests.
  async snapshot(threadId: string) {
    const fence =
      (
        await this.db.aguiStreamEvent.aggregate({
          where: { threadId },
          _max: { cursor: true },
        })
      )._max.cursor ?? 0n;
    const rows: { cursor: bigint; invocationId: string; event: Prisma.JsonValue }[] = [];
    let last = 0n;
    for (;;) {
      const batch = await this.db.aguiStreamEvent.findMany({
        where: { threadId, cursor: { gt: last, lte: fence } },
        orderBy: { cursor: "asc" },
        take: 1000,
        select: { cursor: true, invocationId: true, event: true },
      });
      if (!batch.length) break;
      rows.push(...batch);
      if (rows.length > HISTORY_LIMIT) throw new PayloadTooLargeError("THREAD_HISTORY_TOO_LARGE");
      last = batch.at(-1)!.cursor;
    }
    const texts = new Map<
      string,
      { messageId: string; invocationId: string; content: string; complete: boolean }
    >();
    const surfaces = new Map<string, unknown>();
    for (const { event, invocationId } of rows) {
      if (!object(event)) continue;
      const id = event.messageId as string;
      if (typeof id !== "string") continue;
      if (event.type === "TEXT_MESSAGE_START")
        texts.set(id, { messageId: id, invocationId, content: "", complete: false });
      if (event.type === "TEXT_MESSAGE_CONTENT" && texts.has(id))
        texts.get(id)!.content += event.delta;
      if (event.type === "TEXT_MESSAGE_END" && texts.has(id)) texts.get(id)!.complete = true;
      if (event.type === "ACTIVITY_SNAPSHOT" && event.activityType === "openui-surface")
        surfaces.set(id, event.content);
    }
    const inThread = { invocation: { quote: { threadId } } };
    const recent = { orderBy: { createdAt: "asc" as const }, take: 100 };
    const invocations = await this.db.invocation.findMany({
      where: { quote: { threadId } },
      select: { id: true, executionStatus: true, run: { select: { result: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const quotes = await this.db.quote.findMany({
      where: { threadId },
      include: { invocation: { include: { settlement: true } } },
      ...recent,
    });
    const [questions, answers, revisions] = await Promise.all([
      this.db.invocationQuestion.findMany({ where: inThread, ...recent }),
      this.db.invocationAnswer.findMany({ where: inThread, ...recent }),
      this.db.invocationRevision.findMany({ where: inThread, ...recent }),
    ]);
    return {
      cursor: fence.toString(),
      messages: [...texts.values()],
      surfaces: [...surfaces].map(([messageId, content]) => ({ messageId, content })),
      invocations: invocations.map((i) => {
        const result =
          i.executionStatus === "DELIVERED" && object(i.run?.result) ? i.run.result : null;
        return {
          id: i.id,
          executionStatus: i.executionStatus,
          output: result ? result.output : null,
          // Metadata only; the buyer fetches a short-lived URL per download.
          files: (parseManifest(result?.files) ?? []).map(
            ({ fileId, name, contentType, size }) => ({ fileId, name, contentType, size }),
          ),
        };
      }),
      prompts: quotes.map((q) => {
        const snapshot = (q.document as Record<string, unknown>).inputSnapshot as Record<
          string,
          unknown
        >;
        return {
          quoteId: q.id,
          invocationId: q.invocationId,
          text: promptText(snapshot.arguments as Record<string, unknown>),
          paid: q.invocation?.settlement?.state === "HELD",
        };
      }),
      questions: questions.map((q) => ({
        id: q.id,
        invocationId: q.invocationId,
        questionId: q.questionId,
        prompt: q.prompt,
        inputSchema: q.inputSchema,
        chatTextParameter: q.chatTextParameter,
        status: q.status,
        createdAt: q.createdAt,
        answeredAt: q.answeredAt,
      })),
      answers: answers.map((a) => ({
        questionId: a.questionId,
        invocationId: a.invocationId,
        arguments: a.arguments,
        createdAt: a.createdAt,
      })),
      revisions: revisions.map((r) => ({
        id: r.id,
        invocationId: r.invocationId,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
      })),
      // Unpaid pre-sale chat and offers of an AGENT thread.
      conversation: await this.presale.threadMessages(threadId),
      offers: await this.presale.threadOffers(threadId),
    };
  }

  // Changes whenever a pre-sale message or offer is written; the SSE stream
  // tells the client to reload the snapshot without carrying any content.
  async conversationMark(threadId: string) {
    const thread = await this.db.chatThread.findUnique({
      where: { id: threadId },
      select: { lastMessageAt: true },
    });
    return thread?.lastMessageAt.getTime() ?? 0;
  }

  // Replay cannot be complete when the requested point is older than the
  // retention window: the client must load the snapshot and resume from its cursor.
  async assertReplayable(threadId: string, after: bigint) {
    const oldest = await this.db.aguiStreamEvent.findFirst({
      where: { threadId, createdAt: { gte: new Date(Date.now() - this.retentionSeconds * 1000) } },
      orderBy: { cursor: "asc" },
      select: { cursor: true },
    });
    if (after > 0n && oldest && after < oldest.cursor - 1n)
      throw new ConflictError("CURSOR_EXPIRED");
  }

  async eventsAfter(threadId: string, cursor: bigint) {
    const rows = await this.db.aguiStreamEvent.findMany({
      where: { threadId, cursor: { gt: cursor } },
      orderBy: { cursor: "asc" },
      take: 100,
    });
    return rows.map((row) => ({ cursor: row.cursor, event: row.event }));
  }
}
