import { businessKey, reserveHoldAbi } from "@payvoke/protocol";
import {
  NETWORK,
  readPaymentIntent,
  readQuote,
  validateQuoteDocument,
  type QuoteDocument,
} from "@payvoke/x402";
import {
  encodeFunctionData,
  getAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type TransactionSerialized,
} from "viem";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";

export class SettlementError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode = 409,
  ) {
    super(code);
  }
}
export type SettlementLease = { invocationId: string; owner: string; epoch: bigint };
type Tx = Prisma.TransactionClient;
type JournalPolicy = { vault: Address; resourceUrl: string };

async function databaseTime(tx: Tx) {
  // Epoch avoids raw timestamptz serialization depending on the PostgreSQL
  // session timezone (notably through the PGlite socket/Prisma adapter).
  const [clock] = await tx.$queryRaw<
    { nowMs: bigint }[]
  >`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`;
  return new Date(Number(clock.nowMs));
}
function checkedSeconds(seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 300)
    throw new Error("Invalid lease duration");
  return seconds;
}
// Locks the operation and fences every mutation. RPC/signing must happen outside
// this SQL transaction; stale workers cannot persist or broadcast new tx bytes.
async function lockLease(tx: Tx, lease: SettlementLease) {
  const now = await databaseTime(tx);
  const changed = await tx.settlementOperation.updateMany({
    where: {
      invocationId: lease.invocationId,
      state: "PENDING",
      leaseOwner: lease.owner,
      leaseEpoch: lease.epoch,
      leaseExpiresAt: { gt: now },
    },
    data: { revision: { increment: 1 } },
  });
  if (!changed.count) throw new SettlementError("LEASE_LOST");
  return tx.settlementOperation.findUniqueOrThrow({ where: { invocationId: lease.invocationId } });
}
function reason(code: string) {
  if (!/^[a-z][a-z0-9_]{0,79}$/.test(code)) throw new Error("Invalid machine-readable reason");
  return code;
}

/** Durable intent/transaction journal only. No RPC, private keys or successful
 * hold transitions live here. Only a future finality gate may write HELD. */
export class SettlementJournal {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: JournalPolicy,
  ) {}

  async recordIntent(input: {
    quoteId: string;
    buyerId: string;
    buyerAddress: Address;
    paymentPayload: unknown;
  }) {
    const row = await this.db.quote.findFirst({
      where: { id: input.quoteId, buyerId: input.buyerId },
    });
    if (!row) throw new SettlementError("QUOTE_NOT_FOUND", 404);
    const document = row.document as unknown as QuoteDocument;
    validateQuoteDocument(document, this.policy.vault, getAddress(input.buyerAddress));
    if (
      document.quoteId !== row.id ||
      document.invocationId !== row.invocationId ||
      document.sessionId !== row.sessionId
    ) {
      throw new SettlementError("QUOTE_INCONSISTENT", 500);
    }
    let intent: Awaited<ReturnType<typeof readPaymentIntent>>;
    try {
      intent = await readPaymentIntent(document, input.paymentPayload, this.policy.resourceUrl);
    } catch {
      throw new SettlementError("INVALID_PAYMENT", 400);
    }
    return this.db.$transaction(async (tx) => {
      // All quote-slot admission paths lock the same session row first.
      const locked = await tx.usageSession.updateMany({
        where: { id: row.sessionId, buyerId: input.buyerId },
        data: { quoteLockVersion: { increment: 1 } },
      });
      if (!locked.count) throw new SettlementError("SESSION_NOT_FOUND", 404);
      const previous = await tx.settlementOperation.findUnique({
        where: { invocationId: row.invocationId },
      });
      if (previous) {
        if (
          previous.quoteDigest !== document.quoteDigest ||
          previous.authorizationDigest !== intent.authorizationDigest
        ) {
          throw new SettlementError("INVOCATION_CONFLICT");
        }
        // Recovery/read authorization still works after quote expiry or catalog
        // suspension. This branch never authorizes a new onchain admission.
        return previous;
      }
      const session = await tx.usageSession.findUniqueOrThrow({
        where: { id: row.sessionId },
        include: { product: true },
      });
      const user = await tx.user.findUnique({ where: { id: input.buyerId } });
      if (!user || user.status !== "ACTIVE") throw new SettlementError("ACCOUNT_SUSPENDED", 403);
      if (session.productId !== document.productId || session.product.kind !== "TOOL") {
        throw new SettlementError("QUOTE_INCONSISTENT", 500);
      }
      if (session.archivedAt || session.product.status !== "PUBLISHED")
        throw new SettlementError("ADMISSION_UNAVAILABLE");
      if (session.activeQuoteId !== row.id) throw new SettlementError("SESSION_BUSY");
      const now = await databaseTime(tx);
      if (document.validUntil * 1000 <= now.getTime())
        throw new SettlementError("QUOTE_EXPIRED", 410);
      await tx.invocation.create({
        data: { id: row.invocationId, quoteId: row.id, buyerId: input.buyerId },
      });
      return tx.settlementOperation.create({
        data: {
          invocationId: row.invocationId,
          invocationKey: businessKey("invocation", row.invocationId),
          quoteDigest: document.quoteDigest,
          authorizationDigest: intent.authorizationDigest,
          recoveredSigner: intent.recoveredSigner.toLowerCase(),
          paymentPayload: intent.paymentPayload as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  async claim(invocationId: string, owner: string, seconds = 30): Promise<SettlementLease | null> {
    checkedSeconds(seconds);
    if (!owner || owner.length > 128) throw new Error("Invalid worker identity");
    return this.db.$transaction(async (tx) => {
      const now = await databaseTime(tx);
      const claimed = await tx.settlementOperation.updateMany({
        where: {
          invocationId,
          state: "PENDING",
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          leaseOwner: owner,
          leaseEpoch: { increment: 1 },
          leaseExpiresAt: new Date(now.getTime() + seconds * 1000),
        },
      });
      if (!claimed.count) return null;
      const op = await tx.settlementOperation.findUniqueOrThrow({ where: { invocationId } });
      return { invocationId, owner, epoch: op.leaseEpoch };
    });
  }

  async renew(lease: SettlementLease, seconds = 30) {
    checkedSeconds(seconds);
    await this.db.$transaction(async (tx) => {
      await lockLease(tx, lease);
      const now = await databaseTime(tx);
      await tx.settlementOperation.update({
        where: { invocationId: lease.invocationId },
        data: { leaseExpiresAt: new Date(now.getTime() + seconds * 1000) },
      });
    });
  }

  async reserveAttempt(
    lease: SettlementLease,
    input: {
      relayer: Address;
      nonce: bigint;
      gasLimit: bigint;
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    },
  ) {
    if (
      input.nonce < 0n ||
      input.nonce > BigInt(Number.MAX_SAFE_INTEGER) ||
      input.gasLimit <= 0n ||
      input.gasLimit > BigInt(Number.MAX_SAFE_INTEGER) ||
      input.maxFeePerGas <= 0n ||
      input.maxFeePerGas >= 1n << 256n ||
      input.maxPriorityFeePerGas < 0n ||
      input.maxPriorityFeePerGas > input.maxFeePerGas
    )
      throw new Error("Invalid transaction reservation");
    const relayer = getAddress(input.relayer).toLowerCase();
    return this.db.$transaction(async (tx) => {
      // Consistent order: lane before operation. Lane reservations do not time
      // out, unlike worker leases; a missing receipt never frees this lane.
      await tx.relayerLane.upsert({
        where: { network_relayer: { network: NETWORK, relayer } },
        create: { network: NETWORK, relayer },
        update: { revision: { increment: 1 } },
      });
      const lane = await tx.relayerLane.findUniqueOrThrow({
        where: { network_relayer: { network: NETWORK, relayer } },
      });
      await lockLease(tx, lease);
      if (lane.activeInvocationId && lane.activeInvocationId !== lease.invocationId)
        throw new SettlementError("RELAYER_BUSY");
      const previous = await tx.settlementAttempt.findUnique({
        where: { invocationId: lease.invocationId },
      });
      if (previous) {
        if (
          previous.relayer !== relayer ||
          previous.nonce !== input.nonce ||
          previous.gasLimit !== input.gasLimit ||
          previous.maxFeePerGas.toFixed(0) !== input.maxFeePerGas.toString() ||
          previous.maxPriorityFeePerGas.toFixed(0) !== input.maxPriorityFeePerGas.toString()
        ) {
          throw new SettlementError("ATTEMPT_CONFLICT");
        }
        return previous;
      }
      await tx.relayerLane.update({
        where: { network_relayer: { network: NETWORK, relayer } },
        data: { activeInvocationId: lease.invocationId },
      });
      return tx.settlementAttempt.create({
        data: {
          invocationId: lease.invocationId,
          network: NETWORK,
          relayer,
          nonce: input.nonce,
          gasLimit: input.gasLimit,
          maxFeePerGas: input.maxFeePerGas.toString(),
          maxPriorityFeePerGas: input.maxPriorityFeePerGas.toString(),
        },
      });
    });
  }

  async persistSigned(lease: SettlementLease, serialized: Hex) {
    const operation = await this.db.settlementOperation.findUniqueOrThrow({
      where: { invocationId: lease.invocationId },
      include: { attempt: true, invocation: { include: { quote: true } } },
    });
    const attempt = operation.attempt;
    if (!attempt) throw new SettlementError("ATTEMPT_NOT_RESERVED");
    const document = operation.invocation.quote.document as unknown as QuoteDocument;
    validateQuoteDocument(document, this.policy.vault, getAddress(document.protocolQuote.buyer));
    const intent = await readPaymentIntent(
      document,
      operation.paymentPayload,
      this.policy.resourceUrl,
    );
    if (intent.authorizationDigest !== operation.authorizationDigest)
      throw new SettlementError("JOURNAL_INCONSISTENT", 500);
    // This check is not a simulation. It only prevents storing a different
    // destination/function/value/quote/nonce/fee transaction in this operation.
    const expectedData = encodeFunctionData({
      abi: reserveHoldAbi,
      functionName: "reserveHold",
      args: [readQuote(document.protocolQuote), intent.authorization, intent.signature],
    });
    let transaction: ReturnType<typeof parseTransaction>;
    let sender: Address;
    try {
      transaction = parseTransaction(serialized);
      sender = await recoverTransactionAddress({
        serializedTransaction: serialized as TransactionSerialized,
      });
    } catch {
      throw new SettlementError("INVALID_SIGNED_TRANSACTION", 400);
    }
    if (
      transaction.type !== "eip1559" ||
      transaction.chainId !== 43113 ||
      !transaction.to ||
      getAddress(transaction.to) !== getAddress(this.policy.vault) ||
      sender.toLowerCase() !== attempt.relayer ||
      BigInt(transaction.nonce ?? -1) !== attempt.nonce ||
      (transaction.value ?? 0n) !== 0n ||
      transaction.data?.toLowerCase() !== expectedData.toLowerCase() ||
      transaction.gas !== attempt.gasLimit ||
      transaction.maxFeePerGas?.toString() !== attempt.maxFeePerGas.toFixed(0) ||
      transaction.maxPriorityFeePerGas?.toString() !== attempt.maxPriorityFeePerGas.toFixed(0) ||
      (transaction.accessList?.length ?? 0) !== 0
    )
      throw new SettlementError("TRANSACTION_MISMATCH", 400);
    const transactionHash = keccak256(serialized);
    return this.db.$transaction(async (tx) => {
      await lockLease(tx, lease);
      const current = await tx.settlementAttempt.findUniqueOrThrow({
        where: { invocationId: lease.invocationId },
      });
      if (current.transactionHash) {
        if (current.transactionHash !== transactionHash)
          throw new SettlementError("ATTEMPT_CONFLICT");
        return current;
      }
      if (current.state !== "RESERVED") throw new SettlementError("INVALID_ATTEMPT_STATE");
      return tx.settlementAttempt.update({
        where: { id: current.id },
        data: { state: "SIGNED", signedTransaction: serialized, transactionHash },
      });
    });
  }

  async recordBroadcast(lease: SettlementLease, transactionHash: Hex) {
    return this.updateSentAttempt(lease, transactionHash, "BROADCAST");
  }

  async markUnknown(lease: SettlementLease, transactionHash: Hex, errorReason: string) {
    return this.updateSentAttempt(lease, transactionHash, "UNKNOWN", reason(errorReason));
  }

  private async updateSentAttempt(
    lease: SettlementLease,
    transactionHash: Hex,
    state: "BROADCAST" | "UNKNOWN",
    errorReason?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await lockLease(tx, lease);
      const attempt = await tx.settlementAttempt.findUniqueOrThrow({
        where: { invocationId: lease.invocationId },
      });
      if (!attempt.signedTransaction || attempt.transactionHash !== transactionHash)
        throw new SettlementError("TRANSACTION_MISMATCH");
      if (!["SIGNED", "BROADCAST", "UNKNOWN"].includes(attempt.state))
        throw new SettlementError("INVALID_ATTEMPT_STATE");
      return tx.settlementAttempt.update({
        where: { id: attempt.id },
        data: {
          state,
          lastErrorReason: errorReason ?? null,
          ...(state === "BROADCAST" && !attempt.broadcastAt
            ? { broadcastAt: await databaseTime(tx) }
            : {}),
        },
      });
    });
  }

  async rejectUnattempted(lease: SettlementLease, errorReason: string) {
    reason(errorReason);
    await this.db.$transaction(async (tx) => {
      await lockLease(tx, lease);
      if (await tx.settlementAttempt.findUnique({ where: { invocationId: lease.invocationId } })) {
        throw new SettlementError("ATTEMPT_REQUIRES_RECONCILIATION");
      }
      await tx.settlementOperation.update({
        where: { invocationId: lease.invocationId },
        data: {
          state: "REJECTED",
          errorReason,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
    });
  }
}
