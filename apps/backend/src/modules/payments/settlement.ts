import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { NETWORK } from "@payvoke/x402";
import { VaultValidationError } from "@payvoke/x402/facilitator";
import type { VaultChain } from "@payvoke/x402/chain";
import { getAddress } from "viem";
import type { PrismaClient } from "../../generated/prisma/client";
import { createPaymentValidator, readPersistedPayment } from "../../facilitator/validation";
import { SettlementJournal } from "./journal";

export function createSettlementService(db: PrismaClient, chain: VaultChain, resourceUrl: string) {
  const journal = new SettlementJournal(db, { vault: chain.deployment.vault, resourceUrl });
  return async (
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> => {
    const bound = await readPersistedPayment(
      db,
      chain.deployment.vault,
      resourceUrl,
      payload,
      requirements,
    );
    // Existing immutable intent is authoritative. Do not apply new-admission
    // expiry/product/grant rules to an unresolved or completed debit.
    if (!bound.operation) {
      await createPaymentValidator(db, chain, resourceUrl)(payload, requirements);
      await journal.recordIntent({
        quoteId: bound.row.id,
        buyerId: bound.row.buyerId,
        buyerAddress: getAddress(bound.document.protocolQuote.buyer),
        paymentPayload: payload,
      });
    }
    const operation = await db.settlementOperation.findUniqueOrThrow({
      where: { invocationId: bound.row.invocationId },
      include: { attempt: true },
    });
    // A competing first submission may have inserted a different authorization.
    if (
      operation.authorizationDigest !== bound.intent.authorizationDigest ||
      operation.quoteDigest !== bound.document.quoteDigest
    )
      throw new VaultValidationError("invocation_conflict", 409);
    if (operation.state === "QUARANTINED") throw new VaultValidationError("recovery_required", 503);
    if (operation.state === "REJECTED")
      throw new VaultValidationError(operation.errorReason ?? "operation_rejected", 422);
    const attempt = operation.attempt;
    if (!attempt?.transactionHash) throw new VaultValidationError("settlement_queued", 503);
    if (operation.state === "HELD") {
      if (attempt.state !== "FINALIZED" || !attempt.finalizedAt)
        throw new VaultValidationError("journal_inconsistent", 503);
      return {
        success: true,
        transaction: attempt.transactionHash,
        network: NETWORK,
        payer: bound.document.protocolQuote.buyer,
        amount: bound.document.grossAmount,
        extra: {
          schemeVersion: "1",
          invocationId: bound.row.invocationId,
          quoteId: bound.row.id,
          holdId: operation.invocationKey,
        },
      };
    }
    // SIGNED is not evidence of broadcast. Transport ambiguity still uses status
    // polling rather than advertising an unsubmitted hash as a payment receipt.
    if (["RESERVED", "SIGNED"].includes(attempt.state))
      throw new VaultValidationError("settlement_queued", 503);
    return {
      success: false,
      transaction: attempt.transactionHash,
      network: NETWORK,
      payer: bound.document.protocolQuote.buyer,
      errorReason: "settlement_pending",
    };
  };
}
