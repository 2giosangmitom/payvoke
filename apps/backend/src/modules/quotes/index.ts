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
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { parseFinancialJson } from "../../http/json";
import { gatewayFacilitator, settleGateway } from "../payments/gateway";

type PrepareBody = {
  sessionId: string;
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
          required: ["sessionId", "commandId", "arguments", "contextSelection", "clientRequestId"],
          properties: {
            sessionId: id,
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
          const locked = await tx.usageSession.updateMany({
            where: { id: body.sessionId, buyerId: buyer.id, archivedAt: null },
            data: { quoteLockVersion: { increment: 1 } },
          });
          if (!locked.count) throw app.httpErrors.notFound("SESSION_NOT_FOUND");
          const prior = await tx.quote.findUnique({ where: { buyerId_clientRequestId: key } });
          if (prior) return replay(prior, requestHash, buyer.walletAddress);
          const session = await tx.usageSession.findUniqueOrThrow({
            where: { id: body.sessionId },
            include: { product: true },
          });
          const now = Math.floor(Date.now() / 1000);
          if (session.activeQuoteId) {
            const active = await tx.quote.findUniqueOrThrow({
              where: { id: session.activeQuoteId },
              include: { invocation: { include: { settlement: { include: { attempt: true } } } } },
            });
            // Unresolved transactions outlive quote expiry. A finalized revert
            // proves the attempt consumed its nonce without reserving a hold.
            const finalizedRevert =
              active.invocation?.settlement?.state === "REJECTED" &&
              active.invocation.settlement.attempt?.state === "REVERTED" &&
              !!active.invocation.settlement.attempt.finalizedAt;
            if (
              active.invocation?.settlement &&
              (active.invocation.settlement.state !== "REJECTED" ||
                (active.invocation.settlement.attempt && !finalizedRevert))
            ) {
              throw app.httpErrors.conflict("SESSION_BUSY");
            }
            if (!finalizedRevert && active.validUntil.getTime() > now * 1000)
              throw app.httpErrors.conflict("SESSION_BUSY");
          }
          const product = session.product;
          if (product.providerAppId) throw app.httpErrors.conflict("PROVIDER_DELIVERY_NOT_READY");
          if (product.kind !== "TOOL")
            throw app.httpErrors.badRequest("PRODUCT_KIND_NOT_SUPPORTED");
          if (product.status !== "PUBLISHED" || !product.activeVersion) {
            throw app.httpErrors.conflict("PRODUCT_UNAVAILABLE");
          }
          const version = await tx.productVersion.findUnique({
            where: { productId_number: { productId: product.id, number: product.activeVersion } },
          });
          if (!version || version.status !== "APPROVED")
            throw app.httpErrors.conflict("PRODUCT_UNAVAILABLE");
          const command = await tx.commandVersion.findUnique({
            where: {
              productId_productVersion_commandId: {
                productId: product.id,
                productVersion: version.number,
                commandId: body.commandId,
              },
            },
          });
          if (!command) throw app.httpErrors.notFound("COMMAND_NOT_FOUND");
          const policy = await tx.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
          if (!policy || getAddress(policy.vault) !== vault) {
            throw app.httpErrors.serviceUnavailable("POLICY_NOT_CONFIGURED");
          }
          const effectiveArguments = structuredClone(body.arguments);
          const schema = command.inputSchema;
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
            command.deliverySeconds <= 0 ||
            command.reviewSeconds < 0 ||
            policy.resolutionGraceSeconds <= 0 ||
            policy.quoteLifetimeSeconds <= 0 ||
            policy.maxHoldSeconds <= 0
          ) {
            throw app.httpErrors.serviceUnavailable("INVALID_DEADLINES");
          }
          const terms = command.terms;
          if (
            !terms ||
            typeof terms !== "object" ||
            Array.isArray(terms) ||
            terms.deliverySeconds !== command.deliverySeconds ||
            terms.reviewSeconds !== command.reviewSeconds
          ) {
            throw app.httpErrors.serviceUnavailable("TERMS_INCONSISTENT");
          }
          const validUntil = now + policy.quoteLifetimeSeconds;
          const deliveryDeadline = validUntil + command.deliverySeconds;
          const releaseNotBefore = deliveryDeadline + command.reviewSeconds;
          const resolveBy = releaseNotBefore + policy.resolutionGraceSeconds;
          if (resolveBy - now > policy.maxHoldSeconds)
            throw app.httpErrors.serviceUnavailable("HOLD_DURATION_EXCEEDED");
          const quoteId = randomUUID();
          const invocationId = randomUUID();
          const contextManifest = { messages: [], brief: null, files: [] };
          const inputSnapshot = {
            schemaVersion: 1,
            sessionId: session.id,
            productId: product.id,
            productVersion: version.number,
            commandId: command.commandId,
            commandSchemaHash: hashSnapshot(schema as Json),
            arguments: effectiveArguments,
            context: contextManifest,
          };
          const termsSnapshot = {
            schemaVersion: 1,
            productId: product.id,
            productVersion: version.number,
            commandId: command.commandId,
            definition: command.terms as Json,
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
            usageSessionKey: businessKey("session", session.id),
            productKey: businessKey("product", product.id),
            productVersion: BigInt(version.number),
            commandKey: businessKey("command", command.commandId),
            inputHash: hashSnapshot(inputSnapshot),
            termsHash: hashSnapshot(termsSnapshot),
            policyHash: hashSnapshot(policySnapshot),
            provider: getAddress(version.payoutAddress),
            asset: ASSET,
            grossAmount: BigInt(command.grossAmount.toFixed(0)),
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
            sessionId: session.id,
            productId: product.id,
            productVersion: version.number,
            commandId: command.commandId,
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
              sessionId: session.id,
              requestHash,
              validUntil: new Date(validUntil * 1000),
              document: quote as unknown as Prisma.InputJsonValue,
            },
          });
          await tx.usageSession.update({
            where: { id: session.id },
            data: { activeQuoteId: quoteId },
          });
          return quote;
        });
      } catch (error) {
        // The buyer-wide idempotency key can also race across different sessions.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
          throw error;
        const prior = await db.quote.findUniqueOrThrow({ where: { buyerId_clientRequestId: key } });
        result = replay(prior, requestHash, buyer.walletAddress);
      }
      return reply.code(201).send(result);
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
        include: { session: true, invocation: { include: { settlement: true } } },
      });
      if (!row || row.session.buyerId !== buyer.id) {
        throw app.httpErrors.notFound("QUOTE_NOT_FOUND");
      }
      const quote = document(row.document, buyer.walletAddress);
      if (request.headers["idempotency-key"] !== quote.invocationId) {
        throw app.httpErrors.badRequest("IDEMPOTENCY_KEY_REQUIRED");
      }
      if (!row.invocation?.settlement) {
        if (row.session.archivedAt) throw app.httpErrors.notFound("QUOTE_NOT_FOUND");
        const product = await db.product.findUnique({ where: { id: row.session.productId } });
        if (!product || product.status !== "PUBLISHED")
          throw app.httpErrors.conflict("PRODUCT_UNAVAILABLE");
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
