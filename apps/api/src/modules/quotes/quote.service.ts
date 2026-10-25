import Ajv2020 from "ajv/dist/2020.js";
import type { Cradle } from "@fastify/awilix";
import { hashSnapshot, type Json } from "@payvoke/protocol";
import { ASSET, validateQuoteDocument, type QuoteDocument } from "@payvoke/x402";
import { termsMinEvidence } from "@payvoke/payments/evidence";
import type { Prisma } from "@payvoke/db";
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
import { buildQuoteDocument } from "./quote-document";
import type { PrepareQuoteBody } from "./quote.schemas";
import { loadTranscript } from "./transcript";

type StoredQuote = { requestHash: string; document: Prisma.JsonValue };
const nowSeconds = () => Math.floor(Date.now() / 1000);

export class QuoteService {
  private readonly db: Cradle["db"];
  private readonly config: Cradle["config"];

  constructor({ db, config }: Cradle) {
    this.db = db;
    this.config = config;
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
    // Context resolvers are not implemented yet. Never silently drop a selected
    // context or let a client supply content/hash instead of an owned record.
    const context = body.contextSelection;
    if (context.messageIds.length || context.fileIds.length || context.briefVersionId !== null)
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
    const command = await tx.appCommand.findFirst({
      where: {
        id: body.commandId,
        appId: product.id,
        archivedAt: null,
        activeRevisionId: { not: null },
      },
      include: { activeRevision: true },
    });
    if (!command) throw new NotFoundError("COMMAND_NOT_FOUND");
    const revision = command.activeRevision;
    if (!revision) throw new ConflictError("COMMAND_NOT_READY");
    const policy = await tx.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    if (!policy || getAddress(policy.vault) !== vault)
      throw new ServiceUnavailableError("POLICY_NOT_CONFIGURED");
    // A floor raised after the revision was published still blocks new sales.
    if (revision.grossAmount.lessThan(policy.minGrossAmount))
      throw new ConflictError("PRICE_BELOW_FLOOR");
    const schema = revision.inputSchema;
    if (!schema || typeof schema !== "object" || Array.isArray(schema) || "$async" in schema)
      throw new ServiceUnavailableError("INVALID_COMMAND_SCHEMA");
    const effectiveArguments = structuredClone(body.arguments);
    // Do not retain freshly loaded schema object identities in an unbounded
    // process-wide Ajv cache. This is preparation, not the paid hot path.
    const validate = new Ajv2020({
      useDefaults: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: true,
    }).compile(schema);
    if (!validate(effectiveArguments)) throw new BadRequestError("INVALID_ARGUMENTS");
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
      commandId: command.id,
      revision,
      policy,
      schema: schema as Json,
      effectiveArguments,
      history: await loadTranscript(tx, thread.id),
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
    return quote;
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
