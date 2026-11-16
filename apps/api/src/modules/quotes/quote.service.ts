import type { Cradle } from "../../container";
import { hashSnapshot, type Json } from "@payvoke/shared/protocol";
import { ASSET, validateQuoteDocument, type QuoteDocument } from "@payvoke/shared/x402";
import { termsMinEvidence } from "#core/payments/evidence";
import type { Prisma } from "#core/db";
import { getAddress, type Address } from "viem";
import {
  BadRequestError,
  ConflictError,
  GoneError,
  NotFoundError,
  ServiceUnavailableError,
  isUniqueViolation,
} from "../../errors";
import type { AccountIdentity } from "../auth/auth.service";
import { isAvailable, threadSlotReleased } from "../apps/schema";
import { fileManifestUnion } from "../files/file.service";
import { buildQuoteDocument } from "./quote-document";
import type { PrepareQuoteBody } from "./quote.schemas";
import { conversation, conversationHash } from "../presale/conversation";
import { offerStatus } from "../presale/presale.service";
import { effectiveArguments } from "./arguments";
import { loadTranscript } from "./transcript";

type StoredQuote = { requestHash: string; document: Prisma.JsonValue };
const nowSeconds = () => Math.floor(Date.now() / 1000);

// A chat thread, or the DIRECT thread of one instant x402 purchase.
export type ThreadKind = "CHAT" | "DIRECT";

export type InstantRequest = {
  appId: string;
  command: string;
  arguments: Record<string, unknown>;
};

// Instant purchases share the buyer-wide idempotency namespace with chat
// quotes and threads; the prefix keeps them apart (client keys are UUIDs).
export const instantRequestId = (key: string) => `x402:${key}`;
// What the Idempotency-Key of an instant purchase is bound to.
export const instantRequestHash = (request: InstantRequest) =>
  hashSnapshot({
    kind: "x402.instant",
    appId: request.appId,
    command: request.command,
    arguments: request.arguments,
  } as unknown as Json);
// How long the system offer of an instant purchase stays acceptable. It is
// accepted in the same transaction that creates it.
const INSTANT_OFFER_SECONDS = 300;

export class QuoteService {
  private readonly db: Cradle["db"];
  private readonly config: Cradle["config"];
  private readonly files: Cradle["fileService"];

  constructor({ db, config, fileService }: Cradle) {
    this.db = db;
    this.config = config;
    this.files = fileService;
  }

  vault(): Address {
    if (!this.config.VAULT_ADDRESS) throw new ServiceUnavailableError("VAULT_NOT_CONFIGURED");
    if (
      this.config.CHAIN_ID !== 43113 ||
      getAddress(this.config.USDC_ADDRESS) !== getAddress(ASSET)
    )
      throw new ServiceUnavailableError("PAYMENT_CONFIGURATION_MISMATCH");
    return getAddress(this.config.VAULT_ADDRESS);
  }

  // The resource chat quotes are paid at.
  invocationResource() {
    return new URL("/v1/invocations", this.config.API_ORIGIN).href;
  }

  // Stored documents are re-validated against the configured vault and buyer
  // every time they leave the database.
  document(value: Prisma.JsonValue, buyer: string) {
    const result = value as unknown as QuoteDocument;
    validateQuoteDocument(result, this.vault(), getAddress(buyer));
    return result;
  }

  private replay(row: StoredQuote, requestHash: string, buyer: string) {
    if (row.requestHash !== requestHash) throw new ConflictError("IDEMPOTENCY_CONFLICT");
    const quote = this.document(row.document, buyer);
    if (quote.validUntil <= nowSeconds()) throw new GoneError("QUOTE_EXPIRED");
    return quote;
  }

  // Idempotent on (buyer, clientRequestId). Replays return the same stored
  // document without extending deadlines; a different request conflicts.
  async prepare(buyer: AccountIdentity, body: PrepareQuoteBody, idempotencyKey: unknown) {
    if (idempotencyKey !== body.clientRequestId)
      throw new BadRequestError("IDEMPOTENCY_KEY_REQUIRED");
    // Only file context is resolved so far. Never silently drop a selected
    // context or let a client supply content/hash instead of an owned record.
    const context = body.contextSelection;
    if (
      context.messageIds.length ||
      context.briefVersionId !== null ||
      (context.fileIds.length && !this.files.enabled)
    )
      throw new BadRequestError("CONTEXT_NOT_SUPPORTED");
    const vault = this.vault();
    const requestHash = hashSnapshot(body as unknown as Json);
    const key = { buyerId: buyer.id, clientRequestId: body.clientRequestId };
    const existing = await this.db.quote.findUnique({ where: { buyerId_clientRequestId: key } });
    if (existing) return this.replay(existing, requestHash, buyer.walletAddress);
    try {
      return await this.db.$transaction((tx) =>
        this.admit(tx, {
          buyer,
          body,
          vault,
          requestHash,
          key,
          kind: "CHAT",
          resource: this.invocationResource(),
        }),
      );
    } catch (error) {
      // The buyer-wide idempotency key can also race across different threads.
      if (!isUniqueViolation(error)) throw error;
      const prior = await this.db.quote.findUniqueOrThrow({
        where: { buyerId_clientRequestId: key },
      });
      return this.replay(prior, requestHash, buyer.walletAddress);
    }
  }

  private async admit(
    tx: Prisma.TransactionClient,
    input: {
      buyer: AccountIdentity;
      body: PrepareQuoteBody;
      vault: Address;
      requestHash: string;
      key: { buyerId: string; clientRequestId: string };
      // Chat quotes are only admitted in CHAT threads and instant ones only
      // in their own DIRECT thread.
      kind: ThreadKind;
      resource: string;
    },
  ) {
    const { buyer, body, vault, requestHash, key, kind, resource } = input;
    // A write lock serializes admissions per session on PostgreSQL. Re-read
    // after acquiring it; PGlite tests alone do not prove cross-process locks.
    const locked = await tx.chatThread.updateMany({
      where: { id: body.threadId, buyerId: buyer.id, archivedAt: null, kind },
      data: { quoteLockVersion: { increment: 1 } },
    });
    if (!locked.count) throw new NotFoundError("THREAD_NOT_FOUND");
    const prior = await tx.quote.findUnique({ where: { buyerId_clientRequestId: key } });
    if (prior) return this.replay(prior, requestHash, buyer.walletAddress);
    const thread = await tx.chatThread.findUniqueOrThrow({
      where: { id: body.threadId },
      include: { app: true },
    });
    const now = nowSeconds();
    if (thread.activeQuoteId) {
      const active = await tx.quote.findUniqueOrThrow({
        where: { id: thread.activeQuoteId },
        include: { invocation: { include: { settlement: { include: { attempt: true } } } } },
      });
      if (!threadSlotReleased(active, now * 1000)) throw new ConflictError("THREAD_BUSY");
    }
    const product = thread.app;
    if (product.status !== "ACTIVE" || product.archivedAt)
      throw new ConflictError("APP_UNAVAILABLE");
    if (!isAvailable(product)) throw new ConflictError("APP_OFFLINE");
    const policy = await tx.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    if (!policy || getAddress(policy.vault) !== vault)
      throw new ServiceUnavailableError("POLICY_NOT_CONFIGURED");
    const floor = BigInt(policy.minGrossAmount.toFixed(0));
    const priced = await this.offerTerms(tx, thread.id, product.id, body, kind);
    const { commandId, revision, grossAmount, deliverySeconds, offer } = priced;
    // A floor raised after publication or an offer still blocks new sales.
    if (grossAmount < floor) throw new ConflictError("PRICE_BELOW_FLOOR");
    const schema = revision.inputSchema;
    const effective = effectiveArguments(schema, priced.arguments);
    // The quote freezes the selected attachments and every file the offer's
    // arguments name, so the provider can fetch them once the hold lands.
    const files = fileManifestUnion(
      await this.files.contextFiles(tx, buyer.id, thread.id, body.contextSelection.fileIds),
      await this.files.argumentFiles(tx, buyer.id, thread.id, schema, effective),
    );
    if (
      revision.deliverySeconds <= 0 ||
      revision.reviewSeconds < 0 ||
      policy.resolutionGraceSeconds <= 0 ||
      policy.quoteLifetimeSeconds <= 0 ||
      policy.maxHoldSeconds <= 0
    )
      throw new ServiceUnavailableError("INVALID_DEADLINES");
    const terms = revision.terms;
    if (
      !terms ||
      typeof terms !== "object" ||
      Array.isArray(terms) ||
      terms.deliverySeconds !== revision.deliverySeconds ||
      terms.reviewSeconds !== revision.reviewSeconds ||
      !termsMinEvidence(terms)
    )
      throw new ServiceUnavailableError("TERMS_INCONSISTENT");
    const quote = buildQuoteDocument({
      vault,
      buyer: buyer.walletAddress,
      threadId: thread.id,
      product,
      commandId,
      revision,
      grossAmount,
      deliverySeconds,
      offer,
      policy,
      schema: schema as Json,
      effectiveArguments: effective,
      history: await loadTranscript(tx, thread.id),
      files,
      resource,
      now,
    });
    await tx.quote.create({
      data: {
        id: quote.quoteId,
        invocationId: quote.invocationId,
        ...key,
        threadId: thread.id,
        appId: product.id,
        commandRevisionId: revision.id,
        requestHash,
        validUntil: new Date(quote.validUntil * 1000),
        document: quote as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.chatThread.update({
      where: { id: thread.id },
      data: { activeQuoteId: quote.quoteId },
    });
    if (offer) {
      // Single use: the conditional transition fails for a concurrent accept.
      const accepted = await tx.offer.updateMany({
        where: { id: offer.offerId, status: "OPEN" },
        data: { status: "ACCEPTED", quoteId: quote.quoteId },
      });
      if (!accepted.count) throw new ConflictError("OFFER_NOT_OPEN");
    }
    return quote;
  }

  // An open offer of this thread, re-checked against the quoted revision it
  // pins and the conversation it was made for.
  private async offerTerms(
    tx: Prisma.TransactionClient,
    threadId: string,
    appId: string,
    body: PrepareQuoteBody,
    kind: ThreadKind,
  ) {
    if (!body.offerId) throw new BadRequestError("OFFER_REQUIRED");
    const offer = await tx.offer.findFirst({
      where: { id: body.offerId, threadId, appId },
      include: { commandRevision: { include: { command: true } } },
    });
    if (!offer) throw new NotFoundError("OFFER_NOT_FOUND");
    if (offerStatus(offer) !== "OPEN") throw new ConflictError("OFFER_NOT_OPEN");
    const revision = offer.commandRevision;
    if (revision.command.archivedAt) throw new NotFoundError("COMMAND_NOT_FOUND");
    const grossAmount = BigInt(offer.grossAmount.toFixed(0));
    if (
      !revision.maxGrossAmount ||
      grossAmount > BigInt(revision.maxGrossAmount.toFixed(0)) ||
      offer.deliverySeconds > revision.deliverySeconds
    )
      throw new ConflictError("OFFER_INVALID");
    const entries = await conversation(tx, threadId, offer.messageSeq);
    if (conversationHash(entries) !== offer.conversationHash)
      throw new ConflictError("OFFER_INVALID");
    // A DIRECT thread has no conversation: its only offer is the system offer
    // at the revision's fixed instant price and full delivery time.
    if (
      kind === "DIRECT" &&
      (offer.messageSeq !== 0 ||
        entries.length !== 0 ||
        !revision.instantGrossAmount ||
        grossAmount !== BigInt(revision.instantGrossAmount.toFixed(0)) ||
        offer.deliverySeconds !== revision.deliverySeconds)
    )
      throw new ConflictError("OFFER_INVALID");
    return {
      commandId: revision.commandId,
      revision,
      grossAmount,
      deliverySeconds: offer.deliverySeconds,
      arguments: offer.arguments,
      offer: {
        offerId: offer.id,
        summary: offer.summary,
        conversation: entries as unknown as Json,
        conversationHash: offer.conversationHash,
      },
    };
  }

  // An instant x402 purchase: a fresh DIRECT thread holding one system offer
  // at the command's fixed price, accepted through the same admission as a
  // chat offer (floor, cap, availability, deadlines, files). Idempotent on
  // (buyer, Idempotency-Key): the same request replays the same quote.
  async prepareInstant(
    buyer: AccountIdentity,
    request: InstantRequest,
    idempotencyKey: string,
    resource: string,
  ) {
    const vault = this.vault();
    const requestHash = instantRequestHash(request);
    const clientRequestId = instantRequestId(idempotencyKey);
    const key = { buyerId: buyer.id, clientRequestId };
    const existing = await this.db.quote.findUnique({ where: { buyerId_clientRequestId: key } });
    if (existing) return this.replay(existing, requestHash, buyer.walletAddress);
    try {
      return await this.db.$transaction(async (tx) => {
        const app = await tx.app.findFirst({
          where: {
            id: request.appId,
            status: "ACTIVE",
            archivedAt: null,
            OR: [{ visibility: "PUBLIC" }, { ownerId: buyer.id }],
          },
        });
        if (!app) throw new NotFoundError("APP_NOT_FOUND");
        const command = await tx.appCommand.findFirst({
          where: { appId: app.id, name: request.command, archivedAt: null },
          include: { activeRevision: true },
        });
        const revision = command?.activeRevision;
        if (!revision?.instantGrossAmount) throw new NotFoundError("COMMAND_NOT_FOUND");
        // Bad arguments fail before anything is written.
        effectiveArguments(revision.inputSchema, request.arguments);
        const thread = await tx.chatThread.create({
          data: {
            buyerId: buyer.id,
            appId: app.id,
            kind: "DIRECT",
            clientRequestId,
            title: `/${command!.name}`,
          },
        });
        const offer = await tx.offer.create({
          data: {
            threadId: thread.id,
            appId: app.id,
            commandRevisionId: revision.id,
            arguments: request.arguments as Prisma.InputJsonValue,
            grossAmount: revision.instantGrossAmount,
            deliverySeconds: revision.deliverySeconds,
            summary: `Instant /${command!.name}`,
            messageSeq: 0,
            conversationHash: conversationHash([]),
            expiresAt: new Date(Date.now() + INSTANT_OFFER_SECONDS * 1000),
            // Offer keys are unique per app, across buyers.
            clientRequestId: `${clientRequestId}:${buyer.id}`,
          },
        });
        return this.admit(tx, {
          buyer,
          body: {
            threadId: thread.id,
            offerId: offer.id,
            contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
            clientRequestId,
          },
          vault,
          requestHash,
          key,
          kind: "DIRECT",
          resource,
        });
      });
    } catch (error) {
      // A concurrent request with the same key created the thread first.
      if (!isUniqueViolation(error)) throw error;
      const prior = await this.db.quote.findUnique({ where: { buyerId_clientRequestId: key } });
      if (!prior) throw new ConflictError("IDEMPOTENCY_CONFLICT");
      return this.replay(prior, requestHash, buyer.walletAddress);
    }
  }

  // Restores an unpaid authorization after a tab refresh. Paid or expired
  // quotes cannot be submitted again through checkout.
  async restore(buyer: AccountIdentity, quoteId: string) {
    const row = await this.db.quote.findFirst({
      where: { id: quoteId, buyerId: buyer.id },
      include: {
        invocation: { include: { settlement: true } },
        thread: true,
        offer: { include: { commandRevision: { include: { command: true } } } },
      },
    });
    if (!row || row.thread.archivedAt) throw new NotFoundError("QUOTE_NOT_FOUND");
    if (row.invocation?.settlement || row.validUntil.getTime() <= Date.now())
      return { quote: null };
    const quote = this.document(row.document, buyer.walletAddress);
    // An instant quote is payable only by resending its own request (same URL,
    // Idempotency-Key and arguments), so the buyer's approval page needs it.
    const prefix = instantRequestId("");
    if (row.thread.kind === "DIRECT" && row.offer && row.clientRequestId.startsWith(prefix))
      return {
        quote,
        instant: {
          appId: row.appId,
          command: row.offer.commandRevision.command.name,
          arguments: row.offer.arguments as Record<string, unknown>,
          key: row.clientRequestId.slice(prefix.length),
        },
      };
    return { quote };
  }
}
