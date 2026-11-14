import type { PrismaClient } from "#core/db";

export type Evidence = {
  id: string;
  artifactVersion: number;
  evidenceLevel: string;
  observedAt: Date;
  accessInterruptionSeconds: number;
};
// A buyer's in-scope revision. `dueAt` is null on revisions made before
// revisions had their own deadline; those answer to the quote's deadline.
export type RevisionWindow = { targetArtifactVersion: number | null; dueAt: Date | null };

const seconds = (date: Date) => BigInt(Math.ceil(date.getTime() / 1000));

export type Timeliness =
  // Still inside a delivery window: nothing to decide yet.
  | { state: "pending" }
  // A window closed with nothing delivered for it.
  | { state: "missing"; reason: "auto_not_delivered" | "auto_revision_not_delivered" }
  // At least one delivery arrived after its window; `lateBy` is the worst miss.
  | { state: "late"; lateBy: bigint; latest: Evidence }
  | { state: "on_time"; latest: Evidence };

// Judges each delivery against its own window. The first delivery answers to
// the quote's deadline. A revision is answered by the first delivery of a
// newer artifact, which answers to the revision's own deadline, so fixing
// work after the original deadline is not "late". `evidence` must already be
// limited to deliveries that meet the signed evidence floor.
export function deliveryTimeliness(input: {
  deliveryDeadline: number;
  evidence: Evidence[];
  revisions: RevisionWindow[];
  now: bigint;
}): Timeliness {
  const deadline = BigInt(input.deliveryDeadline);
  const evidence = [...input.evidence].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const first = evidence[0];
  if (!first)
    return input.now >= deadline
      ? { state: "missing", reason: "auto_not_delivered" }
      : { state: "pending" };
  let lateBy: bigint | null = null;
  const miss = (observed: bigint, due: bigint) => {
    if (observed < due) return;
    const by = observed - due;
    lateBy = lateBy === null || by > lateBy ? by : lateBy;
  };
  miss(seconds(first.observedAt), deadline);
  for (const revision of input.revisions) {
    const target = revision.targetArtifactVersion ?? 0;
    const due = revision.dueAt ? seconds(revision.dueAt) : deadline;
    const answer = evidence.find((item) => item.artifactVersion > target);
    if (answer) miss(seconds(answer.observedAt), due);
    else if (input.now < due) return { state: "pending" };
    else return { state: "missing", reason: "auto_revision_not_delivered" };
  }
  const latest = evidence[evidence.length - 1];
  return lateBy === null ? { state: "on_time", latest } : { state: "late", lateBy, latest };
}

// Every delivery and revision of one invocation, oldest first, as the
// timeliness rule needs them.
export async function deliveryRecord(
  db: Pick<PrismaClient, "paymentDeliveryEvidence" | "invocationRevision">,
  invocationId: string,
) {
  const [evidence, revisions] = await Promise.all([
    db.paymentDeliveryEvidence.findMany({
      where: { invocationId },
      orderBy: [{ observedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        artifactVersion: true,
        evidenceLevel: true,
        observedAt: true,
        accessInterruptionSeconds: true,
      },
    }),
    db.invocationRevision.findMany({
      where: { invocationId },
      orderBy: { createdAt: "asc" },
      select: { targetArtifactVersion: true, dueAt: true },
    }),
  ]);
  return { evidence, revisions };
}
