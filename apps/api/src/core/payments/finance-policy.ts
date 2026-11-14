import { paymentTypes, vaultDomain, type ResolutionDecision } from "@payvoke/shared/protocol";
import { type QuoteDocument } from "@payvoke/shared/x402";
import { keccak256, stringToHex, type Hex, type LocalAccount } from "viem";
import { evidenceSatisfies, termsMinEvidence } from "./evidence";
import { readFinalizedHold } from "./finance-ledger";
import { FinanceService, releaseSchedule, type WireDecision } from "./finance";
import {
  deliveryRecord,
  deliveryTimeliness,
  lateRefundBps,
  type Evidence,
  type RevisionWindow,
} from "./timeliness";

// Payvoke does not arbitrate output quality. Paid work that is not delivered,
// fails or arrives late is refunded in full, unless the signed terms grant a
// late-delivery grace: then a slightly late delivery refunds the agreed share
// and releases the rest after review. Verified on-time delivery is released
// once the signed review window has passed. Anything the policy cannot decide
// is left to the buyer's own reclaim after resolveBy.
// `refundBps` is the share of the remaining hold refunded; below 10000 the
// rest is released to the provider.
export type AutoOutcome = { refundBps: number; reason: string; evidenceId: string | null };

const FULL = 10_000;

type Hold = {
  closed: boolean;
  deliveryDeadline: number;
  releaseNotBefore: number;
  resolveBy: number;
};

const activeStates = ["APPROVED", "RESERVED", "SIGNED", "BROADCAST", "UNKNOWN"] as const;
// A failed decision costs gas; stop retrying and leave the hold to reclaim.
const MAX_AUTO_ATTEMPTS = 3;

export function autoOutcome(input: {
  hold: Hold;
  now: bigint;
  executionStatus: string;
  terms: unknown;
  evidence: Evidence[];
  revisions?: RevisionWindow[];
}): AutoOutcome | null {
  const { hold, now } = input;
  if (hold.closed) return null;
  const minimum = termsMinEvidence(input.terms);
  // Evidence below the signed floor is not a delivery.
  const evidence = minimum
    ? input.evidence.filter((item) => evidenceSatisfies(item.evidenceLevel, minimum))
    : [];
  const timeliness = deliveryTimeliness({
    deliveryDeadline: hold.deliveryDeadline,
    evidence,
    revisions: input.revisions ?? [],
    now,
  });
  const refund = (reason: string): AutoOutcome => ({ refundBps: FULL, reason, evidenceId: null });
  // Releases (all or part of) the hold once the latest delivery's review ends.
  const release = (latest: Evidence, refundBps: number, reason: string) => {
    const { earliest } = releaseSchedule(latest, hold);
    if (earliest >= BigInt(hold.resolveBy)) return refund("auto_review_window_exhausted");
    return now >= earliest ? { refundBps, reason, evidenceId: latest.id } : null;
  };
  switch (timeliness.state) {
    case "pending":
      return !evidence.length && input.executionStatus === "FAILED"
        ? refund("auto_execution_failed")
        : null;
    case "missing":
      return refund(timeliness.reason);
    case "late": {
      const refundBps = lateRefundBps(input.terms, timeliness.lateBy);
      return refundBps >= FULL
        ? refund("auto_delivered_late")
        : release(timeliness.latest, refundBps, "auto_delivered_late_partial");
    }
    case "on_time":
      return release(timeliness.latest, 0, "auto_delivered");
  }
}

export class AutoFinance {
  constructor(
    readonly service: FinanceService,
    readonly approver: LocalAccount,
    readonly executor: LocalAccount,
  ) {}

  // Signs and enqueues at most one automatic decision per open hold. Every open
  // hold is screened from the database; only decidable ones cost RPC reads.
  async propose() {
    const { db, chain } = this.service;
    const vault = chain.deployment.vault.toLowerCase();
    const open = await db.vaultHoldProjection.findMany({
      where: { vault, status: { in: ["HELD", "PARTIALLY_REFUNDED"] }, invocationId: { not: null } },
      orderBy: { blockNumber: "asc" },
    });
    const head = await chain.finalized();
    let enqueued = 0;
    for (const projection of open) {
      const holdId = projection.holdId as Hex;
      const previous = await db.financeDecision.findMany({
        where: { vault, holdId },
        select: { state: true },
      });
      if (
        previous.some((d) => (activeStates as readonly string[]).includes(d.state)) ||
        previous.some((d) => d.state === "QUARANTINED" || d.state === "FINALIZED") ||
        previous.length >= MAX_AUTO_ATTEMPTS
      )
        continue;
      try {
        const op = await db.settlementOperation.findUnique({
          where: { invocationKey: holdId },
          include: { invocation: { include: { quote: true } } },
        });
        if (op?.state !== "HELD") continue;
        const { evidence, revisions } = await deliveryRecord(db, op.invocationId);
        const q = op.invocation.quote.document as unknown as QuoteDocument;
        const decide = (h: Hold) =>
          autoOutcome({
            hold: h,
            now: head.timestamp,
            executionStatus: op.invocation.executionStatus,
            terms: (q.termsSnapshot as { definition?: unknown } | null)?.definition,
            evidence,
            revisions,
          });
        // The signed quote carries the same deadlines as the hold.
        if (!decide({ ...q, closed: false })) continue;
        const { hold } = await readFinalizedHold(chain, holdId, head);
        const outcome = decide(hold);
        if (!outcome) continue;
        const decision: ResolutionDecision = {
          holdId,
          decisionId: keccak256(
            stringToHex(`payvoke-auto:${holdId}:${hold.version}:${previous.length}`),
          ),
          expectedVersion: hold.version,
          refundAmount: (hold.remaining * BigInt(outcome.refundBps)) / BigInt(FULL),
          releaseRemainder: outcome.refundBps < FULL,
          validUntil: hold.resolveBy,
        };
        const signature = await this.approver.signTypedData({
          domain: vaultDomain(chain.deployment.vault),
          types: paymentTypes,
          primaryType: "ResolutionDecision",
          message: decision,
        });
        await this.service.enqueue({
          decision: wire(decision),
          approver: this.approver.address,
          signature,
          evidenceId: outcome.evidenceId,
          reason: outcome.reason,
        });
        enqueued++;
      } catch (error) {
        console.error(`Automatic finance proposal skipped: ${code(error)}`);
      }
    }
    return enqueued;
  }

  // Advances queued decisions; the executor lane still sends one at a time.
  async execute(limit = 20) {
    const { db, chain } = this.service;
    const due = await db.financeDecision.findMany({
      where: {
        vault: chain.deployment.vault.toLowerCase(),
        state: { in: [...activeStates] },
        nextCheckAt: { lte: new Date() },
      },
      orderBy: [{ nonce: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: limit,
      select: { id: true },
    });
    for (const { id } of due) await this.service.tick(id, this.executor);
    return due.length;
  }
}

function wire(d: ResolutionDecision): WireDecision {
  return {
    holdId: d.holdId,
    decisionId: d.decisionId,
    expectedVersion: d.expectedVersion.toString(),
    refundAmount: d.refundAmount.toString(),
    releaseRemainder: d.releaseRemainder,
    validUntil: d.validUntil.toString(),
  };
}

function code(error: unknown) {
  return error instanceof Error && /^[a-z][a-z0-9_]{0,79}$/.test(error.message)
    ? error.message
    : "finance_rpc_unavailable";
}
