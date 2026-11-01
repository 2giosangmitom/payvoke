import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { cn } from "@/src/lib/utils";

// Charts for Studio. Colour goes on data only: jade for the series that
// matters, neutral steps of the text colour for the rest, danger for
// failures. No entrance animation: these are work screens.

const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;
const money = (value: number) => `${value.toFixed(2)} USDC`;

export const TONES = {
  brand: "var(--t-brand)",
  strong: "color-mix(in oklab, var(--t-text) 55%, transparent)",
  soft: "color-mix(in oklab, var(--t-text) 28%, transparent)",
  faint: "color-mix(in oklab, var(--t-text) 12%, transparent)",
  warning: "var(--t-warning)",
  danger: "var(--t-danger)",
} as const;

/** A titled chart panel: shadcn Card with the figure that sums it on the right. */
export function ChartCard({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-4 ring-border", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {aside && (
          <CardAction className="font-mono text-xs text-muted-foreground tabular-nums">
            {aside}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("grid h-40 place-items-center text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

type Slice = { key: string; label: string; value: number; tone: string; display: string };

// Swatch, label and figure for each part of a whole; shared by the donut and
// the stacked bars so every part-of-whole chart reads the same.
function Legend({ slices }: { slices: Slice[] }) {
  return (
    <dl className="grid gap-2 text-sm">
      {slices.map((slice) => (
        <div key={slice.key} className="flex items-center justify-between gap-3">
          <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span aria-hidden className="size-2 shrink-0" style={{ background: slice.tone }} />
            <span className="truncate">{slice.label}</span>
          </dt>
          <dd className="font-mono tabular-nums">{slice.display}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Where the agent's money stands: held, paid out, refunded, as a donut. */
export function MoneyDonut({
  held,
  released,
  refunded,
}: {
  held: string;
  released: string;
  refunded: string;
}) {
  const slices: Slice[] = [
    { key: "released", label: "Paid out", value: toUsdc(released), tone: TONES.brand },
    { key: "held", label: "Held for you", value: toUsdc(held), tone: TONES.strong },
    { key: "refunded", label: "Refunded", value: toUsdc(refunded), tone: TONES.soft },
  ].map((slice) => ({ ...slice, display: money(slice.value) }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const config = Object.fromEntries(
    slices.map((slice) => [slice.key, { label: slice.label, color: slice.tone }]),
  ) satisfies ChartConfig;
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="relative mx-auto size-40">
        {total === 0 ? (
          <div aria-hidden className="size-full rounded-full border-[14px] border-muted" />
        ) : (
          <ChartContainer config={config} className="aspect-square size-40">
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="key"
                    formatter={(value, _name, item) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {(item.payload as Slice).label}
                        </span>
                        <span className="font-mono text-foreground tabular-nums">
                          {money(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="key"
                innerRadius={52}
                outerRadius={72}
                paddingAngle={1}
                stroke="none"
                isAnimationActive={false}
              >
                {slices.map((slice) => (
                  <Cell key={slice.key} fill={slice.tone} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="font-mono text-lg tabular-nums">{total.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">USDC</span>
        </div>
      </div>
      <Legend slices={slices} />
    </div>
  );
}

/** One stacked line of how jobs ended, with counts underneath. */
export function OutcomeBar({
  outcomes,
}: {
  outcomes: { delivered: number; inProgress: number; waitingBuyer: number; failed: number };
}) {
  const slices: Slice[] = [
    { key: "delivered", label: "Delivered", value: outcomes.delivered, tone: TONES.brand },
    { key: "inProgress", label: "In progress", value: outcomes.inProgress, tone: TONES.strong },
    { key: "waiting", label: "Waiting on buyer", value: outcomes.waitingBuyer, tone: TONES.soft },
    { key: "failed", label: "Failed", value: outcomes.failed, tone: TONES.danger },
  ].map((slice) => ({ ...slice, display: String(slice.value) }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const rate = total ? Math.round((outcomes.delivered / total) * 100) : 0;
  return (
    <div className="grid gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl tabular-nums">{rate}%</span>
        <span className="text-sm text-muted-foreground">delivered</span>
      </div>
      {total === 0 ? (
        <div aria-hidden className="h-2.5 border border-dashed border-border-strong/60" />
      ) : (
        <div aria-hidden className="flex h-2.5 w-full gap-px">
          {slices
            .filter((slice) => slice.value > 0)
            .map((slice) => (
              <span
                key={slice.key}
                style={{ flexGrow: slice.value, flexBasis: 0, background: slice.tone }}
              />
            ))}
        </div>
      )}
      <Legend slices={slices} />
    </div>
  );
}

/** Stars 5 to 1, each a bar of how many buyers gave it. */
export function RatingBars({
  rating,
}: {
  rating: { average: number | null; count: number; distribution: number[] };
}) {
  const most = Math.max(1, ...rating.distribution);
  return (
    <div className="grid gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl tabular-nums">
          {rating.average === null ? "—" : rating.average.toFixed(1)}
        </span>
        <span className="text-sm text-muted-foreground">
          from {rating.count} {rating.count === 1 ? "rating" : "ratings"}
        </span>
      </div>
      <ul className="grid gap-2">
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = rating.distribution[stars - 1] ?? 0;
          return (
            <li
              key={stars}
              className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm"
            >
              <span className="font-mono text-muted-foreground tabular-nums">{stars}★</span>
              <span className="h-2 bg-muted">
                <span
                  className="block h-full"
                  style={{
                    width: `${(count / most) * 100}%`,
                    background: stars >= 4 ? TONES.brand : TONES.strong,
                  }}
                />
              </span>
              <span className="text-right font-mono tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type BarRow = { name: string; earned: string; jobs: number };

/** Earnings per item (agent or command) as horizontal bars, largest first. */
export function EarnedBars({ rows, limit = 8 }: { rows: BarRow[]; limit?: number }) {
  const data = rows
    .map((row) => ({ name: row.name, earned: toUsdc(row.earned), jobs: row.jobs }))
    .sort((a, b) => b.earned - a.earned || b.jobs - a.jobs)
    .slice(0, limit);
  if (!data.length || data.every((row) => row.earned === 0 && row.jobs === 0))
    return <Empty>Nothing earned yet.</Empty>;
  const config = { earned: { label: "Earned", color: TONES.brand } } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: data.length * 36 + 8 }}
    >
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) => (value.length > 13 ? `${value.slice(0, 12)}…` : value)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(_value, _name, item) => {
                const row = item.payload as (typeof data)[number];
                return (
                  <div className="grid w-full gap-1">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Earned</span>
                      <span className="font-mono text-foreground tabular-nums">
                        {money(row.earned)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Jobs</span>
                      <span className="font-mono text-foreground tabular-nums">{row.jobs}</span>
                    </div>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="earned" fill="var(--color-earned)" barSize={18} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

const hour = (value: number) => `${String(value).padStart(2, "0")}:00`;

/** Paid jobs by the hour they were hired, in UTC. */
export function HourBars({ byHour }: { byHour: number[] }) {
  if (byHour.every((count) => count === 0)) return <Empty>No paid jobs yet.</Empty>;
  const peak = Math.max(...byHour);
  const data = byHour.map((jobs, index) => ({ hour: index, jobs }));
  const config = { jobs: { label: "Jobs", color: TONES.brand } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full">
      <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          ticks={[0, 6, 12, 18, 23]}
          tickFormatter={hour}
        />
        <YAxis width={28} tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => `${hour(Number(payload[0]?.payload.hour))} UTC`}
            />
          }
        />
        <Bar dataKey="jobs" isAnimationActive={false}>
          {data.map((point) => (
            <Cell key={point.hour} fill={point.jobs === peak ? TONES.brand : TONES.soft} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
