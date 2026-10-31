import Papa from "papaparse";

// Everything in this file is deterministic: the LLM never computes a number.

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 200_000;
export const MAX_COLUMNS = 100;

export type Row = Record<string, string>;
export type ColumnType = "number" | "date" | "category" | "text" | "empty";

export type Column = {
  name: string;
  type: ColumnType;
  missing: number;
  distinct: number;
  // number columns
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sum?: number;
  stdev?: number;
  // category / text / date columns
  top?: { value: string; count: number }[];
  first?: string;
  last?: string;
};

export type Profile = { rows: number; columns: Column[] };
export type Agg = "sum" | "mean" | "count";
export type Point = { label: string; value: number };

export class CsvError extends Error {}

export function parseCsv(text: string): Row[] {
  const parsed = Papa.parse<Row>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header, index) => header.trim() || `column_${index + 1}`,
  });
  const fields = parsed.meta.fields ?? [];
  if (!fields.length || !parsed.data.length)
    throw new CsvError("The file has no header or no rows.");
  if (fields.length > MAX_COLUMNS) throw new CsvError(`More than ${MAX_COLUMNS} columns.`);
  if (parsed.data.length > MAX_ROWS) throw new CsvError(`More than ${MAX_ROWS} rows.`);
  const broken = parsed.errors.filter((e) => e.type === "Quotes").length;
  if (broken > parsed.data.length / 10)
    throw new CsvError("The file does not look like valid CSV.");
  return parsed.data;
}

const NUMBER = /^[-+]?[$€£¥]?\s?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?(e[-+]?\d+)?\s?%?$/i;

export function parseNumber(raw: string | undefined): number | null {
  const value = raw?.trim();
  if (!value || !/\d/.test(value) || !NUMBER.test(value)) return null;
  const n = Number(value.replace(/[$€£¥,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const DATE = /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2}(:\d{2})?)?|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const isDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(value));

const round = (n: number) => Math.round(n * 100) / 100;

function counts(values: string[]) {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function profileColumn(name: string, rows: Row[]): Column {
  const values = rows.map((r) => (r[name] ?? "").trim()).filter((v) => v !== "");
  const missing = rows.length - values.length;
  const distinctCounts = counts(values);
  const base = { name, missing, distinct: distinctCounts.length };
  if (!values.length) return { ...base, type: "empty" };

  const numbers = values.map(parseNumber).filter((n): n is number => n !== null);
  if (numbers.length >= values.length * 0.9) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const mean = sum / numbers.length;
    const variance = numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / numbers.length;
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    return {
      ...base,
      type: "number",
      min: sorted[0],
      max: sorted.at(-1),
      mean: round(mean),
      median: round(median),
      sum: round(sum),
      stdev: round(Math.sqrt(variance)),
    };
  }

  if (values.filter(isDate).length >= values.length * 0.9) {
    const sorted = [...values].sort((a, b) => Date.parse(a) - Date.parse(b));
    return { ...base, type: "date", first: sorted[0], last: sorted.at(-1) };
  }

  const top = distinctCounts.slice(0, 5).map(([value, count]) => ({ value, count }));
  // Few distinct values relative to rows: something you can group by.
  const category =
    distinctCounts.length <= Math.max(50, rows.length * 0.2) &&
    distinctCounts.length < values.length;
  return { ...base, type: category ? "category" : "text", top };
}

export function profile(rows: Row[]): Profile {
  const names = Object.keys(rows[0] ?? {});
  return { rows: rows.length, columns: names.map((name) => profileColumn(name, rows)) };
}

export const numericColumns = (p: Profile) => p.columns.filter((c) => c.type === "number");
export const groupColumns = (p: Profile) =>
  p.columns.filter((c) => (c.type === "category" || c.type === "date") && c.distinct >= 2);

// For date columns, group by month so a year of daily rows becomes 12 bars.
const groupKey = (raw: string, type: ColumnType) =>
  type === "date" ? new Date(Date.parse(raw)).toISOString().slice(0, 7) : raw;

export function aggregate(
  rows: Row[],
  p: Profile,
  groupBy: string,
  metric: string | null,
  agg: Agg,
  limit = 12,
): Point[] {
  const type = p.columns.find((c) => c.name === groupBy)?.type ?? "category";
  const groups = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const raw = row[groupBy]?.trim();
    if (!raw) continue;
    const key = groupKey(raw, type);
    const value = metric ? parseNumber(row[metric]) : 1;
    if (value === null) continue;
    const g = groups.get(key) ?? { sum: 0, n: 0 };
    g.sum += value;
    g.n += 1;
    groups.set(key, g);
  }
  const points = [...groups.entries()].map(([label, g]) => ({
    label,
    value: round(agg === "count" ? g.n : agg === "mean" ? g.sum / g.n : g.sum),
  }));
  // Time reads left to right; categories read largest first.
  if (type === "date") return points.sort((a, b) => a.label.localeCompare(b.label)).slice(-limit);
  return points.sort((a, b) => b.value - a.value).slice(0, limit);
}

export type Outlier = { row: number; value: number; z: number };

export function outliers(rows: Row[], column: Column, limit = 5): Outlier[] {
  if (column.type !== "number" || !column.stdev) return [];
  const found: Outlier[] = [];
  rows.forEach((row, i) => {
    const value = parseNumber(row[column.name]);
    if (value === null) return;
    const z = (value - column.mean!) / column.stdev!;
    if (Math.abs(z) >= 3) found.push({ row: i + 2, value, z: round(z) }); // +2: header and 1-based
  });
  return found.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, limit);
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return Papa.unparse({ fields: header, data: rows }) + "\n";
}
