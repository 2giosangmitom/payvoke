import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client";
import { vaultFinanceAbi } from "@payvoke/protocol";
import { encodeFunctionData, getAddress, type Hex } from "viem";
import type { QuoteDocument } from "@payvoke/x402";

// Read-only status is available independently of quote expiry or worker leases.
// Polling does not trigger admission or broadcast.
export async function registerPaymentStatus(app: FastifyInstance, db: PrismaClient) {
  app.post<{ Params: { id: string }; Body: { action: "dispute" | "reclaim"; evidenceHash?: Hex } }>(
    "/v1/invocations/:id/financial-intents",
    {
      preHandler: app.requireAccount,
      onRequest: async (_request, reply) => {
        reply.cacheControl("no-store");
      },
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
        },
        body: {
          type: "object",
          required: ["action"],
          additionalProperties: false,
          properties: {
            action: { enum: ["dispute", "reclaim"] },
            evidenceHash: { type: "string", pattern: "^0x[0-9a-f]{64}$" },
          },
        },
      },
    },
    async (request) => {
      const invocation = await db.invocation.findFirst({
        where: { id: request.params.id, buyerId: request.account!.id },
        include: { quote: true, settlement: true },
      });
      if (!invocation?.settlement) throw app.httpErrors.notFound("INVOCATION_NOT_FOUND");
      if (invocation.settlement.state !== "HELD") throw app.httpErrors.conflict("PAYMENT_NOT_HELD");
      const projection = await db.vaultHoldProjection.findUnique({
        where: { holdId: invocation.settlement.invocationKey },
      });
      if (projection && ["RELEASED", "REFUNDED", "RECLAIMED"].includes(projection.status))
        throw app.httpErrors.conflict("HOLD_CLOSED");
      const q = invocation.quote.document as unknown as QuoteDocument;
      if (request.body.action === "dispute" && !request.body.evidenceHash)
        throw app.httpErrors.badRequest("EVIDENCE_HASH_REQUIRED");
      return {
        status: "UNSUBMITTED",
        chainId: 43113,
        from: getAddress(q.protocolQuote.buyer),
        to: getAddress(q.vault),
        value: "0",
        data:
          request.body.action === "dispute"
            ? encodeFunctionData({
                abi: vaultFinanceAbi,
                functionName: "openDispute",
                args: [invocation.settlement.invocationKey as Hex, request.body.evidenceHash!],
              })
            : encodeFunctionData({
                abi: vaultFinanceAbi,
                functionName: "reclaim",
                args: [invocation.settlement.invocationKey as Hex],
              }),
        resolveBy: q.resolveBy,
        requiresWalletSignature: true,
        requiresSimulation: true,
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/v1/invocations/:id",
    {
      onRequest: async (_request, reply) => {
        reply.cacheControl("no-store");
      },
      preHandler: app.requireAccount,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
        },
      },
    },
    async (request) => {
      const invocation = await db.invocation.findFirst({
        where: { id: request.params.id, buyerId: request.account!.id },
        include: { quote: true, settlement: { include: { attempt: true } } },
      });
      if (!invocation || !invocation.settlement)
        throw app.httpErrors.notFound("INVOCATION_NOT_FOUND");
      const operation = invocation.settlement;
      const attempt = operation.attempt;
      const financial = await db.vaultHoldProjection.findUnique({
        where: { holdId: operation.invocationKey },
      });
      return {
        invocationId: invocation.id,
        sessionId: invocation.quote.sessionId,
        paymentStatus:
          operation.state === "PENDING" && attempt?.state === "UNKNOWN"
            ? "UNKNOWN"
            : operation.state,
        executionStatus: invocation.executionStatus,
        financial: financial
          ? {
              status: financial.status,
              hold: financial.snapshot,
              finalizedBlock: financial.blockNumber.toString(),
              finalizedBlockHash: financial.blockHash,
            }
          : null,
        transaction: attempt?.transactionHash ?? null,
        failure: operation.errorReason ? { code: operation.errorReason } : null,
        receipt:
          operation.state === "HELD" && attempt?.state === "FINALIZED"
            ? {
                success: true,
                transaction: attempt.transactionHash,
                network: attempt.network,
                payer: (invocation.quote.document as { protocolQuote: { buyer: string } })
                  .protocolQuote.buyer,
                amount: (invocation.quote.document as { grossAmount: string }).grossAmount,
                extra: {
                  schemeVersion: "1",
                  invocationId: invocation.id,
                  quoteId: invocation.quoteId,
                  holdId: operation.invocationKey,
                },
              }
            : null,
        nextActions:
          operation.state === "PENDING"
            ? ["poll"]
            : operation.errorReason === "hold_not_executable" || operation.state === "QUARANTINED"
              ? ["contact_support"]
              : [],
      };
    },
  );
}
