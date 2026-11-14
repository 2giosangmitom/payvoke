import { expect, test } from "bun:test";
import { createRunHandlers } from "../src/run";
import { CvError } from "../src/document";
import { PayvokeError, type RevisionEvent } from "../src/payvoke";
import { makeReviewGenerator, type ReviewInput } from "../src/review";
import type { Job } from "../src/state";
import { commands, cvBytes, file, memoryStore, ready, sampleDraft, sampleReview } from "./fixtures";
import { FakePayvoke } from "./payvoke.fake";

const revision: RevisionEvent & { id: string } = {
  id: "revision-1",
  type: "invocation.revision_requested",
  invocationId: "job-1",
  runId: "run-2",
  threadId: "thread-1",
  reason: "Làm phần kinh nghiệm ngắn hơn",
};

test("sparse model edits with an altered metric still deliver a complete source-safe PDF", async () => {
  const api = new FakePayvoke();
  const draft = sampleDraft();
  draft.rewrites = [
    { sourceId: "s6", text: "Phát triển giao diện với React; giảm thời gian tải trang 90%." },
  ];
  const generateReview = makeReviewGenerator(
    async () => draft,
    () => {},
  );
  const handlers = createRunHandlers({ jobs: memoryStore<Job>(), generateReview });
  await handlers.handleReady(api, commands, ready);
  expect(api.uploads).toHaveLength(1);
  const result = api.reports.at(-1)!;
  expect(result.type).toBe("result");
  if (result.type !== "result") throw new Error("Expected result");
  expect(result.data.output).toContain("giữ nguyên từ bản gốc");
  expect(result.data.output).not.toContain("90%");
});

test("funded run reports ordered progress, uploads PDF and completes with a verified file", async () => {
  const api = new FakePayvoke();
  const jobs = memoryStore<Job>();
  const handlers = createRunHandlers({ jobs, generateReview: async () => sampleReview() });
  await handlers.handleReady(api, commands, ready);
  expect(api.reports[0]!.type).toBe("started");
  expect(api.uploads[0]!.name).toBe("cv-improved-v1.pdf");
  expect(api.uploads[0]!.contentType).toBe("application/pdf");
  expect(new TextDecoder().decode(api.uploads[0]!.bytes.subarray(0, 5))).toBe("%PDF-");
  expect(api.reports.at(-1)).toMatchObject({
    type: "result",
    data: { artifactVersion: 1, files: [{ fileId: "uploaded-1" }] },
  });
  expect(api.reports.map((report) => report.sequence)).toEqual(api.reports.map((_, i) => i + 1));
  expect(api.streams.at(-1)!.event.type).toBe("TEXT_MESSAGE_END");
  expect((await jobs.get("job-1"))!.artifactVersion).toBe(1);
  const persisted = JSON.stringify(await jobs.get("job-1"));
  expect(persisted).not.toContain("Nguyễn");
  expect(persisted).not.toContain("anh@example.com");
});

test("duplicate ready/revision events do not reset state or generate extra artifacts", async () => {
  const api = new FakePayvoke();
  const jobs = memoryStore<Job>();
  const inputs: ReviewInput[] = [];
  const handlers = createRunHandlers({
    jobs,
    generateReview: async (input) => {
      inputs.push(input);
      return sampleReview();
    },
  });
  await handlers.handleReady(api, commands, ready);
  await handlers.handleReady(api, commands, ready);
  expect(api.uploads).toHaveLength(1);
  await handlers.handleRevision(api, revision);
  expect(api.uploads[1]!.name).toBe("cv-improved-v2.pdf");
  expect(inputs[1]!.feedback).toBe(revision.reason);
  expect(inputs[1]!.blocks).toEqual(inputs[0]!.blocks);
  await handlers.handleReady(api, commands, ready);
  await handlers.handleRevision(api, revision);
  expect(api.uploads).toHaveLength(2);
  expect((await jobs.get("job-1"))!.artifactVersion).toBe(2);
});

test("invalid file and missing input fail instead of silently leaving the run queued", async () => {
  for (const event of [
    { ...ready, input: { ...ready.input, context: { files: [] } } },
    { ...ready, input: { ...ready.input, context: { files: [{ ...file, size: 0 }] } } },
  ]) {
    const api = new FakePayvoke();
    const handlers = createRunHandlers({
      jobs: memoryStore<Job>(),
      generateReview: async () => {
        throw new Error("must not run");
      },
    });
    await handlers.handleReady(api, commands, event);
    expect(api.reports.at(-1)!.type).toBe("failed");
    expect(api.uploads).toHaveLength(0);
    expect(api.reports.some((report) => report.type === "result")).toBe(false);
  }
});

test("model failure, invalid output, PDF failure and upload failure never deliver success", async () => {
  for (const failure of ["model", "invalid", "pdf", "upload", "upload_conflict", "parse"]) {
    const api = new FakePayvoke();
    const jobs = memoryStore<Job>();
    if (failure === "upload") api.uploadError = new Error("storage offline");
    if (failure === "upload_conflict")
      api.uploadError = new PayvokeError(409, "IDEMPOTENCY_CONFLICT");
    if (failure === "parse") api.bytes = new Uint8Array(cvBytes.length);
    const handlers = createRunHandlers({
      jobs,
      generateReview: async () => {
        if (failure === "model") throw new CvError("review_failed", "AI không khả dụng");
        const review = sampleReview();
        if (failure === "invalid") review.cv.sections[0]!.items[0]!.sourceIds = ["s999"];
        return review;
      },
      ...(failure === "pdf"
        ? {
            render: async () => {
              throw new Error("pdf failed");
            },
          }
        : {}),
    });
    await handlers.handleReady(api, commands, ready);
    expect(api.reports.at(-1)!.type).toBe("failed");
    expect(api.reports.some((report) => report.type === "result")).toBe(false);
    expect((await jobs.get("job-1"))!.artifactVersion).toBe(0);
  }
});

test("revision with missing state or spent allowance fails explicitly", async () => {
  for (const version of [null, 2]) {
    const api = new FakePayvoke();
    const jobs = memoryStore<Job>();
    if (version) await jobs.put("job-1", { file, artifactVersion: version });
    const handlers = createRunHandlers({ jobs, generateReview: async () => sampleReview() });
    await handlers.handleRevision(api, revision);
    expect(api.reports.at(-1)).toMatchObject({
      type: "failed",
      data: { reason: "revision_unavailable" },
    });
    expect(api.uploads).toHaveLength(0);
  }
});
