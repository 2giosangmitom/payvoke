import { useId, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { cn } from "@/src/lib/utils";

export type DayPoint = { date: string; amount: string; jobs: number };

const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;

type View = "amount" | "jobs" | "total";

/**
 * USDC per day over the series, one jade area. The tooltip shows the day's
 * amount and jobs; the axis only marks a few dates so it never crowds. With
 * `views`, a switch above it shows jobs per day or the running total instead.
 */
export function AmountChart({
  series,
  label,
  views = false,
  className,
}: {
  series: DayPoint[];
  label: string;
  views?: boolean;
  className?: string;
}) {
  const fill = useId().replaceAll(":", "");
  const [view, setView] = useState<View>("amount");
  const config = {
    amount: { label, color: "var(--t-brand)" },
    jobs: { label: "Jobs", color: "var(--t-brand)" },
    total: { label: "Running total", color: "var(--t-brand)" },
  } satisfies ChartConfig;
  let running = 0;
  const data = series.map((point) => {
    const amount = toUsdc(point.amount);
    running += amount;
    return { date: point.date, amount, jobs: point.jobs, total: running };
  });
  const money = view !== "jobs";
  const chart = (
    <ChartContainer config={config} className={cn("aspect-auto h-48 w-full", className)}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-brand)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--t-brand)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={36}
          tickFormatter={day}
        />
        <YAxis
          width={44}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          allowDecimals={money}
          tickFormatter={(value: number) => (value >= 1000 ? `${value / 1000}k` : `${value}`)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => day(String(value))}
              formatter={(_value, _name, item) => {
                const point = item.payload as (typeof data)[number];
                return (
                  <div className="grid w-full gap-1">
                    {(
                      [
                        [
                          view === "total" ? "Running total" : label,
                          `${(view === "total" ? point.total : point.amount).toFixed(2)} USDC`,
                        ],
                        ["Jobs", String(point.jobs)],
                      ] as const
                    ).map(([name, value]) => (
                      <div key={name} className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
          }
        />
        <Area
          dataKey={view}
          type={view === "jobs" ? "step" : "monotone"}
          stroke="var(--t-brand)"
          strokeWidth={2}
          fill={`url(#${fill})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
  if (!views) return chart;
  return (
    <div className="grid gap-3">
      <ToggleGroup
        aria-label="Chart view"
        variant="outline"
        size="sm"
        spacing={0}
        value={[view]}
        onValueChange={(next) => next[0] && setView(next[0] as View)}
      >
        <ToggleGroupItem value="amount">{label}</ToggleGroupItem>
        <ToggleGroupItem value="jobs">Jobs</ToggleGroupItem>
        <ToggleGroupItem value="total">Running total</ToggleGroupItem>
      </ToggleGroup>
      {chart}
    </div>
  );
}

/** Jobs per day as thin bars: small enough to sit inside a list row. */
export function JobsSpark({ series, className }: { series: DayPoint[]; className?: string }) {
  const config = { jobs: { label: "Jobs", color: "var(--t-brand)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-10 w-32", className)}>
      <BarChart data={series} margin={{ left: 0, right: 0, top: 2, bottom: 0 }}>
        <Bar dataKey="jobs" fill="var(--color-jobs)" isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
