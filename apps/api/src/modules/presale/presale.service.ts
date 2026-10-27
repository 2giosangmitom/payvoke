import type { Cradle } from "@fastify/awilix";
import type { App, Offer, Prisma, ThreadMessage } from "@payvoke/db";
import { channels } from "@payvoke/queue";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  isUniqueViolation,
} from "../../errors";
import { isAvailable } from "../apps/schema";
import { effectiveArguments } from "../quotes/arguments";
import { conversation, conversationHash } from "./conversation";

export type BuyerMessageBody = {
  content?: unknown;
  commandId?: unknown;
  arguments?: unknown;
  fileIds?: unknown;
  clientRequestId?: unknown;
};
export type ProviderMessageBody = { content?: unknown; clientRequestId?: unknown };
export type OfferBody = {
  clientRequestId?: unknown;
  commandId?: unknown;
  arguments?: unknown;
  grossAmount?: unknown;
  deliverySeconds?: unknown;
  summary?: unknown;
  validForSeconds?: unknown;
};

const CONTENT_MAX = 4000;
const SUMMARY_MAX = 2000;
const MAX_MESSAGE_FILES = 10;
// Consecutive provider messages allowed without a buyer reply.
const PROVIDER_STREAK_MAX = 5;
const OFFER_TTL = { min: 60, max: 86400, default: 3600 };
const UINT256_MAX = (1n << 256n) - 1n;

const requestId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,128}$/.test(value);
const content = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
const positiveInt = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
const json = (value: unknown) => value as Prisma.InputJsonValue;

export const messageView = (message: ThreadMessage) => ({
  id: message.id,
  seq: message.seq,
  role: message.role,
  content: message.content,
  commandId: message.commandId,
  arguments: message.arguments,
  files: message.fileManifest ?? [],
  createdAt: message.createdAt,
});

// Expiry is derived, never written: an OPEN offer past expiresAt is EXPIRED.
export const offerStatus = (offer: Pick<Offer, "status" | "expiresAt">, now = Date.now()) =>
  offer.status === "OPEN" && offer.expiresAt.getTime() <= now ? "EXPIRED" : offer.status;

export const offerView = (offer: Offer) => ({
  id: offer.id,
  threadId: offer.threadId,
  commandRevisionId: offer.commandRevisionId,
  arguments: offer.arguments,
  grossAmount: offer.grossAmount.toFixed(0),
  deliverySeconds: offer.deliverySeconds,
  summary: offer.summary,
  messageSeq: offer.messageSeq,
  conversationHash: offer.conversationHash,
  status: offerStatus(offer),
  expiresAt: offer.expiresAt,
  quoteId: offer.quoteId,
  createdAt: offer.createdAt,
});

// Free pre-sale chat of AGENT apps and the priced offers a provider proposes
// in it. Nothing here moves money; an offer only becomes payable when the
// buyer turns it into a Payvoke-issued quote.
export class PresaleService {
  private readonly db: Cradle["db"];
  private readonly config: Cradle["config"];
  private readonly doorbell: Cradle["doorbell"];
  private readonly files: Cradle["fileService"];

  constructor({ db, config, doorbell, fileService }: Cradle) {
    this.db = db;
    this.config = config;
    this.doorbell = doorbell;
    this.files = fileService;
  }

  private ring(appId: string, threadId: string) {
    this.doorbell.ring(channels.app(appId));
    this.doorbell.ring(channels.thread(threadId));
  }

  // Buyer messages since the thread's last paid invocation; a hold resets it.
  async unpaidBuyerMessages(db: Prisma.TransactionClient, threadId: string) {
    const lastPaid = await db.invocationReady.findFirst({
      where: { invocation: { quote: { threadId } } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return db.threadMessage.count({
      where: {
        threadId,
        role: "BUYER",
        ...(lastPaid ? { createdAt: { gt: lastPaid.createdAt } } : {}),
      },
    });
  }

  async allowance(threadId: string) {
    const used = await this.unpaidBuyerMessages(this.db, threadId);
    const limit = this.config.PRESALE_MESSAGE_LIMIT;
    return { limit, remaining: Math.max(0, limit - used) };
  }

  // Serializes writers of one thread and returns the next sequence number.
  private async nextSeq(tx: Prisma.TransactionClient, threadId: string) {
    await tx.chatThread.update({
      where: { id: threadId },
      data: { quoteLockVersion: { increment: 1 }, lastMessageAt: new Date() },
    });
    const last = await tx.threadMessage.findFirst({
      where: { threadId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    return (last?.seq ?? 0) + 1;
  }

  async sendBuyerMessage(buyerId: string, threadId: string, body: BuyerMessageBody | undefined) {
    const text = content(body?.content, CONTENT_MAX);
    const fileIds = body?.fileIds ?? [];
    if (
      !text ||
      !requestId(body?.clientRequestId) ||
      (body.commandId !== undefined && typeof body.commandId !== "string") ||
      (body.commandId === undefined && body.arguments !== undefined) ||
      !Array.isArray(fileIds) ||
      fileIds.length > MAX_MESSAGE_FILES ||
      fileIds.some((id) => typeof id !== "string") ||
      new Set(fileIds).size !== fileIds.length
    )
      throw new BadRequestError("INVALID_MESSAGE");
    const clientRequestId = body.clientRequestId;
    const commandId = (body.commandId as string | undefined) ?? null;
    const thread = await this.db.chatThread.findFirst({
      where: { id: threadId, buyerId },
      include: { app: true },
    });
    if (!thread) throw new NotFoundError("THREAD_NOT_FOUND");
    const key = { threadId_role_clientRequestId: { threadId, role: "BUYER", clientRequestId } };
    const prior = await this.db.threadMessage.findUnique({ where: key });
    if (prior) {
      if (prior.content !== text || prior.commandId !== commandId)
        throw new ConflictError("IDEMPOTENCY_CONFLICT");
      return messageView(prior);
    }
    if (thread.archivedAt) throw new NotFoundError("THREAD_NOT_FOUND");
    this.assertAgent(thread.app);
    if (!isAvailable(thread.app)) throw new ConflictError("APP_OFFLINE");
    let args: Prisma.InputJsonValue | undefined;
    if (commandId) {
      const command = await this.db.appCommand.findFirst({
        where: { id: commandId, appId: thread.appId, archivedAt: null },
        include: { activeRevision: true },
      });
      if (!command?.activeRevision) throw new NotFoundError("COMMAND_NOT_FOUND");
      args = json(effectiveArguments(command.activeRevision.inputSchema, body.arguments ?? {}));
    }
    if (fileIds.length && !this.files.enabled) throw new BadRequestError("FILES_NOT_SUPPORTED");
    try {
      const message = await this.db.$transaction(async (tx) => {
        const seq = await this.nextSeq(tx, threadId);
        if ((await this.unpaidBuyerMessages(tx, threadId)) >= this.config.PRESALE_MESSAGE_LIMIT)
          throw new ConflictError("PRESALE_LIMIT_REACHED");
        // Metadata only: a provider can download inputs once the work is paid.
        const manifest = await this.files.contextFiles(tx, buyerId, threadId, fileIds as string[]);
        return tx.threadMessage.create({
          data: {
            threadId,
            seq,
            role: "BUYER",
            content: text,
            commandId,
            ...(args !== undefined ? { arguments: args } : {}),
            fileManifest: json(manifest),
            clientRequestId,
          },
        });
      });
      this.ring(thread.appId, threadId);
      return messageView(message);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return messageView(await this.db.threadMessage.findUniqueOrThrow({ where: key }));
    }
  }

  private assertAgent(app: Pick<App, "kind">) {
    if (app.kind !== "AGENT") throw new ConflictError("APP_KIND_MISMATCH");
  }

  // A thread of this provider app that can still be talked to.
  private async providerThread(app: App, threadId: string) {
    this.assertAgent(app);
    const thread = await this.db.chatThread.findFirst({
      where: { id: threadId, appId: app.id, archivedAt: null },
    });
    if (!thread) throw new NotFoundError("THREAD_NOT_FOUND");
    return thread;
  }

  // Unacknowledged buyer messages for the provider feed.
  async pendingMessages(appId: string) {
    const rows = await this.db.threadMessage.findMany({
      where: {
        role: "BUYER",
        acknowledgedAt: null,
        thread: { appId, archivedAt: null, app: { kind: "AGENT" } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        createdAt: row.createdAt,
        event: {
          type: "thread.message",
          threadId: row.threadId,
          messageId: row.id,
          seq: row.seq,
          content: row.content,
          commandId: row.commandId,
          arguments: row.arguments,
          files: row.fileManifest ?? [],
          conversation: await conversation(this.db, row.threadId, row.seq),
        } as Record<string, unknown>,
      })),
    );
  }

  async acknowledgeMessage(app: App, threadId: string, messageId: string) {
    const message = await this.db.threadMessage.findFirst({
      where: { id: messageId, threadId, role: "BUYER", thread: { appId: app.id } },
    });
    if (!message) throw new NotFoundError("MESSAGE_NOT_FOUND");
    if (!message.acknowledgedAt)
      await this.db.threadMessage.updateMany({
        where: { id: message.id, acknowledgedAt: null },
        data: { acknowledgedAt: new Date() },
      });
    return { acknowledged: true };
  }

  async sendProviderMessage(app: App, threadId: string, body: ProviderMessageBody | undefined) {
    const text = content(body?.content, CONTENT_MAX);
    if (!text || !requestId(body?.clientRequestId)) throw new BadRequestError("INVALID_MESSAGE");
    const clientRequestId = body.clientRequestId;
    const key = { threadId_role_clientRequestId: { threadId, role: "PROVIDER", clientRequestId } };
    const thread = await this.providerThread(app, threadId);
    const prior = await this.db.threadMessage.findUnique({ where: key });
    if (prior) {
      if (prior.content !== text) throw new ConflictError("IDEMPOTENCY_CONFLICT");
      return messageView(prior);
    }
    try {
      const message = await this.db.$transaction(async (tx) => {
        const seq = await this.nextSeq(tx, thread.id);
        const recent = await tx.threadMessage.findMany({
          where: { threadId },
          orderBy: { seq: "desc" },
          take: PROVIDER_STREAK_MAX,
          select: { role: true },
        });
        if (!recent.some((m) => m.role === "BUYER"))
          throw new ConflictError("PROVIDER_MESSAGE_LIMIT");
        return tx.threadMessage.create({
          data: { threadId, seq, role: "PROVIDER", content: text, clientRequestId },
        });
      });
      this.ring(app.id, threadId);
      return messageView(message);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return messageView(await this.db.threadMessage.findUniqueOrThrow({ where: key }));
    }
  }

  // Offers are immutable. A new one supersedes the thread's open offer; the
  // price must sit inside the command's published range and the policy floor,
  // and every term except the delivery time comes from the registered revision.
  async createOffer(app: App, threadId: string, body: OfferBody | undefined) {
    const input = body ?? {};
    const summary = content(input.summary, SUMMARY_MAX);
    const validFor =
      input.validForSeconds === undefined ? OFFER_TTL.default : input.validForSeconds;
    if (
      !requestId(input.clientRequestId) ||
      !summary ||
      (input.commandId !== undefined && typeof input.commandId !== "string") ||
      typeof input.grossAmount !== "string" ||
      !/^[1-9]\d*$/.test(input.grossAmount) ||
      BigInt(input.grossAmount) > UINT256_MAX ||
      (input.deliverySeconds !== undefined && !positiveInt(input.deliverySeconds)) ||
      !positiveInt(validFor) ||
      (validFor as number) < OFFER_TTL.min ||
      (validFor as number) > OFFER_TTL.max
    )
      throw new BadRequestError("INVALID_OFFER");
    const clientRequestId = input.clientRequestId;
    const prior = await this.db.offer.findUnique({
      where: { appId_clientRequestId: { appId: app.id, clientRequestId } },
    });
    if (prior) {
      if (
        prior.threadId !== threadId ||
        prior.grossAmount.toFixed(0) !== input.grossAmount ||
        prior.summary !== summary
      )
        throw new ConflictError("IDEMPOTENCY_CONFLICT");
      return offerView(prior);
    }
    const thread = await this.providerThread(app, threadId);
    const commandId = (input.commandId as string | undefined) ?? app.defaultCommandId;
    const command = commandId
      ? await this.db.appCommand.findFirst({
          where: { id: commandId, appId: app.id, archivedAt: null },
          include: { activeRevision: true },
        })
      : null;
    const revision = command?.activeRevision;
    if (!revision) throw new NotFoundError("COMMAND_NOT_FOUND");
    const args = effectiveArguments(revision.inputSchema, input.arguments ?? {});
    const amount = BigInt(input.grossAmount);
    const policy = await this.db.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    if (!policy) throw new UnprocessableEntityError("POLICY_NOT_CONFIGURED");
    if (
      !revision.minGrossAmount ||
      !revision.maxGrossAmount ||
      amount < BigInt(revision.minGrossAmount.toFixed(0)) ||
      amount > BigInt(revision.maxGrossAmount.toFixed(0))
    )
      throw new UnprocessableEntityError("PRICE_OUT_OF_RANGE");
    if (amount < BigInt(policy.minGrossAmount.toFixed(0)))
      throw new UnprocessableEntityError("PRICE_BELOW_FLOOR");
    const deliverySeconds =
      (input.deliverySeconds as number | undefined) ?? revision.deliverySeconds;
    if (
      deliverySeconds > revision.deliverySeconds ||
      deliverySeconds +
        revision.reviewSeconds +
        policy.resolutionGraceSeconds +
        policy.quoteLifetimeSeconds >
        policy.maxHoldSeconds
    )
      throw new BadRequestError("INVALID_DELIVERY_SECONDS");
    try {
      const offer = await this.db.$transaction(async (tx) => {
        await tx.chatThread.update({
          where: { id: thread.id },
          data: { quoteLockVersion: { increment: 1 }, lastMessageAt: new Date() },
        });
        // An offer answers a buyer request; it cannot open a conversation.
        if (!(await tx.threadMessage.findFirst({ where: { threadId, role: "BUYER" } })))
          throw new ConflictError("NO_BUYER_REQUEST");
        const last = await tx.threadMessage.findFirstOrThrow({
          where: { threadId },
          orderBy: { seq: "desc" },
        });
        const entries = await conversation(tx, threadId, last.seq);
        await tx.offer.updateMany({
          where: { threadId, status: "OPEN" },
          data: { status: "SUPERSEDED" },
        });
        return tx.offer.create({
          data: {
            threadId,
            appId: app.id,
            commandRevisionId: revision.id,
            arguments: json(args),
            grossAmount: amount.toString(),
            deliverySeconds,
            summary,
            messageSeq: last.seq,
            conversationHash: conversationHash(entries),
            expiresAt: new Date(Date.now() + (validFor as number) * 1000),
            clientRequestId,
          },
        });
      });
      this.ring(app.id, threadId);
      return offerView(offer);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent offer won the open slot or the same request raced itself.
      throw new ConflictError("OFFER_CONFLICT");
    }
  }

  async withdrawOffer(app: App, threadId: string, offerId: string) {
    return this.close({ id: offerId, threadId, appId: app.id }, "WITHDRAWN", app.id);
  }

  async declineOffer(buyerId: string, threadId: string, offerId: string) {
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, threadId, thread: { buyerId } },
    });
    if (!offer) throw new NotFoundError("OFFER_NOT_FOUND");
    return this.close({ id: offerId, threadId }, "DECLINED", offer.appId);
  }

  private async close(where: Prisma.OfferWhereInput, status: string, appId: string) {
    const changed = await this.db.offer.updateMany({
      where: { ...where, status: "OPEN" },
      data: { status },
    });
    const offer = await this.db.offer.findFirst({ where });
    if (!offer) throw new NotFoundError("OFFER_NOT_FOUND");
    if (!changed.count) throw new ConflictError("OFFER_NOT_OPEN");
    await this.db.chatThread.update({
      where: { id: offer.threadId },
      data: { lastMessageAt: new Date() },
    });
    this.ring(appId, offer.threadId);
    return offerView(offer);
  }

  async threadMessages(threadId: string) {
    const rows = await this.db.threadMessage.findMany({
      where: { threadId },
      orderBy: { seq: "desc" },
      take: 200,
    });
    return rows.reverse().map(messageView);
  }

  async threadOffers(threadId: string) {
    const rows = await this.db.offer.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.reverse().map(offerView);
  }
}
