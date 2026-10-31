import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { cn } from "@/src/lib/utils";

export type DayPoint = { date: string; amount: string; jobs: number };

const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;

/**
 * USDC per day over the series, one jade area. The tooltip shows the day's
 * amount and jobs; the axis only marks a few dates so it never crowds.
 */
export function AmountChart({
  series,
  label,
  className,
}: {
  series: DayPoint[];
  label: string;
  className?: string;
}) {
  const fill = useId().replaceAll(":", "");
  const config = {
    amount: { label, color: "var(--t-brand)" },
    jobs: { label: "Jobs", color: "var(--t-brand)" },
  } satisfies ChartConfig;
  const data = series.map((point) => ({
    date: point.date,
    amount: toUsdc(point.amount),
    jobs: point.jobs,
  }));
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-48 w-full", className)}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-amount)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--color-amount)" stopOpacity={0.02} />
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
          allowDecimals
          tickFormatter={(value: number) => (value >= 1000 ? `${value / 1000}k` : `${value}`)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => day(String(value))}
              formatter={(value, name, item) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {name === "amount" ? label : "Jobs"}
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {name === "amount"
                      ? `${Number(value).toFixed(2)} USDC`
                      : (item.payload as { jobs: number }).jobs}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="amount"
          type="monotone"
          stroke="var(--color-amount)"
          strokeWidth={2}
          fill={`url(#${fill})`}
          animationDuration={600}
        />
      </AreaChart>
    </ChartContainer>
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
