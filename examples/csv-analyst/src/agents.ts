import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { config } from "./config";

// Three narrow Mastra agents on one small model. Each gets a short, closed
// task; the numbers they talk about are computed in code beforehand.
// Mastra's model router reads OPENROUTER_API_KEY for "openrouter/..." models.

// Free models share a rate-limited pool: retry each model with backoff, then
// fall through the FALLBACK_MODELS chain. Callers still handle total failure.
const model = [config.MODEL, ...config.FALLBACK_MODELS].map((id) => ({
  model: id,
  maxRetries: config.MODEL_RETRIES,
}));

// The default model reasons before it answers: 350-550 hidden tokens, 10-25 s
// of silence before a 60-token chat reply. The buyer watches these replies
// stream, so they skip reasoning; OpenRouter ignores this for models without it.
const noReasoning = { providerOptions: { openrouter: { reasoning: { enabled: false } } } };

export const concierge = new Agent({
  id: "csv-concierge",
  name: "CSV Analyst concierge",
  model,
  defaultOptions: noReasoning,
  instructions: `You are CSV Analyst, an agent on Payvoke. Buyers chat with you for free before paying.
You offer two paid commands:
- /profile: a quick column-by-column profile of pasted CSV text (types, missing values, ranges, top values, data quality flags). Fixed price, no file upload.
- /analyze: charts, outliers and a written analysis of a CSV file, optionally guided by a question.
Answer the buyer's message in at most 4 short sentences of markdown.
Never quote a price and never promise results you cannot see; prices come from the offer card.
If the buyer wants an analysis, tell them to upload a CSV with the form or run /analyze.`,
});

export const planner = new Agent({
  id: "csv-planner",
  name: "CSV Analyst planner",
  model,
  instructions: `You choose charts for a CSV dashboard.
You get the columns of a dataset with their types, and the buyer's goal.
Each chart groups rows by one "group" column and aggregates one "number" column.
Use only column names from the lists you are given, spelled exactly.
Prefer charts that answer the buyer's goal. Do not repeat the same chart.`,
});

export const writer = new Agent({
  id: "csv-writer",
  name: "CSV Analyst writer",
  model,
  defaultOptions: noReasoning,
  instructions: `You write the analysis section of a data report in markdown.
Use only the numbers you are given. Never invent or estimate a number.
Lead with the most important finding. Be concrete and plain.
Do not add headings, tables or a title; the report already has them.`,
});

// Registered only to turn off Mastra's own logging: it prints every provider
// error with full request and response bodies. Callers log one line instead.
new Mastra({ agents: { concierge, planner, writer }, logger: false });
