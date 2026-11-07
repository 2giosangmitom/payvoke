"use client";

import type { ReactNode } from "react";
import { useAuiState } from "@assistant-ui/react";
import { CheckIcon, ChevronDown, Loader2Icon, XIcon } from "lucide-react";
import { formatUsdc } from "@/src/features/apps/format";
import type { OfferArgs, ProgressArgs, RunPhase, TimelineRun } from "@/src/features/chat/api";
import { useThreadChat } from "@/src/features/chat/thread-runtime";
import { cn } from "@/src/lib/utils";

const STAGES = ["Accepted", "Held in vault", "Working", "Verifying", "Delivered"] as const;

type Tone = "live" | "wait" | "done" | "failed";

// Where a phase sits on the five stages, what the buyer reads, and its tone.
const phases: Record<RunPhase, { index: number; label: string; note: string; tone: Tone }> = {
  awaiting_payment: {
    index: 1,
    label: "Waiting for your payment",
    note: "The agent starts once the vault holds the amount.",
    tone: "wait",
  },
  payment_pending: {
    index: 1,
    label: "Holding your payment",
    note: "The vault is locking the amount on Avalanche Fuji.",
    tone: "live",
  },
  payment_expired: {
    index: 1,
    label: "Quote expired",
    note: "Nothing was charged. Accept the offer again for a new quote.",
    tone: "failed",
  },
  payment_rejected: {
    index: 1,
    label: "Payment rejected",
    note: "Nothing was charged.",
    tone: "failed",
  },
  queued: {
    index: 2,
    label: "Queued",
    note: "Paid. Waiting for the agent to pick it up.",
    tone: "live",
  },
  running: { index: 2, label: "Working", note: "The agent is on it.", tone: "live" },
  waiting_buyer: {
    index: 2,
    label: "Needs your answer",
    note: "Answer the request below to continue.",
    tone: "wait",
  },
  verifying: {
    index: 3,
    label: "Verifying",
    note: "Checking the delivery against the terms.",
    tone: "live",
  },
  delivered: {
    index: 4,
    label: "Delivered",
    note: "The vault pays the agent when the review window ends.",
    tone: "done",
  },
  failed: {
    index: 2,
    label: "Failed",
    note: "The vault refunds the full amount.",
    tone: "failed",
  },
};

function StatusMark({ tone }: { tone: Tone }) {
  if (tone === "done") return <CheckIcon aria-hidden className="size-3.5 text-primary" />;
  if (tone === "failed") return <XIcon aria-hidden className="size-3.5 text-destructive" />;
  return (
    <span aria-hidden className="relative grid size-3.5 place-items-center">
      {tone === "live" && (
        <span className="absolute size-2 animate-ping bg-primary/50 motion-reduce:hidden" />
      )}
      <span className={cn("size-2", tone === "live" ? "bg-primary" : "bg-warning")} />
    </span>
  );
}

// Five hairline segments: filled up to the current stage, the current one
// marked by tone. The colour change is the only motion, and it is a state
// change the buyer is waiting for.
function StageBar({ index, tone }: { index: number; tone: Tone }) {
  const complete = tone === "done";
  return (
    <ol aria-label="Job progress" className="grid grid-cols-5 gap-1">
      {STAGES.map((name, i) => {
        const state = i < index || complete ? "done" : i === index ? "current" : "todo";
        return (
          <li
            key={name}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "h-1 transition-[background-color] duration-200 ease-out motion-reduce:transition-none",
              state === "done" && "bg-primary",
              state === "current" &&
                (tone === "failed"
                  ? "bg-destructive"
                  : tone === "wait"
                    ? "bg-warning"
                    : "bg-primary/45"),
              state === "todo" && "bg-border-strong/60",
            )}
          >
            <span className="sr-only">
              {name}: {state === "todo" ? "not started" : state === "done" ? "done" : "current"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepList({ steps }: { steps: ProgressArgs[] }) {
  const done = steps.filter((step) => step.status === "done").length;
  const finished = done === steps.length;
  return (
    <details open={!finished} className="group/steps border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-foreground">Steps</span>
        <span className="font-mono tabular-nums">
          {done}/{steps.length}
        </span>
        <ChevronDown
          aria-hidden
          className="ml-auto size-3.5 transition-transform duration-150 ease-out group-open/steps:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ol className="grid gap-2 px-4 pb-3.5">
        {steps.map((step) => (
          <li key={step.stepId} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 text-sm">
            <span className="grid h-5 place-items-center">
              {step.status === "done" ? (
                <CheckIcon aria-hidden className="size-3.5 text-primary" />
              ) : step.status === "failed" ? (
                <XIcon aria-hidden className="size-3.5 text-destructive" />
              ) : (
                <Loader2Icon
                  aria-hidden
                  className="size-3.5 animate-spin text-foreground motion-reduce:animate-none"
                />
              )}
            </span>
            <span
              className={cn(
                "leading-5 break-words",
                step.status === "done" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
              <span className="sr-only">
                {step.status === "done"
                  ? ", done"
                  : step.status === "failed"
                    ? ", failed"
                    : ", in progress"}
              </span>
            </span>
            {step.detail && step.status === "running" && (
              <span className="col-start-2 text-xs text-muted-foreground">{step.detail}</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

// A paid job as one card: what it is, what it costs, where it stands, and
// its steps. Output the job produced follows the card in the thread.
export function JobCard({ run, children }: { run: TimelineRun; children?: ReactNode }) {
  const chat = useThreadChat();
  const parts = useAuiState((s) => s.message.parts);
  const steps = parts.flatMap((part) =>
    part.type === "tool-call" && part.toolName === "progress"
      ? [part.args as unknown as ProgressArgs]
      : [],
  );
  const offer = [...chat.tools.values()].find(
    (tool) => tool.toolName === "offer" && (tool.args as OfferArgs | null)?.offerId === run.offerId,
  );
  const command = (offer?.args as OfferArgs | undefined)?.command.name;
  return (
    <JobCardView
      phase={run.phase}
      command={command}
      amount={formatUsdc(run.grossAmount)}
      steps={steps}
    >
      {children}
    </JobCardView>
  );
}

/** The job card's markup alone, for anything that already knows the run's state. */
export function JobCardView({
  phase: phaseName,
  command,
  amount,
  steps,
  children,
}: {
  phase: RunPhase;
  command?: string | undefined;
  amount: string;
  steps: ProgressArgs[];
  children?: ReactNode;
}) {
  const phase = phases[phaseName];
  const step = Math.min(phase.index + 1, STAGES.length);

  return (
    <section
      aria-label={`Paid job${command ? ` /${command}` : ""}`}
      className="relative grid min-w-0 border border-border bg-card"
    >
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span role="status" className="flex items-center gap-2 text-sm font-medium">
            <StatusMark tone={phase.tone} />
            <span className={cn(phase.tone === "failed" && "text-destructive")}>{phase.label}</span>
          </span>
          {command && <code className="font-mono text-xs text-primary">/{command}</code>}
          <span className="ml-auto font-mono text-sm tabular-nums">{amount}</span>
        </div>
        <StageBar index={phase.index} tone={phase.tone} />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{phase.note}</span>
          {/* A stopped job has no stage to be at; its label says why. */}
          {phase.tone !== "failed" && (
            <span className="font-mono tabular-nums">
              {phase.tone === "done" ? "Done" : `Stage ${step} of ${STAGES.length}`} ·{" "}
              {STAGES[Math.min(phase.index, STAGES.length - 1)]}
            </span>
          )}
        </div>
      </div>
      {children && <div className="border-t border-border p-4">{children}</div>}
      {steps.length > 0 && <StepList steps={steps} />}
    </section>
  );
}
