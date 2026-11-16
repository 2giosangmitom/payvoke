import { expect, test } from "bun:test";
import { PayvokeError, type HireRequest, type HireResult } from "@payvoke/x402-client";
import { Payvoke, Run, type AguiEvent, type Report } from "../src/payvoke";
import { reviewCv, reviewSection, subhireSettings, type Reviewer } from "../src/subhire";

// Records reports and stream lines instead of calling the network.
class FakePayvoke extends Payvoke {
  reports: Report[] = [];
  streamed: AguiEvent[] = [];
  constructor() {
    super("https://example.invalid", "test-app", "pvk_test");
  }
  override report: Payvoke["report"] = async (_id, report) => {
    this.reports.push(structuredClone(report));
    return { lastCommittedSequence: report.sequence };
  };
  override stream: Payvoke["stream"] = async (_id, _run, lines) => {
    this.streamed.push(...lines.map((l) => l.event));
    return { lastCommittedSequence: lines.at(-1)!.streamSequence };
  };
  text() {
    return this.streamed
      .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
      .map((e) => (e as { delta: string }).delta)
      .join("");
  }
}

const tx = `0x${"ab".repeat(32)}` as const;
const settings = { appId: "app_cv", maxAmount: 500_000n, timeoutMs: 5_000 };
const done = (over: Partial<HireResult> = {}): HireResult => ({
  invocationId: "inv_sub",
  threadId: "th_sub",
  idempotencyKey: "k",
  amount: "500000",
  paymentStatus: "HELD",
  executionStatus: "DELIVERED",
  transaction: tx,
  result: {
    artifactVersion: 1,
    output: "## Quick review\nGood CV.",
    text: "## Quick review\nGood CV.",
    files: [],
  },
  ...over,
});

test("is off unless both the reviewer app and the buyer key are set", () => {
  expect(subhireSettings({})).toBeNull();
  expect(subhireSettings({ CV_REVIEWER_APP_ID: "app_cv" })).toBeNull();
  expect(subhireSettings({ JOB_FINDER_BUYER_KEY: `0x${"1".repeat(64)}` })).toBeNull();
  expect(() =>
    subhireSettings({ CV_REVIEWER_APP_ID: "app_cv", JOB_FINDER_BUYER_KEY: "nope" }),
  ).toThrow();
  expect(
    subhireSettings({ CV_REVIEWER_APP_ID: "app_cv", JOB_FINDER_BUYER_KEY: `0x${"1".repeat(64)}` }),
  ).toMatchObject({ appId: "app_cv", maxAmount: 500_000n, timeoutMs: 120_000 });
});

test("hires quick_review with the CV text and streams the escrow notes", async () => {
  const api = new FakePayvoke();
  const run = new Run(api, "inv_main", "run_main");
  let request: HireRequest | null = null;
  const reviewer: Reviewer = {
    hire: async (r) => {
      request = r;
      await r.onEvent?.({
        type: "challenge",
        invocationId: "inv_sub",
        quoteId: "qt",
        quoteDigest: `0x${"9".repeat(64)}`,
        amount: "500000",
        vault: "0x1111111111111111111111111111111111111111",
        resource: "https://api.test/v1/x402/apps/app_cv/commands/quick_review",
        validUntil: 0,
        deliveryDeadline: 0,
        quote: {} as never,
      });
      await r.onEvent?.({ type: "pending", invocationId: "inv_sub", transaction: tx });
      await r.onEvent?.({
        type: "held",
        invocationId: "inv_sub",
        threadId: "th_sub",
        transaction: tx,
        holdId: null,
      });
      return done();
    },
  };
  const review = await reviewCv(
    reviewer,
    run,
    { cvText: "x".repeat(20_000), goal: "Frontend" },
    settings,
  );
  expect(review).toBe("## Quick review\nGood CV.");
  expect(request!).toMatchObject({
    appId: "app_cv",
    command: "quick_review",
    maxAmount: 500_000n,
    timeoutMs: 5_000,
  });
  const args = request!.arguments as { cv_text: string; goal: string };
  expect(args.cv_text).toHaveLength(12_000);
  expect(args.goal).toBe("Frontend");
  const text = api.text();
  expect(text).toContain("Đang thuê CV Reviewer qua x402…");
  expect(text).toContain("0.50 USDC");
  expect(text).toContain(`https://testnet.snowtrace.io/tx/${tx}`);
  // The tx link is shown once, though pending and held both carry it.
  expect(text.split("snowtrace").length).toBe(2);
  // The note is a closed text message; progress opens and closes around it.
  expect(api.streamed.at(-1)?.type).toBe("TEXT_MESSAGE_END");
  expect(api.reports.map((r) => (r as { data: { status: string } }).data.status)).toEqual([
    "running",
    "done",
  ]);
  expect(reviewSection(review!)).toContain("CV Reviewer");
});

test("carries on without the review when the sub-job fails, times out or cannot be paid", async () => {
  const cases: Reviewer["hire"][] = [
    async () => done({ executionStatus: "FAILED", result: null }),
    async () => {
      throw new PayvokeError("TIMEOUT", 0, null, "inv_sub");
    },
    async () => {
      throw new PayvokeError("insufficient_balance", 402);
    },
    async () => {
      throw new Error("socket hang up");
    },
  ];
  for (const hire of cases) {
    const api = new FakePayvoke();
    const run = new Run(api, "inv_main", "run_main");
    expect(await reviewCv({ hire }, run, { cvText: "My CV text" }, settings)).toBeNull();
    expect(api.streamed.at(-1)?.type).toBe("TEXT_MESSAGE_END");
    expect(api.reports.at(-1)).toMatchObject({
      type: "progress",
      data: { stepId: "cv_review", status: "failed" },
    });
    expect(api.text()).toMatch(/Tiếp tục không có nhận xét/);
  }
});
