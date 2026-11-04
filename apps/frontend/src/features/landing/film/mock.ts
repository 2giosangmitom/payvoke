import type { CommandRevision } from "@/src/features/chat/api";

// Sample data for the landing films, modelled on the CSV Analyst example in
// examples/csv-analyst: its real commands, prices, terms, progress steps and
// dashboard. None of it comes from the API, and the figures agree across
// every film (the same file, the same regions, the same totals).

export const film = {
  fps: 30,
  width: 960,
  height: 600,
} as const;

export type Chapter = { id: string; label: string; from: number; duration: number };

// Seconds on screen for each chapter of the overview, in order.
const lengths = [
  ["intro", "Payvoke", 3],
  ["store", "Store", 4.5],
  ["command", "Commands", 4],
  ["form", "Forms", 4.5],
  ["offer", "Offer", 4.5],
  ["hold", "Avalanche", 5],
  ["work", "Results", 5.5],
  ["settle", "Settled", 4.5],
] as const;

export const chapters: Chapter[] = lengths.reduce<Chapter[]>((list, [id, label, seconds]) => {
  const last = list.at(-1);
  const from = last ? last.from + last.duration : 0;
  list.push({ id, label, from, duration: Math.round(seconds * film.fps) });
  return list;
}, []);

export const filmDuration = chapters.reduce((total, chapter) => total + chapter.duration, 0);

export const chapter = (id: string) => chapters.find((entry) => entry.id === id)!;

/* The store */

export const agents = [
  {
    name: "CSV Analyst",
    description: "Charts, outliers and a written analysis of a CSV file.",
    commands: ["analyze", "profile"],
  },
  {
    name: "Sheet Cleaner",
    description: "Dedupes, fixes dates and splits columns in messy CSV files.",
    commands: ["clean"],
  },
  {
    name: "PR Reviewer",
    description: "Line-by-line review of a GitHub pull request.",
    commands: ["review"],
  },
  {
    name: "Meeting Notes",
    description: "Decisions and action items from a call recording.",
    commands: ["notes", "transcribe"],
  },
] as const;

export const query = "csv";

export const commands = [
  ["analyze", "Charts, outliers and a written analysis of a CSV file"],
  ["profile", "Column-by-column profile: types, missing values, ranges"],
] as const;

// CommandCard reads only the options of a revision.
export const analyzeRevision = {
  options: [
    { name: "file", type: "FILE", required: true },
    { name: "goal", type: "STRING", required: false },
    { name: "depth", type: "STRING", required: false },
  ],
} as unknown as CommandRevision;

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

export const chain = {
  block: 47_183_902,
  tx: "0x8f3a5e91…b07c21d",
  vault: "0x5b2E…9aF1",
  key: "0x71C4…e2B9",
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

const money = (value: number) => `$${value.toLocaleString("en-US")}`;
const change = (from: number, to: number) => {
  const pct = ((to - from) / from) * 100;
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
};

export const regionRows = regions.map(([name, q2, q3]) => [
  name,
  money(q2),
  money(q3),
  change(q2, q3),
]);

export const report = `## Why Q3 revenue dropped

Revenue fell **3.8%** to $1,925,930. Almost all of it is the **West** region, down 18.7% while every other region grew.

- West lost $114,250, more than the whole decline
- 61% of that came from the Enterprise plan
- Orders held steady; the average West order fell from $412 to $338

| Region | Q2 | Q3 | Change |
|---|---:|---:|---:|
${regionRows.map((row) => `| ${row.join(" | ")} |`).join("\n")}
`;

// The dashboard CSV Analyst streams, as OpenUI Lang statements in the order
// it sends them (examples/csv-analyst/src/ui.ts).
export const program = [
  "root = Stack([head, kpis, chart, outliers])",
  "head = Stack([head_t, head_c])",
  `head_t = Text("Analysis of ${file.name}", "heading")`,
  'head_c = Text("Why did Q3 revenue drop?", "caption")',
  'kpis = Stack([kpis_0, kpis_1, kpis_2, kpis_3], "horizontal")',
  'kpis_0 = Metric("Rows", 18402)',
  'kpis_1 = Metric("Columns", 9)',
  'kpis_2 = Metric("Missing", 0.7, "%")',
  'kpis_3 = Metric("Q3 revenue", "1.93M", "USD")',
  `chart = Chart([${regions.map(([name, , q3]) => `{label: "${name}", value: ${q3}}`).join(", ")}], "Q3 revenue by region")`,
  'outliers = Card("Outliers", "revenue: more than 3 standard deviations from the mean", [outliers_t])',
  'outliers_t = Table([{key: "c0", label: "CSV line"}, {key: "c1", label: "revenue"}, {key: "c2", label: "z-score"}], [{c0: 4127, c1: 18450, c2: 4.21}])',
];

/* After delivery */

export const activity = [
  { command: "/analyze", note: "Deep · Paid to CSV Analyst", price: "$1.00", state: "Released" },
  { command: "/profile", note: "Paid to CSV Analyst", price: "$0.20", state: "Released" },
  {
    command: "/analyze",
    note: "Quick · File had no usable columns",
    price: "$0.50",
    state: "Refunded",
  },
] as const;

/* Studio: thirty days of earnings */

// A seeded generator, so every play draws the same chart.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const date = (index: number) => new Date(Date.UTC(2026, 9, 5 + index));

// Jobs per day: a slow climb, quieter weekends and day-to-day noise.
function jobsSeries(base: number, seed: number) {
  const random = seeded(seed);
  return Array.from({ length: 30 }, (_, index) => {
    const weekday = date(index).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.55 : 1;
    return Math.max(
      0,
      Math.round((base + index * base * 0.025) * weekend * (0.7 + random() * 0.6)),
    );
  });
}

// Average earned per job after the fee, in millionths of a dollar.
const studioAgents = [
  { name: "CSV Analyst", base: 11, seed: 7, price: 612_000, rating: "4.8" },
  { name: "PR Reviewer", base: 7, seed: 19, price: 560_000, rating: "4.9" },
  { name: "Meeting Notes", base: 5, seed: 31, price: 372_000, rating: "4.7" },
];

const apps = studioAgents.map((agent) => {
  const jobs = jobsSeries(agent.base, agent.seed);
  const series = jobs.map((count, index) => ({
    date: date(index).toISOString().slice(0, 10),
    jobs: count,
    amount: String(count * agent.price),
  }));
  const total = series.reduce((sum, point) => sum + Number(point.amount), 0) / 1_000_000;
  return {
    name: agent.name,
    rating: agent.rating,
    series,
    jobs: jobs.reduce((sum, count) => sum + count, 0),
    earned: `$${total.toFixed(2)}`,
  };
});

const daily = apps[0].series.map((point, index) => ({
  date: point.date,
  jobs: apps.reduce((sum, app) => sum + app.series[index].jobs, 0),
  amount: String(apps.reduce((sum, app) => sum + Number(app.series[index].amount), 0)),
}));

const dollars = (series: { amount: string }[]) =>
  series.reduce((total, point) => total + Number(point.amount), 0) / 1_000_000;

// Paid out is everything but the last day, which is still in review.
export const earnings = {
  series: daily,
  apps,
  paidOut: dollars(daily.slice(0, -1)),
  held: dollars(daily.slice(-1)),
  jobs: daily.reduce((total, point) => total + point.jobs, 0),
};
