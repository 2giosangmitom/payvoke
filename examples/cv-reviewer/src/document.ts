import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import type { FileEntry } from "./payvoke";

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_CHARS = 30_000;
export const ACCEPT = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export class CvError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function documentKind(file: Pick<FileEntry, "name" | "contentType">) {
  const extension = file.name.toLowerCase().split(".").at(-1);
  // A declared, supported MIME type must agree with the extension when present.
  const byType = { [ACCEPT[0]!]: "pdf", [ACCEPT[1]!]: "docx", [ACCEPT[2]!]: "txt" } as const;
  const kind = byType[file.contentType as keyof typeof byType];
  if (kind) return extension === kind || !file.name.includes(".") ? kind : null;
  if (file.contentType === "application/octet-stream" || !file.contentType) {
    return extension === "pdf" || extension === "docx" || extension === "txt" ? extension : null;
  }
  return null;
}

export function validateFile(file: FileEntry) {
  if (!documentKind(file))
    throw new CvError("unsupported_file", "Chỉ nhận CV dạng PDF, DOCX hoặc TXT.");
  if (file.size < 1 || file.size > MAX_BYTES) {
    throw new CvError("file_size", "CV phải có nội dung và không vượt quá 5 MB.");
  }
}

export function normalizeText(raw: string): string {
  const text = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > MAX_CHARS) {
    throw new CvError("text_too_long", "CV vượt quá 30.000 ký tự. Vui lòng gửi bản ngắn hơn.");
  }
  if (text.length < 20 || !/\p{L}{2}/u.test(text)) {
    throw new CvError(
      "unreadable_file",
      "Không đọc được văn bản CV. PDF scan cần được chuyển sang văn bản trước khi gửi.",
    );
  }
  return text;
}

export async function extractCv(bytes: Uint8Array, file: FileEntry): Promise<string> {
  validateFile(file);
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.length !== file.size) {
    throw new CvError("file_size", "Kích thước tệp CV không hợp lệ hoặc vượt quá 5 MB.");
  }
  try {
    const kind = documentKind(file);
    let raw: string;
    if (kind === "pdf") {
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
        throw new Error("Invalid PDF");
      const pdf = await getDocumentProxy(bytes.slice(), { verbosity: 0 });
      try {
        const { text } = await extractText(pdf, { mergePages: true });
        raw = text;
      } finally {
        await pdf.loadingTask.destroy();
      }
    } else if (kind === "docx") {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Invalid DOCX");
      raw = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else {
      // Fatal decoding prevents binary files from being accepted as text.
      raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (raw.includes("\u0000")) throw new Error("Binary text");
    }
    return normalizeText(raw);
  } catch (error) {
    if (error instanceof CvError) throw error;
    throw new CvError(
      "unreadable_file",
      "Không đọc được CV. Hãy gửi PDF có văn bản, không đặt mật khẩu, DOCX hoặc TXT UTF-8 hợp lệ.",
    );
  }
}

export type SourceBlock = { id: string; text: string };

export function isSectionHeading(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 80 || /[\d@\n]/.test(value)) return false;
  return (
    (/\p{L}/u.test(value) && value === value.toUpperCase()) ||
    /^(?:summary|profile|experience|work experience|employment|education|skills|technical skills|projects|certifications|languages|contact|mục tiêu nghề nghiệp|kinh nghiệm(?: làm việc)?|kỹ năng|dự án(?: cá nhân)?|học vấn|chứng chỉ|ngoại ngữ|liên hệ)$/iu.test(
      value,
    )
  );
}

export function sourceBlocks(text: string): SourceBlock[] {
  // PDF paragraphs may be flattened; split long blocks at sentence/word boundaries.
  const parts: string[] = [];
  for (const line of text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    let rest = line;
    while (rest.length > 700) {
      const end = rest.lastIndexOf(" ", 700);
      const at = end > 0 ? end : 700;
      parts.push(rest.slice(0, at));
      rest = rest.slice(at).trim();
    }
    if (rest) parts.push(rest);
  }
  return parts.map((text, i) => ({ id: `s${i + 1}`, text }));
}
