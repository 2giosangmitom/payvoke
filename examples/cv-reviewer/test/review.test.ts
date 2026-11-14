import { expect, test } from "bun:test";
import { sourceBlocks } from "../src/document";
import { makeReviewGenerator, reviewMarkdown, validateReview } from "../src/review";
import { cvText, sampleReview } from "./fixtures";

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
    return calls === 1 ? { summary: "incomplete" } : sampleReview();
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
