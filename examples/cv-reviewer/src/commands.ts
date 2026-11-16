import { ACCEPT, MAX_BYTES } from "./document";
import type { CommandDefinition } from "./payvoke";

export type CommandName = "review_cv" | "quick_review";
export const DELIVERY_SECONDS = 300;
export const REVIEW_SECONDS = 1800;
// Fixed price for /quick_review, in atomic USDC (0.50). It can be hired without
// chat over x402: POST /v1/x402/apps/:appId/commands/quick_review.
export const QUICK_REVIEW_AMOUNT = "500000";
export const QUICK_REVIEW_MAX_CHARS = 12_000;
export const QUICK_DELIVERY_SECONDS = 120;
export const QUICK_REVIEW_SECONDS = 600;

export const commandDefinitions = (price: string): CommandDefinition[] => [
  {
    name: "review_cv",
    description: "Review CV bằng tiếng Việt và tạo CV PDF đã cải thiện, giữ ngôn ngữ bản gốc.",
    options: [
      {
        name: "file",
        type: "FILE",
        required: true,
        description: "CV dạng PDF có văn bản, DOCX hoặc TXT, tối đa 5 MB.",
        accept: ACCEPT,
        maxBytes: MAX_BYTES,
      },
      {
        name: "goal",
        type: "STRING",
        maxLength: 500,
        description: "Trọng tâm review hoặc phần muốn cải thiện (tùy chọn).",
      },
    ],
    positionalParameter: "goal",
    maxAmount: price,
    terms: {
      deliverySeconds: DELIVERY_SECONDS,
      reviewSeconds: REVIEW_SECONDS,
      revisionPolicy: {
        maxIncluded: 1,
        description:
          "One revision of the review and improved PDF using the same CV and buyer feedback.",
      },
      refundPolicy:
        "Automatic refund if the CV is unreadable, the review or PDF cannot be produced, or delivery misses the deadline.",
      sideEffects:
        "Creates a new PDF from the supplied CV. Does not submit applications or modify the original file.",
      dataUse:
        "CV text and review instructions are sent to an LLM via OpenRouter. The agent stores only file metadata, job settings and artifact versions locally; Payvoke stores the input and delivered PDF. No CV text is logged. Local job metadata expires after the review window.",
      verification: { minEvidence: "REC" },
    },
  },
  {
    name: "quick_review",
    description:
      "Review nhanh CV dạng văn bản bằng tiếng Việt: chấm điểm và 3 sửa đổi cụ thể. Giá cố định, không cần chat.",
    options: [
      {
        name: "cv_text",
        type: "STRING",
        required: true,
        maxLength: QUICK_REVIEW_MAX_CHARS,
        description: "Nội dung CV dạng văn bản thuần, tối đa 12.000 ký tự.",
      },
      {
        name: "goal",
        type: "STRING",
        maxLength: 500,
        description: "Vị trí mục tiêu hoặc trọng tâm review (tùy chọn).",
      },
    ],
    positionalParameter: null,
    maxAmount: QUICK_REVIEW_AMOUNT,
    instantAmount: QUICK_REVIEW_AMOUNT,
    terms: {
      deliverySeconds: QUICK_DELIVERY_SECONDS,
      reviewSeconds: QUICK_REVIEW_SECONDS,
      revisionPolicy: {
        maxIncluded: 0,
        description: "No revisions: a fixed-price quick review of the supplied text.",
      },
      refundPolicy:
        "Automatic refund if the CV text is unreadable, the review cannot be produced, or delivery misses the deadline.",
      sideEffects: "None. Produces a text review and a Markdown copy of it; no PDF is generated.",
      dataUse:
        "CV text and goal are sent to an LLM via OpenRouter. The agent stores nothing locally for this command; Payvoke stores the input and the delivered review. No CV text is logged.",
      verification: { minEvidence: "REC" },
    },
  },
];
