import type { Cradle } from "@fastify/awilix";
import { vaultFinanceAbi } from "@payvoke/protocol";
import type { QuoteDocument } from "@payvoke/x402";
import { encodeFunctionData, getAddress, type Hex } from "viem";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors";

export type FinancialIntentBody = { action: "reclaim" };

const PAGE = 30;

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

  // The buyer's paid invocations, newest first, for the console activity view.
  async list(buyerId: string, cursor?: string) {
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 128))
      throw new BadRequestError("INVALID_CURSOR");
    const rows = await this.db.invocation.findMany({
      where: { buyerId, settlement: { isNot: null } },
      include: {
        quote: {
          include: {
            app: { select: { id: true, name: true } },
            commandRevision: { select: { command: { select: { name: true } } } },
          },
        },
        settlement: { include: { attempt: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const projections = await this.db.vaultHoldProjection.findMany({
      where: { holdId: { in: page.map((row) => row.settlement!.invocationKey) } },
      select: { holdId: true, status: true },
    });
    const financial = new Map(projections.map((row) => [row.holdId, row.status]));
    return {
      items: page.map((row) => {
        const operation = row.settlement!;
        const quote = row.quote.document as unknown as QuoteDocument;
        return {
          invocationId: row.id,
          threadId: row.quote.threadId,
          app: row.quote.app,
          commandName: row.quote.commandRevision?.command.name ?? null,
          grossAmount: quote.grossAmount,
          paymentStatus:
            operation.state === "PENDING" && operation.attempt?.state === "UNKNOWN"
              ? "UNKNOWN"
              : operation.state,
          executionStatus: row.executionStatus,
          financialStatus: financial.get(operation.invocationKey) ?? null,
          deliveryDeadline: quote.deliveryDeadline,
          releaseNotBefore: quote.releaseNotBefore,
          resolveBy: quote.resolveBy,
          createdAt: row.createdAt,
        };
      }),
      nextCursor: rows.length > PAGE ? page.at(-1)!.id : null,
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
