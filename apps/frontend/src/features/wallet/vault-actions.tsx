import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { ErrorNotice } from "@/src/components/layout/page-kit";
import { usdc } from "@/src/features/wallet/api";
import { chainError, useVaultWrite, vaultAccountAbi } from "@/src/features/wallet/vault";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// What the vault owes these addresses: a refund or payout USDC refused to
// deliver (for example to a blacklisted address). Normally empty.
export function useClaimable(vault: Address | null, addresses: Address[]) {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))] as Address[];
  const reads = useReadContracts({
    allowFailure: false,
    contracts: unique.map((address) => ({
      chainId: avalancheFuji.id,
      address: vault ?? undefined,
      abi: vaultAccountAbi,
      functionName: "claimable" as const,
      args: [address] as const,
    })),
    query: { enabled: Boolean(vault && unique.length), refetchInterval: 30_000 },
  });
  const amounts = (reads.data as bigint[] | undefined) ?? [];
  return {
    total: reads.data ? amounts.reduce((sum, value) => sum + value, 0n) : unique.length ? null : 0n,
    owed: unique.flatMap((address, index) =>
      amounts[index] ? [{ address, amount: amounts[index]! }] : [],
    ),
  };
}

// Refunds and payouts go straight to wallets. When USDC refuses one, the
// vault keeps it claimable; the owner withdraws it here to the connected wallet.
export function ClaimDeferred({
  vault,
  address,
  addresses,
}: {
  vault: Address | null;
  address: Address | undefined;
  addresses: Address[];
}) {
  const send = useVaultWrite();
  const queryClient = useQueryClient();
  const claimable = useClaimable(vault, addresses);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  if (!vault || !claimable.owed.length) return null;
  const mine = claimable.owed.find((item) => item.address.toLowerCase() === address?.toLowerCase());
  return (
    <div className="grid gap-2 border-l border-warning pl-3">
      <p className="text-sm">
        The vault could not deliver{" "}
        {claimable.owed.map((item) => (
          <span key={item.address} className="font-mono tabular-nums">
            {usdc(item.amount)} USDC to {short(item.address)}{" "}
          </span>
        ))}
        and keeps it for you to claim.
      </p>
      {mine ? (
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={busy}
          onClick={async () => {
            setError("");
            setBusy(true);
            try {
              await send((write) =>
                write({
                  address: vault,
                  abi: vaultAccountAbi,
                  functionName: "claim",
                  args: [mine.address],
                }),
              );
              setDone(`Claimed ${usdc(mine.amount)} USDC.`);
              await queryClient.invalidateQueries({
                predicate: (query) =>
                  ["readContract", "readContracts"].includes(String(query.queryKey[0])),
              });
            } catch (cause) {
              setError(chainError(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner />}{" "}
          {busy ? "Confirm in your wallet…" : `Claim ${usdc(mine.amount)} USDC`}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Connect that address to claim it.</p>
      )}
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
      {done && (
        <p role="status" className="text-sm text-primary">
          {done}
        </p>
      )}
    </div>
  );
}
