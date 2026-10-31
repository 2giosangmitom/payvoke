import type { Column, Outlier, Point, Profile } from "./csv";

// Builds OpenUI Lang patches from computed data. The model never writes UI:
// small models break the syntax, and code-built UI is always valid.
//
// Payvoke rejects any patch containing markup, URLs or `javascript:`/`data:`,
// and CSV cells can contain all of those, so every string goes through safe().

const PATCH_LIMIT = 8000; // Payvoke allows 8192 per patch

export function safe(value: string, max = 80): string {
  const clean = value
    // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/(javascript|data|https?)\s*:/gi, "$1 :")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const str = (value: string, max?: number) => JSON.stringify(safe(value, max));
const num = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "null");
const lit = (v: string | number | null) =>
  v === null ? "null" : typeof v === "number" ? num(v) : str(v);

// Table columns use generated keys (c0, c1, …) with display labels, so column
// names with spaces or symbols never need quoting as object keys.
function table(id: string, labels: string[], rows: (string | number | null)[][]): string {
  const columns = labels.map((label, i) => `{key: "c${i}", label: ${str(label, 40)}}`).join(", ");
  const body = rows
    .map((row) => `{${row.map((v, i) => `c${i}: ${lit(v)}`).join(", ")}}`)
    .join(", ");
  return `${id} = Table([${columns}], [${body}])`;
}

const fmt = (n: number | undefined) =>
  n === undefined
    ? ""
    : Math.abs(n) >= 1e6
      ? n.toExponential(2)
      : String(Math.round(n * 100) / 100);

function describe(c: Column): string {
  if (c.type === "number") return `${fmt(c.min)} to ${fmt(c.max)}, mean ${fmt(c.mean)}`;
  if (c.type === "date") return `${c.first} to ${c.last}`;
  if (c.top?.length)
    return c.top
      .slice(0, 3)
      .map((t) => `${t.value} (${t.count})`)
      .join(", ");
  return "";
}

export function header(id: string, title: string, caption: string) {
  return `${id} = Stack([${id}_t, ${id}_c])\n${id}_t = Text(${str(title)}, "heading")\n${id}_c = Text(${str(caption, 160)}, "caption")`;
}

export function metrics(
  id: string,
  items: { label: string; value: number | string; unit?: string }[],
) {
  const ids = items.map((_, i) => `${id}_${i}`);
  const lines = items.map(
    (m, i) =>
      `${ids[i]} = Metric(${str(m.label, 40)}, ${typeof m.value === "number" ? num(m.value) : str(m.value, 40)}${m.unit ? `, ${str(m.unit, 20)}` : ""})`,
  );
  return [`${id} = Stack([${ids.join(", ")}], "horizontal")`, ...lines].join("\n");
}

export function profileCard(id: string, p: Profile) {
  const rows = p.columns
    .slice(0, 40)
    .map((c) => [c.name, c.type, c.missing, c.distinct, describe(c)] as (string | number)[]);
  let patch = "";
  // Shrink the table until it fits one patch.
  for (let n = rows.length; n > 0; n = Math.floor(n * 0.7)) {
    patch = `${id} = Card("Columns", ${str(`${p.columns.length} columns, ${p.rows} rows`)}, [${id}_t])\n${table(`${id}_t`, ["Column", "Type", "Missing", "Distinct", "Summary"], rows.slice(0, n))}`;
    if (patch.length <= PATCH_LIMIT) break;
  }
  return patch;
}

export function chart(id: string, title: string, points: Point[]) {
  const data = points.map((p) => `{label: ${str(p.label, 40)}, value: ${num(p.value)}}`).join(", ");
  return `${id} = Chart([${data}], ${str(title)})`;
}

export function outlierCard(id: string, column: string, found: Outlier[]) {
  if (!found.length)
    return `${id} = Card("Outliers", ${str(`No values of ${column} more than 3 standard deviations from the mean`)})`;
  return `${id} = Card("Outliers", ${str(`${column}: values more than 3 standard deviations from the mean`)}, [${id}_t])\n${table(
    `${id}_t`,
    ["CSV line", "Value", "z-score"],
    found.map((o) => [o.row, o.value, o.z]),
  )}`;
}

// The root lists the sections streamed so far; redefining it is how the
// surface grows (latest definition wins).
export const root = (ids: string[]) => `root = Stack([${ids.join(", ")}])`;
