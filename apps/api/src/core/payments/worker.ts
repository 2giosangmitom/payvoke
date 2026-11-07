import { randomUUID } from "node:crypto";
import {
  paymentRequirements,
  readPaymentIntent,
  readQuote,
  validateQuoteDocument,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import { VaultValidationError } from "@payvoke/shared/x402/facilitator";
import { fundingCalldata, fundingOf, type VaultChain } from "@payvoke/shared/x402/chain";
import type { SettlementChain } from "@payvoke/shared/x402/settlement";
import { getAddress, type Hex, type LocalAccount } from "viem";
import { Prisma, type PrismaClient } from "#core/db";
import { createPaymentValidator } from "./validation";
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
    // Called after an operation commits HELD and its provider feed item exists.
    private readonly onHeld: (held: { invocationId: string; appId: string }) => void = () => {},
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

  // Database time, not application clock, determines scheduling and ownership.
  // Prisma stores these columns as UTC `timestamp`, so compare against the clock
  // in UTC; a bare timestamptz comparison would shift by the session time zone.
  //
  // Only operations signed for this deployment's resource URL are due here. A
  // second deployment sharing the database (a staging or local API with its
  // own origin and vault) must neither settle nor quarantine them: its checks
  // would fail on the foreign binding and wrongly quarantine a valid payment.
  private get dueFilter() {
    return Prisma.sql`state = 'PENDING'
      AND "paymentPayload"->'resource'->>'url' = ${this.resourceUrl}
      AND "nextCheckAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC'))`;
  }

  async tick() {
    const due = await this.db.$queryRaw<{ invocationId: string }[]>`
      SELECT "invocationId" FROM settlement_operations WHERE ${this.dueFilter}
      ORDER BY "nextCheckAt", "createdAt" LIMIT 20`;
    for (const candidate of due) if (await this.run(candidate.invocationId)) return true;
    return false;
  }

  // Job entry point: processes one operation only if it is due right now, so a
  // wake-up never jumps a deferral the journal scheduled.
  async handle(invocationId: string) {
    const [due] = await this.db.$queryRaw<{ invocationId: string }[]>`
      SELECT "invocationId" FROM settlement_operations
      WHERE "invocationId" = ${invocationId} AND ${this.dueFilter}`;
    return due ? this.run(invocationId) : false;
  }

  // Claims and advances one operation; false when another worker holds it.
  private async run(invocationId: string) {
    const lease = await this.journal.claim(invocationId, this.owner, 120);
    if (!lease) return false;
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
      return true;
    }
    await this.notifyIfHeld(lease.invocationId);
    return true;
  }

  private async notifyIfHeld(invocationId: string) {
    const operation = await this.db.settlementOperation.findUnique({
      where: { invocationId },
      select: { state: true, invocation: { select: { quote: { select: { appId: true } } } } },
    });
    if (operation?.state === "HELD")
      this.onHeld({ invocationId, appId: operation.invocation.quote.appId });
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
    const funding = fundingOf(intent);
    const data = fundingCalldata(quote, funding);
    let attempt = operation.attempt;
    const client = this.chain.client;
    if (!attempt?.signedTransaction) {
      if (
        await this.db.financeLane.findUnique({
          where: { id: `43113:${this.signer.address.toLowerCase()}` },
        })
      )
        throw new VaultValidationError("relayer_not_dedicated", 503);
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
      intent: funding,
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
