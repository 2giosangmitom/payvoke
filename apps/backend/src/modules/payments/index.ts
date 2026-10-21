import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client";

// Read-only status is available independently of quote expiry or worker leases.
// No admission/broadcast route is enabled until the facilitator/finality ships.
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
        nextActions: operation.state === "PENDING" ? ["poll"] : [],
      };
    },
  );
}
