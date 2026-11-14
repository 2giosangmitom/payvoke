import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { extractText } from "unpdf";
import { sampleReview } from "./fixtures";

test("bundled PDF renderer resolves bundled font assets", async () => {
  const root = new URL("../", import.meta.url);
  const build = await Bun.build({
    entrypoints: [fileURLToPath(new URL("src/pdf.ts", root))],
    outdir: fileURLToPath(new URL("dist/", root)),
    target: "bun",
  });
  expect(build.success).toBe(true);
  const bundleUrl = new URL("dist/pdf.js", root).href;
  const bundle = await import(bundleUrl);
  const pdf = await bundle.renderPdf(sampleReview().cv);
  const { text } = await extractText(pdf.bytes, { mergePages: true });
  expect(text).toContain("Nguyễn Thị Minh Anh");
  expect(text).toContain("30%");
});
