import { Prisma, type PrismaClient } from "#core/db";

// A public track record for each agent, so a buyer (or their assistant) can
// judge it before paying. Every number comes from Payvoke's own records:
// escrow outcomes from the finalized vault projection and delivery times from
// verified delivery evidence. The owner's own purchases of their agent say
// nothing about it and are left out, as in the payment Risk Check.

// An agent with fewer paid jobs is new. The Risk Check uses the same bound.
export const NEW_AGENT_JOBS = 3;
// Rates cover the agent's most recent jobs whose escrow has closed.
export const REPUTATION_WINDOW = 50;
// With fewer closed jobs the rates are not shown; a couple of jobs prove little.
export const REPUTATION_MIN = 5;

export type Reputation = {
  /** Paid jobs by buyers other than the owner, all time. */
  paidJobs: number;
  /** Closed jobs the rates below are taken over (at most REPUTATION_WINDOW). */
  sample: number;
  /** Whole percents, or null below REPUTATION_MIN closed jobs. */
  successRate: number | null;
  onTimeRate: number | null;
  refundRate: number | null;
  /** Median time from payment to the first verified result, in seconds. */
  medianDeliverySeconds: number | null;
  isNew: boolean;
};

export const emptyReputation = (): Reputation => ({
  paidJobs: 0,
  sample: 0,
  successRate: null,
  onTimeRate: null,
  refundRate: null,
  medianDeliverySeconds: null,
  isNew: true,
});

type ClosedJob = {
  appId: string;
  status: string;
  deadline: string | null;
  started: Date;
  firstDelivery: Date | null;
};

const percent = (part: number, whole: number) => Math.round((part * 100) / whole);

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** The track record of each app, keyed by app id. Two queries for any number of apps. */
export async function reputation(
  db: Pick<PrismaClient, "$queryRaw">,
  appIds: string[],
): Promise<Map<string, Reputation>> {
  const ids = [...new Set(appIds)];
  const result = new Map(ids.map((id) => [id, emptyReputation()]));
  if (!ids.length) return result;
  // A paid job is a quote whose payment the vault held, bought by someone
  // other than the agent's owner.
  const paid = Prisma.sql`
    FROM "quotes" q
    JOIN "apps" a ON a."id" = q."appId"
    JOIN "invocations" i ON i."quoteId" = q."id"
    JOIN "settlement_operations" s ON s."invocationId" = i."id" AND s."state" = 'HELD'
    LEFT JOIN "vault_hold_projections" h ON h."holdId" = s."invocationKey"
    WHERE q."appId" IN (${Prisma.join(ids)}) AND q."buyerId" <> a."ownerId"`;
  const [counts, closed] = await Promise.all([
    db.$queryRaw<{ appId: string; jobs: bigint }[]>`
      SELECT q."appId", COUNT(*) AS "jobs" ${paid} GROUP BY q."appId"`,
    // Each app's most recent closed jobs, ranked per app in SQL so a busy
    // agent never crowds the others out of the window.
    db.$queryRaw<ClosedJob[]>`
      SELECT "appId", "status", "deadline", "started", "firstDelivery" FROM (
        SELECT q."appId", h."status", q."document"->>'deliveryDeadline' AS "deadline",
          i."createdAt" AS "started",
          (SELECT MIN(e."observedAt") FROM "payment_delivery_evidence" e
            WHERE e."invocationId" = i."id") AS "firstDelivery",
          ROW_NUMBER() OVER (PARTITION BY q."appId" ORDER BY i."createdAt" DESC) AS "rank"
        ${paid}
        AND h."status" IN ('RELEASED', 'REFUNDED', 'RECLAIMED')
      ) ranked
      WHERE "rank" <= ${REPUTATION_WINDOW}`,
  ]);
  for (const row of counts) {
    const entry = result.get(row.appId)!;
    entry.paidJobs = Number(row.jobs);
    entry.isNew = entry.paidJobs < NEW_AGENT_JOBS;
  }
  const byApp = new Map<string, ClosedJob[]>();
  for (const row of closed) byApp.set(row.appId, [...(byApp.get(row.appId) ?? []), row]);
  for (const [appId, jobs] of byApp) {
    const entry = result.get(appId)!;
    entry.sample = jobs.length;
    if (jobs.length < REPUTATION_MIN) continue;
    // RELEASED includes a slightly late delivery settled partly under the
    // signed late policy; the on-time rate still counts it as late.
    entry.successRate = percent(
      jobs.filter((job) => job.status === "RELEASED").length,
      jobs.length,
    );
    entry.refundRate = percent(jobs.filter((job) => job.status !== "RELEASED").length, jobs.length);
    // On time as the escrow judges it: the first result observed before the deadline.
    entry.onTimeRate = percent(
      jobs.filter(
        (job) =>
          job.firstDelivery !== null &&
          job.deadline !== null &&
          Math.ceil(job.firstDelivery.getTime() / 1000) < Number(job.deadline),
      ).length,
      jobs.length,
    );
    entry.medianDeliverySeconds = median(
      jobs.flatMap((job) =>
        job.firstDelivery
          ? [Math.max(0, Math.round((job.firstDelivery.getTime() - job.started.getTime()) / 1000))]
          : [],
      ),
    );
  }
  return result;
}
