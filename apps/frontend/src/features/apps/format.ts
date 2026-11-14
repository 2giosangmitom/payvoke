import type { CommandRevision } from "@/src/features/chat/api";

export function formatDuration(seconds: number) {
  return seconds >= 3600
    ? `${Math.round(seconds / 360) / 10} h`
    : seconds >= 60
      ? `${Math.round(seconds / 60)} min`
      : `${seconds} s`;
}

export function formatUsdc(atomic: string | null | undefined, maximumFractionDigits = 4) {
  if (!atomic) return "—";
  return `${(Number(atomic) / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits,
  })} USDC`;
}

// Bots price each request with an offer; a command may cap that price.
export function formatCommandPrice(revision: CommandRevision | null | undefined) {
  if (!revision) return "—";
  return revision.maxGrossAmount
    ? `Priced by offer · up to ${formatUsdc(revision.maxGrossAmount)}`
    : "Priced by offer";
}

// The signed late-delivery terms in a few words, or null when any late
// delivery is refunded in full.
export function formatLatePolicy(
  terms: { latePolicy?: { graceSeconds: number; refundBps: number } } | null | undefined,
) {
  const late = terms?.latePolicy;
  if (!late) return null;
  return `late < ${formatDuration(late.graceSeconds)}: ${late.refundBps / 100}% back`;
}
