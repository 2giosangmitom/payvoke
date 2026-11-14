import JSZip from "jszip";
import { sourceBlocks } from "../src/document";
import type { FileEntry, InvocationReadyEvent, ThreadMessageEvent } from "../src/payvoke";
import type { Review, ReviewDraft } from "../src/review";
import type { Store } from "../src/state";

export const cvText = [
  "Nguyễn Thị Minh Anh",
  "anh@example.com | 0901234567 | https://github.com/minhanh",
  "Lập trình viên Frontend với 4 năm kinh nghiệm.",
  "KINH NGHIỆM",
  "Frontend Developer — Công ty ABC | 2022-2026",
  "Làm frontend với React; giảm thời gian tải trang 30%.",
  "KỸ NĂNG",
  "React, TypeScript, HTML, CSS",
  "HỌC VẤN",
  "Đại học Công nghệ | 2018-2022",
].join("\n");
export const cvBytes = new TextEncoder().encode(cvText);
export const file: FileEntry = {
  fileId: "cv-file",
  name: "cv.txt",
  contentType: "text/plain",
  size: cvBytes.length,
  sha256: "a".repeat(64),
};

export function sampleReview(text = cvText): Review {
  const blocks = sourceBlocks(text);
  return {
    summary: "CV thể hiện kinh nghiệm phát triển giao diện, có kết quả đo lường cụ thể.",
    strengths: ["Có thành tích cải thiện thời gian tải trang và kỹ năng chuyên môn rõ ràng."],
    issues: [
      {
        priority: "high",
        section: "Kinh nghiệm",
        problem: "Một số mô tả công việc còn chung chung.",
        suggestion: "Làm rõ đóng góp và phạm vi công việc; giữ các kết quả có thể kiểm chứng.",
      },
    ],
    checklist: ["Bổ sung liên kết sản phẩm nếu có và kiểm tra lại thông tin trước khi gửi."],
    cv: {
      language: "vi",
      sections: [
        {
          title: "",
          items: blocks.slice(0, 2).map((block) => ({ sourceIds: [block.id], text: block.text })),
        },
        {
          title: "Năng lực và kinh nghiệm",
          items: blocks.slice(2).map((block) => ({
            sourceIds: [block.id],
            text: block.text.replace("Làm frontend với React", "Phát triển giao diện với React"),
          })),
        },
      ],
    },
  };
}

export function sampleDraft(text = cvText): ReviewDraft {
  const { cv, ...report } = sampleReview(text);
  return {
    ...report,
    language: cv.language,
    rewrites: cv.sections
      .flatMap((section) => section.items)
      .map((item) => ({ sourceId: item.sourceIds[0]!, text: item.text })),
  };
}

export const commands = {
  byId: new Map([["review-command", "review_cv" as const]]),
  id: { review_cv: "review-command" },
};
export const ready: InvocationReadyEvent & { id: string } = {
  id: "ready-event",
  type: "invocation.ready",
  invocationId: "job-1",
  runId: "run-1",
  threadId: "thread-1",
  input: {
    commandId: "review-command",
    arguments: { file: file.fileId },
    context: { files: [file] },
  },
};
export function message(overrides: Partial<ThreadMessageEvent> = {}): ThreadMessageEvent {
  return {
    type: "thread.message",
    threadId: "thread-1",
    messageId: "message-1",
    content: "",
    commandId: null,
    arguments: null,
    toolResult: null,
    files: [],
    conversation: [],
    ...overrides,
  };
}

export function memoryStore<T>(): Store<T> & { values: Map<string, T> } {
  const values = new Map<string, T>();
  return {
    values,
    async get(id) {
      return values.get(id) ?? null;
    },
    async put(id, value) {
      values.set(id, structuredClone(value));
    },
  };
}

export async function docxBytes(text = cvText): Promise<Uint8Array<ArrayBuffer>> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text
      .split("\n")
      .map((line) => `<w:p><w:r><w:t>${escape(line)}</w:t></w:r></w:p>`)
      .join("")}</w:body></w:document>`,
  );
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}
