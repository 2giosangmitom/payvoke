import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getAddress, type Address } from "viem";
import {
  NETWORK,
  SCHEME,
  paymentRequirements as requirementsFor,
  readPaymentIntent,
  readQuote,
  sameJson,
  validateQuoteDocument,
  type QuoteDocument,
} from "@payvoke/x402";
import { VaultValidationError, type AdmissionObservation } from "@payvoke/x402/facilitator";
import type { PrismaClient } from "../generated/prisma/client";
import type { VaultChain } from "@payvoke/x402/chain";

export async function readPersistedPayment(
  db: PrismaClient,
  vault: Address,
  resourceUrl: string,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) {
  // Inputs can originate from HTTP or SDK direct calls. Never dispatch RPC or
  // interpolate unvalidated payload identifiers into database operations.
  if (
    !payload ||
    payload.x402Version !== 2 ||
    !requirements ||
    requirements.scheme !== SCHEME ||
    requirements.network !== NETWORK ||
    typeof requirements.extra?.quoteId !== "string" ||
    requirements.extra.quoteId.length > 128 ||
    !requirements.extra.quoteId.length
  ) {
    throw new VaultValidationError("invalid_payment", 400);
  }
  const row = await db.quote.findUnique({
    where: { id: requirements.extra.quoteId },
    include: {
      thread: { include: { app: true } },
      invocation: { include: { settlement: { include: { attempt: true } } } },
    },
  });
  if (!row) throw new VaultValidationError("quote_not_found", 404);
  const document = row.document as unknown as QuoteDocument;
  try {
    validateQuoteDocument(document, vault, getAddress(document.protocolQuote.buyer));
    if (
      document.quoteId !== row.id ||
      document.invocationId !== row.invocationId ||
      document.sessionId !== row.threadId ||
      document.productId !== row.thread.appId ||
      row.buyerId !== row.thread.buyerId ||
      row.validUntil.getTime() !== document.validUntil * 1000
    )
      throw new Error("identity mismatch");
  } catch {
    throw new VaultValidationError("quote_inconsistent", 503);
  }
  let intent: Awaited<ReturnType<typeof readPaymentIntent>>;
  try {
    if (!sameJson(requirements, requirementsFor(document)))
      throw new Error("requirements mismatch");
    intent = await readPaymentIntent(document, payload, resourceUrl);
  } catch {
    throw new VaultValidationError("invalid_payment", 400);
  }
  const operation = row.invocation?.settlement;
  if (
    row.invocation &&
    (row.invocation.id !== row.invocationId || row.invocation.buyerId !== row.buyerId)
  ) {
    throw new VaultValidationError("journal_inconsistent", 503);
  }
  if (
    operation &&
    (operation.quoteDigest !== document.quoteDigest ||
      operation.authorizationDigest !== intent.authorizationDigest)
  ) {
    throw new VaultValidationError("invocation_conflict", 409);
  }
  return { row, document, intent, operation };
}

export function createPaymentValidator(
  db: PrismaClient,
  chain: VaultChain,
  resourceUrl: string,
  resumeReservedInvocationId?: string,
) {
  return async (
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<AdmissionObservation> => {
    const { row, document, intent, operation } = await readPersistedPayment(
      db,
      chain.deployment.vault,
      resourceUrl,
      payload,
      requirements,
    );
    const observation = await chain.validate(
      readQuote(document.protocolQuote),
      intent.authorization,
      intent.signature,
      async () => {
        const health = await db.vaultFinancialHealth.findUnique({
          where: {
            id: `${chain.deployment.chainId}:${chain.deployment.vault.toLowerCase()}`,
          },
        });
        if (health?.blocked)
          throw new VaultValidationError("financial_reconciliation_required", 503);
        const current = await db.settlementOperation.findUnique({
          where: { invocationId: row.invocationId },
          include: { attempt: true },
        });
        if (
          current &&
          (current.quoteDigest !== document.quoteDigest ||
            current.authorizationDigest !== intent.authorizationDigest)
        ) {
          throw new VaultValidationError("invocation_conflict", 409);
        }
        // A pending attempt may already have created a hold on a newer block.
        // Do not reject/re-admit it based on a fresh balance/expiry/grant read.
        const resumable =
          !!current &&
          current.invocationId === resumeReservedInvocationId &&
          current.attempt?.state === "RESERVED" &&
          !current.attempt.signedTransaction &&
          !current.attempt.transactionHash;
        if ((current?.attempt && !resumable) || current?.state === "QUARANTINED")
          throw new VaultValidationError("reconciliation_required", 503);
        if (current?.state === "HELD") throw new VaultValidationError("hold_inconsistent", 503);
        if (current?.state === "REJECTED")
          throw new VaultValidationError("operation_rejected", 409);
        const user = await db.user.findUnique({ where: { id: row.buyerId } });
        if (!user || user.status !== "ACTIVE")
          throw new VaultValidationError("account_suspended", 403);
        const wallet = await db.walletAddress.findFirst({
          where: { userId: row.buyerId, chainId: 43113, isPrimary: true },
        });
        if (!wallet || getAddress(wallet.address) !== getAddress(document.protocolQuote.buyer)) {
          throw new VaultValidationError("buyer_wallet_mismatch", 403);
        }
        const thread = await db.chatThread.findUnique({
          where: { id: row.threadId },
          include: { app: true },
        });
        if (
          !thread ||
          thread.buyerId !== row.buyerId ||
          thread.appId !== document.productId ||
          thread.archivedAt ||
          thread.app.status !== "ACTIVE" ||
          thread.app.archivedAt
        ) {
          throw new VaultValidationError("admission_unavailable", 409);
        }
        if (thread.activeQuoteId !== row.id) throw new VaultValidationError("thread_busy", 409);
      },
    );
    if (observation.kind === "existing-hold") {
      if (!operation || operation.state === "REJECTED" || operation.state === "QUARANTINED") {
        throw new VaultValidationError("recovery_required", 503);
      }
    }
    return observation;
  };
}
