import { z } from "zod";
import { groupColumns, numericColumns, type Agg, type Profile } from "./csv";

export type ChartSpec = { groupBy: string; metric: string | null; agg: Agg };
export type Plan = { charts: ChartSpec[]; source: "model" | "fallback" };

// What we ask the model for. Loose on purpose: a small model's output is
// filtered against the real columns afterwards instead of being trusted.
export const planSchema = z.object({
  charts: z
    .array(
      z.object({
        group: z.string().describe("A column from the group list"),
        number: z
          .string()
          .nullable()
          .describe("A column from the number list, or null to count rows"),
        aggregate: z.enum(["sum", "mean", "count"]),
      }),
    )
    .max(8),
});

export function validatePlan(
  raw: z.infer<typeof planSchema>,
  p: Profile,
  max: number,
): ChartSpec[] {
  const groups = new Set(groupColumns(p).map((c) => c.name));
  const numbers = new Set(numericColumns(p).map((c) => c.name));
  const seen = new Set<string>();
  const charts: ChartSpec[] = [];
  for (const c of raw.charts) {
    const groupBy = c.group.trim();
    const metric = c.number?.trim() || null;
    if (!groups.has(groupBy)) continue;
    if (metric !== null && !numbers.has(metric)) continue;
    const agg: Agg = metric === null ? "count" : c.aggregate === "count" ? "sum" : c.aggregate;
    const key = `${groupBy}|${metric}|${agg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    charts.push({ groupBy, metric, agg });
    if (charts.length === max) break;
  }
  return charts;
}

// Used when the model is down, rate limited or returns nothing usable.
// Groups with few distinct values first: they make readable bar charts.
export function defaultPlan(p: Profile, metric: string | null, max: number): ChartSpec[] {
  const groups = groupColumns(p).sort((a, b) => a.distinct - b.distinct);
  const focus = metric ?? numericColumns(p)[0]?.name ?? null;
  const charts: ChartSpec[] = groups.map((g) => ({
    groupBy: g.name,
    metric: focus,
    agg: focus ? "sum" : "count",
  }));
  if (focus && groups[0])
    charts.splice(1, 0, { groupBy: groups[0].name, metric: focus, agg: "mean" });
  return charts.slice(0, max);
}

export function planPrompt(
  p: Profile,
  opts: { goal?: string; metric: string | null; max: number; feedback?: string },
) {
  const groups = groupColumns(p).map(
    (c) => `- ${c.name} (${c.type}, ${c.distinct} distinct values)`,
  );
  const numbers = numericColumns(p).map((c) => `- ${c.name} (min ${c.min}, max ${c.max})`);
  return [
    `Pick up to ${opts.max} charts.`,
    `Group columns:\n${groups.join("\n") || "- none"}`,
    `Number columns:\n${numbers.join("\n") || "- none"}`,
    opts.metric ? `The buyer cares most about: ${opts.metric}` : "",
    opts.goal ? `Buyer's goal: ${opts.goal}` : "",
    opts.feedback ? `The buyer asked to change the previous version: ${opts.feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
