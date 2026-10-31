import { describe, expect, test } from "bun:test";
import { aggregate, CsvError, outliers, parseCsv, parseNumber, profile } from "../src/csv";
import { salesCsv } from "./fixtures";

describe("parseNumber", () => {
  test.each([
    ["1,234.5", 1234.5],
    ["$99,000.00", 99000],
    ["-3e2", -300],
    ["12%", 12],
    ["€ 7", 7],
  ])("%s", (raw, expected) => expect(parseNumber(raw)).toBe(expected));

  test.each(["", "abc", "1,23", "2026-01-15", "12 apples"])("rejects %p", (raw) =>
    expect(parseNumber(raw)).toBeNull(),
  );
});

describe("profile", () => {
  const rows = parseCsv(salesCsv);
  const p = profile(rows);
  const col = (name: string) => p.columns.find((c) => c.name === name)!;

  test("detects column types", () => {
    expect(p.rows).toBe(60);
    expect(col("date").type).toBe("date");
    expect(col("region").type).toBe("category");
    expect(col("units").type).toBe("number");
    expect(col("revenue").type).toBe("number");
    expect(col("note").missing).toBe(48);
  });

  test("computes number stats", () => {
    expect(col("units").min).toBe(10);
    expect(col("units").max).toBe(16);
  });

  test("aggregates by category, largest first", () => {
    const points = aggregate(rows, p, "region", null, "count");
    expect(points).toEqual([
      { label: "EU", value: 20 },
      { label: "US", value: 20 },
      { label: "APAC", value: 20 },
    ]);
  });

  test("groups dates by month, in time order", () => {
    const points = aggregate(rows, p, "date", "units", "sum");
    expect(points.map((x) => x.label)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`),
    );
  });

  test("finds the planted outlier", () => {
    expect(outliers(rows, col("revenue"))).toEqual([
      { row: 44, value: 99000, z: expect.any(Number) },
    ]);
  });
});

test("rejects files without rows", () => {
  expect(() => parseCsv("a,b\n")).toThrow(CsvError);
  expect(() => parseCsv("")).toThrow(CsvError);
});
