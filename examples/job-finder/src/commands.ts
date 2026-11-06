// No external csv import; define MAX_BYTES locally
import { config } from "./config";
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

export const commandDefinitions = [
  {
    name: "analyze_cv",
    description: "Đọc & phân tích chi tiết thông tin CV, chấm điểm đánh giá điểm mạnh/yếu, và gợi ý việc làm theo khu vực nơi ở & tỉnh lân cận.",
    options: [
      file,
      locationOption,
      {
        name: "goal",
        type: "STRING",
        maxLength: 500,
        description: "Mục tiêu nghề nghiệp hoặc trọng tâm phân tích (tùy chọn).",
      },
    ],
    positionalParameter: "goal",
    maxAmount: config.PRICE_ANALYZE_CV,
    terms: {
      ...shared,
      deliverySeconds: 300,
      reviewSeconds: 1800,
      revisionPolicy: { maxIncluded: 1, description: "One revision on the same file: adjust focus, location or wording." },
      verification: { minEvidence: "REC" },
    },
  },
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
      verification: { minEvidence: "REC" },
    },
  },
];

export type CommandName = "analyze_cv" | "find_job";
