import { randomUUID } from "node:crypto";
import { reserveHoldAbi } from "@payvoke/protocol";
import {
  paymentRequirements,
  readPaymentIntent,
  readQuote,
  validateQuoteDocument,
  type QuoteDocument,
} from "@payvoke/x402";
import { VaultValidationError } from "@payvoke/x402/facilitator";
import type { VaultChain } from "@payvoke/x402/chain";
import type { SettlementChain } from "@payvoke/x402/settlement";
import { encodeFunctionData, getAddress, type Hex, type LocalAccount } from "viem";
import type { PrismaClient } from "../../generated/prisma/client";
import { createPaymentValidator } from "../../facilitator/validation";
import { SettlementError, SettlementJournal, type GasPolicy } from "./journal";

export function validateGasPolicy(policy: GasPolicy) {
  if (
    policy.maxGasLimit <= 0n ||
    policy.maxGasLimit > BigInt(Number.MAX_SAFE_INTEGER) ||
    policy.maxFeePerGas <= 0n ||
    policy.maxPriorityFeePerGas < 0n ||
    policy.maxPriorityFeePerGas > policy.maxFeePerGas ||
    policy.maxTransactionCost <= 0n ||
    policy.maxOutstandingCost < policy.maxTransactionCost ||
    policy.maxWindowCost < policy.maxTransactionCost ||
    !Number.isSafeInteger(policy.windowSeconds) ||
    policy.windowSeconds < 1
  )
    throw new Error("Invalid gas policy");
}

// A tick owns at most one operation. Multiple processes race only through SQL
// leases/lanes; timers and RPC wakeups are never the source of truth.
export class SettlementWorker {
  readonly owner = randomUUID();
  private readonly journal: SettlementJournal;
  constructor(
    private readonly db: PrismaClient,
    private readonly admission: VaultChain,
    private readonly chain: SettlementChain,
    private readonly signer: LocalAccount,
    private readonly resourceUrl: string,
    private readonly budget: GasPolicy,
  ) {
    validateGasPolicy(budget);
    if (
      getAddress(signer.address) !== getAddress(chain.deployment.relayer) ||
      chain.deployment.chainId !== 43113 ||
      admission.deployment.chainId !== 43113 ||
      getAddress(chain.deployment.vault) !== getAddress(admission.deployment.vault) ||
      getAddress(chain.deployment.relayer) !== getAddress(admission.deployment.relayer)
    )
      throw new Error("Worker deployment mismatch");
    this.journal = new SettlementJournal(db, { vault: chain.deployment.vault, resourceUrl });
  }
  async tick() {
    // Database time, not application clock, determines scheduling and ownership.
    const due = await this.db.$queryRaw<{ invocationId: string }[]>`
      SELECT "invocationId" FROM settlement_operations
      WHERE state = 'PENDING' AND "nextCheckAt" <= clock_timestamp()
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
      ORDER BY "nextCheckAt", "createdAt" LIMIT 20`;
    for (const candidate of due) {
      const lease = await this.journal.claim(candidate.invocationId, this.owner, 120);
      if (!lease) continue;
      try {
        await this.process(lease);
      } catch (error) {
        if (error instanceof SettlementError && error.code === "LEASE_LOST") return true;
        const operation = await this.db.settlementOperation.findUnique({
          where: { invocationId: lease.invocationId },
          include: { attempt: true },
        });
        if (operation?.state !== "PENDING") return true;
        try {
          const code =
            error instanceof VaultValidationError
              ? error.code
              : error instanceof SettlementError
                ? error.code.toLowerCase()
                : "rpc_unavailable";
          if (
            [
              "transaction_inconsistent",
              "receipt_inconsistent",
              "hold_event_inconsistent",
              "hold_inconsistent",
              "reverted_with_existing_hold",
              "journal_inconsistent",
              "nonce_consumed",
              "nonce_conflict",
            ].includes(code)
          ) {
            await this.journal.quarantine(lease, code);
          } else if (
            !operation.attempt &&
            error instanceof VaultValidationError &&
            error.statusCode < 500
          ) {
            await this.journal.rejectUnattempted(lease, code);
          } else {
            // RESERVED and signed attempts are never discarded on expiry/revoke.
            await this.journal.defer(lease, code);
          }
        } catch (mutationError) {
          if (!(mutationError instanceof SettlementError && mutationError.code === "LEASE_LOST"))
            throw mutationError;
        }
      }
      return true;
    }
    return false;
  }

  private async process(lease: import("./journal").SettlementLease) {
    const operation = await this.db.settlementOperation.findUniqueOrThrow({
      where: { invocationId: lease.invocationId },
      include: { attempt: true, invocation: { include: { quote: true } } },
    });
    const document = operation.invocation.quote.document as unknown as QuoteDocument;
    let intent;
    try {
      validateQuoteDocument(
        document,
        this.chain.deployment.vault,
        getAddress(document.protocolQuote.buyer),
      );
      intent = await readPaymentIntent(document, operation.paymentPayload, this.resourceUrl);
      if (
        document.invocationId !== lease.invocationId ||
        document.quoteId !== operation.invocation.quoteId ||
        intent.authorizationDigest !== operation.authorizationDigest ||
        document.quoteDigest !== operation.quoteDigest
      )
        throw new Error("Binding mismatch");
    } catch {
      throw new VaultValidationError("journal_inconsistent", 503);
    }
    const quote = readQuote(document.protocolQuote);
    const data = encodeFunctionData({
      abi: reserveHoldAbi,
      functionName: "reserveHold",
      args: [quote, intent.authorization, intent.signature],
    });
    let attempt = operation.attempt;
    const client = this.chain.client;
    if (!attempt?.signedTransaction) {
      const validation = await createPaymentValidator(
        this.db,
        this.admission,
        this.resourceUrl,
        lease.invocationId,
      )(intent.paymentPayload, paymentRequirements(document));
      if (validation.kind !== "new-admission")
        throw new VaultValidationError("hold_inconsistent", 503);
      // Finality capability is mandatory even before the first signature.
      const checkpoint = await this.chain.finalized();
      const cursor = await this.db.settlementScanCursor.findUnique({
        where: {
          id: `${this.chain.deployment.chainId}:${this.chain.deployment.vault.toLowerCase()}`,
        },
      });
      if (cursor) {
        if (checkpoint.number < cursor.blockNumber)
          throw new VaultValidationError("finality_regressed", 503);
        await this.chain.canonical(cursor.blockNumber, cursor.blockHash as Hex);
      }
      const address = this.signer.address;
      const [executed, pending, balance] = await Promise.all([
        client.getTransactionCount({ address, blockTag: "latest" }),
        client.getTransactionCount({ address, blockTag: "pending" }),
        client.getBalance({ address, blockTag: "latest" }),
      ]);
      if (executed !== pending || (attempt && attempt.nonce !== BigInt(executed)))
        throw new VaultValidationError("nonce_conflict", 503);
      if (!attempt) {
        const [estimate, fees] = await Promise.all([
          client.estimateGas({
            account: address,
            to: this.chain.deployment.vault,
            data,
            value: 0n,
          }),
          client.estimateFeesPerGas({ type: "eip1559", chain: null }),
        ]);
        const gasLimit = (estimate * 120n + 99n) / 100n;
        if (balance < gasLimit * fees.maxFeePerGas)
          throw new VaultValidationError("insufficient_relayer_gas", 503);
        attempt = await this.journal.reserveAttempt(
          lease,
          {
            relayer: address,
            nonce: BigInt(executed),
            gasLimit,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          },
          this.budget,
        );
      }
      if (balance < attempt.gasLimit * BigInt(attempt.maxFeePerGas.toFixed(0)))
        throw new VaultValidationError("insufficient_relayer_gas", 503);
      // Recheck the current policy under the same lane lock when resuming an
      // unsigned reservation created before a restart or policy tightening.
      attempt = await this.journal.reserveAttempt(
        lease,
        {
          relayer: address,
          nonce: attempt.nonce,
          gasLimit: attempt.gasLimit,
          maxFeePerGas: BigInt(attempt.maxFeePerGas.toFixed(0)),
          maxPriorityFeePerGas: BigInt(attempt.maxPriorityFeePerGas.toFixed(0)),
        },
        this.budget,
      );
      await this.journal.renew(lease, 120);
      await createPaymentValidator(
        this.db,
        this.admission,
        this.resourceUrl,
        lease.invocationId,
      )(intent.paymentPayload, paymentRequirements(document));
      const serialized = await this.signer.signTransaction({
        type: "eip1559",
        chainId: 43113,
        to: this.chain.deployment.vault,
        data,
        value: 0n,
        nonce: Number(attempt.nonce),
        gas: attempt.gasLimit,
        maxFeePerGas: BigInt(attempt.maxFeePerGas.toFixed(0)),
        maxPriorityFeePerGas: BigInt(attempt.maxPriorityFeePerGas.toFixed(0)),
      });
      attempt = await this.journal.persistSigned(lease, serialized);
    }
    const hash = attempt.transactionHash as Hex;
    // Always look up the persisted hash first, including after a crash before
    // recording BROADCAST. The authorization can now be expired/revoked.
    const observation = await this.chain.inspect({
      hash,
      data,
      nonce: attempt.nonce,
      quote,
      authorization: intent.authorization,
      authorizationDigest: intent.authorizationDigest,
    });
    if (observation.kind === "finalized") {
      await this.journal.finalize(lease, observation.proof);
      return;
    }
    if (observation.kind === "confirming") {
      await this.journal.observeReceipt(lease, observation);
      await this.journal.defer(lease, "settlement_pending");
      return;
    }
    if (attempt.state === "CONFIRMED") await this.journal.observeReceipt(lease, null);
    const nonce = await client.getTransactionCount({
      address: this.signer.address,
      blockTag: "latest",
    });
    if (BigInt(nonce) > attempt.nonce) throw new VaultValidationError("nonce_consumed", 503);
    if (BigInt(nonce) < attempt.nonce) throw new VaultValidationError("nonce_conflict", 503);
    await this.journal.renew(lease, 120);
    await this.journal.authorizeBroadcast(lease, hash);
    try {
      const returned = await client.sendRawTransaction({
        serializedTransaction: attempt.signedTransaction as Hex,
      });
      if (returned.toLowerCase() !== hash.toLowerCase()) throw new Error("Unexpected send hash");
      await this.journal.recordBroadcast(lease, hash);
    } catch {
      await this.journal.markUnknown(lease, hash, "broadcast_ambiguous");
    }
    await this.journal.defer(lease, "settlement_pending");
  }
}
