import { expect, test } from "bun:test";
import { parseCsv, profile } from "../src/csv";
import { defaultPlan, validatePlan } from "../src/plan";
import { salesCsv } from "./fixtures";

const p = profile(parseCsv(salesCsv));

test("keeps only charts over real columns, without duplicates", () => {
  const charts = validatePlan(
    {
      charts: [
        { group: "region", number: "revenue", aggregate: "sum" },
        { group: "region", number: "revenue", aggregate: "sum" },
        { group: "Region ", number: "revenue", aggregate: "sum" },
        { group: "revenue", number: "units", aggregate: "sum" },
        { group: "product", number: "made_up", aggregate: "mean" },
        { group: "product", number: null, aggregate: "sum" },
      ],
    },
    p,
    5,
  );
  expect(charts).toEqual([
    { groupBy: "region", metric: "revenue", agg: "sum" },
    { groupBy: "product", metric: null, agg: "count" },
  ]);
});

test("respects the chart limit", () => {
  const raw = {
    charts: ["region", "product", "date"].map((group) => ({
      group,
      number: "units",
      aggregate: "sum" as const,
    })),
  };
  expect(validatePlan(raw, p, 2)).toHaveLength(2);
});

test("default plan uses the chosen metric", () => {
  const charts = defaultPlan(p, "units", 5);
  expect(charts.length).toBeGreaterThan(1);
  expect(charts.every((c) => c.metric === "units")).toBe(true);
});
