import type { PrismaClient } from "#core/db";

export type HoldOutcome = "held" | "released" | "refunded";

// Where each held job's money stands, from the hold's finalized projection,
// keyed by hold id (the settlement's invocation key). A hold with no closed
// projection is still held.
export async function holdOutcomes(
  db: PrismaClient,
  keys: string[],
): Promise<(key: string) => HoldOutcome> {
  const projections = keys.length
    ? await db.vaultHoldProjection.findMany({
        where: { holdId: { in: keys } },
        select: { holdId: true, status: true },
      })
    : [];
  const closed = new Map(projections.map((row) => [row.holdId, row.status]));
  return (key) => {
    const status = closed.get(key);
    return status === "RELEASED"
      ? "released"
      : status === "REFUNDED" || status === "RECLAIMED"
        ? "refunded"
        : "held";
  };
}
