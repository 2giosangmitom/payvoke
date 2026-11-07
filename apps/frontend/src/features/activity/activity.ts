import type { ActivityItem } from "@/src/features/activity/api";

export type Stage = {
  label: string;
  tone: "active" | "attention" | "done" | "failed";
  // Short, buyer-facing deadline or next step.
  detail: string;
};

// "in 2 h" / "3 min ago" from a unix-seconds deadline.
export function relative(seconds: number, now = Date.now()) {
  const delta = seconds * 1000 - now;
  const abs = Math.abs(delta);
  const text =
    abs >= 86400000
      ? `${Math.round(abs / 86400000)} d`
      : abs >= 3600000
        ? `${Math.round(abs / 3600000)} h`
        : `${Math.max(1, Math.round(abs / 60000))} min`;
  return delta >= 0 ? `in ${text}` : `${text} ago`;
}

const RUNNING = ["NOT_STARTED", "QUEUED", "ACKED", "RUNNING", "WAITING_BUYER", "VERIFYING"];

// Where a paid request stands for the buyer: the hold's settled outcome wins,
// then payment admission, then delivery against the quoted deadlines.
export function stageOf(item: ActivityItem, now = Date.now()): Stage {
  const nowSeconds = now / 1000;
  if (item.financialStatus === "RELEASED")
    return { label: "Paid out", tone: "done", detail: "Released to the provider" };
  if (item.financialStatus === "REFUNDED" || item.financialStatus === "RECLAIMED")
    return { label: "Refunded", tone: "done", detail: "Returned to your wallet" };
  if (item.paymentStatus === "PENDING" || item.paymentStatus === "UNKNOWN")
    return { label: "Payment pending", tone: "active", detail: "Waiting for the hold to finalize" };
  if (item.paymentStatus !== "HELD")
    return { label: "Payment failed", tone: "failed", detail: "No funds were held" };
  if (nowSeconds >= item.resolveBy)
    return { label: "Reclaimable", tone: "attention", detail: "You can reclaim the hold now" };
  if (item.executionStatus === "DELIVERED")
    return nowSeconds < item.releaseNotBefore
      ? {
          label: "In review",
          tone: "attention",
          detail: `Review window ends ${relative(item.releaseNotBefore, now)}`,
        }
      : { label: "Releasing", tone: "active", detail: "Review window over" };
  if (item.executionStatus === "FAILED")
    return { label: "Failed", tone: "failed", detail: "The hold is refunded in full" };
  if (nowSeconds >= item.deliveryDeadline)
    return { label: "Overdue", tone: "failed", detail: "Missed delivery; refund due" };
  if (item.executionStatus === "WAITING_BUYER")
    return { label: "Needs your answer", tone: "attention", detail: "The app asked a question" };
  if (RUNNING.includes(item.executionStatus))
    return {
      label: item.executionStatus === "VERIFYING" ? "Verifying" : "Running",
      tone: "active",
      detail: `Due ${relative(item.deliveryDeadline, now)}`,
    };
  return { label: item.executionStatus.toLowerCase(), tone: "active", detail: "" };
}
