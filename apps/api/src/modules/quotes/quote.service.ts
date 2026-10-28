import type { Cradle } from "@fastify/awilix";
import { hashSnapshot, type Json } from "@payvoke/shared/protocol";
import { ASSET, validateQuoteDocument, type QuoteDocument } from "@payvoke/shared/x402";
import { termsMinEvidence } from "@/core/payments/evidence";
import type { Prisma } from "@/core/db";
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
        this.admit(tx, { buyer, body, vault, requestHash, key }),
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
    },
  ) {
    const { buyer, body, vault, requestHash, key } = input;
    // A write lock serializes admissions per session on PostgreSQL. Re-read
    // after acquiring it; PGlite tests alone do not prove cross-process locks.
    const locked = await tx.chatThread.updateMany({
      where: { id: body.threadId, buyerId: buyer.id, archivedAt: null },
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
    const priced = await this.offerTerms(tx, thread.id, product.id, body);
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
      (revision.maxGrossAmount && grossAmount > BigInt(revision.maxGrossAmount.toFixed(0))) ||
      offer.deliverySeconds > revision.deliverySeconds
    )
      throw new ConflictError("OFFER_INVALID");
    const entries = await conversation(tx, threadId, offer.messageSeq);
    if (conversationHash(entries) !== offer.conversationHash)
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

  // Restores an unpaid authorization after a tab refresh. Paid or expired
  // quotes cannot be submitted again through checkout.
  async restore(buyer: AccountIdentity, quoteId: string) {
    const row = await this.db.quote.findFirst({
      where: { id: quoteId, buyerId: buyer.id },
      include: { invocation: { include: { settlement: true } }, thread: true },
    });
    if (!row || row.thread.archivedAt) throw new NotFoundError("QUOTE_NOT_FOUND");
    if (row.invocation?.settlement || row.validUntil.getTime() <= Date.now())
      return { quote: null };
    return { quote: this.document(row.document, buyer.walletAddress) };
  }
}
