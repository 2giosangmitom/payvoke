import type { Cradle } from "@fastify/awilix";
import { vaultFinanceAbi } from "@payvoke/protocol";
import type { QuoteDocument } from "@payvoke/x402";
import { encodeFunctionData, getAddress, type Hex } from "viem";
import { ConflictError, NotFoundError } from "../../errors";

export type FinancialIntentBody = { action: "reclaim" };

const latestEvidence = { orderBy: [{ observedAt: "desc" as const }, { id: "desc" as const }] };

// Read-only payment status, available independently of quote expiry or worker
// leases. Polling never triggers admission or broadcast.
export class PaymentStatusService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  async status(buyerId: string, invocationId: string) {
    const invocation = await this.db.invocation.findFirst({
      where: { id: invocationId, buyerId },
      include: { quote: true, settlement: { include: { attempt: true } } },
    });
    if (!invocation || !invocation.settlement) throw new NotFoundError("INVOCATION_NOT_FOUND");
    const operation = invocation.settlement;
    const attempt = operation.attempt;
    const financial = await this.db.vaultHoldProjection.findUnique({
      where: { holdId: operation.invocationKey },
    });
    const evidence = await this.db.paymentDeliveryEvidence.findFirst({
      where: { invocationId: invocation.id },
      ...latestEvidence,
      select: { artifactVersion: true, evidenceLevel: true, envelopeHash: true },
    });
    const quote = invocation.quote.document as unknown as QuoteDocument;
    return {
      invocationId: invocation.id,
      threadId: invocation.quote.threadId,
      paymentStatus:
        operation.state === "PENDING" && attempt?.state === "UNKNOWN" ? "UNKNOWN" : operation.state,
      executionStatus: invocation.executionStatus,
      financial: financial
        ? {
            status: financial.status,
            hold: financial.snapshot,
            finalizedBlock: financial.blockNumber.toString(),
            finalizedBlockHash: financial.blockHash,
          }
        : null,
      delivery: evidence,
      transaction: attempt?.transactionHash ?? null,
      failure: operation.errorReason ? { code: operation.errorReason } : null,
      receipt:
        operation.state === "HELD" && attempt?.state === "FINALIZED"
          ? {
              success: true,
              transaction: attempt.transactionHash,
              network: attempt.network,
              payer: quote.protocolQuote.buyer,
              amount: quote.grossAmount,
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
  }

  // Returns UNSUBMITTED wallet calldata only. The buyer simulates, signs and
  // sends it; the finalized indexer observes the transaction independently.
  async financialIntent(buyerId: string, invocationId: string) {
    const invocation = await this.db.invocation.findFirst({
      where: { id: invocationId, buyerId },
      include: { quote: true, settlement: true },
    });
    if (!invocation?.settlement) throw new NotFoundError("INVOCATION_NOT_FOUND");
    const settlement = invocation.settlement;
    if (settlement.state !== "HELD") throw new ConflictError("PAYMENT_NOT_HELD");
    const projection = await this.db.vaultHoldProjection.findUnique({
      where: { holdId: settlement.invocationKey },
    });
    if (projection && ["RELEASED", "REFUNDED", "RECLAIMED"].includes(projection.status))
      throw new ConflictError("HOLD_CLOSED");
    const quote = invocation.quote.document as unknown as QuoteDocument;
    const holdId = settlement.invocationKey as Hex;
    return {
      status: "UNSUBMITTED",
      chainId: 43113,
      from: getAddress(quote.protocolQuote.buyer),
      to: getAddress(quote.vault),
      value: "0",
      data: encodeFunctionData({ abi: vaultFinanceAbi, functionName: "reclaim", args: [holdId] }),
      resolveBy: quote.resolveBy,
      requiresWalletSignature: true,
      requiresSimulation: true,
    };
  }
}
