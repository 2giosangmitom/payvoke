import { randomUUID } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { FastifyInstance } from "fastify";
import { x402ResourceServer } from "@x402/core/server";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import {
  businessKey,
  hashQuote,
  hashSnapshot,
  vaultDomain,
  type InvocationQuote,
  type Json,
} from "@payvoke/protocol";
import {
  ASSET,
  NETWORK,
  VaultServerScheme,
  paymentRequirements,
  validateQuoteDocument,
  wireQuote,
  type QuoteDocument,
} from "@payvoke/x402";
import { getAddress, type Address } from "viem";
import type { Config } from "../../config";
import { Prisma, type PrismaClient } from "@payvoke/db";
import { parseFinancialJson } from "@payvoke/server";
import { gatewayFacilitator, settleGateway } from "../payments/gateway";
import { isAvailable, termsMinEvidence, threadSlotReleased } from "../apps/schema";

type PrepareBody = {
  threadId: string;
  commandId: string;
  arguments: Record<string, Json>;
  contextSelection: { messageIds: string[]; briefVersionId: string | null; fileIds: string[] };
  clientRequestId: string;
};

const id = { type: "string", minLength: 1, maxLength: 128 };

// Register in a child Fastify scope; do not change Better Auth's JSON parser.
export async function registerQuotes(app: FastifyInstance, config: Config, db: PrismaClient) {
  const facilitator = gatewayFacilitator(app, config);
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, parseFinancialJson(body as string));
    } catch {
      done(app.httpErrors.badRequest("INVALID_JSON"));
    }
  });
  app.addHook("onRequest", async (_request, reply) => {
    reply.cacheControl("no-store");
  });

  function configuredVault(): Address {
    if (!config.VAULT_ADDRESS) throw app.httpErrors.serviceUnavailable("VAULT_NOT_CONFIGURED");
    if (config.CHAIN_ID !== 43113 || getAddress(config.USDC_ADDRESS) !== getAddress(ASSET)) {
      throw app.httpErrors.serviceUnavailable("PAYMENT_CONFIGURATION_MISMATCH");
    }
    return getAddress(config.VAULT_ADDRESS);
  }
  function document(value: Prisma.JsonValue, buyer: string) {
    const result = value as unknown as QuoteDocument;
    validateQuoteDocument(result, configuredVault(), getAddress(buyer));
    return result;
  }
  function replay(
    row: { requestHash: string; document: Prisma.JsonValue },
    hash: string,
    buyer: string,
  ) {
    if (row.requestHash !== hash) throw app.httpErrors.conflict("IDEMPOTENCY_CONFLICT");
    const quote = document(row.document, buyer);
    if (quote.validUntil <= Math.floor(Date.now() / 1000))
      throw app.httpErrors.gone("QUOTE_EXPIRED");
    return quote;
  }

  app.post<{ Body: PrepareBody }>(
    "/v1/quotes",
    {
      bodyLimit: 32768,
      preHandler: app.requireAccount,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["threadId", "commandId", "arguments", "contextSelection", "clientRequestId"],
          properties: {
            threadId: id,
            commandId: id,
            clientRequestId: id,
            arguments: { type: "object" },
            contextSelection: {
              type: "object",
              additionalProperties: false,
              required: ["messageIds", "briefVersionId", "fileIds"],
              properties: {
                messageIds: { type: "array", maxItems: 100, uniqueItems: true, items: id },
                briefVersionId: { anyOf: [id, { type: "null" }] },
                fileIds: { type: "array", maxItems: 100, uniqueItems: true, items: id },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const buyer = request.account!;
      if (request.headers["idempotency-key"] !== body.clientRequestId) {
        throw app.httpErrors.badRequest("IDEMPOTENCY_KEY_REQUIRED");
      }
      // Context resolvers are not implemented yet. Never silently drop a selected
      // context or let a client supply content/hash instead of an owned record.
      if (
        body.contextSelection.messageIds.length ||
        body.contextSelection.fileIds.length ||
        body.contextSelection.briefVersionId !== null
      )
        throw app.httpErrors.badRequest("CONTEXT_NOT_SUPPORTED");
      const vault = configuredVault();
      const requestHash = hashSnapshot(body as unknown as Json);
      const key = { buyerId: buyer.id, clientRequestId: body.clientRequestId };
      const existing = await db.quote.findUnique({ where: { buyerId_clientRequestId: key } });
      if (existing) return reply.code(201).send(replay(existing, requestHash, buyer.walletAddress));

      let result: QuoteDocument;
      try {
        result = await db.$transaction(async (tx) => {
          // A write lock serializes admissions per session on PostgreSQL. Re-read
          // after acquiring it; PGlite tests alone do not prove cross-process locks.
          const locked = await tx.chatThread.updateMany({
            where: { id: body.threadId, buyerId: buyer.id, archivedAt: null },
            data: { quoteLockVersion: { increment: 1 } },
          });
          if (!locked.count) throw app.httpErrors.notFound("THREAD_NOT_FOUND");
          const prior = await tx.quote.findUnique({ where: { buyerId_clientRequestId: key } });
          if (prior) return replay(prior, requestHash, buyer.walletAddress);
          const thread = await tx.chatThread.findUniqueOrThrow({
            where: { id: body.threadId },
            include: { app: true },
          });
          const now = Math.floor(Date.now() / 1000);
          if (thread.activeQuoteId) {
            const active = await tx.quote.findUniqueOrThrow({
              where: { id: thread.activeQuoteId },
              include: { invocation: { include: { settlement: { include: { attempt: true } } } } },
            });
            if (!threadSlotReleased(active, now * 1000))
              throw app.httpErrors.conflict("THREAD_BUSY");
          }
          const product = thread.app;
          if (product.status !== "ACTIVE" || product.archivedAt) {
            throw app.httpErrors.conflict("APP_UNAVAILABLE");
          }
          if (!isAvailable(product)) throw app.httpErrors.conflict("APP_OFFLINE");
          const command = await tx.appCommand.findFirst({
            where: {
              id: body.commandId,
              appId: product.id,
              archivedAt: null,
              activeRevisionId: { not: null },
            },
            include: { activeRevision: true },
          });
          if (!command) throw app.httpErrors.notFound("COMMAND_NOT_FOUND");
          const revision = command.activeRevision;
          if (!revision) throw app.httpErrors.conflict("COMMAND_NOT_READY");
          const version = { number: 1 };
          const policy = await tx.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
          if (!policy || getAddress(policy.vault) !== vault) {
            throw app.httpErrors.serviceUnavailable("POLICY_NOT_CONFIGURED");
          }
          // A floor raised after the revision was published still blocks new sales.
          if (revision.grossAmount.lessThan(policy.minGrossAmount))
            throw app.httpErrors.conflict("PRICE_BELOW_FLOOR");
          const effectiveArguments = structuredClone(body.arguments);
          const schema = revision.inputSchema;
          if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
            throw app.httpErrors.serviceUnavailable("INVALID_COMMAND_SCHEMA");
          }
          if ("$async" in schema) throw app.httpErrors.serviceUnavailable("INVALID_COMMAND_SCHEMA");
          // Do not retain freshly loaded schema object identities in an unbounded
          // process-wide Ajv cache. This is preparation, not the paid hot path.
          const validate = new Ajv2020({
            useDefaults: true,
            coerceTypes: false,
            removeAdditional: false,
            strict: true,
          }).compile(schema);
          if (!validate(effectiveArguments)) throw app.httpErrors.badRequest("INVALID_ARGUMENTS");
          if (
            revision.deliverySeconds <= 0 ||
            revision.reviewSeconds < 0 ||
            policy.resolutionGraceSeconds <= 0 ||
            policy.quoteLifetimeSeconds <= 0 ||
            policy.maxHoldSeconds <= 0
          ) {
            throw app.httpErrors.serviceUnavailable("INVALID_DEADLINES");
          }
          const terms = revision.terms;
          if (
            !terms ||
            typeof terms !== "object" ||
            Array.isArray(terms) ||
            terms.deliverySeconds !== revision.deliverySeconds ||
            terms.reviewSeconds !== revision.reviewSeconds ||
            !termsMinEvidence(terms)
          ) {
            throw app.httpErrors.serviceUnavailable("TERMS_INCONSISTENT");
          }
          const validUntil = now + policy.quoteLifetimeSeconds;
          const deliveryDeadline = validUntil + revision.deliverySeconds;
          const releaseNotBefore = deliveryDeadline + revision.reviewSeconds;
          const resolveBy = releaseNotBefore + policy.resolutionGraceSeconds;
          if (resolveBy - now > policy.maxHoldSeconds)
            throw app.httpErrors.serviceUnavailable("HOLD_DURATION_EXCEEDED");
          const quoteId = randomUUID();
          const invocationId = randomUUID();
          // The paid agent sees a bounded, verified transcript from this owned
          // session. Unverified streaming previews cannot enter a new quote.
          const history: { role: "user" | "assistant"; content: string; invocationId: string }[] =
            [];
          {
            const previous = (
              await tx.quote.findMany({
                where: { threadId: thread.id, invocation: { executionStatus: "DELIVERED" } },
                select: {
                  invocationId: true,
                  document: true,
                  invocation: { select: { run: { select: { result: true } } } },
                },
                take: 6,
                orderBy: { createdAt: "desc" },
              })
            ).reverse();
            const events = previous.length
              ? await tx.aguiStreamEvent.findMany({
                  where: { invocationId: { in: previous.map((p) => p.invocationId) } },
                  orderBy: { cursor: "asc" },
                  select: { invocationId: true, event: true },
                  take: 10000,
                })
              : [];
            const outputs = new Map<string, string[]>();
            for (const { invocationId: oldId, event } of events) {
              if (!event || typeof event !== "object" || Array.isArray(event)) continue;
              if (event.type === "TEXT_MESSAGE_START")
                outputs.set(oldId, [...(outputs.get(oldId) ?? []), ""]);
              if (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string") {
                const messages = outputs.get(oldId);
                if (messages?.length) messages[messages.length - 1] += event.delta;
              }
            }
            for (const previousQuote of previous) {
              const document = previousQuote.document;
              if (!document || typeof document !== "object" || Array.isArray(document)) continue;
              const input = document.inputSnapshot;
              if (!input || typeof input !== "object" || Array.isArray(input)) continue;
              const args = input.arguments;
              if (!args || typeof args !== "object" || Array.isArray(args)) continue;
              const values = Object.values(args);
              const prompt =
                values.length === 1 && typeof values[0] === "string"
                  ? values[0]
                  : JSON.stringify(args);
              history.push({
                role: "user",
                content: prompt.slice(0, 2000),
                invocationId: previousQuote.invocationId,
              });
              const text = (outputs.get(previousQuote.invocationId) ?? []).join("\n").trim();
              const result = previousQuote.invocation?.run?.result;
              const fallback =
                result && typeof result === "object" && !Array.isArray(result)
                  ? JSON.stringify(result.output)
                  : "";
              if (text || fallback)
                history.push({
                  role: "assistant",
                  content: (text || fallback).slice(0, 2000),
                  invocationId: previousQuote.invocationId,
                });
            }
          }
          const contextManifest = { messages: history, brief: null, files: [] };
          const inputSnapshot = {
            schemaVersion: 1,
            sessionId: thread.id,
            productId: product.id,
            productVersion: version.number,
            commandId: command.id,
            commandSchemaHash: hashSnapshot(schema as Json),
            arguments: effectiveArguments,
            context: contextManifest,
          };
          const termsSnapshot = {
            schemaVersion: 2,
            productId: product.id,
            productVersion: version.number,
            commandId: command.id,
            definition: revision.terms as Json,
            deliveryDeadline,
          };
          const policySnapshot = {
            schemaVersion: 1,
            policyVersion: policy.version,
            feeBps: policy.feeBps,
            feeRecipient: getAddress(policy.feeRecipient),
            quoteLifetimeSeconds: policy.quoteLifetimeSeconds,
            maxHoldSeconds: policy.maxHoldSeconds,
            resolutionGraceSeconds: policy.resolutionGraceSeconds,
          };
          const protocol: InvocationQuote = {
            invocationKey: businessKey("invocation", invocationId),
            quoteKey: businessKey("quote", quoteId),
            buyer: getAddress(buyer.walletAddress),
            usageSessionKey: businessKey("session", thread.id),
            productKey: businessKey("product", product.id),
            productVersion: BigInt(version.number),
            commandKey: businessKey("command", command.id),
            inputHash: hashSnapshot(inputSnapshot),
            termsHash: hashSnapshot(termsSnapshot),
            policyHash: hashSnapshot(policySnapshot),
            provider: getAddress(product.payoutAddress),
            asset: ASSET,
            grossAmount: BigInt(revision.grossAmount.toFixed(0)),
            feeBps: policy.feeBps,
            feeRecipient: policySnapshot.feeRecipient,
            validUntil,
            deliveryDeadline,
            releaseNotBefore,
            resolveBy,
          };
          const quote: QuoteDocument = {
            quoteId,
            invocationId,
            sessionId: thread.id,
            productId: product.id,
            productVersion: version.number,
            commandId: command.id,
            network: NETWORK,
            asset: ASSET,
            vault,
            providerPayout: protocol.provider,
            grossAmount: protocol.grossAmount.toString(),
            feeBps: policy.feeBps,
            feeRecipient: protocol.feeRecipient,
            validUntil,
            deliveryDeadline,
            releaseNotBefore,
            resolveBy,
            policyVersion: policy.version,
            quoteLifetimeSeconds: policy.quoteLifetimeSeconds,
            quoteDigest: hashQuote(vaultDomain(vault), protocol),
            inputHash: protocol.inputHash,
            termsHash: protocol.termsHash,
            policyHash: protocol.policyHash,
            effectiveArguments,
            contextManifest,
            inputSnapshot,
            termsSnapshot,
            policySnapshot,
            protocolQuote: wireQuote(protocol),
          };
          validateQuoteDocument(quote, vault, protocol.buyer);
          await tx.quote.create({
            data: {
              id: quoteId,
              invocationId,
              ...key,
              threadId: thread.id,
              appId: product.id,
              commandRevisionId: revision.id,
              requestHash,
              validUntil: new Date(validUntil * 1000),
              document: quote as unknown as Prisma.InputJsonValue,
            },
          });
          await tx.chatThread.update({
            where: { id: thread.id },
            data: { activeQuoteId: quoteId },
          });
          return quote;
        });
      } catch (error) {
        // The buyer-wide idempotency key can also race across different threads.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
          throw error;
        const prior = await db.quote.findUniqueOrThrow({ where: { buyerId_clientRequestId: key } });
        result = replay(prior, requestHash, buyer.walletAddress);
      }
      return reply.code(201).send(result);
    },
  );

  // Restore an unpaid authorization after a tab refresh. Quotes are immutable;
  // only the buyer may retrieve their own document, and paid runs cannot be
  // submitted again through this checkout surface.
  app.get<{ Params: { quoteId: string } }>(
    "/v1/quotes/:quoteId",
    { preHandler: app.requireAccount },
    async (request) => {
      const row = await db.quote.findFirst({
        where: { id: request.params.quoteId, buyerId: request.account!.id },
        include: { invocation: { include: { settlement: true } }, thread: true },
      });
      if (!row || row.thread.archivedAt) throw app.httpErrors.notFound("QUOTE_NOT_FOUND");
      if (row.invocation?.settlement || row.validUntil.getTime() <= Date.now())
        return { quote: null };
      return { quote: document(row.document, request.account!.walletAddress) };
    },
  );

  app.post<{ Body: { quoteId: string } }>(
    "/v1/invocations",
    {
      bodyLimit: 1024,
      preHandler: app.requireAccount,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["quoteId"],
          properties: { quoteId: id },
        },
      },
    },
    async (request, reply) => {
      const buyer = request.account!;
      const row = await db.quote.findFirst({
        where: { id: request.body.quoteId, buyerId: buyer.id },
        include: { thread: true, app: true, invocation: { include: { settlement: true } } },
      });
      if (!row || row.thread.buyerId !== buyer.id) {
        throw app.httpErrors.notFound("QUOTE_NOT_FOUND");
      }
      const quote = document(row.document, buyer.walletAddress);
      if (request.headers["idempotency-key"] !== quote.invocationId) {
        throw app.httpErrors.badRequest("IDEMPOTENCY_KEY_REQUIRED");
      }
      if (!row.invocation?.settlement) {
        if (row.thread.archivedAt) throw app.httpErrors.notFound("QUOTE_NOT_FOUND");
        if (row.app.status !== "ACTIVE" || row.app.archivedAt)
          throw app.httpErrors.conflict("APP_UNAVAILABLE");
        if (quote.validUntil <= Math.floor(Date.now() / 1000))
          throw app.httpErrors.gone("QUOTE_EXPIRED");
      }
      // Only explicit private-facilitator configuration enables submission.
      // Signing and broadcasting never happen in this HTTP process.
      if (request.headers["payment-signature"] !== undefined) {
        if (facilitator) return settleGateway(app, db, config, facilitator, quote, request, reply);
        throw app.httpErrors.serviceUnavailable("SETTLEMENT_NOT_AVAILABLE");
      }
      const core = new x402ResourceServer().register(NETWORK, new VaultServerScheme(quote));
      const resource = {
        url: new URL("/v1/invocations", config.API_ORIGIN).href,
        method: "POST",
        description: "Payvoke invocation",
        mimeType: "application/json",
      };
      const required = await core.createPaymentRequiredResponse(
        [paymentRequirements(quote)],
        resource,
      );
      return reply
        .code(402)
        .header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required))
        .send(required);
    },
  );
}
