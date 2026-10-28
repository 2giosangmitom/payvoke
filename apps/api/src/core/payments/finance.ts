import { randomUUID } from "node:crypto";
import {
  applyDecisionAbi,
  hashDecision,
  hashSnapshot,
  paymentTypes,
  vaultDomain,
  vaultFinanceAbi,
  type ResolutionDecision,
} from "@payvoke/shared/protocol";
import { type QuoteDocument } from "@payvoke/shared/x402";
import { SettlementChain } from "@payvoke/shared/x402/settlement";
import { VaultChain } from "@payvoke/shared/x402/chain";
import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  stringToHex,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { Prisma, type PrismaClient, type FinanceDecision } from "#core/db";
import {
  evidenceLevels,
  evidenceSatisfies,
  termsMinEvidence,
  type EvidenceLevel,
} from "./evidence";
import { databaseTime, type GasPolicy } from "./journal";
import { validateGasPolicy } from "./worker";
import { financialDeployment, financialJson, readFinalizedHold } from "./finance-ledger";

export type WireDecision = {
  [K in keyof ResolutionDecision]: ResolutionDecision[K] extends boolean ? boolean : string;
};
export type FinanceApproval = {
  decision: WireDecision;
  approver: Address;
  signature: Hex;
  evidenceId: string | null;
  reason: string;
};
function check(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(code);
}
function uint(s: string, bits: number) {
  check(typeof s === "string" && /^(0|[1-9][0-9]*)$/.test(s), "invalid_integer");
  const n = BigInt(s);
  check(n < 1n << BigInt(bits), "integer_overflow");
  return n;
}
export function parseDecision(w: WireDecision): ResolutionDecision {
  check(
    Object.keys(w).sort().join() ===
      "decisionId,expectedVersion,holdId,refundAmount,releaseRemainder,validUntil",
    "invalid_decision",
  );
  check(
    /^0x[\da-f]{64}$/.test(w.holdId) &&
      /^0x[\da-f]{64}$/.test(w.decisionId) &&
      typeof w.releaseRemainder === "boolean",
    "invalid_decision",
  );
  return {
    holdId: w.holdId as Hex,
    decisionId: w.decisionId as Hex,
    expectedVersion: uint(w.expectedVersion, 64),
    refundAmount: uint(w.refundAmount, 256),
    releaseRemainder: w.releaseRemainder,
    validUntil: Number(uint(w.validUntil, 48)),
  };
}
function approval(row: FinanceDecision): FinanceApproval {
  return {
    decision: row.decision as unknown as WireDecision,
    approver: getAddress(row.approver),
    signature: row.signature as Hex,
    evidenceId: row.evidenceId,
    reason: row.reason,
  };
}
export function decisionData(a: FinanceApproval) {
  return encodeFunctionData({
    abi: applyDecisionAbi,
    functionName: "applyDecision",
    args: [parseDecision(a.decision), a.approver, a.signature],
  });
}
async function validateSigned(row: FinanceDecision, signed: Hex, data: Hex) {
  try {
    check(/^0x02[\da-fA-F]+$/.test(signed), "finance_transaction_inconsistent");
    const parsed = parseTransaction(signed);
    check(
      parsed.chainId === 43113 &&
        parsed.type === "eip1559" &&
        parsed.to?.toLowerCase() === row.vault &&
        parsed.data === data &&
        (parsed.value ?? 0n) === 0n &&
        BigInt(parsed.nonce!) === row.nonce &&
        parsed.gas === row.gasLimit &&
        parsed.maxFeePerGas === BigInt(row.maxFeePerGas!.toFixed(0)) &&
        parsed.maxPriorityFeePerGas === BigInt(row.maxPriorityFeePerGas!.toFixed(0)) &&
        (
          await recoverTransactionAddress({ serializedTransaction: signed as `0x02${string}` })
        ).toLowerCase() === row.executor &&
        (!row.transactionHash || keccak256(signed) === row.transactionHash),
      "finance_transaction_inconsistent",
    );
  } catch {
    throw new Error("finance_transaction_inconsistent");
  }
}

type HoldTimes = { deliveryDeadline: number; releaseNotBefore: number };
// The buyer keeps the full signed review window after the observed delivery,
// extended by any confirmed access interruption, and never before releaseNotBefore.
export function releaseSchedule(
  evidence: { observedAt: Date; accessInterruptionSeconds: number },
  hold: HoldTimes,
) {
  const review = BigInt(hold.releaseNotBefore - hold.deliveryDeadline);
  const observed = BigInt(Math.ceil(evidence.observedAt.getTime() / 1000));
  const businessEarliest = observed + review + BigInt(evidence.accessInterruptionSeconds);
  const floor = BigInt(hold.releaseNotBefore);
  return { observed, earliest: businessEarliest > floor ? businessEarliest : floor };
}

// Trusted verifier seam, not a provider-facing "delivered=true" endpoint.
// Every revision/access correction is a new immutable observation. Approval of
// an older observation cannot silently authorize payout for a newer artifact.
export async function recordPaymentDelivery(
  db: PrismaClient,
  input: {
    id: string;
    invocationId: string;
    artifactVersion: number;
    outputHash: Hex;
    verifier: string;
    accessInterruptionSeconds: number;
    evidenceLevel: EvidenceLevel;
    // Verified files of this artifact version, bound into the envelope hash.
    files?: { fileId: string; sha256: string; size: number }[];
  },
) {
  const { files: listed = [], ...evidenceInput } = input;
  const files = [...listed].sort((left, right) =>
    left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0,
  );
  check(
    files.every(
      (file) =>
        /^[\w-]{1,128}$/.test(file.fileId) &&
        /^[\da-f]{64}$/.test(file.sha256) &&
        Number.isSafeInteger(file.size) &&
        file.size > 0,
    ) && new Set(files.map((file) => file.fileId)).size === files.length,
    "invalid_delivery_evidence",
  );
  const sameFiles = (envelope: unknown) =>
    JSON.stringify((envelope as { files?: unknown } | null)?.files ?? []) === JSON.stringify(files);
  check(
    evidenceLevels.includes(input.evidenceLevel) &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(input.id) &&
      /^0x[\da-f]{64}$/.test(input.outputHash) &&
      input.verifier.length > 0 &&
      input.verifier.length <= 128 &&
      Number.isSafeInteger(input.artifactVersion) &&
      input.artifactVersion > 0 &&
      Number.isSafeInteger(input.accessInterruptionSeconds) &&
      input.accessInterruptionSeconds >= 0,
    "invalid_delivery_evidence",
  );
  return db.$transaction(async (tx) => {
    const op = await tx.settlementOperation.update({
      where: { invocationId: input.invocationId },
      data: { revision: { increment: 1 } },
    });
    check(op.state === "HELD", "payment_not_held");
    const projection = await tx.vaultHoldProjection.findUnique({
      where: { holdId: op.invocationKey },
    });
    check(
      !projection || !["RELEASED", "REFUNDED", "RECLAIMED"].includes(projection.status),
      "hold_closed",
    );
    const previous = await tx.paymentDeliveryEvidence.findUnique({ where: { id: input.id } });
    if (previous) {
      check(
        previous.invocationId === input.invocationId &&
          previous.artifactVersion === input.artifactVersion &&
          previous.outputHash === input.outputHash &&
          previous.verifier === input.verifier &&
          previous.accessInterruptionSeconds === input.accessInterruptionSeconds &&
          previous.evidenceLevel === input.evidenceLevel &&
          sameFiles(previous.envelope),
        "evidence_conflict",
      );
      return previous;
    }
    const latest = await tx.paymentDeliveryEvidence.findFirst({
      where: { invocationId: input.invocationId },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    });
    check(!latest || input.artifactVersion >= latest.artifactVersion, "stale_delivery_evidence");
    if (latest && input.artifactVersion === latest.artifactVersion)
      check(
        input.outputHash === latest.outputHash &&
          sameFiles(latest.envelope) &&
          input.accessInterruptionSeconds >= latest.accessInterruptionSeconds,
        "delivery_version_conflict",
      );
    const now = await databaseTime(tx);
    // Strictly monotone observation time makes "latest" stable within a millisecond.
    check(!latest || now > latest.observedAt, "retry_evidence_observation");
    // JCS keeps the Evidence Envelope hash reproducible from the stored envelope.
    const envelope = {
      schemaVersion: 1,
      invocationId: input.invocationId,
      artifactVersion: input.artifactVersion,
      outputHash: input.outputHash,
      files,
      deliveredAt: Math.floor(now.getTime() / 1000),
      evidenceLevel: input.evidenceLevel,
      verifier: input.verifier,
      accessInterruptionSeconds: input.accessInterruptionSeconds,
    };
    const evidence = await tx.paymentDeliveryEvidence.create({
      data: { ...evidenceInput, observedAt: now, envelope, envelopeHash: hashSnapshot(envelope) },
    });
    // Only this trusted verifier path can make a paid run DELIVERED. Provider
    // reports and AG-UI stream events remain display-only until evidence exists.
    await tx.invocation.updateMany({
      where: { id: input.invocationId, executionStatus: "VERIFYING" },
      data: { executionStatus: "DELIVERED" },
    });
    return evidence;
  });
}

export class FinanceService {
  readonly owner = randomUUID();
  private deploymentChecked = false;
  constructor(
    readonly db: PrismaClient,
    readonly chain: SettlementChain,
    readonly executor: Address,
    readonly budget: GasPolicy,
  ) {
    validateGasPolicy(budget);
    check(
      getAddress(executor) !== getAddress(chain.deployment.relayer),
      "finance_executor_must_be_dedicated",
    );
    check(chain.deployment.chainId === 43113, "chain_mismatch");
  }
  private lane() {
    return `43113:${this.executor.toLowerCase()}`;
  }
  private async initialize() {
    if (!this.deploymentChecked) {
      check(
        !(await this.db.relayerLane.findUnique({
          where: {
            network_relayer: { network: "eip155:43113", relayer: this.executor.toLowerCase() },
          },
        })),
        "finance_executor_not_dedicated",
      );
      await new VaultChain(this.chain.client, this.chain.deployment).initialize({
        requireRelayerRole: false,
      });
      this.deploymentChecked = true;
    }
  }
  private async checkBudget(
    tx: Prisma.TransactionClient,
    id: string,
    gas: bigint,
    maxFee: bigint,
    priority: bigint,
  ) {
    const budget = this.budget,
      cost = gas * maxFee;
    check(
      gas <= budget.maxGasLimit &&
        maxFee <= budget.maxFeePerGas &&
        priority <= budget.maxPriorityFeePerGas &&
        cost <= budget.maxTransactionCost,
      "finance_gas_policy_exceeded",
    );
    const now = await databaseTime(tx),
      since = new Date(now.getTime() - budget.windowSeconds * 1000);
    const history = await tx.financeDecision.findMany({
      where: {
        executor: this.executor.toLowerCase(),
        id: { not: id },
        OR: [{ finalizedAt: null }, { finalizedAt: { gte: since } }],
      },
    });
    let outstanding = cost,
      window = cost;
    for (const previous of history) {
      if (!previous.finalizedAt && previous.gasLimit && previous.maxFeePerGas) {
        const liability = previous.gasLimit * BigInt(previous.maxFeePerGas.toFixed(0));
        outstanding += liability;
        window += liability;
      } else if (previous.finalizedAt) window += BigInt(previous.actualGasCost!.toFixed(0));
    }
    check(
      outstanding <= budget.maxOutstandingCost && window <= budget.maxWindowCost,
      "finance_gas_budget_exceeded",
    );
  }
  private async gate(a: FinanceApproval) {
    await this.initialize();
    const d = parseDecision(a.decision);
    check(getAddress(a.approver) !== getAddress(this.executor), "approver_executor_separation");
    check(
      a.reason.length > 0 && a.reason.length <= 1000 && (d.refundAmount > 0n || d.releaseRemainder),
      "invalid_finance_reason_or_effect",
    );
    check(
      (await recoverTypedDataAddress({
        domain: vaultDomain(this.chain.deployment.vault),
        types: paymentTypes,
        primaryType: "ResolutionDecision",
        message: d,
        signature: a.signature,
      })) === getAddress(a.approver),
      "invalid_approval_signature",
    );
    const health = await this.db.vaultFinancialHealth.findUnique({
      where: { id: financialDeployment(this.chain) },
    });
    check(!health?.blocked, "financial_reconciliation_required");
    const { hold, block } = await readFinalizedHold(this.chain, d.holdId);
    check(
      !hold.closed && hold.version === d.expectedVersion && d.refundAmount <= hold.remaining,
      "stale_finance_decision",
    );
    check(
      block.timestamp < BigInt(d.validUntil) &&
        block.timestamp < BigInt(hold.resolveBy) &&
        d.validUntil <= hold.resolveBy,
      "resolution_expired",
    );
    const op = await this.db.settlementOperation.findUnique({
      where: { invocationKey: d.holdId },
      include: { invocation: { include: { quote: true } } },
    });
    check(
      op?.state === "HELD" &&
        op.quoteDigest === hold.quoteDigest &&
        op.authorizationDigest === hold.authorizationDigest,
      "hold_recovery_required",
    );
    if (d.releaseRemainder) {
      const latest = await this.db.paymentDeliveryEvidence.findFirst({
        where: { invocationId: op.invocationId },
        orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      });
      check(latest && latest.id === a.evidenceId, "verified_delivery_required");
      const q = op.invocation.quote.document as unknown as QuoteDocument;
      // Never release on weaker evidence than the signed terms promised the buyer.
      const minimum = termsMinEvidence(
        (q.termsSnapshot as { definition?: unknown } | null)?.definition,
      );
      check(
        minimum !== null && evidenceSatisfies(latest.evidenceLevel, minimum),
        "evidence_below_minimum",
      );
      const { observed, earliest } = releaseSchedule(latest, hold);
      check(observed < BigInt(hold.deliveryDeadline), "delivery_late_requires_refund");
      check(earliest < BigInt(hold.resolveBy), "review_window_exhausted");
      check(block.timestamp >= earliest, "business_review_not_complete");
    }
    const read = {
      address: this.chain.deployment.vault,
      abi: vaultFinanceAbi,
      blockNumber: block.number,
    } as const;
    const roles = [
      ["FINANCE_EXECUTOR_ROLE", this.executor] as const,
      ...(d.refundAmount > 0n ? [["REFUND_APPROVER_ROLE", a.approver] as const] : []),
      ...(d.releaseRemainder ? [["RELEASE_APPROVER_ROLE", a.approver] as const] : []),
    ];
    for (const [role, account] of roles)
      check(
        await this.chain.client.readContract({
          ...read,
          functionName: "hasRole",
          args: [keccak256(stringToHex(role)), account],
        }),
        "finance_role_missing",
      );
    await this.chain.client.simulateContract({
      ...read,
      functionName: "applyDecision",
      args: [d, a.approver, a.signature],
      account: this.executor,
    });
    await this.chain.canonical(block.number, block.hash);
    return { hold, invocationId: op.invocationId };
  }
  async enqueue(a: FinanceApproval) {
    const d = parseDecision(a.decision),
      digest = hashDecision(vaultDomain(this.chain.deployment.vault), d);
    const existing = await this.db.financeDecision.findUnique({ where: { id: d.decisionId } });
    if (existing) {
      check(
        existing.digest === digest &&
          existing.approver === a.approver.toLowerCase() &&
          existing.signature === a.signature &&
          existing.evidenceId === a.evidenceId &&
          existing.reason === a.reason,
        "finance_decision_conflict",
      );
      return existing;
    }
    const admitted = await this.gate(a);
    return this.db.$transaction(async (tx) => {
      await tx.settlementOperation.update({
        where: { invocationId: admitted.invocationId },
        data: { revision: { increment: 1 } },
      });
      const previous = await tx.financeDecision.findUnique({ where: { id: d.decisionId } });
      if (previous) {
        check(
          previous.digest === digest &&
            previous.approver === a.approver.toLowerCase() &&
            previous.signature === a.signature &&
            previous.evidenceId === a.evidenceId &&
            previous.reason === a.reason,
          "finance_decision_conflict",
        );
        return previous;
      }
      if (d.releaseRemainder) {
        const latest = await tx.paymentDeliveryEvidence.findFirst({
          where: { invocationId: admitted.invocationId },
          orderBy: [{ observedAt: "desc" }, { id: "desc" }],
        });
        check(latest?.id === a.evidenceId, "verified_delivery_required");
      }
      return tx.financeDecision.create({
        data: {
          id: d.decisionId,
          holdId: d.holdId,
          vault: this.chain.deployment.vault.toLowerCase(),
          digest,
          decision: financialJson(a.decision),
          approver: a.approver.toLowerCase(),
          signature: a.signature,
          evidenceId: a.evidenceId,
          reason: a.reason,
        },
      });
    });
  }
  private async mutate(
    id: string,
    epoch: bigint,
    fn: (tx: Prisma.TransactionClient, row: FinanceDecision) => Promise<void>,
    lane = false,
  ) {
    return this.db.$transaction(async (tx) => {
      if (lane)
        await tx.financeLane.upsert({
          where: { id: this.lane() },
          create: { id: this.lane() },
          update: { revision: { increment: 1 } },
        });
      const now = await databaseTime(tx);
      const changed = await tx.financeDecision.updateMany({
        where: {
          id,
          leaseOwner: this.owner,
          leaseEpoch: epoch,
          leaseExpiresAt: { gt: now },
          state: { in: ["APPROVED", "RESERVED", "SIGNED", "BROADCAST", "UNKNOWN"] },
        },
        data: { revision: { increment: 1 }, leaseExpiresAt: new Date(now.getTime() + 120000) },
      });
      check(changed.count, "finance_lease_lost");
      await fn(tx, await tx.financeDecision.findUniqueOrThrow({ where: { id } }));
    });
  }
  async tick(id: string, signer: LocalAccount) {
    await this.initialize();
    check(getAddress(signer.address) === getAddress(this.executor), "wrong_finance_executor");
    const lease = await this.db.$transaction(async (tx) => {
      const now = await databaseTime(tx);
      const claimed = await tx.financeDecision.updateMany({
        where: {
          id,
          vault: this.chain.deployment.vault.toLowerCase(),
          nextCheckAt: { lte: now },
          state: { in: ["APPROVED", "RESERVED", "SIGNED", "BROADCAST", "UNKNOWN"] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          leaseOwner: this.owner,
          leaseEpoch: { increment: 1 },
          leaseExpiresAt: new Date(now.getTime() + 120000),
        },
      });
      return claimed.count ? await tx.financeDecision.findUniqueOrThrow({ where: { id } }) : null;
    });
    if (!lease) return false;
    try {
      await this.process(lease, signer);
    } catch (error) {
      if (error instanceof Error && error.message === "finance_lease_lost") return true;
      const reason =
        error instanceof Error && /^[a-z][a-z0-9_]{0,79}$/.test(error.message)
          ? error.message
          : "finance_rpc_unavailable";
      await this.mutate(id, lease.leaseEpoch, async (tx, row) => {
        const quarantine = [
          "finance_nonce_consumed",
          "finance_nonce_conflict",
          "finance_evidence_inconsistent",
          "finance_transaction_inconsistent",
        ].includes(reason);
        const reject =
          row.nonce === null &&
          [
            "stale_finance_decision",
            "resolution_expired",
            "invalid_approval_signature",
            "verified_delivery_required",
            "delivery_late_requires_refund",
            "review_window_exhausted",
            "hold_recovery_required",
          ].includes(reason);
        const now = await databaseTime(tx);
        await tx.financeDecision.update({
          where: { id },
          data: {
            state: quarantine ? "QUARANTINED" : reject ? "REJECTED" : row.state,
            errorReason: reason,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextCheckAt: new Date(now.getTime() + 5000),
          },
        });
      }).catch((error) => {
        if (!(error instanceof Error && error.message === "finance_lease_lost")) throw error;
      });
    }
    return true;
  }
  private async process(initial: FinanceDecision, signer: LocalAccount) {
    let row = initial;
    const a = approval(row),
      d = parseDecision(a.decision),
      data = decisionData(a),
      client = this.chain.client;
    check(
      row.id === d.decisionId &&
        row.holdId === d.holdId &&
        row.digest === hashDecision(vaultDomain(this.chain.deployment.vault), d),
      "finance_evidence_inconsistent",
    );
    if (!row.signedTransaction) {
      const before = await this.gate(a);
      if (row.nonce === null) {
        const [latest, pending, estimate, fees] = await Promise.all([
          client.getTransactionCount({ address: this.executor, blockTag: "latest" }),
          client.getTransactionCount({ address: this.executor, blockTag: "pending" }),
          client.estimateGas({
            account: this.executor,
            to: this.chain.deployment.vault,
            data,
            value: 0n,
          }),
          client.estimateFeesPerGas({ type: "eip1559", chain: null }),
        ]);
        check(latest === pending, "finance_nonce_conflict");
        const gas = (estimate * 120n + 99n) / 100n;
        check(
          gas <= this.budget.maxGasLimit &&
            fees.maxFeePerGas <= this.budget.maxFeePerGas &&
            fees.maxPriorityFeePerGas <= this.budget.maxPriorityFeePerGas &&
            gas * fees.maxFeePerGas <= this.budget.maxTransactionCost,
          "finance_gas_policy_exceeded",
        );
        await this.mutate(
          row.id,
          row.leaseEpoch,
          async (tx) => {
            const lane = await tx.financeLane.findUniqueOrThrow({ where: { id: this.lane() } });
            check(
              !lane.activeDecisionId || lane.activeDecisionId === row.id,
              "finance_executor_busy",
            );
            await this.checkBudget(tx, row.id, gas, fees.maxFeePerGas, fees.maxPriorityFeePerGas);
            await tx.financeLane.update({
              where: { id: this.lane() },
              data: { activeDecisionId: row.id },
            });
            await tx.financeDecision.update({
              where: { id: row.id },
              data: {
                state: "RESERVED",
                executor: this.executor.toLowerCase(),
                nonce: BigInt(latest),
                gasLimit: gas,
                maxFeePerGas: fees.maxFeePerGas.toString(),
                maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
                beforeHold: financialJson(before.hold),
              },
            });
          },
          true,
        );
        row = await this.db.financeDecision.findUniqueOrThrow({ where: { id: row.id } });
      }
      check(row.executor === this.executor.toLowerCase(), "wrong_finance_executor");
      const [latest, pending, balance] = await Promise.all([
        client.getTransactionCount({ address: this.executor, blockTag: "latest" }),
        client.getTransactionCount({ address: this.executor, blockTag: "pending" }),
        client.getBalance({ address: this.executor }),
      ]);
      check(BigInt(latest) === row.nonce && latest === pending, "finance_nonce_conflict");
      check(
        balance >= row.gasLimit! * BigInt(row.maxFeePerGas!.toFixed(0)),
        "insufficient_finance_gas",
      );
      check(
        row.gasLimit! <= this.budget.maxGasLimit &&
          BigInt(row.maxFeePerGas!.toFixed(0)) <= this.budget.maxFeePerGas &&
          BigInt(row.maxPriorityFeePerGas!.toFixed(0)) <= this.budget.maxPriorityFeePerGas &&
          row.gasLimit! * BigInt(row.maxFeePerGas!.toFixed(0)) <= this.budget.maxTransactionCost,
        "finance_gas_policy_exceeded",
      );
      await this.gate(a);
      await this.mutate(
        row.id,
        row.leaseEpoch,
        async (tx) => {
          const lane = await tx.financeLane.findUniqueOrThrow({ where: { id: this.lane() } });
          check(lane.activeDecisionId === row.id, "finance_lane_inconsistent");
          await this.checkBudget(
            tx,
            row.id,
            row.gasLimit!,
            BigInt(row.maxFeePerGas!.toFixed(0)),
            BigInt(row.maxPriorityFeePerGas!.toFixed(0)),
          );
        },
        true,
      );
      const signed = await signer.signTransaction({
        chainId: 43113,
        type: "eip1559",
        to: this.chain.deployment.vault,
        data,
        value: 0n,
        nonce: Number(row.nonce),
        gas: row.gasLimit!,
        maxFeePerGas: BigInt(row.maxFeePerGas!.toFixed(0)),
        maxPriorityFeePerGas: BigInt(row.maxPriorityFeePerGas!.toFixed(0)),
      });
      await validateSigned(row, signed, data);
      await this.mutate(row.id, row.leaseEpoch, async (tx) => {
        await tx.financeDecision.update({
          where: { id: row.id },
          data: { state: "SIGNED", signedTransaction: signed, transactionHash: keccak256(signed) },
        });
      });
      row = await this.db.financeDecision.findUniqueOrThrow({ where: { id: row.id } });
    }
    await this.reconcileOrSend(row, a, signer);
  }
  private async reconcileOrSend(row: FinanceDecision, a: FinanceApproval, _signer: LocalAccount) {
    const client = this.chain.client,
      hash = row.transactionHash as Hex,
      d = parseDecision(a.decision);
    check(row.executor === this.executor.toLowerCase(), "wrong_finance_executor");
    await validateSigned(row, row.signedTransaction as Hex, decisionData(a));
    const head = await this.chain.finalized();
    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash });
    } catch (error) {
      if (!(error instanceof Error && error.name === "TransactionReceiptNotFoundError"))
        throw error;
    }
    if (receipt) {
      await this.chain.canonical(receipt.blockNumber, receipt.blockHash);
      if (receipt.blockNumber <= head.number) {
        const tx = await client.getTransaction({ hash });
        check(
          tx.hash === hash &&
            tx.chainId === 43113 &&
            tx.from.toLowerCase() === row.executor &&
            tx.to?.toLowerCase() === row.vault &&
            tx.value === 0n &&
            BigInt(tx.nonce) === row.nonce &&
            tx.input === decisionData(a) &&
            tx.blockHash === receipt.blockHash &&
            tx.blockNumber === receipt.blockNumber &&
            receipt.transactionHash === hash &&
            receipt.from.toLowerCase() === row.executor &&
            receipt.to?.toLowerCase() === row.vault &&
            receipt.gasUsed <= row.gasLimit! &&
            receipt.effectiveGasPrice <= BigInt(row.maxFeePerGas!.toFixed(0)),
          "finance_transaction_inconsistent",
        );
        if (receipt.status === "success") {
          const before = row.beforeHold as Record<string, string>;
          const net = BigInt(before.remaining) - d.refundAmount;
          const fee = d.releaseRemainder ? (net * BigInt(before.feeBps)) / 10000n : 0n;
          const expectedProvider = d.releaseRemainder ? net - fee : 0n;
          const events = receipt.logs.filter((log) => {
            if (
              log.address.toLowerCase() !== row.vault ||
              log.removed ||
              log.transactionHash !== hash ||
              log.blockHash !== receipt.blockHash
            )
              return false;
            try {
              const decoded = decodeEventLog({
                abi: vaultFinanceAbi,
                data: log.data,
                topics: log.topics,
              });
              return (
                decoded.eventName === "DecisionApplied" &&
                decoded.args.decisionId === row.id &&
                decoded.args.holdId === row.holdId &&
                decoded.args.version === d.expectedVersion + 1n &&
                decoded.args.refundAmount === d.refundAmount &&
                decoded.args.feeAmount === fee &&
                decoded.args.providerAmount === expectedProvider
              );
            } catch {
              return false;
            }
          });
          check(
            events.length === 1 &&
              (await client.readContract({
                address: this.chain.deployment.vault,
                abi: vaultFinanceAbi,
                functionName: "usedDecisionIds",
                args: [d.decisionId],
                blockNumber: head.number,
              })),
            "finance_evidence_inconsistent",
          );
          const { hold } = await readFinalizedHold(this.chain, d.holdId, head);
          check(
            hold.version >= d.expectedVersion + 1n &&
              hold.refunded >= BigInt(before.refunded) + d.refundAmount &&
              (!d.releaseRemainder ||
                (hold.providerReleased === expectedProvider &&
                  hold.feeReleased === fee &&
                  hold.closed)),
            "finance_evidence_inconsistent",
          );
        } else check(receipt.status === "reverted", "finance_evidence_inconsistent");
        await this.chain.canonical(head.number, head.hash);
        await this.mutate(
          row.id,
          row.leaseEpoch,
          async (tx) => {
            const lane = await tx.financeLane.updateMany({
              where: { id: this.lane(), activeDecisionId: row.id },
              data: { activeDecisionId: null },
            });
            check(lane.count, "finance_lane_inconsistent");
            await tx.financeDecision.update({
              where: { id: row.id },
              data: {
                state: receipt.status === "success" ? "FINALIZED" : "REVERTED",
                receipt: financialJson({
                  transactionHash: hash,
                  receiptBlock: receipt.blockNumber,
                  receiptBlockHash: receipt.blockHash,
                  finalizedBlock: head.number,
                  finalizedBlockHash: head.hash,
                }),
                actualGasCost: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
                finalizedAt: await databaseTime(tx),
                errorReason: receipt.status === "success" ? null : "finance_transaction_reverted",
                leaseOwner: null,
                leaseExpiresAt: null,
              },
            });
          },
          true,
        );
        return;
      }
    } else {
      const latest = await client.getTransactionCount({
        address: this.executor,
        blockTag: "latest",
      });
      check(BigInt(latest) <= row.nonce!, "finance_nonce_consumed");
      check(BigInt(latest) === row.nonce, "finance_nonce_conflict");
      if (row.broadcastCount === 0) {
        check(
          BigInt(
            await client.getTransactionCount({ address: this.executor, blockTag: "pending" }),
          ) === row.nonce,
          "finance_nonce_conflict",
        );
        await this.gate(a);
      }
      await this.mutate(row.id, row.leaseEpoch, async (tx, current) => {
        check(current.broadcastCount < 3, "finance_broadcast_limit_reached");
        if (current.broadcastCount === 0 && d.releaseRemainder) {
          const operation = await tx.settlementOperation.update({
            where: { invocationKey: d.holdId },
            data: { revision: { increment: 1 } },
          });
          const latest = await tx.paymentDeliveryEvidence.findFirst({
            where: { invocationId: operation.invocationId },
            orderBy: [{ observedAt: "desc" }, { id: "desc" }],
          });
          check(latest?.id === a.evidenceId, "verified_delivery_required");
        }
        await tx.financeDecision.update({
          where: { id: row.id },
          data: { broadcastCount: { increment: 1 }, state: "UNKNOWN" },
        });
      });
      try {
        check(
          (await client.sendRawTransaction({
            serializedTransaction: row.signedTransaction as Hex,
          })) === hash,
          "finance_broadcast_hash_mismatch",
        );
        await this.mutate(row.id, row.leaseEpoch, async (tx) => {
          await tx.financeDecision.update({ where: { id: row.id }, data: { state: "BROADCAST" } });
        });
      } catch {
        /* Ambiguous sends retain exact persisted bytes and lane. */
      }
    }
    await this.mutate(row.id, row.leaseEpoch, async (tx) => {
      const now = await databaseTime(tx);
      await tx.financeDecision.update({
        where: { id: row.id },
        data: {
          errorReason: "finance_pending",
          nextCheckAt: new Date(now.getTime() + 5000),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
    });
  }
}
