import type { CommandRevision } from "@/src/features/chat/api";

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
