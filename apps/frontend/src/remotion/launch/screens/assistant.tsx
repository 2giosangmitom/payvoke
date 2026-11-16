import type { ReactNode } from "react";
import { CircleDollarSign, ShieldCheck } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { VIET } from "@/src/remotion/launch/stage";

// The AI assistant side: a coding assistant's terminal calling Payvoke's MCP
// tools (names and answers from apps/api/src/modules/mcp/mcp.tools.ts), the
// API key's autopay limits (features/keys/api-keys.tsx) and the approval
// page an assistant links to (features/payments/approve-page.tsx).

export type TermLine =
  | { kind: "user"; text: string }
  | { kind: "tool"; name: string; args?: string; result: ReactNode; tone?: "ok" | "warn" }
  | { kind: "say"; text: string }
  | { kind: "agent"; text: string }
  // A shell command, and the plain output lines of a CLI (x402-buyer).
  | { kind: "cmd"; text: string }
  | { kind: "out"; text: ReactNode; tone?: "ok" | "warn" | "dim" };

export function Terminal({
  lines,
  shown,
  title = "claude — ~/sales",
  className,
}: {
  lines: TermLine[];
  /** How many lines are on screen; a fraction types the last one. */
  shown: number;
  title?: string;
  className?: string;
}) {
  const whole = Math.floor(shown);
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden border border-border-strong bg-[#0b1310] shadow-[0_50px_140px_-20px_rgb(0_0_0/0.75)]",
        className,
      )}
    >
      <div className="flex h-11 items-center gap-2 border-b border-border bg-background-deep px-4">
        {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
          <span key={color} className="size-3 rounded-full" style={{ background: color }} />
        ))}
        <span className="mx-auto font-mono text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="flex flex-1 flex-col justify-start gap-4 overflow-hidden p-7 font-mono text-[19px] leading-relaxed">
        {lines.slice(0, Math.ceil(shown)).map((line, index) => {
          const part = index < whole ? 1 : shown - whole;
          return (
            <div key={index} style={{ opacity: Math.min(1, part * 2.5) }}>
              <Line line={line} part={part} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const cut = (text: string, part: number) => text.slice(0, Math.ceil(text.length * Math.min(1, part * 1.4)));

function Line({ line, part }: { line: TermLine; part: number }) {
  if (line.kind === "user")
    return (
      <div className="border border-border bg-background/60 px-4 py-3 text-[#f1f2df]" style={{ fontFamily: `${VIET}` }}>
        <span className="mr-2 font-mono text-primary">&gt;</span>
        {cut(line.text, part)}
      </div>
    );
  if (line.kind === "say")
    return (
      <p className="text-[#f1f2df]" style={{ fontFamily: VIET }}>
        <span className="mr-2 text-[#f1f2df]">⏺</span>
        {cut(line.text, part)}
      </p>
    );
  if (line.kind === "cmd")
    return (
      <p className="text-[#f1f2df]">
        <span className="mr-3 text-primary">$</span>
        {cut(line.text, part)}
      </p>
    );
  if (line.kind === "out")
    return (
      <p
        className={cn(
          "text-[17px]",
          line.tone === "ok" && "text-primary",
          line.tone === "warn" && "font-semibold text-warning",
          line.tone === "dim" && "pl-5 text-muted-foreground",
          !line.tone && "text-[#f1f2df]",
        )}
      >
        {line.text}
      </p>
    );
  if (line.kind === "agent")
    return (
      <div className="border-l-2 border-destructive/70 bg-destructive/10 px-4 py-2 text-[15px] text-[#f0c8ca]">
        <span className="text-xs tracking-wide text-destructive uppercase">agent message · untrusted</span>
        <p>{line.text}</p>
      </div>
    );
  return (
    <div>
      <p>
        <span className={line.tone === "warn" ? "text-warning" : "text-primary"}>⏺</span>{" "}
        <span className="font-semibold text-[#f1f2df]">payvoke · {line.name}</span>
        {line.args && <span className="text-muted-foreground"> ({line.args})</span>}
      </p>
      {part > 0.4 && (
        <div className="flex gap-2 pl-5 text-[15px] text-muted-foreground">
          <span>⎿</span>
          <div className="min-w-0">{line.result}</div>
        </div>
      )}
    </div>
  );
}

/** The payment choice and the three limits of a new API key. */
export function LimitsPanel({ typedTotal = "50", focus = -1 }: { typedTotal?: string; focus?: number }) {
  const field = (label: string, value: string, index: number) => (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div
        className={cn(
          "relative flex h-10 items-center border border-input px-3 font-mono text-sm tabular-nums",
          focus === index && "border-primary shadow-[0_0_0_3px_var(--color-primary-soft)]",
        )}
      >
        {value}
        <span className="absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">USDC</span>
      </div>
    </div>
  );
  return (
    <div className="grid w-[640px] gap-5 border border-border-strong bg-popover p-6 text-foreground shadow-[0_40px_120px_-20px_rgb(0_0_0/0.8)]">
      <div className="grid gap-1">
        <p className="text-lg font-semibold">New API key</p>
        <p className="text-sm text-muted-foreground">
          For Claude Code, Cursor or any MCP client. Choose how it pays.
        </p>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Name</span>
        <div className="flex h-10 items-center border border-input px-3 text-sm">Claude Code</div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Payments</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["Pay by itself up to a limit", "Small jobs are paid at once. Anything above the limit asks you.", true],
              ["Ask me every time", "You get a link to approve each payment.", false],
            ] as const
          ).map(([title, detail, on]) => (
            <label
              key={title}
              className={cn(
                "flex items-start gap-3 border border-border p-3 text-sm",
                on && "border-primary bg-primary-soft",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-input",
                  on && "border-primary",
                )}
              >
                {on && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <span className="grid gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-xs text-muted-foreground">{detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 border-l border-primary pl-4">
        <div className="grid grid-cols-3 items-start gap-3">
          {field("Per job", "2", 0)}
          {field("Per day", "10", 1)}
          {field("In total", typedTotal, 2)}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The agent can pay up to <span className="font-mono text-foreground">2</span> USDC a job and{" "}
          <span className="font-mono text-foreground">10</span> USDC a day,{" "}
          <span className="font-mono text-foreground">{typedTotal}</span> USDC in total, until Dec 14, 2026. The
          day resets at 00:00 UTC and the vault enforces every limit.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <span className="inline-flex h-10 items-center border border-border-strong px-4 text-sm font-medium">
          Cancel
        </span>
        <span className="inline-flex h-10 items-center bg-primary px-4 text-sm font-medium text-primary-foreground">
          Create key
        </span>
      </div>
    </div>
  );
}

/** The approval page, inside the console, for the raised price. */
export function ApproveScreen() {
  return (
    <main className="container-page pt-2 pb-24">
      <header className="grid items-end gap-6 border-b border-border pt-6 pb-5">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.025em]">Approve payment</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted-foreground">
            Your AI assistant wants to pay for this job. Approve only if you asked for it.
          </p>
        </div>
      </header>
      <div className="grid max-w-2xl gap-6 py-8">
        <section className="grid gap-2">
          <h2 className="text-base font-medium">Job for CSV Analyst</h2>
          <pre className="bg-background-deep p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {JSON.stringify({ file: "doanh-thu-2026.csv", goal: "Chi nhánh nào tăng trưởng tốt nhất?", depth: "deep" }, null, 2)}
          </pre>
          <span className="text-sm text-muted-foreground underline underline-offset-4">
            Read the whole chat with CSV Analyst
          </span>
        </section>
        <section data-mark="card" className="grid max-w-lg gap-3 border border-border-strong bg-card p-4">
          <div className="flex items-start gap-3">
            <CircleDollarSign size={18} className="mt-1 shrink-0 text-primary" />
            <div className="grid min-w-0 gap-0.5">
              <strong className="font-mono text-lg font-semibold">$1.80</strong>
              <span className="text-xs text-muted-foreground">
                Quote valid for <span className="font-mono text-foreground">4:22</span> · Avalanche Fuji
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <div>
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="font-mono">10 min</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Review window</dt>
              <dd className="font-mono">30 min</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Refund</dt>
              <dd>Full refund if not delivered</dd>
            </div>
            <div className="col-span-3">
              <dt className="text-muted-foreground">If delivered late</dt>
              <dd>Full refund</dd>
            </div>
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The escrow holds this amount before the agent gets your request and sends it back to your wallet if
            the job isn&apos;t delivered. In your wallet <span className="font-mono text-foreground">23.50 USDC</span>.
          </p>
          <span className="inline-flex h-10 items-center gap-2 justify-self-start bg-primary px-4 text-sm font-medium text-primary-foreground">
            <ShieldCheck size={16} /> Pay $1.80 from wallet
          </span>
        </section>
      </div>
    </main>
  );
}
