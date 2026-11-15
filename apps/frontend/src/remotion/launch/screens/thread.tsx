import { memo, useState, type ReactNode } from "react";
import { ArrowUp, FileText, Paperclip, Plus, ShieldCheck, SquareSlash, X } from "lucide-react";
import { interpolate } from "remotion";
import { ElicitationForm } from "@/src/components/assistant-ui/elements/elicitation-form";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import type { ProgressArgs, RunPhase } from "@/src/features/chat/api";
import { JobCardView } from "@/src/features/chat/job-card";
import { OpenUISurface } from "@/src/features/chat/openui-surface";
import { QuoteCard } from "@/src/features/chat/quote-card";
import { cn } from "@/src/lib/utils";
import { file, offer, plan, program, question } from "@/src/remotion/launch/mock";
import { clamp, out, typed } from "@/src/remotion/launch/stage";

/** Opens from no height to its own at `at` of the thread clock (see landing film's Grow). */
function Grow({ frame, at, className, children }: { frame: number; at: number; className?: string; children: ReactNode }) {
  if (frame < at) return null;
  const k = interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: out });
  return (
    <div className="grid shrink-0" style={{ gridTemplateRows: `${k}fr` }}>
      <div className={cn("min-h-0 overflow-hidden", className)} style={{ opacity: k }}>
        {children}
      </div>
    </div>
  );
}

// The chat with CSV Analyst, from the first message to the delivered
// dashboard: the console's thread page with the real chat components
// (ElicitationForm, QuoteCard, JobCardView, OpenUISurface) and a copy of the
// embedded PaymentConfirm. Every part opens at its cue in `t`.

const APP = "CSV Analyst";

export type ThreadCues = {
  attach: number;
  type: number;
  send: number;
  ask: number;
  deep: number;
  formSent: number;
  offer: number;
  accept: number;
  payClick: number;
  signed: number;
  queued: number;
  running: number;
  steps: number;
  stepEvery: number;
  ui: number;
  uiEvery: number;
  verifying: number;
  delivered: number;
};

const message = `/analyze ${question}`;

export const ThreadHeader = memo(function ThreadHeader({ free }: { free: number }) {
  return (
    <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-6 py-3">
      <AgentAvatar name={APP} className="size-10 text-base" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium tracking-[-0.02em]">Doanh thu 2026</p>
        <p className="flex items-center gap-x-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 bg-primary" />
            {APP} is online
          </span>
          <span>·</span>
          <span>2 commands</span>
        </p>
      </div>
      <p className="shrink-0 border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground tabular-nums">
        {free}/20 free
      </p>
    </div>
  );
});

const Welcome = memo(function Welcome() {
  return (
    <div className="grid shrink-0 justify-items-start gap-4 pb-2">
      <AgentAvatar name={APP} className="size-12 text-xl" />
      <div className="grid gap-2">
        <p className="text-2xl font-medium tracking-[-0.03em]">What should {APP} do?</p>
        <p className="max-w-lg text-sm leading-6 text-muted-foreground">
          Messages and commands are free. {APP} may ask for details, then sends an offer. You pay
          only if you accept it, and the vault holds the amount until the work is delivered.
        </p>
      </div>
    </div>
  );
});

const UserBubble = memo(function UserBubble() {
  return (
    <div data-mark="bubble" className="grid max-w-[80%] justify-items-end gap-1.5 justify-self-end">
      <div className="grid justify-items-end gap-2 border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
        <p className="leading-relaxed">
          <code className="font-mono text-primary">/analyze</code> {question}
        </p>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <FileText size={14} /> {file.name} · {file.size}
        </span>
      </div>
      <span className="font-mono text-[11px] text-faint">09:21</span>
    </div>
  );
});

function AgentTurn({ label, time, children }: { label?: string; time: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-3">
      <AgentAvatar name={APP} className="size-8 text-sm" />
      <div className="grid min-w-0 flex-1 gap-2">
        <span className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{APP}</span>
          {label && <span>{label}</span>}
          <span className="font-mono text-[11px] text-faint">{time}</span>
        </span>
        {children}
      </div>
    </div>
  );
}

const depths = ["Quick, $0.50", "Deep, $1.00"];

const DepthForm = memo(function DepthForm({ deep, sent }: { deep: boolean; sent: boolean }) {
  return (
    <ElicitationForm
      server={APP}
      message="Quick gives key metrics and 2 charts. Deep adds 5 charts, outliers and a longer analysis."
      className="w-[26rem] max-w-none"
      state={sent ? "accepted" : "request"}
      acceptedLabel={`Sent to ${APP}`}
      fields={[
        { name: "file", label: "File", kind: "text", value: `${file.name} · ${file.rows}` },
        { name: "depth", label: "Depth", kind: "choice", options: depths, value: deep ? depths[1] : depths[0] },
      ]}
    />
  );
});

const offerTerms = [
  { label: "Delivery", value: "10 min" },
  { label: "Review", value: "30 min" },
  { label: "Revisions", value: "1 included" },
];
const noop = () => {};

const Offer = memo(function Offer({ open, busy }: { open: boolean; busy: boolean }) {
  const [expiresAt] = useState(() => new Date(Date.now() + 15 * 60_000).toISOString());
  return (
    <QuoteCard
      command="analyze"
      amount="0"
      amountLabel={offer.price}
      summary={offer.summary}
      terms={offerTerms}
      refund="Full automatic refund if the file cannot be parsed or the result is not delivered before the deadline."
      expiresAt={expiresAt}
      open={open}
      closedLabel="Accepted. Waiting for your payment."
      closedTone="done"
      busy={busy ? "accept" : null}
      onAccept={noop}
      onDecline={noop}
    />
  );
});

/** PaymentConfirm, embedded in the job card: one USDC authorization. */
export const PayInWallet = memo(function PayInWallet({ busy, press }: { busy: boolean; press: number }) {
  return (
    <div className="grid gap-3">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Quote valid for <span className="font-mono text-foreground tabular-nums">14:41</span>
        </span>
        <span>
          Wallet <span className="font-mono text-foreground tabular-nums">24.50 USDC</span>
        </span>
      </p>
      <div className="grid gap-2">
        <span
          data-mark="pay"
          className={cn(
            "inline-flex h-10 items-center gap-2 justify-self-start bg-primary px-4 text-sm font-medium text-primary-foreground",
            busy && "opacity-60",
          )}
          style={{ scale: 1 - press * 0.04 }}
        >
          <ShieldCheck size={16} />
          {busy ? "Confirm in your wallet…" : "Pay $1.00 from wallet"}
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your wallet signs one USDC authorization for exactly this job: to the Payvoke escrow, for 1
          USDC. No gas, no deposit. Your wallet shows the amount in USDC&apos;s smallest unit (1000000 =
          1 USDC).
        </p>
      </div>
    </div>
  );
});

const Job = memo(function Job({
  phase,
  step,
  children,
}: {
  phase: RunPhase;
  step: number;
  children?: ReactNode;
}) {
  const steps: ProgressArgs[] = plan.slice(0, Math.min(step + 1, plan.length)).map((label, i) => ({
    stepId: String(i),
    label,
    status: i < step ? "done" : "running",
  }));
  return (
    <JobCardView phase={phase} command="analyze" amount="1 USDC" steps={step < 0 ? [] : steps}>
      {children}
    </JobCardView>
  );
});

const Surface = memo(function Surface({ shown }: { shown: number }) {
  return <OpenUISurface source={program.slice(0, shown).join("\n")} />;
});

function phaseAt(frame: number, t: ThreadCues): RunPhase {
  if (frame >= t.delivered) return "delivered";
  if (frame >= t.verifying) return "verifying";
  if (frame >= t.running) return "running";
  if (frame >= t.queued) return "queued";
  if (frame >= t.signed) return "payment_pending";
  return "awaiting_payment";
}

function Thread({ frame, t }: { frame: number; t: ThreadCues }) {
  const step =
    frame < t.steps
      ? -1
      : Math.floor(interpolate(frame, [t.steps, t.steps + plan.length * t.stepEvery], [0, plan.length], clamp));
  const shown = Math.floor(
    interpolate(frame, [t.ui, t.ui + program.length * t.uiEvery], [0, program.length], clamp),
  );
  const awaiting = frame < t.signed;
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-6">
      <Welcome />
      <Grow frame={frame} at={t.send} className="grid pt-7">
        <UserBubble />
      </Grow>
      <Grow frame={frame} at={t.ask} className="pt-7">
        <AgentTurn time="09:21">
          <p className="text-sm leading-relaxed">
            Mình sẽ phân tích file này. Chọn mức độ trước khi mình báo giá nhé:
          </p>
          <div data-mark="form">
            <DepthForm deep={frame >= t.deep + 2} sent={frame >= t.formSent + 2} />
          </div>
        </AgentTurn>
      </Grow>
      <Grow frame={frame} at={t.offer} className="pt-7">
        <AgentTurn time="09:22">
          <div data-mark="offer">
            <Offer open={frame < t.accept + 8} busy={frame >= t.accept + 2} />
          </div>
        </AgentTurn>
      </Grow>
      <Grow frame={frame} at={t.accept + 10} className="pt-7">
        <AgentTurn label="Paid job" time="09:22">
          <div data-mark="job" className="grid min-w-0 gap-4">
            <Job phase={phaseAt(frame, t)} step={step}>
              {awaiting && (
                <PayInWallet
                  busy={frame >= t.payClick + 3}
                  press={interpolate(frame, [t.payClick - 3, t.payClick, t.payClick + 4], [0, 1, 0], clamp)}
                />
              )}
            </Job>
            {shown > 0 && (
              <div data-mark="surface">
                <Surface shown={shown} />
              </div>
            )}
          </div>
        </AgentTurn>
      </Grow>
      <div className="h-6 shrink-0" />
    </div>
  );
}

function Composer({ frame, t }: { frame: number; t: ThreadCues }) {
  const sending = frame >= t.send;
  const text = sending ? "" : typed(message, frame, t.type, 1.1);
  const attached = frame >= t.attach && !sending;
  const focused = frame >= t.attach && frame < t.send + 6;
  const press = interpolate(frame, [t.send - 4, t.send, t.send + 4], [1, 0.88, 1], clamp);
  return (
    <div data-mark="composer" className="shrink-0 px-6 pb-5">
      <div
        className={cn(
          "relative flex w-full flex-col gap-1 border border-border-strong bg-background p-2",
          focused && "border-primary shadow-[0_0_0_3px_var(--color-primary-soft)]",
        )}
      >
        {attached && (
          <span className="flex w-fit items-center gap-2 border border-border bg-background-deep px-2.5 py-1.5 text-xs">
            <Paperclip size={13} className="text-muted-foreground" />
            {file.name}
            <span className="font-mono text-faint">{file.size}</span>
            <X size={12} className="text-muted-foreground" />
          </span>
        )}
        <p className="min-h-11 px-2 py-1.5 text-[15px] leading-6">
          {text ? (
            <>
              {text}
              <span className="ml-px inline-block h-5 w-px translate-y-1 bg-primary" />
            </>
          ) : (
            <span className="text-faint">Message {APP}, or type / for commands</span>
          )}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="grid size-9 place-items-center">
              <Plus size={18} />
            </span>
            <span className="grid size-9 place-items-center">
              <SquareSlash size={18} />
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-faint">
              Enter to send · Shift+Enter for a new line
            </span>
            <span
              className={cn(
                "grid size-9 place-items-center bg-primary text-primary-foreground",
                !text && "opacity-35",
              )}
              style={{ scale: press }}
            >
              <ArrowUp size={18} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The chat column (header, thread, composer) at `frame` of the thread clock. */
export function ChatColumn({ frame, t }: { frame: number; t: ThreadCues }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-card">
      <ThreadHeader free={frame >= t.ask ? 19 : 20} />
      <div className="flex min-h-0 flex-1 flex-col">
        <Thread frame={frame} t={t} />
        <Composer frame={frame} t={t} />
      </div>
    </div>
  );
}
