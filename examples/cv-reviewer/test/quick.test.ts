import { expect, test } from "bun:test";
import { createChatHandler } from "../src/chat";
import { commandDefinitions, QUICK_REVIEW_AMOUNT } from "../src/commands";
import type { InvocationReadyEvent } from "../src/payvoke";
import { makeQuickReviewGenerator, type QuickReview, type QuickReviewInput } from "../src/quick";
import { createRunHandlers } from "../src/run";
import type { Job, PendingIntake } from "../src/state";
import { commands, cvText, memoryStore, message } from "./fixtures";
import { FakePayvoke } from "./payvoke.fake";

const sample: QuickReview = {
  score: 72,
  summary: "CV rõ ràng, có kết quả đo lường nhưng phần mô tả còn chung chung.",
  fixes: [
    { section: "Kinh nghiệm", problem: "Mô tả chung chung.", fix: "Nêu phạm vi và đóng góp." },
    { section: "Kỹ năng", problem: "Thiếu mức độ thành thạo.", fix: "Nhóm kỹ năng theo cấp độ." },
    { section: "Tóm tắt", problem: "Chưa nêu mục tiêu.", fix: "Thêm một câu về vị trí mong muốn." },
  ],
};

// An instant job: no chat, no files, arguments straight from the x402 request.
const instant = (args: Record<string, unknown>): InvocationReadyEvent & { id: string } => ({
  id: "instant-event",
  type: "invocation.ready",
  invocationId: "job-quick",
  runId: "run-quick",
  threadId: "direct-thread",
  input: { commandId: "quick-command", arguments: args, context: { files: [] } },
});

test("quick_review is registered as an instant command with no FILE option", () => {
  const quick = commandDefinitions("150000").find((c) => c.name === "quick_review")!;
  expect(quick.instantAmount).toBe("500000");
  expect(BigInt(quick.maxAmount) >= BigInt(quick.instantAmount!)).toBe(true);
  expect(quick.options.map((o) => [o.name, o.type, o.required ?? false])).toEqual([
    ["cv_text", "STRING", true],
    ["goal", "STRING", false],
  ]);
  expect(quick.options[0]!.maxLength).toBe(12000);
  expect(quick.terms).toMatchObject({ verification: { minEvidence: "REC" } });
  const full = commandDefinitions("150000").find((c) => c.name === "review_cv")!;
  expect(full.instantAmount).toBeUndefined();
});

test("instant ready event delivers a scored review with three fixes and a REC file", async () => {
  const api = new FakePayvoke();
  const inputs: QuickReviewInput[] = [];
  const jobs = memoryStore<Job>();
  const handlers = createRunHandlers({
    jobs,
    generateReview: async () => {
      throw new Error("full review must not run");
    },
    generateQuickReview: async (input) => {
      inputs.push(input);
      return sample;
    },
    render: async () => {
      throw new Error("no PDF for quick_review");
    },
  });
  await handlers.handleReady(api, commands, instant({ cv_text: cvText, goal: " Frontend " }));
  expect(inputs).toEqual([{ cvText, goal: "Frontend" }]);
  expect(api.reports[0]).toMatchObject({ type: "started", data: { command: "quick_review" } });
  expect(api.uploads).toHaveLength(1);
  expect(api.uploads[0]).toMatchObject({
    name: "cv-quick-review.md",
    contentType: "text/markdown",
  });
  const result = api.reports.at(-1)!;
  if (result.type !== "result") throw new Error("expected result");
  expect(result.data).toMatchObject({ artifactVersion: 1, files: [{ fileId: "uploaded-1" }] });
  const output = result.data.output as string;
  expect(output).toContain("72/100");
  expect(output.match(/^\d\. /gm)).toHaveLength(3);
  expect(new TextDecoder().decode(api.uploads[0]!.bytes)).toBe(output);
  expect(api.streams.at(-1)!.event.type).toBe("TEXT_MESSAGE_END");
  expect(jobs.values.size).toBe(0);
});

test("instant run fails (refund) on bad input, model failure or upload failure", async () => {
  const cases: [Record<string, unknown>, "model" | "upload" | null][] = [
    [{}, null],
    [{ cv_text: "x".repeat(12001) }, null],
    [{ cv_text: "ab" }, null],
    [{ cv_text: cvText, goal: "y".repeat(501) }, null],
    [{ cv_text: cvText }, "model"],
    [{ cv_text: cvText }, "upload"],
  ];
  for (const [args, failure] of cases) {
    const api = new FakePayvoke();
    if (failure === "upload") api.uploadError = new Error("storage offline");
    const generateQuickReview = makeQuickReviewGenerator(
      async () => {
        if (failure === "model") return { score: 200, summary: "x", fixes: [] };
        return sample;
      },
      () => {},
    );
    const handlers = createRunHandlers({
      jobs: memoryStore<Job>(),
      generateReview: async () => {
        throw new Error("must not run");
      },
      generateQuickReview,
    });
    await handlers.handleReady(api, commands, instant(args));
    expect(api.reports.at(-1)!.type).toBe("failed");
    expect(api.reports.some((r) => r.type === "result")).toBe(false);
  }
});

test("quick review generator retries once on invalid output", async () => {
  let calls = 0;
  const generate = makeQuickReviewGenerator(
    async () => (++calls === 1 ? { score: 50 } : sample),
    () => {},
  );
  expect(await generate({ cvText })).toEqual(sample);
  expect(calls).toBe(2);
});

test("/quick_review in chat makes a fixed-price offer", async () => {
  const api = new FakePayvoke();
  const handle = createChatHandler({
    price: "150000",
    tools: memoryStore<PendingIntake>(),
    concierge: async function* () {
      yield "";
    },
  });
  await handle(
    api,
    commands,
    message({ commandId: "quick-command", arguments: { cv_text: cvText } }),
  );
  expect(api.offers[0]).toMatchObject({
    commandId: "quick-command",
    grossAmount: QUICK_REVIEW_AMOUNT,
    arguments: { cv_text: cvText },
  });
  await handle(
    api,
    commands,
    message({ messageId: "m2", commandId: "quick-command", arguments: {} }),
  );
  expect(api.offers).toHaveLength(1);
  expect(api.messages.at(-1)!.content).toContain("/quick_review");
});
