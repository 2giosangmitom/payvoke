// Agent hires agent: before matching jobs, Job Finder can buy a quick CV
// review from the CV Reviewer agent over x402, with its own wallet. That is a
// second, separate escrow: if the review fails or times out, only its hold
// is refunded (by the vault) and Job Finder carries on without it.
import { createPayvoke, type HireEvent, type Payvoke } from "@payvoke/x402-client";
import { isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Run } from "./payvoke";

// What the sub-hire needs from the SDK; a fake in tests.
export type Reviewer = Pick<Payvoke, "hire">;

export type SubhireSettings = {
  appId: string;
  maxAmount: bigint;
  timeoutMs: number;
};

// cv-reviewer's quick_review accepts at most this many characters.
const CV_TEXT_LIMIT = 12_000;
// How much of the review goes into Job Finder's own result.
const SUMMARY_LIMIT = 4_000;

export const snowtrace = (hash: string) => `https://testnet.snowtrace.io/tx/${hash}`;

// Off unless both the reviewer's app id and Job Finder's buyer key are set.
export function subhireSettings(env: {
  CV_REVIEWER_APP_ID?: string;
  JOB_FINDER_BUYER_KEY?: string;
  CV_REVIEWER_MAX_AMOUNT?: string;
  CV_REVIEWER_TIMEOUT_MS?: number;
}): (SubhireSettings & { key: Hex }) | null {
  const appId = env.CV_REVIEWER_APP_ID?.trim();
  const key = env.JOB_FINDER_BUYER_KEY?.trim();
  if (!appId || !key) return null;
  if (!isHex(key) || key.length !== 66)
    throw new Error("JOB_FINDER_BUYER_KEY must be a 0x-prefixed 32-byte private key");
  return {
    appId,
    key,
    maxAmount: BigInt(env.CV_REVIEWER_MAX_AMOUNT || "500000"),
    timeoutMs: env.CV_REVIEWER_TIMEOUT_MS ?? 120_000,
  };
}

// One SDK client for the agent's wallet: it signs in once (SIWE) and keeps
// the session for every later sub-hire.
export function createReviewer(baseUrl: string, key: Hex, webOrigin?: string): Reviewer {
  return createPayvoke({ baseUrl, account: privateKeyToAccount(key), webOrigin });
}

// Streams a short note into the job's thread, hires quick_review with the CV
// text and returns the review (markdown), or null when it could not be had.
// Never throws: the buyer's own job must not fail because of the sub-job.
export async function reviewCv(
  reviewer: Reviewer,
  run: Run,
  input: { cvText: string; goal?: string },
  settings: SubhireSettings,
): Promise<string | null> {
  const note = async (line: string) => {
    try {
      await run.text(`${line}\n\n`);
    } catch {
      /* A lost note is not worth failing the job. */
    }
  };
  let txShown: string | null = null;
  const onEvent = async (event: HireEvent) => {
    if (event.type === "challenge")
      await note(
        `Báo giá: ${(Number(event.amount) / 1e6).toFixed(2)} USDC, ký quỹ vào vault \`${event.vault}\`.`,
      );
    if (
      (event.type === "pending" || event.type === "held") &&
      event.transaction &&
      event.transaction !== txShown
    ) {
      txShown = event.transaction;
      await note(
        `Giao dịch ký quỹ: [${event.transaction.slice(0, 10)}…](${snowtrace(event.transaction)})`,
      );
    }
    if (event.type === "held")
      await note("Tiền đã được giữ trong escrow, CV Reviewer đang làm việc…");
  };
  // Progress reports go before and after the note, never while it is open.
  let outcome: { label: string; status: "done" | "failed" } = {
    label: "Không thuê được CV Reviewer",
    status: "failed",
  };
  try {
    await run.progress("cv_review", "Đang thuê CV Reviewer qua x402…");
    await run.startText(`subhire-${run.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"));
    await note("**Đang thuê CV Reviewer qua x402…** (một escrow riêng, hoàn tiền nếu thất bại)");
    const job = await reviewer.hire({
      appId: settings.appId,
      command: "quick_review",
      arguments: {
        cv_text: input.cvText.slice(0, CV_TEXT_LIMIT),
        ...(input.goal ? { goal: input.goal.slice(0, 500) } : {}),
      },
      maxAmount: settings.maxAmount,
      timeoutMs: settings.timeoutMs,
      signal: AbortSignal.timeout(settings.timeoutMs + 30_000),
      onEvent,
    });
    const text =
      job.result?.text ??
      (job.result?.output != null ? JSON.stringify(job.result.output, null, 2) : null);
    if (job.executionStatus !== "DELIVERED" || !text?.trim()) {
      await note(
        "CV Reviewer không giao kết quả; khoản ký quỹ của nó sẽ được hoàn. Tiếp tục không có nhận xét.",
      );
      outcome = { label: "CV Reviewer không giao kết quả", status: "failed" };
      return null;
    }
    await note("Đã nhận nhận xét từ CV Reviewer.");
    outcome = { label: "Đã nhận nhận xét từ CV Reviewer", status: "done" };
    return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT)}…` : text;
  } catch (error) {
    const reason =
      error && typeof error === "object" && "code" in error ? String(error.code) : String(error);
    console.warn(`cv-reviewer sub-hire failed: ${reason}`);
    await note(`Không thuê được CV Reviewer (${reason}). Tiếp tục không có nhận xét.`);
    return null;
  } finally {
    try {
      await run.endText();
      await run.progress("cv_review", outcome.label, outcome.status);
    } catch {
      /* ignore */
    }
  }
}

// The section appended to Job Finder's own report.
export const reviewSection = (review: string) =>
  `\n\n---\n\n## Nhận xét CV từ CV Reviewer (thuê qua x402)\n\n${review}\n`;
