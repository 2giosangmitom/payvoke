import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { NumberTicker } from "@/src/components/ui/number-ticker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { RatingLine, count } from "@/src/features/apps/agent-facts";
import type { ProviderStats } from "@/src/features/people/api";
import { AmountChart, JobsSpark } from "@/src/features/stats/day-chart";
import { cn } from "@/src/lib/utils";

const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;
export const sum = (...amounts: string[]) =>
  amounts.reduce((total, amount) => total + BigInt(amount), 0n).toString();

export type Figure = {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  note?: string;
};

/** One divided strip of figures; numbers count up once when they arrive. */
export function FigureStrip({ figures, className }: { figures: Figure[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px border border-border bg-border",
        figures.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3",
        className,
      )}
    >
      {figures.map((figure) => (
        <div key={figure.label} className="grid content-start gap-1 bg-card px-4 py-3.5">
          <dt className="text-sm text-muted-foreground">{figure.label}</dt>
          <dd className="flex items-baseline gap-1 font-mono text-2xl tabular-nums">
            {figure.value === 0 ? (
              <span>{(0).toFixed(figure.decimals ?? 0)}</span>
            ) : (
              <NumberTicker value={figure.value} decimalPlaces={figure.decimals ?? 0} />
            )}
            {figure.unit && <span className="text-sm text-muted-foreground">{figure.unit}</span>}
          </dd>
          {figure.note && <span className="text-xs text-faint">{figure.note}</span>}
        </div>
      ))}
    </dl>
  );
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid content-start gap-4 border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * What a builder's agents earned: totals after the fee, the last 30 days by
 * day, and each agent with its own numbers.
 */
export function Earnings({ stats }: { stats: ProviderStats }) {
  const earned = sum(stats.released, stats.held);
  const last30 = stats.series.reduce((total, day) => total + BigInt(day.amount), 0n).toString();
  return (
    <div className="grid gap-4">
      <FigureStrip
        figures={[
          {
            label: "Paid out",
            value: toUsdc(stats.released),
            unit: "USDC",
            decimals: 2,
            note: "Released to your wallet",
          },
          {
            label: "Held for you",
            value: toUsdc(stats.held),
            unit: "USDC",
            decimals: 2,
            note: "Paid out after the review window",
          },
          { label: "Paid jobs", value: stats.jobs, note: `${count(stats.users)} people chatted` },
          {
            label: "Refunded",
            value: toUsdc(stats.refunded),
            unit: "USDC",
            decimals: 2,
            note: "Undelivered or failed jobs",
          },
        ]}
      />
      <Panel title="Earnings, last 30 days" aside={`${toUsdc(last30).toFixed(2)} USDC after fees`}>
        <AmountChart series={stats.series} label="Earned" />
      </Panel>
      <Panel title="By agent" aside={`${toUsdc(earned).toFixed(2)} USDC in total`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="max-md:hidden">Rating</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right max-sm:hidden">Users</TableHead>
              <TableHead className="max-lg:hidden">30 days</TableHead>
              <TableHead className="text-right">Earned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.apps.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="max-w-56">
                  <Link
                    to="/console/studio/apps/$appId"
                    params={{ appId: app.id }}
                    className="group flex min-w-0 items-center gap-2.5"
                  >
                    <AgentAvatar
                      name={app.name}
                      imageUrl={app.imageUrl}
                      className="size-7 text-xs"
                    />
                    <span className="truncate font-medium group-hover:text-primary">
                      {app.name}
                    </span>
                    <ArrowUpRight
                      size={13}
                      aria-hidden="true"
                      className="shrink-0 text-faint group-hover:text-primary"
                    />
                  </Link>
                </TableCell>
                <TableCell className="max-md:hidden">
                  <RatingLine rating={app.rating} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{app.jobs}</TableCell>
                <TableCell className="text-right font-mono tabular-nums max-sm:hidden">
                  {app.users}
                </TableCell>
                <TableCell className="max-lg:hidden">
                  <JobsSpark series={app.series} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {toUsdc(sum(app.released, app.held)).toFixed(2)}
                  <span className="ml-1 text-xs text-muted-foreground">USDC</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
