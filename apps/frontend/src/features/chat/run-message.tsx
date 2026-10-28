"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagePrimitive, useAuiState } from "@assistant-ui/react";
import { AgentPlan } from "@/src/components/assistant-ui/elements/agent-plan";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { Textarea } from "@/src/components/ui/textarea";
import { ErrorNotice, FormField } from "@/src/components/layout/page-kit";
import { formatUsdc } from "@/src/features/apps/format";
import {
  requestRevision,
  type ProgressArgs,
  type RunPhase,
  type TimelineRun,
} from "@/src/features/chat/api";
import { StreamdownText } from "@/src/features/chat/assistant-ui/streamdown-text";
import { FilePart } from "@/src/features/chat/file-part";
import { useThreadChat } from "@/src/features/chat/thread-runtime";
import { toolUIs } from "@/src/features/chat/tool-uis";
import { getPendingQuote } from "@/src/features/payments/api";
import { PaymentConfirm } from "@/src/features/payments/payment-confirm";
import { cn } from "@/src/lib/utils";

const STAGES = ["Accepted", "Held in vault", "Working", "Verifying", "Delivered"] as const;

// Where a phase sits on the strip, what the current stage is called, and
// whether the run stopped there.
const stage: Record<RunPhase, { index: number; label: string; failed?: boolean }> = {
  awaiting_payment: { index: 1, label: "Awaiting your payment" },
  payment_pending: { index: 1, label: "Holding payment" },
  payment_expired: { index: 1, label: "Quote expired", failed: true },
  payment_rejected: { index: 1, label: "Payment rejected", failed: true },
  queued: { index: 2, label: "Queued" },
  running: { index: 2, label: "Working" },
  waiting_buyer: { index: 2, label: "Needs your answer" },
  verifying: { index: 3, label: "Verifying" },
  delivered: { index: 4, label: "Delivered" },
  failed: { index: 2, label: "Failed, refund due", failed: true },
};

// The signature of a paid job: its path from offer to delivery as one line of
// stages. The current stage carries the console's only accent mark, a 1px
// line exactly as wide as its label.
export function RunStrip({ run }: { run: TimelineRun }) {
  const current = stage[run.phase];
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border pb-2">
      <ol aria-label="Job progress" className="flex flex-wrap items-end gap-x-5 gap-y-1 text-xs">
        {STAGES.map((name, index) => {
          const done = index < current.index || (index === 4 && run.phase === "delivered");
          const here = index === current.index;
          return (
            <li
              key={name}
              aria-current={here ? "step" : undefined}
              className={cn(
                "relative pb-1.5",
                here
                  ? current.failed
                    ? "text-destructive"
                    : "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-faint",
              )}
            >
              {here ? current.label : name}
              {here && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 -bottom-[9px] h-px",
                    current.failed ? "bg-destructive" : "bg-primary",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <span className="pb-1.5 font-mono text-xs text-muted-foreground">
        {formatUsdc(run.grossAmount)}
      </span>
    </div>
  );
}

function PaymentStep({ run }: { run: TimelineRun }) {
  const { refresh } = useThreadChat();
  const quote = useQuery({
    queryKey: ["quote", run.quoteId],
    queryFn: () => getPendingQuote(run.quoteId),
    staleTime: 10_000,
  });
  if (quote.isPending) return <p className="text-sm text-muted-foreground">Loading the quote</p>;
  if (!quote.data?.quote)
    return <p className="text-sm text-muted-foreground">This quote can no longer be paid.</p>;
  return <PaymentConfirm quote={quote.data.quote} onPaid={refresh} />;
}

function RevisionControl({ run }: { run: TimelineRun }) {
  const { refresh } = useThreadChat();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const left = run.revisions.included - run.revisions.used;
  if (left <= 0) return null;
  if (!open)
    return (
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        Request a revision <span className="font-mono text-muted-foreground">{left} left</span>
      </Button>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestRevision(run.invocationId, reason, crypto.randomUUID());
      setReason("");
      setOpen(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="grid max-w-lg gap-3" onSubmit={(event) => void submit(event)}>
      <FormField label="What should change?" htmlFor={`revision-${run.invocationId}`}>
        <Textarea
          id={`revision-${run.invocationId}`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={2000}
        />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner />} Request revision
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
    </form>
  );
}

// Consecutive progress reports as one plan, the first unfinished step live.
function Steps({ indices }: { indices: readonly number[] }) {
  const parts = useAuiState((s) => s.message.parts);
  const steps = indices.flatMap((index) => {
    const part = parts[index];
    return part?.type === "tool-call" ? [part.args as unknown as ProgressArgs] : [];
  });
  const active = steps.findIndex((step) => step.status !== "done");
  return (
    <AgentPlan
      title="Steps"
      steps={steps.map((step) => ({
        id: step.stepId,
        label: step.label,
        description: step.detail,
      }))}
      activeIndex={active === -1 ? steps.length : active}
      className="max-w-md border-l border-border pl-4"
    />
  );
}

// A paid job: its strip, the payment step while one is owed, then everything
// the run produced in order (steps grouped, text as markdown, tools inline)
// and the verified result.
export function RunBody({ run }: { run: TimelineRun }) {
  return (
    <div className="grid min-w-0 gap-4">
      <RunStrip run={run} />
      {run.phase === "awaiting_payment" && <PaymentStep run={run} />}
      <MessagePrimitive.GroupedParts
        indicator="never"
        groupBy={(part) =>
          part.type === "tool-call" && part.toolName === "progress" ? ["group-steps"] : null
        }
      >
        {({ part }) => {
          switch (part.type) {
            case "group-steps":
              return <Steps indices={part.indices} />;
            case "text":
              return (
                <div className="min-w-0 max-w-[72ch]">
                  <StreamdownText />
                </div>
              );
            case "file":
              return <FilePart {...part} />;
            case "tool-call": {
              const Tool = toolUIs[part.toolName as keyof typeof toolUIs];
              return Tool ? <Tool {...part} /> : <></>;
            }
            default:
              // Part types the projection never sends render nothing.
              return <></>;
          }
        }}
      </MessagePrimitive.GroupedParts>
      {run.phase === "delivered" && <RevisionControl run={run} />}
    </div>
  );
}
