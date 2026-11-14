import { expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { extractCv, MAX_BYTES, MAX_CHARS, normalizeText, sourceBlocks } from "../src/document";
import { renderPdf } from "../src/pdf";
import { cvBytes, cvText, docxBytes, file, sampleReview } from "./fixtures";

test("extracts Vietnamese TXT and compressed DOCX paragraphs", async () => {
  expect(await extractCv(cvBytes, file)).toBe(cvText);
  const bytes = await docxBytes();
  const text = await extractCv(bytes, {
    ...file,
    name: "cv.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: bytes.length,
  });
  expect(text).toContain("Nguyễn Thị Minh Anh");
  expect(text).toContain("30%");
  expect(text).not.toContain("PK");
});

test("extracts text PDFs and rejects empty scanned PDFs", async () => {
  const { bytes } = await renderPdf(sampleReview().cv);
  const text = await extractCv(bytes, {
    ...file,
    name: "cv.pdf",
    contentType: "application/pdf",
    size: bytes.length,
  });
  expect(text).toContain("Nguyễn Thị Minh Anh");
  expect(text).toContain("anh@example.com");
  const empty = await PDFDocument.create();
  empty.addPage();
  const scan = new Uint8Array(await empty.save());
  await expect(
    extractCv(scan, {
      ...file,
      name: "scan.pdf",
      contentType: "application/pdf",
      size: scan.length,
    }),
  ).rejects.toMatchObject({ code: "unreadable_file" });
});

test("handles English and normalizes Unicode without truncating", async () => {
  const raw = "Resume\r\nFrontend Developer\r\nSkills: TypeScript and React";
  const bytes = new TextEncoder().encode(raw);
  expect(await extractCv(bytes, { ...file, size: bytes.length })).toBe(
    raw.replaceAll("\r\n", "\n"),
  );
  expect(normalizeText(cvText.normalize("NFD"))).toBe(cvText);
  expect(() => normalizeText("a".repeat(MAX_CHARS + 1))).toThrow();
  const long = "Vietnamese CV ".repeat(1000);
  expect(
    sourceBlocks(long)
      .map((block) => block.text)
      .join(" "),
  ).toBe(long.trim());
});

test("rejects corrupt/misnamed documents, binary text, missing data and oversized files", async () => {
  await expect(extractCv(cvBytes, { ...file, size: MAX_BYTES + 1 })).rejects.toMatchObject({
    code: "file_size",
  });
  await expect(extractCv(cvBytes, { ...file, name: "cv.exe" })).rejects.toMatchObject({
    code: "unsupported_file",
  });
  await expect(
    extractCv(cvBytes, { ...file, name: "cv.pdf", contentType: "application/pdf" }),
  ).rejects.toMatchObject({ code: "unreadable_file" });
  await expect(
    extractCv(cvBytes, {
      ...file,
      name: "cv.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  ).rejects.toMatchObject({ code: "unreadable_file" });
  await expect(extractCv(new Uint8Array(), { ...file, size: 0 })).rejects.toMatchObject({
    code: "file_size",
  });
  const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x50]);
  await expect(extractCv(binary, { ...file, size: binary.length })).rejects.toMatchObject({
    code: "unreadable_file",
  });
  await expect(extractCv(cvBytes, { ...file, size: cvBytes.length - 1 })).rejects.toMatchObject({
    code: "file_size",
  });
});
