import { MAX_BYTES } from "./csv";
import type { CommandDefinition } from "./payvoke";
import { PROFILE_AMOUNT, PROFILE_MAX_AMOUNT, PROFILE_MAX_CHARS, PROFILE_TIERS } from "./profile";

// Registered with overwriteCommands on every start. Payvoke compiles the
// options into a JSON Schema and every quote signs the terms.

const file = {
  name: "file",
  type: "FILE",
  required: true,
  description: "The CSV file, up to 5 MB",
  accept: ["text/csv"],
  maxBytes: MAX_BYTES,
};

export const commandDefinitions: CommandDefinition[] = [
  {
    name: "analyze",
    description:
      "Charts, outliers and a written analysis of a CSV file. Ask a question to focus it.",
    options: [
      file,
      {
        name: "goal",
        type: "STRING",
        maxLength: 500,
        description: "What you want to learn from the data",
      },
      {
        name: "depth",
        type: "STRING",
        choices: ["quick", "deep"],
        description: "quick: 2 charts. deep: 5 charts, outliers and a longer analysis",
      },
    ],
    positionalParameter: "goal",
    maxAmount: "2000000",
    terms: {
      refundPolicy:
        "Full automatic refund if the file cannot be parsed, has no usable columns, or the result is not delivered before the deadline.",
      sideEffects: "None. The agent only reads the uploaded file.",
      dataUse:
        "The file is processed in memory for this job. Column names and computed statistics, never raw rows, are sent to an LLM through OpenRouter. The agent keeps the file id and job settings until the review window ends, to support revisions.",
      deliverySeconds: 600,
      reviewSeconds: 1800,
      revisionPolicy: {
        maxIncluded: 1,
        description:
          "One revision on the same file: change the grouping, the focus metric or the wording of the analysis.",
      },
      verification: { minEvidence: "REC" },
    },
  },
  // Instant: hireable without chat over x402 at
  // POST /v1/x402/apps/:appId/commands/profile. The CSV comes as pasted text
  // or as a file uploaded beforehand; bigger inputs move up a price tier.
  {
    name: "profile",
    description:
      "A fast column-by-column profile of a CSV (pasted text or a file): types, missing values, ranges, top values and data quality flags.",
    options: [
      {
        name: "csv",
        type: "STRING",
        maxLength: PROFILE_MAX_CHARS,
        description: "The raw CSV text with a header row, up to 200,000 characters",
      },
      { ...file, required: false, description: "Or the CSV file, up to 5 MB" },
    ],
    positionalParameter: null,
    maxAmount: PROFILE_MAX_AMOUNT,
    instantAmount: PROFILE_AMOUNT,
    instantTiers: PROFILE_TIERS,
    terms: {
      refundPolicy:
        "Full automatic refund if the CSV cannot be parsed, has no usable columns, or the result is not delivered before the deadline.",
      sideEffects: "None. The agent only reads the supplied CSV.",
      dataUse:
        "The CSV is processed in memory for this job and never sent to an LLM. The agent stores nothing locally for this command.",
      deliverySeconds: 120,
      reviewSeconds: 600,
      revisionPolicy: {
        maxIncluded: 0,
        description: "No revisions: the profile is computed directly from the data.",
      },
      verification: { minEvidence: "SIGN" },
    },
  },
];

export type CommandName = "analyze" | "profile";
