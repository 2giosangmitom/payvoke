import {
  CsvError,
  numericColumns,
  outliers,
  parseCsv,
  profile,
  type Profile,
  type Row,
} from "./csv";
import type { Run } from "./payvoke";
import * as ui from "./ui";

// /profile: an instant, fixed-price command. The buyer pastes the CSV text as
// the `csv` argument (often over x402, with no chat), so the run gets no files
// and nothing is downloaded. No model is involved: every number comes from code.

export const PROFILE_AMOUNT = "200000"; // 0.20 USDC, atomic
export const PROFILE_MAX_CHARS = 200_000;

export type Flag = { column: string | null; issue: string };

// Data quality checks a buyer would want before trusting the file.
export function qualityFlags(rows: Row[], p: Profile): Flag[] {
  const flags: Flag[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const key = JSON.stringify(Object.values(row));
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  if (duplicates)
    flags.push({ column: null, issue: `${duplicates} duplicate row${duplicates > 1 ? "s" : ""}` });
  for (const c of p.columns) {
    if (/^column_\d+$/.test(c.name)) flags.push({ column: c.name, issue: "Missing header" });
    if (c.type === "empty") {
      flags.push({ column: c.name, issue: "Every value is empty" });
      continue;
    }
    const share = p.rows ? c.missing / p.rows : 0;
    if (share >= 0.2)
      flags.push({ column: c.name, issue: `${Math.round(share * 100)}% of values missing` });
    if (c.distinct === 1 && p.rows > 1)
      flags.push({ column: c.name, issue: "Constant: only one distinct value" });
    if (c.type === "text" && c.distinct === p.rows - c.missing && p.rows > 1)
      flags.push({ column: c.name, issue: "Every value is unique (an id or free text)" });
    if (c.type === "number") {
      const found = outliers(rows, c, 100);
      if (found.length)
        flags.push({
          column: c.name,
          issue: `${found.length} outlier${found.length > 1 ? "s" : ""} (more than 3 standard deviations from the mean)`,
        });
    }
  }
  return flags;
}

export function headline(p: Profile, focus?: string) {
  const cells = p.rows * p.columns.length;
  const missing = p.columns.reduce((a, c) => a + c.missing, 0);
  const items: { label: string; value: number | string; unit?: string }[] = [
    { label: "Rows", value: p.rows },
    { label: "Columns", value: p.columns.length },
    { label: "Missing", value: cells ? Math.round((missing / cells) * 1000) / 10 : 0, unit: "%" },
  ];
  const column = p.columns.find((c) => c.name === focus);
  if (column?.sum !== undefined) items.push({ label: `Total ${column.name}`, value: column.sum });
  else items.push({ label: "Numeric columns", value: numericColumns(p).length });
  return items;
}

const cell = (v: unknown) =>
  String(v ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
export const mdTable = (head: string[], rows: unknown[][]) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");

export function columnsTable(p: Profile) {
  return mdTable(
    ["Column", "Type", "Missing", "Distinct", "Min", "Max", "Mean", "Top values"],
    p.columns.map((c) => [
      c.name,
      c.type,
      c.missing,
      c.distinct,
      c.min ?? c.first ?? "",
      c.max ?? c.last ?? "",
      c.mean ?? "",
      c.top
        ?.slice(0, 3)
        .map((t) => `${t.value} (${t.count})`)
        .join(", ") ?? "",
    ]),
  );
}

export function profileMarkdown(p: Profile, flags: Flag[]) {
  const quality = flags.length
    ? mdTable(
        ["Column", "Issue"],
        flags.map((f) => [f.column ?? "(all rows)", f.issue]),
      )
    : "No issues found.";
  return `# CSV profile\n\n${p.rows} rows, ${p.columns.length} columns.\n\n## Columns\n\n${columnsTable(p)}\n\n## Data quality\n\n${quality}\n`;
}

function flagCard(id: string, flags: Flag[]) {
  const text = flags.length
    ? flags
        .slice(0, 12)
        .map((f) => `${f.column ? `${f.column}: ` : ""}${f.issue}`)
        .join("; ")
    : "No issues found";
  return `${id} = Card("Data quality", ${JSON.stringify(ui.safe(text, 1500))})`;
}

export function parseProfileInput(args: Record<string, unknown>) {
  if (typeof args.csv !== "string" || !args.csv.trim())
    throw new CsvError("The csv argument must contain the CSV text.");
  if (args.csv.length > PROFILE_MAX_CHARS)
    throw new CsvError(`The CSV text is longer than ${PROFILE_MAX_CHARS} characters.`);
  const rows = parseCsv(args.csv);
  const p = profile(rows);
  if (p.columns.every((c) => c.type === "empty")) throw new CsvError("Every column is empty.");
  return { rows, profile: p };
}

// Runs the whole instant job on a claimed run. Throws CsvError on bad input,
// which the caller turns into a `failed` report (automatic refund).
export async function runProfile(
  run: Run,
  args: Record<string, unknown>,
  upload: (name: string, type: string, body: string) => Promise<{ fileId: string }[]>,
) {
  await run.progress("read", "Reading the CSV");
  const { rows, profile: p } = parseProfileInput(args);
  await run.progress("read", "Read the CSV", "done", `${p.rows} rows, ${p.columns.length} columns`);

  await run.progress("ui", "Building the profile");
  const flags = qualityFlags(rows, p);
  const sections = ["head", "kpi", "cols", "flags"];
  await run.surface(
    "profile",
    `${ui.header("head", "CSV profile", "Computed directly from the data")}\n${ui.root(sections)}`,
  );
  await run.surface("profile", ui.metrics("kpi", headline(p)));
  await run.surface("profile", ui.profileCard("cols", p));
  await run.surface("profile", flagCard("flags", flags));
  await run.progress("ui", "Built the profile", "done", `${flags.length} quality flags`);

  // `/profile` needs SIGN evidence: the reported output is the deliverable and
  // profile.json is an optional extra.
  const files = await upload(
    "profile.json",
    "application/json",
    JSON.stringify({ profile: p, flags }, null, 2),
  );
  await run.finish({
    type: "result",
    data: { artifactVersion: 1, output: profileMarkdown(p, flags), files },
  });
}
