import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { extractText, renderPageAsImage } from "unpdf";
import { renderPdf } from "../src/pdf";
import { sampleReview } from "./fixtures";

test("PDF preserves Vietnamese, contacts and dates and produces a visual preview", async () => {
  const { bytes } = await renderPdf(sampleReview().cv);
  const extracted = await extractText(bytes.slice(), { mergePages: true });
  expect(extracted.text).toContain("Nguyễn Thị Minh Anh");
  expect(extracted.text).toContain("anh@example.com");
  expect(extracted.text).toContain("0901234567");
  expect(extracted.text).toContain("2022-2026");
  expect(extracted.text).toContain("30%");
  const preview = await renderPageAsImage(bytes.slice(), 1, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: 1.25,
  });
  await mkdir("dist", { recursive: true });
  await Bun.write("dist/preview.pdf", bytes);
  await Bun.write("dist/preview.png", preview);
  expect(preview.length).toBeGreaterThan(1000);
});

test("long English CVs and long URLs wrap and paginate within page bounds", async () => {
  const cv = sampleReview().cv;
  cv.language = "en";
  cv.sections = Array.from({ length: 18 }, () => ({
    title: "Experience",
    items: [
      {
        sourceIds: ["s1"],
        text: "Developed accessible frontend interfaces using TypeScript and React. ".repeat(15),
      },
    ],
  }));
  cv.sections.push({
    title: "Portfolio",
    items: [{ sourceIds: ["s1"], text: `https://example.com/${"verylongpath".repeat(20)}` }],
  });
  const { bytes, lines } = await renderPdf(cv);
  const result = await extractText(bytes.slice(), { mergePages: true });
  expect(result.totalPages).toBeGreaterThan(1);
  expect(result.text).toContain("Portfolio");
  for (const line of lines) {
    expect(line.x + line.width).toBeLessThanOrEqual(595.28 - 46 + 0.01);
    expect(line.y).toBeGreaterThanOrEqual(46);
    expect(line.y + line.size).toBeLessThanOrEqual(841.89 - 46);
  }
  for (let i = 1; i < lines.length; i++)
    if (lines[i]!.page === lines[i - 1]!.page) {
      expect(lines[i - 1]!.y - lines[i]!.y).toBeGreaterThanOrEqual(15);
    }
});

test("unsupported glyphs fail explicitly instead of disappearing", async () => {
  const cv = sampleReview().cv;
  cv.sections[0]!.items[0]!.text = "Nguyễn Thị Minh Anh 🧑‍💻";
  await expect(renderPdf(cv)).rejects.toMatchObject({ code: "unsupported_glyph" });
});
