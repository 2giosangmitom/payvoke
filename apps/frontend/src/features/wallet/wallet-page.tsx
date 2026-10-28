import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { vaultAdmissionAbi, vaultFinanceAbi } from "@payvoke/shared/protocol";
import { Button } from "@/src/components/ui/button";
import {
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { getWallet, usdc, type WalletSummary } from "@/src/features/wallet/api";
import { cn } from "@/src/lib/utils";

type Row = {
  label: string;
  detail: ReactNode;
  amount: bigint | null;
  // The one series that carries the accent: money held for work in progress.
  accent?: boolean;
};

function Figure({ amount, className }: { amount: bigint | null; className?: string }) {
  const value = usdc(amount);
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {value === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <>
          {value}
          <span className="ml-1 text-[0.7em] text-muted-foreground">USDC</span>
        </>
      )}
    </span>
  );
}

// Where the money is, as one line: each place a share of the total, the held
// part in jade and the rest in neutral steps. Zero-sized parts are skipped.
function Allocation({ rows }: { rows: Row[] }) {
  const known = rows.filter((row) => row.amount !== null && row.amount > 0n);
  const total = known.reduce((sum, row) => sum + (row.amount as bigint), 0n);
  if (total === 0n)
    return <div aria-hidden className="h-3 border border-dashed border-border-strong/60" />;
  const tones = ["bg-foreground/70", "bg-foreground/40", "bg-foreground/20", "bg-foreground/10"];
  let neutral = 0;
  return (
    <div aria-hidden className="flex h-3 w-full gap-px">
      {known.map((row) => (
        <span
          key={row.label}
          className={row.accent ? "bg-primary" : tones[neutral++ % tones.length]}
          style={{ flexGrow: Number(((row.amount as bigint) * 10000n) / total), flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

function LedgerTable({ title, id, rows }: { title: string; id: string; rows: Row[] }) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-3">
      <h2 id={id} className="text-base font-medium">
        {title}
      </h2>
      <table className="w-full text-sm">
        <caption className="sr-only">{title}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border last:border-b">
              <th scope="row" className="py-3 pr-4 text-left font-normal">
                <span className="flex items-center gap-2">
                  {row.accent && <span aria-hidden className="size-2 bg-primary" />}
                  {row.label}
                </span>
                <span className="block text-xs text-muted-foreground">{row.detail}</span>
              </th>
              <td className="py-3 text-right align-top">
                <Figure amount={row.amount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

// Live balances: USDC in the wallet, the vault's free balance for it, and
// what the vault owes the account's payout addresses. Null when unreadable.
function useChainBalances(summary: WalletSummary | undefined, address: Address | undefined) {
  const vault = (summary?.vault ?? undefined) as Address | undefined;
  const payouts = (summary?.provider.payoutAddresses ?? []) as Address[];
  const live = { refetchInterval: 30_000 };
  const wallet = useReadContract({
    chainId: avalancheFuji.id,
    address: summary?.usdc as Address | undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { ...live, enabled: Boolean(summary && address) },
  });
  const available = useReadContract({
    chainId: avalancheFuji.id,
    address: vault,
    abi: vaultAdmissionAbi,
    functionName: "availableBalance",
    args: address ? [address] : undefined,
    query: { ...live, enabled: Boolean(vault && address) },
  });
  const claimable = useReadContracts({
    allowFailure: false,
    contracts: payouts.map((payout) => ({
      chainId: avalancheFuji.id,
      address: vault,
      abi: vaultFinanceAbi,
      functionName: "providerClaimable" as const,
      args: [payout] as const,
    })),
    query: { ...live, enabled: Boolean(vault && payouts.length) },
  });
  return {
    wallet: wallet.data ?? null,
    available: available.data ?? null,
    claimable: claimable.data
      ? (claimable.data as bigint[]).reduce<bigint>((sum, value) => sum + value, 0n)
      : payouts.length
        ? null
        : 0n,
    loading: wallet.isLoading,
  };
}

export function WalletPage() {
  const { data: session } = authClient.useSession();
  const { address: connected } = useConnection();
  const summary = useQuery({
    queryKey: ["account", session?.user.id, "wallet"],
    queryFn: getWallet,
    refetchInterval: 30_000,
  });
  const address = (connected ?? summary.data?.wallets[0]?.address) as Address | undefined;
  const chain = useChainBalances(summary.data, address);
  const data = summary.data;
  const big = (amount: string | undefined) => (amount === undefined ? null : BigInt(amount));

  const buyerRows: Row[] = data
    ? [
        {
          label: "In your wallet",
          detail: address ? (
            <code className="font-mono">
              {address.slice(0, 6)}…{address.slice(-4)}
            </code>
          ) : (
            "Connect your wallet to read it"
          ),
          amount: chain.wallet,
        },
        {
          label: "Available in the vault",
          detail: data.vault ? "Ready to pay for the next job" : "Vault not configured",
          amount: chain.available,
        },
        {
          label: "Held for jobs",
          detail: `${plural(data.buyer.held.count, "job")} in progress or in review`,
          amount: big(data.buyer.held.amount),
          accent: true,
        },
        {
          label: "Being held",
          detail: `${plural(data.buyer.pending.count, "payment")} waiting to finalize`,
          amount: big(data.buyer.pending.amount),
        },
      ]
    : [];
  const historyRows: Row[] = data
    ? [
        {
          label: "Released to agents",
          detail: plural(data.buyer.released.count, "delivered job"),
          amount: big(data.buyer.released.amount),
        },
        {
          label: "Returned to you",
          detail: `${plural(data.buyer.refunded.count, "job")} refunded or reclaimed`,
          amount: big(data.buyer.refunded.amount),
        },
      ]
    : [];
  const providerRows: Row[] = data
    ? [
        {
          label: "Held for your agents",
          detail: `${plural(data.provider.held.count, "paid job")} not yet released`,
          amount: big(data.provider.held.amount),
          accent: true,
        },
        {
          label: "Claimable now",
          detail: "Released to your payout addresses, ready to withdraw",
          amount: chain.claimable,
        },
        {
          label: "Released so far",
          detail: plural(data.provider.released.count, "job"),
          amount: big(data.provider.released.amount),
        },
        {
          label: "Refunded to buyers",
          detail: plural(data.provider.refunded.count, "job"),
          amount: big(data.provider.refunded.amount),
        },
      ]
    : [];
  const owned = buyerRows.reduce<bigint | null>(
    (sum, row) => (sum === null || row.amount === null ? sum : sum + row.amount),
    0n,
  );

  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="Wallet"
        description="Your USDC on Avalanche Fuji: in your wallet, in the vault, and held for the jobs you hired."
        actions={
          <Button variant="outline" render={<Link to="/console/activity" />}>
            Payment activity
          </Button>
        }
      />
      {summary.isPending ? (
        <LoadingState>Loading your wallet</LoadingState>
      ) : summary.isError ? (
        <ErrorNotice onRetry={() => void summary.refetch()}>
          {errorMessage(summary.error, "Couldn't load your wallet.")}
        </ErrorNotice>
      ) : (
        <div className="grid gap-12 py-8">
          <section aria-labelledby="where" className="grid gap-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid gap-1">
                <h2 id="where" className="text-sm text-muted-foreground">
                  Your USDC, all places
                </h2>
                <Figure amount={owned} className="text-3xl font-medium" />
              </div>
              <p className="text-xs text-muted-foreground">
                {chain.loading ? "Reading the chain" : "Balances read from the chain every 30 s"}
              </p>
            </div>
            <Allocation rows={buyerRows} />
            <LedgerTable title="Where it is" id="ledger" rows={buyerRows} />
          </section>
          <div className="grid gap-12 lg:grid-cols-2">
            <LedgerTable title="Settled payments" id="history" rows={historyRows} />
            {data && data.provider.apps > 0 ? (
              <LedgerTable
                title={`Earnings of your ${plural(data.provider.apps, "agent")}`}
                id="earnings"
                rows={providerRows}
              />
            ) : (
              <section aria-labelledby="earnings" className="grid content-start gap-3">
                <h2 id="earnings" className="text-base font-medium">
                  Earnings
                </h2>
                <p className="border-y border-border py-3 text-sm text-muted-foreground">
                  Share an agent in Studio and what buyers pay it shows here.{" "}
                  <Link
                    to="/console/studio"
                    className="text-foreground underline underline-offset-4"
                  >
                    Open Studio
                  </Link>
                </p>
              </section>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
