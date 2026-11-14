import { ACCEPT, MAX_BYTES } from "./document";

export type CommandName = "review_cv";
export const DELIVERY_SECONDS = 300;
export const REVIEW_SECONDS = 1800;

export const commandDefinitions = (price: string) => [
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
];
