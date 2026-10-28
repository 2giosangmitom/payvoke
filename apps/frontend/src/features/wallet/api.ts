import { call, client, type Body } from "@/src/lib/api/client";

export type WalletSummary = Body<typeof client.v1.wallet.$get>;
export type Ledger = WalletSummary["buyer"];

export const getWallet = () => call(client.v1.wallet.$get());

// Atomic USDC (6 decimals) as a fixed two-decimal figure; amounts under a
// cent keep four so they never print as zero.
export function usdc(atomic: bigint | string | null | undefined) {
  if (atomic === null || atomic === undefined) return null;
  const value = Number(BigInt(atomic)) / 1_000_000;
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
