import type { Reputation } from "@/src/features/apps/agent-facts";
import type { CommandRevision } from "@/src/features/chat/api";

// Sample data for the launch video. The CSV Analyst job follows the real
// example agent (examples/csv-analyst): its commands, terms, depth choice and
// dashboard. The figures agree with each other: one file, the same branches,
// the same totals (coffee-sales-2026.csv, 60 rows).

export const wallet = "0x7a3E…f19c";
export const walletFull = "0x7a3E8c41D0b2a95F1e6C3d7B42a0E9c51b8Df19c";
export const vaultAddress = "0x9C1d…4e7A";

export type MockAgent = {
  name: string;
  owner: string;
  description: string;
  rating: { average: number | null; count: number };
  jobs: number;
  users: number;
  reputation: Reputation;
  priceCap: string;
  commands: {
    name: string;
    description: string;
    revision: CommandRevision;
    terms: string[];
  }[];
};

const rep = (paidJobs: number, success: number, onTime: number, refund: number, median: number) => ({
  paidJobs,
  sample: 50,
  successRate: success,
  onTimeRate: onTime,
  refundRate: refund,
  medianDeliverySeconds: median,
  isNew: false,
});

const revision = (options: { name: string; type: string; required?: boolean }[]) =>
  ({ options: options.map((o) => ({ required: false, ...o })) }) as unknown as CommandRevision;

export const agents: MockAgent[] = [
  {
    name: "CSV Analyst",
    owner: "0xf883…8080",
    description:
      "Upload a CSV, ask a question, and get a live dashboard, charts, outliers and a written analysis.",
    rating: { average: 4.8, count: 126 },
    jobs: 1240,
    users: 386,
    reputation: rep(1240, 97, 95, 3, 252),
    priceCap: "2 USDC",
    commands: [
      {
        name: "analyze",
        description: "Charts, outliers and a written analysis of a CSV file. Ask a question to focus it.",
        revision: revision([
          { name: "file", type: "FILE", required: true },
          { name: "goal", type: "STRING" },
          { name: "depth", type: "STRING" },
        ]),
        terms: ["Priced by offer · up to 2 USDC", "delivery ≤ 10 min", "review 30 min", "late: full refund"],
      },
      {
        name: "profile",
        description: "A fast column-by-column profile of a CSV file: types, missing values, ranges and top values.",
        revision: revision([{ name: "file", type: "FILE", required: true }]),
        terms: ["Priced by offer · up to 0.2 USDC", "delivery ≤ 2 min", "review 10 min", "late: full refund"],
      },
    ],
  },
  {
    name: "CV Mentor",
    owner: "0x435c…F393",
    description:
      "Review CV chi tiết bằng tiếng Việt, chỉ ra điểm mạnh và phần cần cải thiện. Nhận thêm CV PDF được chỉnh sửa câu chữ và bố cục.",
    rating: { average: 4.9, count: 88 },
    jobs: 512,
    users: 301,
    reputation: rep(512, 98, 96, 2, 140),
    priceCap: "0.15 USDC",
    commands: [],
  },
  {
    name: "Job Finder Agent",
    owner: "0x435c…F393",
    description: "Finds open roles that match your CV and writes a short pitch for each one.",
    rating: { average: 4.7, count: 41 },
    jobs: 204,
    users: 133,
    reputation: rep(204, 95, 93, 5, 310),
    priceCap: "0.15 USDC",
    commands: [],
  },
  {
    name: "PR Reviewer",
    owner: "0x1b9e…77Ac",
    description: "Reviews a pull request for bugs, security issues and missing tests, line by line.",
    rating: { average: 4.6, count: 63 },
    jobs: 389,
    users: 97,
    reputation: rep(389, 94, 91, 6, 420),
    priceCap: "3 USDC",
    commands: [],
  },
  {
    name: "Contract Compare",
    owner: "0x6d20…b3F1",
    description: "Compares two contract versions and flags every changed obligation, date and amount.",
    rating: { average: 4.7, count: 29 },
    jobs: 151,
    users: 64,
    reputation: rep(151, 96, 94, 4, 380),
    priceCap: "1.5 USDC",
    commands: [],
  },
  {
    name: "Docs Translator",
    owner: "0xa4F7…0d2E",
    description: "Translates Markdown docs into 30 languages and keeps code blocks, links and layout.",
    rating: { average: 4.5, count: 52 },
    jobs: 276,
    users: 118,
    reputation: rep(276, 93, 90, 7, 190),
    priceCap: "1 USDC",
    commands: [],
  },
];

export const csvAgent = agents[0];

/* The job */

export const file = { name: "doanh-thu-2026.csv", size: "4.2 KB", rows: "60 rows" };
export const question = "Chi nhánh nào tăng trưởng tốt nhất năm 2026?";

export const offer = {
  price: "$1.00",
  summary:
    "Deep analysis: column profile, 5 charts, outliers and a written analysis, plus the numbers as JSON and CSV.",
};

export const plan = [
  `Reading ${file.name}`,
  "Profiled 60 rows and 6 columns",
  "Comparing H1 and H2 by branch",
  "Building the dashboard",
  "Writing the analysis",
  "Saved 2 files",
];

// Revenue growth, second half over first half of 2026, per branch.
export const growth = [
  ["Gò Vấp", 33.0],
  ["Quận 1", 23.4],
  ["Quận 3", 20.1],
  ["Bình Thạnh", 16.7],
  ["Thủ Đức", 7.5],
] as const;

export const program = [
  "root = Stack([head, kpis, chart, note])",
  "head = Stack([head_t, head_c])",
  `head_t = Text("Analysis of ${file.name}", "heading")`,
  `head_c = Text("${question}", "caption")`,
  'kpis = Stack([kpis_0, kpis_1, kpis_2, kpis_3], "horizontal")',
  'kpis_0 = Metric("Revenue 2026", "17.7B", "VND")',
  'kpis_1 = Metric("Best growth", "+33%", "Gò Vấp")',
  'kpis_2 = Metric("Branches", 5)',
  'kpis_3 = Metric("Outliers", 1)',
  `chart = Chart([${growth.map(([name, value]) => `{label: "${name}", value: ${value}}`).join(", ")}], "Growth H2 vs H1, %")`,
  'note = Text("Gò Vấp grew fastest (+33%). Thủ Đức dropped 47% in September, then recovered in October.", "body")',
];
