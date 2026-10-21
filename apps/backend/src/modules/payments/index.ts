import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client";

// Read-only status is available independently of quote expiry or worker leases.
// Polling does not trigger admission or broadcast.
export async function registerPaymentStatus(app: FastifyInstance, db: PrismaClient) {
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
      return {
        invocationId: invocation.id,
        sessionId: invocation.quote.sessionId,
        paymentStatus:
          operation.state === "PENDING" && attempt?.state === "UNKNOWN"
            ? "UNKNOWN"
            : operation.state,
        executionStatus: invocation.executionStatus,
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
