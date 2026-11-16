// No external csv import; define MAX_BYTES locally
import { config } from "./config";
import { MATCH_AMOUNT, MATCH_MAX_SKILLS } from "./match";
import type { CommandDefinition } from "./payvoke";
const MAX_BYTES = 5 * 1024 * 1024;
// Removed invalid import

// Shared command metadata
const shared = {
  refundPolicy:
    "Full automatic refund if the file cannot be processed, has no usable content, or the result is not delivered before the deadline.",
  sideEffects: "None. The agent only reads the uploaded file.",
  dataUse:
    "The file is processed in memory for this job. Extracted text is sent to an LLM via OpenRouter. The agent keeps the file id and job settings until the review window ends.",
};

const file = {
  name: "file",
  type: "FILE",
  required: true,
  description: "The CV file, up to 5 MB (PDF, DOCX, or TXT).",
  accept: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ],
  maxBytes: MAX_BYTES,
};

const locationOption = {
  name: "location",
  type: "STRING",
  maxLength: 200,
  description: "Tỉnh/thành phố nơi bạn ở hoặc muốn tìm việc (VD: Hà Nội, TP.HCM, Đà Nẵng... Để trống sẽ tự trích xuất từ CV).",
};

export const commandDefinitions: CommandDefinition[] = [
  {
    name: "find_job",
    description: "Đọc CV, đánh giá hồ sơ và tìm việc làm đang tuyển dụng phù hợp theo vị trí nơi ở của bạn & các tỉnh lân cận (kèm mức lương thị trường).",
    options: [
      file,
      locationOption,
      {
        name: "goal",
        type: "STRING",
        maxLength: 500,
        description: "Vị trí mục tiêu, kỳ vọng lương hoặc sở thích làm việc (tùy chọn).",
      },
    ],
    positionalParameter: "goal",
    maxAmount: config.PRICE_FIND_JOB,
    terms: {
      ...shared,
      deliverySeconds: 300,
      reviewSeconds: 1800,
      revisionPolicy: { maxIncluded: 1, description: "One revision on the same file: refine job criteria or location." },
      // find_job delivers a structured result with no files, which the host
      // can only attest as SIGN; demanding REC would fail every delivery.
      verification: { minEvidence: "SIGN" },
    },
  },
  // Instant: a fixed price, hireable without chat over x402 at
  // POST /v1/x402/apps/:appId/commands/match. No CV file, only skills text.
  {
    name: "match",
    description:
      "Gợi ý nhanh top 5 vị trí phù hợp từ mô tả kỹ năng (kèm lương tham khảo và link tìm việc). Giá cố định, không cần chat.",
    options: [
      {
        name: "skills",
        type: "STRING",
        required: true,
        maxLength: MATCH_MAX_SKILLS,
        description: "Kỹ năng, kinh nghiệm và vị trí mong muốn, tối đa 2.000 ký tự.",
      },
      locationOption,
    ],
    positionalParameter: "skills",
    maxAmount: MATCH_AMOUNT,
    instantAmount: MATCH_AMOUNT,
    terms: {
      refundPolicy:
        "Full automatic refund if the skills text is unusable, five roles cannot be produced, or the result is not delivered before the deadline.",
      sideEffects: "None. The agent only reads the supplied text.",
      dataUse:
        "The skills text and location are sent to an LLM via OpenRouter. The agent stores nothing locally for this command.",
      deliverySeconds: 120,
      reviewSeconds: 600,
      revisionPolicy: { maxIncluded: 0, description: "No revisions: a fixed-price quick match." },
      verification: { minEvidence: "REC" },
    },
  },
];

export type CommandName = "find_job" | "match";
