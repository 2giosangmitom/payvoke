// Sample data for the hero film, modelled on the CSV Analyst example in
// examples/csv-analyst: its real command, price, terms, progress steps and
// dashboard. None of it comes from the API, and the figures agree with each
// other (the same file, the same regions, the same totals).

export const film = {
  fps: 30,
  width: 1280,
  height: 800,
} as const;

export type Chapter = { id: string; label: string; from: number; duration: number };

// Seconds on screen for each part of the job, in order.
const lengths = [
  ["chat", "Chat", 5],
  ["offer", "Offer", 6],
  ["pay", "Pay", 4],
  ["result", "Result", 9],
] as const;

export const chapters: Chapter[] = lengths.reduce<Chapter[]>((list, [id, label, seconds]) => {
  const last = list.at(-1);
  const from = last ? last.from + last.duration : 0;
  list.push({ id, label, from, duration: Math.round(seconds * film.fps) });
  return list;
}, []);

export const filmDuration = chapters.reduce((total, chapter) => total + chapter.duration, 0);

/* The console around the chat */

export const threads = [
  { title: "Q3 revenue drop", app: "CSV Analyst" },
  { title: "Review #482 auth flow", app: "PR Reviewer" },
  { title: "MSA v3 vs v4", app: "Contract Compare" },
  { title: "Weekly product sync", app: "Meeting Notes" },
  { title: "Clean October leads", app: "Sheet Cleaner" },
  { title: "Docs into Japanese", app: "Docs Translator" },
] as const;

export const wallet = "0x3a9E…c6e1";

/* The job */

export const file = { name: "sales-2026-q3.csv", size: "1.4 MB", rows: "18,402 rows" };
export const goal = "why did Q3 revenue drop?";

export const offer = {
  price: "$1.00",
  summary:
    "Deep analysis: column profile, 5 charts, outliers and a written analysis, plus the numbers as JSON and CSV.",
  refund:
    "Full automatic refund if the file cannot be parsed, has no usable columns, or the result is not delivered before the deadline.",
};

export const plan = [
  `Reading ${file.name}`,
  "Profiled 18,402 rows and 9 columns",
  "Choosing charts",
  "Building the dashboard",
  "Writing the analysis",
  "Saved 2 files",
];

// Revenue by region. Q2 totals 2,002,700 and Q3 1,925,930: down 3.8%, and
// the West alone lost 114,250.
export const regions = [
  ["West", 612_400, 498_150],
  ["East", 588_900, 603_200],
  ["Central", 421_300, 432_780],
  ["South", 380_100, 391_800],
] as const;

// The dashboard CSV Analyst streams, as OpenUI Lang statements in the order
// it sends them (examples/csv-analyst/src/ui.ts), without the outliers table
// so the delivered job fits on one screen.
export const program = [
  "root = Stack([head, kpis, chart])",
  "head = Stack([head_t, head_c])",
  `head_t = Text("Analysis of ${file.name}", "heading")`,
  'head_c = Text("Why did Q3 revenue drop?", "caption")',
  'kpis = Stack([kpis_0, kpis_1, kpis_2, kpis_3], "horizontal")',
  'kpis_0 = Metric("Rows", 18402)',
  'kpis_1 = Metric("Columns", 9)',
  'kpis_2 = Metric("Missing", 0.7, "%")',
  'kpis_3 = Metric("Q3 revenue", "1.93M", "USD")',
  `chart = Chart([${regions.map(([name, , q3]) => `{label: "${name}", value: ${q3}}`).join(", ")}], "Q3 revenue by region")`,
];
