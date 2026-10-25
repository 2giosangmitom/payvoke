import { z } from "zod/v4";

// The Payvoke OpenUI Lang catalog. Backend validation and the frontend renderer
// both build their library from these schemas, so a program accepted at
// ingress always has a host renderer. Prop order is the positional argument
// order in OpenUI Lang: `m = Metric("Revenue", 1200, "USD")`.
//
// The catalog is display-only. It has no action, URL, Query or Mutation props:
// providers never get to call tools or navigate the buyer from generated UI.
export const OPENUI_ROOT = "Stack";

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const componentSpecs = {
  Stack: {
    description: "Root and layout container. Lays out child components vertically or horizontally.",
    props: z.object({
      children: z.array(z.any()).describe("Child components"),
      direction: z.enum(["vertical", "horizontal"]).optional().describe("Defaults to vertical"),
    }),
  },
  Text: {
    description: "A paragraph, heading or caption of plain text.",
    props: z.object({
      value: z.string().describe("Plain text; markup is not rendered"),
      variant: z.enum(["body", "heading", "caption"]).optional(),
    }),
  },
  Card: {
    description: "Bordered section with a title, optional description and child components.",
    props: z.object({
      title: z.string(),
      description: z.string().optional(),
      children: z.array(z.any()).optional(),
    }),
  },
  Metric: {
    description: "A labeled headline value, such as a score or total.",
    props: z.object({
      label: z.string(),
      value: z.union([z.number(), z.string()]),
      unit: z.string().optional(),
    }),
  },
  Table: {
    description: "Tabular data. Columns are row keys, or {key, label} objects.",
    props: z.object({
      columns: z.array(z.union([z.string(), z.object({ key: z.string(), label: z.string() })])),
      rows: z.array(z.record(z.string(), cell)),
    }),
  },
  Chart: {
    description: "Horizontal bar chart of labeled numeric points.",
    props: z.object({
      points: z.array(z.object({ label: z.string(), value: z.number() })),
      title: z.string().optional(),
    }),
  },
  QuestionForm: {
    description:
      "Places the open provider question with this questionId inline. The answer form comes from the question report, not from this component.",
    props: z.object({
      questionId: z.string(),
      title: z.string().optional(),
    }),
  },
} as const;

export type ComponentName = keyof typeof componentSpecs;
export type ComponentProps<N extends ComponentName> = z.infer<(typeof componentSpecs)[N]["props"]>;
export const COMPONENT_NAMES = Object.keys(componentSpecs) as ComponentName[];
// Widened for library builders, which define every component in one loop.
export const componentList: { name: ComponentName; description: string; props: z.ZodObject }[] =
  COMPONENT_NAMES.map((name) => ({ name, ...componentSpecs[name] }));

export const isAllowedComponent = (name: string): name is ComponentName =>
  Object.hasOwn(componentSpecs, name);

// Examples and rules appended to the generated system prompt for provider LLMs.
export const promptExamples = [
  `root = Stack([summary, score, breakdown])
summary = Text("Analysis complete", "heading")
score = Metric("Score", 92, "/100")
breakdown = Card("Breakdown", "Per-region totals", [regions])
regions = Table(["region", "total"], [{region: "EU", total: 120}, {region: "US", total: 80}])`,
];
export const promptRules = [
  "Emit only complete statements, one or more per stream event; never split a statement across events.",
  "Redefine an identifier to update it; the latest definition wins.",
  "Do not use Query, Mutation, URLs or markup. Strings are shown as plain text.",
];
