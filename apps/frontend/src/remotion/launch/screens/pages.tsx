import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, KeyRound, Lock, RotateCcw } from "lucide-react";
import { interpolate } from "remotion";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { cn } from "@/src/lib/utils";
import { clamp, rise, typed } from "@/src/remotion/launch/stage";

// Two console pages drawn for the launch video: Activity (where each paid
// job's money is) and the builder's Studio. Same shell, classes and
// components as the real pages.

export const Pill = ({ tone, children }: { tone: "held" | "ok" | "warn" | "muted"; children: ReactNode }) => (
  <span
    className={cn(
      "inline-flex h-6 items-center gap-1.5 border px-2 font-mono text-[11px] tracking-wide uppercase",
      tone === "held" && "border-primary/50 bg-primary-soft text-primary",
      tone === "ok" && "border-primary bg-primary text-primary-foreground",
      tone === "warn" && "border-warning/60 bg-warning/10 text-warning",
      tone === "muted" && "border-border-strong text-muted-foreground",
    )}
  >
    {children}
  </span>
);

/* Settlement: the Activity page */

export type JobRow = {
  agent: string;
  command: string;
  amount: string;
  status: ReactNode;
  money: ReactNode;
  tx: string;
  flash: number;
};

export function ActivityScreen({ rows, held, released, refunded }: { rows: JobRow[]; held: string; released: string; refunded: string }) {
  const stat = (label: string, value: string, icon: ReactNode, mark?: string) => (
    <div data-mark={mark} className="grid gap-2 border border-border bg-card p-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-mono text-2xl tabular-nums">{value}</span>
    </div>
  );
  return (
    <main className="flex-1 overflow-hidden px-8 pt-6">
      <h1 className="text-2xl font-semibold tracking-[-0.025em]">Activity</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">Every job you paid for, and where its money is now.</p>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {stat("Held in PayvokeVault", held, <Lock size={14} className="text-primary" />)}
        {stat("Released to builders", released, <ArrowUpRight size={14} />)}
        {stat("Refunded to you", refunded, <ArrowDownLeft size={14} />)}
      </div>
      <div className="mt-6 border border-border">
        <div className="grid grid-cols-[1.6fr_0.8fr_1.4fr_1.5fr_1fr] border-b border-border bg-background-deep px-4 py-2.5 text-xs text-muted-foreground">
          <span>Job</span>
          <span>Amount</span>
          <span>Status</span>
          <span>Settlement</span>
          <span>Transaction</span>
        </div>
        {rows.map((row, i) => (
          <div
            key={i}
            data-mark={`row-${i}`}
            className="grid grid-cols-[1.6fr_0.8fr_1.4fr_1.5fr_1fr] items-center border-b border-border px-4 py-3.5 text-sm last:border-b-0"
            style={{ background: `color-mix(in oklch, var(--t-brand) ${row.flash * 10}%, transparent)` }}
          >
            <span className="flex min-w-0 items-center gap-3">
              <AgentAvatar name={row.agent} className="size-8 text-sm" />
              <span className="grid min-w-0">
                <span className="truncate font-medium">{row.agent}</span>
                <code className="font-mono text-xs text-muted-foreground">/{row.command}</code>
              </span>
            </span>
            <span className="font-mono tabular-nums">{row.amount}</span>
            <span>{row.status}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{row.money}</span>
            <span className="font-mono text-xs text-faint">{row.tx}</span>
          </div>
        ))}
      </div>
    </main>
  );
}


/* Studio: one agent's page, as the builder sees it */

// From features/studio/provider-app.tsx: a new agent's key panel and its
// read-only command list (the agent registers its own commands with PUT
// /commands). The command terms follow
// examples/csv-analyst/src/commands.ts.

const commands = [
  { name: "analyze", isDefault: true, description: "Charts, outliers and a written analysis of a CSV file.", options: "file, goal (optional), depth (optional)", cap: "≤ 2.00 USDC", delivery: "10 min delivery" },
  { name: "profile", isDefault: false, description: "A fast column-by-column profile of a CSV file.", options: "file", cap: "≤ 0.20 USDC", delivery: "2 min delivery" },
];

/** What the agent says to Payvoke, as a short HTTPS log. */
export const feed = [
  { dir: "→", text: "GET …/events", note: "SSE feed · heartbeat" },
  { dir: "→", text: "PUT …/commands", note: "registers /analyze, /profile" },
  { dir: "←", text: "invocation.ready", note: "paid job, 1 USDC held" },
  { dir: "→", text: "POST …/invocations/:id/acks", note: "started" },
  { dir: "→", text: "POST …/invocations/:id/reports", note: "progress" },
  { dir: "→", text: "POST …/ag-ui/streams/:runId", note: "OpenUI dashboard" },
  { dir: "→", text: "POST …/invocations/:id/files", note: "S3 upload, SHA-256" },
  { dir: "→", text: "POST …/invocations/:id/reports", note: "result" },
] as const;

const Section = ({ title, description, mark, children }: { title: string; description: string; mark?: string; children: ReactNode }) => (
  <section data-mark={mark} className="grid gap-3 border-t border-border pt-5">
    <div className="grid gap-1">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {children}
  </section>
);

/**
 * The agent's Studio page at `frame`: the key is generated at `keyAt` (and
 * shown once), the agent's log runs from `feedAt`, one line every `every`
 * frames, and its commands appear when the log reaches `PUT …/commands`.
 */
export function StudioScreen({ frame, keyAt, feedAt, every }: { frame: number; keyAt: number; feedAt: number; every: number }) {
  const issued = frame >= keyAt;
  const lines = Math.floor(interpolate(frame, [feedAt, feedAt + feed.length * every], [0, feed.length], clamp));
  const synced = rise(frame, feedAt + every * 2, 14);
  const press = interpolate(frame, [keyAt - 3, keyAt, keyAt + 5], [0, 1, 0], clamp);
  return (
    <div className="flex min-w-0 flex-1 gap-5 overflow-hidden p-6">
      <div className="grid min-w-0 flex-1 content-start gap-5">
        <div className="flex items-center gap-4">
          <AgentAvatar name="CSV Analyst" className="size-12 text-lg" />
          <div className="grid gap-0.5">
            <span className="text-xl font-semibold tracking-[-0.02em]">CSV Analyst</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 bg-primary" /> Public · {synced > 0.5 ? "2 commands" : "0 commands"}
            </span>
          </div>
        </div>
        <Section mark="key" title="API key" description="Your agent connects to Payvoke with this key. You see it only once, when you generate it.">
          {issued ? (
            <div className="grid gap-2 border border-primary bg-primary-soft p-3">
              <p className="text-sm font-medium">Copy your new key now. For your security it won&apos;t be shown again.</p>
              <code className="block bg-background-deep p-2 font-mono text-xs break-all">
                {typed("pvk_7f3c9a1e04b2d8c6.5e0b9d4c27a1f3e8b6d0c9a4e7f2b1d8c3a6e9f0b4d7c2a5e8f1b3d6c9a0e7f4b2", frame, keyAt, 6)}
              </code>
            </div>
          ) : (
            <div className="grid gap-1">
              <code className="font-mono text-sm">No key</code>
              <p className="text-sm text-muted-foreground">Your agent can&apos;t take jobs until it has a key.</p>
            </div>
          )}
          <span
            data-mark="generate"
            className={cn(
              "inline-flex h-9 items-center gap-2 justify-self-start px-3 text-sm font-medium",
              issued ? "border border-border-strong" : "bg-primary text-primary-foreground",
            )}
            style={{ scale: 1 - 0.05 * press }}
          >
            {issued ? <RotateCcw size={15} /> : <KeyRound size={15} />}
            {issued ? "Reset key" : "Generate key"}
          </span>
        </Section>
        <Section mark="commands" title="Commands" description="What buyers can ask this agent for. The agent registers its own commands.">
          {synced <= 0 ? (
            <p className="text-sm text-muted-foreground">No commands yet. They appear here once your agent registers them.</p>
          ) : (
            <ul className="grid gap-4" style={{ opacity: synced }}>
              {commands.map((command) => (
                <li key={command.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm text-primary">/{command.name}</code>
                      {command.isDefault && <span className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Default</span>}
                    </div>
                    <p className="mt-1 text-sm leading-6">{command.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{command.options}</p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p className="font-mono text-foreground tabular-nums">{command.cap}</p>
                    <p className="text-xs">{command.delivery}</p>
                    <p className="text-xs">Late: full refund</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <div
        data-mark="feed"
        className="grid w-[300px] shrink-0 content-start self-start border border-border-strong bg-[#0b1310] font-mono text-[12px]"
        style={{ opacity: rise(frame, feedAt - 12, 12) }}
      >
        <span className="border-b border-white/10 px-4 py-2.5 text-[11px] text-[#9fb0a6]">agent ⇄ /v1/provider/apps/:appId</span>
        <div className="grid gap-2.5 p-4">
          {feed.slice(0, lines).map((line, i) => (
            <span key={i} className="grid grid-cols-[14px_1fr] gap-2">
              <span className={line.dir === "←" ? "text-[#7fc4a1]" : "text-[#e3b36a]"}>{line.dir}</span>
              <span className="grid gap-0.5">
                <span className="text-[#eef0e4]">{line.text}</span>
                <span className="text-[11px] text-[#8a9a90]">{line.note}</span>
              </span>
            </span>
          ))}
          {lines < feed.length && frame >= feedAt && <span className="h-4 w-2 bg-[#7fc4a1]" />}
        </div>
      </div>
    </div>
  );
}
