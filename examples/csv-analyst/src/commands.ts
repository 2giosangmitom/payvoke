import { config } from "./config";
import { MAX_BYTES } from "./csv";

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

const shared = {
  refundPolicy:
    "Full automatic refund if the file cannot be parsed, has no usable columns, or the result is not delivered before the deadline.",
  sideEffects: "None. The agent only reads the uploaded file.",
  dataUse:
    "The file is processed in memory for this job. Column names and computed statistics, never raw rows, are sent to an LLM through OpenRouter. The agent keeps the file id and job settings until the review window ends, to support revisions.",
};

export const commandDefinitions = [
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
      ...shared,
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
  {
    name: "profile",
    description:
      "A fast column-by-column profile of a CSV file: types, missing values, ranges and top values.",
    options: [file],
    positionalParameter: null,
    maxAmount: config.PRICE_PROFILE,
    terms: {
      ...shared,
      deliverySeconds: 120,
      reviewSeconds: 600,
      revisionPolicy: {
        maxIncluded: 0,
        description: "No revisions: the profile is computed directly from the file.",
      },
      verification: { minEvidence: "SIGN" },
    },
  },
];

export type CommandName = "analyze" | "profile";
