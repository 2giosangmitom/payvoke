import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { ArrowUpRight, MessagesSquare, Sparkles } from "lucide-react";
import { ramp, useLocal } from "../lib/motion";
import { mono, sans, T } from "../lib/theme";
import { Avatar, Button, ConsoleFrame, Cursor, Mono } from "../ui/kit";

// The console home screen as the real app draws it (apps/frontend
// features/console/console-home.tsx): greeting, "Your money" figure strip,
// the jade area charts from stats/day-chart.tsx, the agents you hire most
// and what your own agents earned. Mock data; the charts draw themselves in.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const usdc = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 30 days ending today (Nov 3). */
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 5 + i));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
});
const noise = (i: number) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};
/** Jingle Bot's earnings: slow at first, then word gets around. */
export const EARNED = DAYS.map(
  (_, i) => 4 + i * i * 0.09 + noise(i) * 9 + (i > 24 ? (i - 24) * 9 : 0),
);
export const JOBS = EARNED.map((v, i) => Math.round(v / 2.5 + noise(i + 40) * 3));
const SPENT = DAYS.map((_, i) => (noise(i + 7) > 0.55 ? 0.8 + noise(i + 9) * 5 : 0.2 * noise(i)));

/** The shared area chart: dashed grid, few ticks, one jade series. */
export const AreaChart = ({
  data,
  width,
  height,
  draw = 1,
  tooltip,
  label,
}: {
  data: number[];
  width: number;
  height: number;
  /** 0..1, how much of the line has been drawn. */
  draw?: number;
  /** Index of the point under the cursor. */
  tooltip?: number;
  label: string;
}) => {
  const left = 58;
  const bottom = 34;
  const W = width - left - 10;
  const H = height - bottom - 10;
  const max = Math.ceil(Math.max(...data) / 20) * 20 || 1;
  const x = (i: number) => left + (i / (data.length - 1)) * W;
  const y = (v: number) => 10 + H - (v / max) * H;
  // monotone-ish curve: quadratic midpoints
  let line = `M ${x(0)} ${y(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const mx = (x(i - 1) + x(i)) / 2;
    line += ` C ${mx} ${y(data[i - 1])}, ${mx} ${y(data[i])}, ${x(i)} ${y(data[i])}`;
  }
  const area = `${line} L ${x(data.length - 1)} ${10 + H} L ${x(0)} ${10 + H} Z`;
  const id = `fill-${label.replace(/\W/g, "")}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  return (
    <svg width={width} height={height} style={{ overflow: "visible", fontFamily: sans }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.brand} stopOpacity={0.32} />
          <stop offset="100%" stopColor={T.brand} stopOpacity={0.02} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect x={0} y={0} width={left + W * draw} height={height} />
        </clipPath>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line
            x1={left}
            x2={left + W}
            y1={y(v)}
            y2={y(v)}
            stroke={T.border}
            strokeDasharray="4 5"
          />
          <text x={left - 12} y={y(v) + 6} textAnchor="end" fontSize={17} fill={T.muted}>
            {v >= 1000 ? `${v / 1000}k` : Math.round(v)}
          </text>
        </g>
      ))}
      {[0, 7, 14, 21, 29].map((i) => (
        <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={17} fill={T.muted}>
          {DAYS[i]}
        </text>
      ))}
      <g clipPath={`url(#${id}-clip)`}>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={T.brand} strokeWidth={3} />
      </g>
      {tooltip !== undefined && draw >= 1 && (
        <g>
          <circle
            cx={x(tooltip)}
            cy={y(data[tooltip])}
            r={7}
            fill={T.brand}
            stroke={T.bg}
            strokeWidth={3}
          />
          <foreignObject x={x(tooltip) - 250} y={y(data[tooltip]) - 20} width={230} height={110}>
            <div
              style={{
                background: T.bg,
                border: `1.5px solid ${T.border}`,
                padding: "10px 14px",
                display: "grid",
                gap: 6,
                fontSize: 17,
                color: T.text,
                boxShadow: "0 10px 30px #0008",
              }}
            >
              <span style={{ fontWeight: 600 }}>{DAYS[tooltip]}</span>
              <span style={{ display: "flex", justifyContent: "space-between", color: T.muted }}>
                {label}
                <Mono style={{ color: T.text }}>${usdc(data[tooltip])}</Mono>
              </span>
              <span style={{ display: "flex", justifyContent: "space-between", color: T.muted }}>
                Jobs <Mono style={{ color: T.text }}>{JOBS[tooltip]}</Mono>
              </span>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
};

/** Jobs per day as thin bars (JobsSpark). */
export const Spark = ({
  data,
  width,
  height,
  draw = 1,
}: {
  data: number[];
  width: number;
  height: number;
  draw?: number;
}) => {
  const max = Math.max(...data);
  const bw = width / data.length;
  return (
    <svg width={width} height={height}>
      {data.map((v, i) =>
        i / data.length > draw ? null : (
          <rect
            key={i}
            x={i * bw + 1}
            y={height - (v / max) * height}
            width={bw - 2}
            height={(v / max) * height}
            fill={T.brand}
          />
        ),
      )}
    </svg>
  );
};

const Section = ({
  title,
  action,
  children,
  style,
}: {
  title: string;
  action?: string;
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <section style={{ display: "grid", gap: 14, alignContent: "start", ...style }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <span style={{ fontSize: 26, fontWeight: 500 }}>{title}</span>
      {action && (
        <span
          style={{ fontSize: 19, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}
        >
          {action} <ArrowUpRight size={16} />
        </span>
      )}
    </div>
    {children}
  </section>
);

const Figure = ({
  label,
  value,
  unit,
  note,
  last,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  last?: boolean;
}) => (
  <div
    style={{
      background: T.surface,
      padding: "18px 22px",
      display: "grid",
      gap: 6,
      borderRight: last ? undefined : `1.5px solid ${T.border}`,
    }}
  >
    <span style={{ fontSize: 19, color: T.muted }}>{label}</span>
    <Mono style={{ fontSize: 40, letterSpacing: "-0.02em" }}>
      {value}
      {unit && <span style={{ fontSize: 19, color: T.muted, marginLeft: 6 }}>{unit}</span>}
    </Mono>
    {note && <span style={{ fontSize: 16, color: T.muted, opacity: 0.8 }}>{note}</span>}
  </div>
);

const TOP_AGENTS: [string, string, number][] = [
  ["Logo Smith", "L", 18.4],
  ["Bug Whisperer", "B", 12.0],
  ["CSV Analyst", "C", 9.3],
  ["Tax Goblin", "T", 6.5],
];

/** "A little work, a little time": the console home, money climbing. */
export const ConsoleHome = () => {
  const { t, dur } = useLocal();
  const draw = ramp(t, 0.2, Math.min(2.6, dur * 0.6));
  const earned = interpolate(
    t,
    [0.2, Math.min(2.6, dur * 0.6)],
    [0, EARNED.reduce((a, b) => a + b, 0)],
    clamp,
  );
  const jobs = Math.round(interpolate(t, [0.2, Math.min(2.6, dur * 0.6)], [0, 496], clamp));
  const tip = t > dur * 0.62 ? 29 : undefined;
  const cursor: [number, number] = [
    interpolate(t, [dur * 0.45, dur * 0.62], [1500, 1132], clamp),
    interpolate(t, [dur * 0.45, dur * 0.62], [980, 640], clamp),
  ];
  return (
    <AbsoluteFill style={{ fontFamily: sans, color: T.text }}>
      <ConsoleFrame section="Home" active={0} style={{ width: 1800, height: 1080 }}>
        <div style={{ padding: "26px 44px", display: "grid", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Avatar name="Chiến" size={56} />
            <div style={{ display: "grid", gap: 4, flex: 1 }}>
              <span style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em" }}>
                Good evening, Chiến
              </span>
              <span style={{ fontSize: 20, color: T.muted }}>
                1 result in review · 3 jobs running
              </span>
            </div>
            <Button variant="outline">
              <Sparkles size={20} /> Find agents
            </Button>
            <Button>
              <MessagesSquare size={20} /> New chat
            </Button>
          </div>

          <Section title="Your money" action="Wallet">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                border: `1.5px solid ${T.border}`,
              }}
            >
              <Figure label="Held for jobs" value="$7.50" note="3 jobs running" />
              <Figure label="Paid to agents" value="$46.20" note="pay per job, via x402" />
              <Figure label="Refunded to you" value="$2.50" />
              <Figure label="Jobs hired" value="21" note="1 in review" last />
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1.75fr 1fr", gap: 36 }}>
            <Section title="Your agents" action="Earnings">
              <div
                style={{
                  border: `1.5px solid ${T.border}`,
                  background: T.surface,
                  padding: 22,
                  display: "grid",
                  gridTemplateColumns: "250px 1fr",
                  gap: 20,
                }}
              >
                <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 19, color: T.muted }}>Earned after fees</span>
                    <Mono style={{ fontSize: 44, letterSpacing: "-0.03em" }}>${usdc(earned)}</Mono>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontSize: 19 }}>
                    <span style={{ color: T.muted }}>
                      Paid jobs
                      <Mono style={{ display: "block", color: T.text, fontSize: 26 }}>{jobs}</Mono>
                    </span>
                    <span style={{ color: T.muted }}>
                      Users
                      <Mono style={{ display: "block", color: T.text, fontSize: 26 }}>
                        {Math.round(jobs * 0.43)}
                      </Mono>
                    </span>
                  </div>
                  <Spark data={JOBS} width={230} height={56} draw={draw} />
                  <Button
                    variant="outline"
                    style={{ justifySelf: "start", height: 44, fontSize: 18 }}
                  >
                    Open Studio
                  </Button>
                </div>
                <AreaChart
                  data={EARNED}
                  width={760}
                  height={370}
                  draw={draw}
                  label="Earned"
                  tooltip={tip}
                />
              </div>
            </Section>
            <div style={{ display: "grid", gap: 26, alignContent: "start" }}>
              <Section title="Spending, last 30 days">
                <div
                  style={{
                    border: `1.5px solid ${T.border}`,
                    background: T.surface,
                    padding: "14px 14px 8px",
                  }}
                >
                  <AreaChart data={SPENT} width={560} height={170} draw={draw} label="Spent" />
                </div>
              </Section>
              <Section title="Agents you hire most">
                <div style={{ borderTop: `1.5px solid ${T.border}` }}>
                  {TOP_AGENTS.map(([name, initial, amount]) => (
                    <div
                      key={name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "10px 0",
                        borderBottom: `1.5px solid ${T.border}`,
                      }}
                    >
                      <Avatar name={initial} size={38} />
                      <span style={{ display: "grid", flex: 1 }}>
                        <span style={{ fontSize: 20, fontWeight: 500 }}>{name}</span>
                        <span style={{ fontFamily: mono, fontSize: 16, color: T.muted }}>
                          ${usdc(amount)} · {Math.round(amount / 1.7)} jobs
                        </span>
                      </span>
                      <ArrowUpRight size={18} color={T.muted} />
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        </div>
        <Cursor x={cursor[0] - 84} y={cursor[1] - 72} />
      </ConsoleFrame>
    </AbsoluteFill>
  );
};
