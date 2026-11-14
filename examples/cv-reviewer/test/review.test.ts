import { expect, test } from "bun:test";
import { sourceBlocks } from "../src/document";
import {
  makeReviewGenerator,
  reviewMarkdown,
  validateReview,
  type ReviewDiagnostic,
} from "../src/review";
import { cvText, sampleDraft, sampleReview } from "./fixtures";

const blocks = sourceBlocks(cvText);

test("accepts a complete source-grounded rewrite and builds the Vietnamese review", () => {
  const result = validateReview(sampleReview(), blocks);
  const markdown = reviewMarkdown(result, blocks);
  expect(markdown).toContain("Tổng quan");
  expect(markdown).toContain("Trước:");
  expect(markdown).toContain("Sau:");
  expect(markdown).toContain("Phát triển giao diện");
});

test("rejects unknown, reused, duplicate and omitted source references", () => {
  for (const change of ["unknown", "reused", "duplicate", "omitted"]) {
    const review = sampleReview();
    const items = review.cv.sections[0]!.items;
    if (change === "unknown") items[0]!.sourceIds = ["s999"];
    if (change === "reused") items[1]!.sourceIds = ["s1"];
    if (change === "duplicate") items[0]!.sourceIds = ["s1", "s1"];
    if (change === "omitted") items.pop();
    expect(() => validateReview(review, blocks)).toThrow();
  }
});

test("rejects changed contact details, dates, invented achievements and factual headings", () => {
  for (const [from, to] of [
    ["anh@example.com", "wrong@example.com"],
    ["0901234567", "0909999999"],
    ["2022-2026", "2020-2026"],
    ["30%", "90%"],
    ["React, TypeScript", "10 năm React, TypeScript"],
  ]) {
    const review = sampleReview();
    for (const section of review.cv.sections)
      for (const item of section.items) item.text = item.text.replace(from!, to!);
    expect(() => validateReview(review, blocks)).toThrow();
  }
  const review = sampleReview();
  review.cv.sections[0]!.title = "Chuyên gia với 10 năm kinh nghiệm";
  expect(() => validateReview(review, blocks)).toThrow();
});

test("retries invalid structured output once with original CV and feedback", async () => {
  let calls = 0;
  const generate = makeReviewGenerator(async (prompt, signal) => {
    expect(prompt).toContain("s1");
    expect(prompt).toContain("Ngắn gọn hơn");
    expect(signal).toBeInstanceOf(AbortSignal);
    calls++;
    return calls === 1 ? { summary: "incomplete" } : sampleDraft();
  });
  const review = await generate({ blocks, feedback: "Ngắn gọn hơn" });
  expect(review.cv.language).toBe("vi");
  expect(calls).toBe(2);
});

test("model/network failure and partial output never become successful reviews", async () => {
  for (const model of [
    async () => {
      throw new Error("network interrupted");
    },
    async () => ({ summary: "partial" }),
  ]) {
    let calls = 0;
    const generate = makeReviewGenerator(async () => {
      calls++;
      return model();
    });
    await expect(generate({ blocks })).rejects.toMatchObject({ code: "review_failed" });
    expect(calls).toBe(2);
  }
});

test("accepts equivalent date-range separators, percentage spacing and URL punctuation", () => {
  const review = sampleReview();
  for (const section of review.cv.sections)
    for (const item of section.items) {
      item.text = item.text.replace("2022-2026", "2022 – 2026").replace("30%", "30 %");
      if (item.text.includes("https://github.com/minhanh")) item.text += ".";
    }
  expect(() => validateReview(review, blocks)).not.toThrow();
});

test("format normalization does not allow a negative numeric fact to become positive", () => {
  const original = cvText.replace("30%", "-30%");
  const changed = sampleReview(original);
  for (const section of changed.cv.sections)
    for (const item of section.items) item.text = item.text.replace("-30%", "30%");
  expect(() => validateReview(changed, sourceBlocks(original))).toThrow();
});

test("restores altered facts from source while retaining the valid review and safe improvements", async () => {
  const diagnostics: ReviewDiagnostic[] = [];
  const rewritten = sampleDraft();
  for (const item of rewritten.rewrites) {
    item.text = item.text
      .replace("30%", "90%")
      .replace("React, TypeScript", "Kỹ năng: React, TypeScript");
  }
  const generate = makeReviewGenerator(
    async () => rewritten,
    (event) => diagnostics.push(event),
  );
  const review = await generate({ blocks });
  expect(() => validateReview(review, blocks)).not.toThrow();
  const items = review.cv.sections.flatMap((section) => section.items);
  expect(items.find((item) => item.sourceIds.includes("s6"))!.text).toBe(blocks[5]!.text);
  expect(items.find((item) => item.sourceIds.includes("s8"))!.text).toContain(
    "Kỹ năng: React, TypeScript",
  );
  expect(review.summary).toBe(rewritten.summary);
  expect(review.checklist.at(-1)).toContain("giữ nguyên từ bản gốc");
  expect(diagnostics).toEqual([
    { attempt: 1, stage: "repair", code: "source_restored", sourceIds: ["s6"] },
  ]);
});

test("fact restoration never conceals unknown or duplicate edit references", async () => {
  for (const kind of ["unknown", "duplicate"]) {
    const rewritten = sampleDraft();
    if (kind === "unknown") rewritten.rewrites[0]!.sourceId = "s999";
    else rewritten.rewrites.push({ ...rewritten.rewrites[0]! });
    for (const item of rewritten.rewrites) item.text = item.text.replace("30%", "90%");
    const generate = makeReviewGenerator(
      async () => rewritten,
      () => {},
    );
    await expect(generate({ blocks })).rejects.toMatchObject({ code: "review_failed" });
  }
});

test("validation retry explains the specific source error without returning CV content to logs", async () => {
  const diagnostics: ReviewDiagnostic[] = [];
  let calls = 0;
  const generate = makeReviewGenerator(
    async (prompt) => {
      calls++;
      if (calls === 1) {
        const bad = sampleDraft();
        bad.rewrites[0]!.sourceId = "s999";
        return bad;
      }
      expect(prompt).toContain("unknown_source");
      expect(prompt).toContain("s999");
      return sampleDraft();
    },
    (event) => diagnostics.push(event),
  );
  await generate({ blocks });
  expect(diagnostics[0]).toEqual({
    attempt: 1,
    stage: "validation",
    code: "unknown_source",
    sourceIds: ["s999"],
  });
  expect(JSON.stringify(diagnostics)).not.toContain("Nguyễn");
  expect(JSON.stringify(diagnostics)).not.toContain("anh@example.com");
});

test("authentication, rate limits and timeouts have actionable, redacted diagnostics", async () => {
  for (const [status, text] of [
    [401, "OPENROUTER_API_KEY"],
    [429, "giới hạn lượt"],
  ] as const) {
    const diagnostics: ReviewDiagnostic[] = [];
    let calls = 0;
    const generate = makeReviewGenerator(
      async () => {
        calls++;
        throw Object.assign(new Error("private CV and secret-key"), {
          cause: Object.assign(new Error("secret-key"), { statusCode: status }),
        });
      },
      (event) => diagnostics.push(event),
    );
    await expect(generate({ blocks })).rejects.toThrow(text);
    expect(calls).toBe(status === 401 ? 1 : 2);
    expect(diagnostics[0]).toMatchObject({ stage: "model", code: `http_${status}`, status });
    expect(JSON.stringify(diagnostics)).not.toContain("secret-key");
    expect(JSON.stringify(diagnostics)).not.toContain("private CV");
  }
  const generate = makeReviewGenerator(
    async () => {
      throw new DOMException("secret-key", "TimeoutError");
    },
    () => {},
  );
  await expect(generate({ blocks })).rejects.toThrow("thời gian cho phép");
});

test("sparse edits retain every original block in order, including omitted contact and section labels", async () => {
  const draft = sampleDraft();
  draft.rewrites = [
    { sourceId: "s6", text: "Phát triển giao diện với React; giảm thời gian tải trang 30%." },
  ];
  const generate = makeReviewGenerator(
    async () => draft,
    () => {},
  );
  const review = await generate({ blocks });
  const items = review.cv.sections.flatMap((section) => section.items);
  expect(items.map((item) => item.sourceIds[0])).toEqual(blocks.map((block) => block.id));
  expect(items[0]!.text).toBe(blocks[0]!.text);
  expect(items[1]!.text).toBe(blocks[1]!.text);
  expect(items[3]!.text).toBe("KINH NGHIỆM");
  expect(items[5]!.text).toContain("Phát triển giao diện");
  expect(review.cv.sections.length).toBeGreaterThan(1);
  draft.rewrites = [];
  const unchanged = await generate({ blocks });
  expect(
    unchanged.cv.sections.flatMap((section) => section.items).map((item) => item.text),
  ).toEqual(blocks.map((block) => block.text));
});
