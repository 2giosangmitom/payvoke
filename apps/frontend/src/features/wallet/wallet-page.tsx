import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { vaultAdmissionAbi, vaultFinanceAbi } from "@payvoke/shared/protocol";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ErrorNotice, PageHeader, PageShell, errorMessage } from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { getStats } from "@/src/features/people/api";
import { AmountChart } from "@/src/features/stats/day-chart";
import { getWallet, usdc, type WalletSummary } from "@/src/features/wallet/api";
import { OneClickSection } from "@/src/features/wallet/one-click-pay";
import { EarningsWithdraw, FundsPanel } from "@/src/features/wallet/vault-actions";
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

const NEUTRAL_TONES = [
  "bg-foreground/70",
  "bg-foreground/40",
  "bg-foreground/20",
  "bg-foreground/10",
];

// One colour per place, fixed by its position, so the bar and its legend
// agree: the held part in jade, the rest in neutral steps.
function tones(rows: Row[]) {
  let neutral = 0;
  return rows.map((row) =>
    row.accent ? "bg-primary" : NEUTRAL_TONES[neutral++ % NEUTRAL_TONES.length]!,
  );
}

// Where the money is, as one line: each place a share of the total.
// Zero-sized parts are skipped.
function Allocation({ rows }: { rows: Row[] }) {
  const colours = tones(rows);
  const known = rows
    .map((row, index) => ({ row, tone: colours[index]! }))
    .filter(({ row }) => row.amount !== null && row.amount > 0n);
  const total = known.reduce((sum, { row }) => sum + (row.amount as bigint), 0n);
  if (total === 0n)
    return <div aria-hidden className="h-2.5 border border-dashed border-border-strong/60" />;
  return (
    <div aria-hidden className="flex h-2.5 w-full gap-px">
      {known.map(({ row, tone }) => (
        <span
          key={row.label}
          className={cn(tone, "transition-[flex-grow] duration-500 ease-out")}
          style={{ flexGrow: Number(((row.amount as bigint) * 10000n) / total), flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

// The legend under the bar: every place with its swatch, amount and detail.
function PlaceTiles({ rows }: { rows: Row[] }) {
  const colours = tones(rows);
  return (
    <dl className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row, index) => (
        <div key={row.label} className="grid content-start gap-1.5 bg-card px-4 py-3.5">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden className={cn("size-2 shrink-0", colours[index])} />
            {row.label}
          </dt>
          <dd className="grid gap-1">
            <Figure amount={row.amount} className="text-xl" />
            <span className="text-xs text-faint">{row.detail}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function WalletSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-10 py-8">
      <span className="sr-only">Loading your wallet</span>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="grid gap-6 border border-border bg-card p-5 sm:p-6">
          <div className="grid gap-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-10 w-56" />
          </div>
          <Skeleton className="h-2.5 w-full" />
          <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid gap-2 bg-card px-4 py-3.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid content-start gap-3 border border-border bg-card p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <Skeleton className="h-64" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
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
  const stats = useQuery({
    queryKey: ["account", session?.user.id, "stats"],
    queryFn: getStats,
    refetchInterval: 60_000,
  });
  const spending = stats.data?.buyer;
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
        description="Your USDC on Avalanche Fuji: wallet, vault and jobs in progress."
        actions={
          <Button variant="outline" render={<Link to="/console/activity" />}>
            Payment activity
          </Button>
        }
      />
      {summary.isPending ? (
        <WalletSkeleton />
      ) : summary.isError ? (
        <ErrorNotice onRetry={() => void summary.refetch()}>
          {errorMessage(summary.error, "Couldn't load your wallet.")}
        </ErrorNotice>
      ) : (
        <div className="grid gap-12 py-8">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
            <section
              aria-labelledby="where"
              className="grid content-start gap-6 border border-border bg-card p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="grid gap-1">
                  <h2 id="where" className="text-sm text-muted-foreground">
                    Your USDC in total
                  </h2>
                  <Figure amount={owned} className="text-4xl font-medium tracking-[-0.02em]" />
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 bg-primary",
                      chain.loading && "animate-pulse motion-reduce:animate-none",
                    )}
                  />
                  {chain.loading ? "Reading the chain" : "Live from Avalanche Fuji, every 30 s"}
                </p>
              </div>
              <Allocation rows={buyerRows} />
              <PlaceTiles rows={buyerRows} />
            </section>
            <section
              aria-labelledby="move"
              className="grid content-start gap-3 border border-border bg-card p-4 sm:p-5 lg:sticky lg:top-6"
            >
              <div className="grid gap-1">
                <h2 id="move" className="text-base font-medium">
                  Move USDC
                </h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  Deposit into the vault to pay for jobs, or withdraw what isn&apos;t held.
                </p>
              </div>
              <FundsPanel
                token={data!.usdc as Address}
                vault={(data!.vault ?? null) as Address | null}
                address={connected}
                wallet={chain.wallet}
                available={chain.available}
              />
            </section>
          </div>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section aria-labelledby="spent" className="grid content-start gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="spent" className="text-base font-medium">
                  Spent, last 30 days
                </h2>
                {spending && (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {plural(spending.jobs, "job")} hired in all
                  </span>
                )}
              </div>
              <div className="border border-border bg-card p-4">
                {stats.isPending ? (
                  <Skeleton className="h-48" />
                ) : spending ? (
                  <AmountChart series={spending.series} label="Spent" />
                ) : (
                  <p className="grid h-48 place-items-center text-sm text-muted-foreground">
                    {errorMessage(stats.error, "Couldn't load your spending.")}
                  </p>
                )}
              </div>
            </section>
            <LedgerTable title="Settled payments" id="history" rows={historyRows} />
          </div>
          {data?.vault && (
            <section aria-labelledby="one-click" className="grid gap-3 lg:max-w-3xl">
              <div className="grid gap-1">
                <h2 id="one-click" className="text-base font-medium">
                  One-click pay
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pay without a wallet prompt. Each browser has its own key and daily limit; revoke
                  it here to stop it.
                </p>
              </div>
              <OneClickSection vault={data.vault as Address} connected={connected} />
            </section>
          )}
          <div className="lg:max-w-3xl">
            {data && data.provider.apps > 0 ? (
              <div className="grid content-start gap-4">
                <LedgerTable
                  title={`Earnings of your ${plural(data.provider.apps, "agent")}`}
                  id="earnings"
                  rows={providerRows}
                />
                <EarningsWithdraw
                  vault={(data.vault ?? null) as Address | null}
                  address={connected}
                  payouts={data.provider.payoutAddresses as Address[]}
                />
              </div>
            ) : (
              <section aria-labelledby="earnings" className="grid content-start gap-3">
                <h2 id="earnings" className="text-base font-medium">
                  Earnings
                </h2>
                <p className="border-y border-border py-3 text-sm text-muted-foreground">
                  Once you share an agent in Studio, what buyers pay it appears here.{" "}
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
