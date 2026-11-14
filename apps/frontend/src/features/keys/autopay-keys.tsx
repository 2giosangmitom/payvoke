import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useConnection, useReadContracts } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { ErrorNotice } from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { forgetGrant, listGrants, type Grant } from "@/src/features/keys/grants";
import { SettingsRow } from "@/src/features/keys/settings-row";
import { getWallet, usdc } from "@/src/features/wallet/api";
import { useGrantChanges } from "@/src/features/wallet/grant-changes";
import { chainError, useVaultWrite, vaultAccountAbi } from "@/src/features/wallet/vault";

const DAY = 86_400;
const PERIODS = [
  [DAY, "day"],
  [7 * DAY, "week"],
] as const;
export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export type OnChain = {
  config: {
    signer: Address;
    expiresAt: number;
    maxPerCall: bigint;
    periodSeconds: number;
    maxPerPeriod: bigint;
    maxTotal: bigint;
  };
  epoch: bigint;
  spentTotal: bigint;
  spentInPeriod: bigint;
  currentPeriod: bigint;
  revoked: boolean;
};

// What the vault counts as spent in the grant's current period: a day
// resets at 00:00 UTC.
export function spentInPeriod(grant: OnChain, now: number) {
  const period = BigInt(Math.floor(now / (grant.config.periodSeconds || 1)));
  return grant.currentPeriod === period ? grant.spentInPeriod : 0n;
}

export function grantState(grant: OnChain | undefined, now: number) {
  if (!grant || grant.epoch === 0n) return "Not in the vault";
  if (grant.revoked) return "Revoked";
  if (grant.config.expiresAt <= now) return "Expired";
  return null;
}

// Each grant's live state from the vault, with revoke. `onRemoved` runs
// after a grant leaves the list; `note` labels a row, such as this browser's.
export function GrantList({
  grants,
  vault,
  connected,
  note,
  onRemoved,
}: {
  grants: Grant[];
  vault: Address;
  connected: Address | undefined;
  note?: (grant: Grant) => string | null;
  onRemoved?: (grant: Grant) => void | Promise<void>;
}) {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const send = useVaultWrite();
  const { revokeGrant } = useGrantChanges(vault);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // Set when the relayed revoke failed: the buyer can still revoke directly.
  const [fallback, setFallback] = useState<Grant | null>(null);
  const chain = useReadContracts({
    allowFailure: true,
    contracts: grants.map((grant) => ({
      chainId: avalancheFuji.id,
      address: vault,
      abi: vaultAccountAbi,
      functionName: "getGrant" as const,
      args: [grant.buyer as Address, grant.grantId as Hex] as const,
    })),
    query: { refetchInterval: 30_000 },
  });
  const now = Math.floor(Date.now() / 1000);

  // Revoking is a buyer signature Payvoke relays (no gas), which also lowers
  // the USDC allowance; the list entry goes once the vault refuses the grant.
  // If the relay fails, the buyer can revoke straight from the wallet.
  async function remove(grant: Grant, revoke: boolean, direct = false) {
    setError("");
    setBusy(grant.id);
    try {
      if (revoke) {
        if (connected?.toLowerCase() !== grant.buyer.toLowerCase())
          throw new Error(`Connect ${short(grant.buyer)}, the wallet this grant pays from.`);
        if (direct)
          await send((write) =>
            write({
              address: vault,
              abi: vaultAccountAbi,
              functionName: "revokeGrant",
              args: [grant.grantId as Hex],
            }),
          );
        else {
          const onChain = chain.data?.[grants.indexOf(grant)]?.result as OnChain | undefined;
          try {
            await revokeGrant({
              buyer: grant.buyer as Address,
              grantId: grant.grantId as Hex,
              remaining:
                onChain && onChain.config.maxTotal > onChain.spentTotal
                  ? onChain.config.maxTotal - onChain.spentTotal
                  : 0n,
            });
          } catch (cause) {
            setFallback(grant);
            throw cause;
          }
        }
      }
      setFallback(null);
      await forgetGrant(grant.id);
      await onRemoved?.(grant);
      await queryClient.invalidateQueries({ queryKey: ["account", session?.user.id, "grants"] });
    } catch (cause) {
      setError(chainError(cause));
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {fallback && (
        <Button
          variant="outline"
          size="sm"
          className="mb-3"
          disabled={Boolean(busy)}
          onClick={() => void remove(fallback, true, true)}
        >
          Revoke {fallback.name} from your wallet instead (pays gas)
        </Button>
      )}
      <ul className="grid">
        {grants.map((grant, index) => {
          const onChain = chain.data?.[index]?.result as OnChain | undefined;
          const state = chain.isPending ? null : grantState(onChain, now);
          const config = onChain?.config;
          const period = PERIODS.find(([seconds]) => seconds === config?.periodSeconds)?.[1];
          const spent = onChain ? spentInPeriod(onChain, now) : 0n;
          return (
            <li
              key={grant.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-t border-border py-3"
            >
              <div className="grid min-w-0 gap-0.5">
                <span className="flex items-center gap-2 truncate text-sm">
                  {grant.name}
                  {note?.(grant) && <span className="text-xs text-primary">· {note(grant)}</span>}
                  {state && <span className="text-xs text-muted-foreground">· {state}</span>}
                </span>
                <code className="truncate font-mono text-xs text-muted-foreground">
                  {grant.grantId.slice(0, 10)}… · signer {short(grant.signer)}
                </code>
                {config && !state && (
                  <span className="text-xs text-muted-foreground">
                    Up to {usdc(config.maxPerCall)} a job ·{" "}
                    <span className="font-mono tabular-nums">
                      {usdc(spent)}/{usdc(config.maxPerPeriod)}
                    </span>{" "}
                    this {period ?? "period"} ·{" "}
                    <span className="font-mono tabular-nums">
                      {usdc(onChain!.spentTotal)}/{usdc(config.maxTotal)}
                    </span>{" "}
                    in all · expires {date(config.expiresAt)}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={Boolean(busy) || chain.isPending}
                onClick={() => void remove(grant, !state)}
                aria-label={`${state ? "Remove" : "Revoke"} ${grant.name}`}
              >
                {busy === grant.id && <Spinner />} {state ? "Remove" : "Revoke"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Autopay grants made before each coding agent's limit lived on its access
// token. Shown only while some remain, so they can be revoked.
export function OlderAutopayKeys() {
  const { data: session } = authClient.useSession();
  const { address: connected } = useConnection();
  const wallet = useQuery({
    queryKey: ["account", session?.user.id, "wallet"],
    queryFn: getWallet,
  });
  const grants = useQuery({
    queryKey: ["account", session?.user.id, "grants"],
    queryFn: listGrants,
  });
  const vault = (wallet.data?.vault ?? null) as Address | null;
  const older = (grants.data ?? []).filter((grant) => grant.kind === "agent" && !grant.tokenId);
  if (!vault || !older.length) return null;
  return (
    <SettingsRow
      id="older-autopay"
      title="Older autopay keys"
      description="Spend keys that are not tied to an API key. Revoke any you no longer use."
    >
      <GrantList grants={older} vault={vault} connected={connected} />
    </SettingsRow>
  );
}
