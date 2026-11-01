import { useQuery } from "@tanstack/react-query";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EmptyState,
  ErrorNotice,
  FiguresSkeleton,
  SettlementNote,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { getAppStats } from "@/src/features/apps/api";
import {
  ChartCard,
  EarnedBars,
  HourBars,
  MoneyDonut,
  OutcomeBar,
  RatingBars,
} from "@/src/features/stats/charts";
import { AmountChart } from "@/src/features/stats/day-chart";
import { FigureStrip, sum } from "@/src/features/stats/earnings";

const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;

function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4">
      <span className="sr-only">Loading the agent's figures</span>
      <FiguresSkeleton count={5} />
      <Skeleton className="h-72" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    </div>
  );
}

/** One agent's numbers: what it earned, how its jobs went, who hires it and when. */
export function AgentOverview({
  appId,
  onSetup,
}: {
  appId: string;
  // Opens the Settings tab, for an agent that hasn't taken a job yet.
  onSetup: () => void;
}) {
  const stats = useQuery({
    queryKey: ["provider", "app", appId, "stats"],
    queryFn: () => getAppStats(appId),
    refetchInterval: 60_000,
  });
  if (stats.isPending) return <OverviewSkeleton />;
  if (stats.isError)
    return (
      <ErrorNotice onRetry={() => void stats.refetch()}>
        {errorMessage(stats.error, "Couldn't load this agent's figures.")}
      </ErrorNotice>
    );
  const data = stats.data;
  if (data.jobs === 0)
    return (
      <EmptyState
        title="No paid jobs yet"
        action={
          <Button variant="outline" onClick={onSetup}>
            Check the key and commands
          </Button>
        }
      >
        Charts appear here once a buyer pays for a job. Your agent needs an API key and at least one
        command to take jobs.
      </EmptyState>
    );

  const earned = sum(data.released, data.held);
  const last30 = data.series.reduce((total, day) => total + BigInt(day.amount), 0n).toString();
  // Share of the money paid in that went back to buyers.
  const paidIn = toUsdc(earned) + toUsdc(data.refunded);
  const refundRate = paidIn ? Math.round((toUsdc(data.refunded) / paidIn) * 100) : 0;
  return (
    <div className="grid gap-4">
      <FigureStrip
        className="sm:grid-cols-3 lg:grid-cols-5"
        figures={[
          {
            label: "Earned after fees",
            value: toUsdc(earned),
            unit: "USDC",
            decimals: 2,
            note: `${toUsdc(data.held).toFixed(2)} still held`,
          },
          { label: "Paid jobs", value: data.jobs },
          {
            label: "Buyers",
            value: data.users,
            note: `${data.repeatBuyers} came back`,
          },
          {
            label: "Average job",
            value: toUsdc(data.averageJob),
            unit: "USDC",
            decimals: 2,
          },
          { label: "Refunded", value: refundRate, unit: "%", note: "Of the money paid in" },
        ]}
      />
      <SettlementNote />
      <ChartCard title="Last 30 days" aside={`${toUsdc(last30).toFixed(2)} USDC`}>
        <AmountChart series={data.series} label="Earned" views className="h-56" />
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Money">
          <MoneyDonut held={data.held} released={data.released} refunded={data.refunded} />
        </ChartCard>
        <ChartCard title="How jobs ended" aside={`${data.jobs} jobs`}>
          <OutcomeBar outcomes={data.outcomes} />
        </ChartCard>
        <ChartCard title="Ratings">
          <RatingBars rating={data.rating} />
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By command" aside={`${data.byCommand.length} used`}>
          <EarnedBars
            rows={data.byCommand.map((row) => ({
              ...row,
              name: row.name === null ? "Removed command" : `/${row.name}`,
            }))}
          />
        </ChartCard>
        <ChartCard title="When buyers hire" aside="UTC">
          <HourBars byHour={data.byHour} />
        </ChartCard>
      </div>
    </div>
  );
}
