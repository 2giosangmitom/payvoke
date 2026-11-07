import { memo, useState, type ReactNode } from "react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import {
  Activity,
  ArrowUp,
  Blocks,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  FileText,
  House,
  KeyRound,
  MessagesSquare,
  Moon,
  PanelLeft,
  Paperclip,
  Plus,
  Search,
  SquareSlash,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ElicitationForm } from "@/src/components/assistant-ui/elements/elicitation-form";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import type { ProgressArgs, RunPhase } from "@/src/features/chat/api";
import { JobCardView } from "@/src/features/chat/job-card";
import { OpenUISurface } from "@/src/features/chat/openui-surface";
import { QuoteCard } from "@/src/features/chat/quote-card";
import {
  Camera,
  Cursor,
  Grow,
  clamp,
  typed,
  type Shot,
  type Stop,
} from "@/src/features/landing/film/kit";
import {
  file,
  filmDuration,
  goal,
  offer,
  plan,
  program,
  threads,
  wallet,
} from "@/src/features/landing/film/mock";
import { cn } from "@/src/lib/utils";

// The hero film: the console's chat page with one CSV Analyst job, from the
// first message to the delivered dashboard. The screen is a still copy of the
// real page (same classes, same components: ElicitationForm, QuoteCard, the
// job card, OpenUI) fed with sample data; a camera follows the action.
//
// Performance: a scene re-renders on every frame, so anything that does not
// change with the frame is memoized with stable props, and React skips it.

const APP = "CSV Analyst";
const message = `/analyze ${goal}`;

// Frames of the story, in order. Everything below reads from here.
const t = {
  attach: 16,
  type: 26,
  send: 104,
  ask: 124,
  deep: 178,
  sent: 206,
  offer: 226,
  accept: 336,
  accepted: 372,
  job: 380,
  queued: 418,
  running: 432,
  steps: 440,
  stepEvery: 22,
  ui: 500,
  uiEvery: 8,
  verifying: 576,
  delivered: 598,
};
const stepAt = (index: number) => t.steps + index * t.stepEvery;

/* The console around the chat */

const rail = [House, MessagesSquare, Activity, Wallet, KeyRound];
const build = [Blocks, CircleUserRound];

const Rail = memo(function Rail() {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar text-muted-foreground">
      <div className="grid h-12 place-items-center">
        <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className="size-6">
          <g transform="rotate(-8 14 14)" fill="#509475">
            <path d="M3 3h6v6H3zM19 3h6v6h-6zM3 19h6v6H3zM19 19h6v6h-6z" />
            <path d="M11 3h6v6h-6zM3 11h6v6H3zM19 11h6v6h-6zM11 19h6v6h-6z" opacity=".18" />
            <path d="M11 11h6v6h-6z" fill="#bcd6cb" />
          </g>
        </svg>
      </div>
      <div className="grid gap-1.5 pt-2">
        {rail.map((Icon, index) => (
          <span
            key={index}
            className={cn(
              "relative grid size-9 place-items-center",
              index === 1 &&
                "text-foreground after:absolute after:inset-y-1 after:-right-2.5 after:w-px after:bg-primary",
            )}
          >
            <Icon size={18} strokeWidth={1.5} />
          </span>
        ))}
      </div>
      <span className="my-3 h-px w-5 bg-sidebar-border" />
      <div className="grid gap-1.5">
        {build.map((Icon, index) => (
          <span key={index} className="grid size-9 place-items-center">
            <Icon size={18} strokeWidth={1.5} />
          </span>
        ))}
      </div>
      <div className="mt-auto grid gap-3 pb-4 justify-items-center">
        <Store size={18} strokeWidth={1.5} />
        <NetworkAvalancheFuji size={16} aria-hidden="true" />
      </div>
    </div>
  );
});

const TopBar = memo(function TopBar() {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <PanelLeft size={16} className="text-muted-foreground" />
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Console <ChevronRight size={14} /> <span className="text-foreground">Chat</span>
      </span>
      <span className="ml-auto grid size-8 place-items-center text-muted-foreground">
        <Moon size={16} />
      </span>
      <span className="flex h-8 items-center gap-2 border border-border-strong px-3 font-mono text-xs">
        <span className="size-1.5 bg-primary" />
        {wallet}
        <ChevronDown size={14} className="text-muted-foreground" />
      </span>
    </div>
  );
});

const ThreadList = memo(function ThreadList() {
  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-border bg-background-deep p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-primary">Threads</p>
        <span className="flex h-7 items-center gap-1.5 border border-border-strong px-2.5 text-xs">
          <Plus size={14} /> New
        </span>
      </div>
      <span className="relative mt-4 mb-3 flex h-9 items-center gap-2 border border-input bg-background px-3 text-sm text-faint">
        <Search size={14} /> Search threads
      </span>
      <div className="grid gap-1">
        {threads.map((thread, index) => (
          <div
            key={thread.title}
            className={cn(
              "relative flex min-w-0 items-center gap-3 py-2.5 pr-2 pl-3",
              "before:absolute before:inset-y-1.5 before:left-0 before:w-px",
              index === 0 && "bg-card before:bg-primary",
            )}
          >
            <AgentAvatar name={thread.app} className="size-8 text-sm" />
            <span className="grid min-w-0 gap-1">
              <span className="truncate text-[13px] font-semibold">{thread.title}</span>
              <small className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className="size-1.5 shrink-0 bg-primary" />
                {thread.app}
              </small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

const ThreadHeader = memo(function ThreadHeader({ free }: { free: number }) {
  return (
    <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-6 py-3">
      <AgentAvatar name={APP} className="size-10 text-base" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium tracking-[-0.02em]">Q3 revenue drop</p>
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
        {free}/5 free
      </p>
    </div>
  );
});

/* The thread */

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

const FileChip = memo(function FileChip() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <FileText size={14} aria-hidden="true" /> {file.name} · {file.size}
    </span>
  );
});

const UserBubble = memo(function UserBubble() {
  return (
    <div className="grid max-w-[80%] justify-items-end gap-1.5 justify-self-end">
      <div className="grid justify-items-end gap-2 border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
        <p className="leading-relaxed">
          <code className="font-mono text-primary">/analyze</code> {goal}
        </p>
        <FileChip />
      </div>
      <span className="font-mono text-[11px] text-faint">09:21</span>
    </div>
  );
});

function AgentTurn({
  label,
  time,
  children,
}: {
  label?: string;
  time: string;
  children: ReactNode;
}) {
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
        {
          name: "depth",
          label: "Depth",
          kind: "choice",
          options: depths,
          value: deep ? depths[1] : depths[0],
        },
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
  // QuoteCard counts down against the real clock, so the offer opens fifteen
  // minutes from whenever the film is mounted.
  const [expiresAt] = useState(() => new Date(Date.now() + 15 * 60_000).toISOString());
  return (
    <QuoteCard
      command="analyze"
      amount="0"
      amountLabel={offer.price}
      summary={offer.summary}
      terms={offerTerms}
      expiresAt={expiresAt}
      open={open}
      closedLabel="Accepted. Locking the payment on Avalanche."
      closedTone="done"
      busy={busy ? "accept" : null}
      onAccept={noop}
      onDecline={noop}
    />
  );
});

const Job = memo(function Job({ phase, step }: { phase: RunPhase; step: number }) {
  const steps: ProgressArgs[] = plan.slice(0, Math.min(step + 1, plan.length)).map((label, i) => ({
    stepId: String(i),
    label,
    status: i < step ? "done" : "running",
  }));
  return <JobCardView phase={phase} command="analyze" amount="1 USDC" steps={steps} />;
});

const Surface = memo(function Surface({ shown }: { shown: number }) {
  return <OpenUISurface source={program.slice(0, shown).join("\n")} />;
});

const phaseAt = (frame: number): RunPhase =>
  frame >= t.delivered
    ? "delivered"
    : frame >= t.verifying
      ? "verifying"
      : frame >= t.running
        ? "running"
        : frame >= t.queued
          ? "queued"
          : "payment_pending";

function Thread() {
  const frame = useCurrentFrame();
  const step = Math.floor(
    interpolate(frame, [t.steps, stepAt(plan.length)], [0, plan.length], clamp),
  );
  const shown = Math.floor(
    interpolate(frame, [t.ui, t.ui + program.length * t.uiEvery], [0, program.length], clamp),
  );
  return (
    // Anchored to the latest message, like the real viewport: new parts open
    // at the bottom and push the older ones up and out.
    <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-6">
      <Welcome />
      <Grow at={t.send} className="grid pt-7">
        <UserBubble />
      </Grow>
      <Grow at={t.ask} className="pt-7">
        <AgentTurn time="09:21">
          <p className="text-sm leading-relaxed">
            Happy to dig into that file. One question before I price it:
          </p>
          <DepthForm deep={frame >= t.deep + 2} sent={frame >= t.sent + 2} />
        </AgentTurn>
      </Grow>
      <Grow at={t.offer} className="pt-7">
        <AgentTurn time="09:22">
          <Offer open={frame < t.accepted} busy={frame >= t.accept + 2} />
        </AgentTurn>
      </Grow>
      <Grow at={t.job} className="pt-7">
        <AgentTurn label="Paid job" time="09:22">
          <div className="grid min-w-0 gap-4">
            <Job phase={phaseAt(frame)} step={step} />
            {shown > 0 && <Surface shown={shown} />}
          </div>
        </AgentTurn>
      </Grow>
      <div className="h-6 shrink-0" />
    </div>
  );
}

const commandList = [
  ["analyze", "Charts, outliers and a written analysis of a CSV file", "up to 2 USDC"],
  ["profile", "Column-by-column profile: types, missing values, ranges", "up to 0.5 USDC"],
] as const;

const Commands = memo(function Commands({ query }: { query: string }) {
  return (
    <div className="absolute inset-x-0 bottom-full mb-2 grid gap-px border border-border-strong bg-popover p-1 shadow-float">
      {commandList.map(([name, description, price]) => (
        <div
          key={name}
          className={cn(
            "flex items-baseline gap-3 px-2 py-2 text-sm",
            `/${name}`.startsWith(query) ? "opacity-100" : "opacity-35",
            name === "analyze" && query.length > 1 && "bg-muted/60",
          )}
        >
          <code className="font-mono text-primary">/{name}</code>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{description}</span>
          <span className="font-mono text-xs text-faint">{price}</span>
        </div>
      ))}
    </div>
  );
});

function Composer() {
  const frame = useCurrentFrame();
  const sending = frame >= t.send;
  const text = sending ? "" : typed(message, frame, t.type, 0.45);
  const attached = frame >= t.attach && !sending;
  const picking = text.startsWith("/") && !text.includes(" ");
  const focused = frame >= t.attach && frame < t.send + 6;
  const press = interpolate(frame, [t.send - 4, t.send, t.send + 4], [1, 0.9, 1], clamp);
  return (
    <div className="shrink-0 px-6 pb-5">
      <div
        className={cn(
          "relative flex w-full flex-col gap-1 border border-border-strong bg-background p-2",
          focused && "border-primary shadow-[0_0_0_3px_var(--color-primary-soft)]",
        )}
      >
        {picking && <Commands query={text} />}
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

/* The camera and the pointer, in screen pixels (1280×800). */

const wide = { x: 640, y: 400, scale: 1 };
const shots: Shot[] = [
  { at: 0, ...wide },
  { at: 14, ...wide },
  { at: 44, x: 720, y: 690, scale: 1.6 },
  { at: 104, x: 720, y: 690, scale: 1.6 },
  { at: 132, x: 720, y: 560, scale: 1.3 },
  { at: 160, x: 600, y: 560, scale: 1.55 },
  { at: 212, x: 600, y: 560, scale: 1.55 },
  { at: 244, x: 640, y: 520, scale: 1.35 },
  { at: 312, x: 640, y: 540, scale: 1.35 },
  { at: 334, x: 760, y: 640, scale: 1.7 },
  { at: 376, x: 760, y: 640, scale: 1.7 },
  { at: 404, x: 820, y: 560, scale: 1.4 },
  { at: 500, x: 820, y: 560, scale: 1.4 },
  { at: 540, x: 760, y: 470, scale: 1.18 },
  { at: 600, x: 760, y: 470, scale: 1.18 },
  { at: 640, ...wide },
  { at: filmDuration, ...wide },
];

// Targets: the Deep chip and the form's Send, then the offer's Accept button.
const target = {
  deep: { x: 536, y: 574 },
  send: { x: 749, y: 615 },
  accept: { x: 806, y: 620 },
};
const stops: Stop[] = [
  { at: 150, x: 900, y: 760 },
  { at: t.deep, ...target.deep },
  { at: t.deep + 10, ...target.deep },
  { at: t.sent, ...target.send },
  { at: t.sent + 12, ...target.send },
  { at: 300, x: 860, y: 760 },
  { at: t.accept, ...target.accept },
  { at: t.accept + 30, ...target.accept },
];

export function HeroDemo() {
  const frame = useCurrentFrame();
  // The thread fades out at the end and back in at the start, so the loop
  // reads as a new chat in the same console; the chrome never blinks.
  const fade = interpolate(frame, [0, 10, filmDuration - 14, filmDuration], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill className="overflow-hidden bg-background font-sans text-foreground antialiased">
      <Camera shots={shots}>
        <div inert className="flex size-full text-[14px]">
          <Rail />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <div className="flex min-h-0 flex-1">
              <ThreadList />
              <div className="flex min-w-0 flex-1 flex-col bg-card">
                <ThreadHeader free={frame >= t.ask ? 4 : 5} />
                <div className="flex min-h-0 flex-1 flex-col" style={{ opacity: fade }}>
                  <Thread />
                  <Composer />
                </div>
              </div>
            </div>
          </div>
        </div>
        <Cursor stops={stops} clicks={[t.deep, t.sent, t.accept]} />
      </Camera>
    </AbsoluteFill>
  );
}
