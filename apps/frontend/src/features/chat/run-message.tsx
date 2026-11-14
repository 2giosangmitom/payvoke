"use client";

import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessagePrimitive } from "@assistant-ui/react";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { Textarea } from "@/src/components/ui/textarea";
import { ErrorNotice, FormField } from "@/src/components/layout/page-kit";
import { requestRevision, type TimelineRun } from "@/src/features/chat/api";
import { StreamdownText } from "@/src/features/chat/assistant-ui/streamdown-text";
import { FilePart } from "@/src/features/chat/file-part";
import { JobCard } from "@/src/features/chat/job-card";
import { useThreadChat } from "@/src/features/chat/thread-runtime";
import { toolUIs } from "@/src/features/chat/tool-uis";
import { getPendingQuote } from "@/src/features/payments/api";
import { PaymentConfirm } from "@/src/features/payments/payment-confirm";

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
  return <PaymentConfirm embedded quote={quote.data.quote} onPaid={refresh} />;
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

// Once the escrow has settled the job: where the money went, and an invite
// to rate the agent now that the buyer knows how it turned out.
function SettledNote({ run }: { run: TimelineRun }) {
  const { thread } = useThreadChat();
  if (run.outcome !== "released" && run.outcome !== "refunded") return null;
  const appId = thread?.appId;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>
        {run.outcome === "released"
          ? "Payment released to the builder."
          : "Payment refunded to your wallet."}
      </span>
      {appId && (
        <Link
          to="/store/$appId"
          params={{ appId }}
          hash="ratings"
          className="font-medium text-primary hover:underline"
        >
          Rate this agent
        </Link>
      )}
    </p>
  );
}

// A paid job: its card (status, stages, steps and the payment step while
// one is owed), then everything the run produced in order and, once
// delivered, the revision control. Steps live in the card, not the flow.
export function RunBody({ run }: { run: TimelineRun }) {
  return (
    <div className="grid min-w-0 gap-4">
      <JobCard run={run}>
        {run.phase === "awaiting_payment" ? <PaymentStep run={run} /> : null}
      </JobCard>
      <MessagePrimitive.GroupedParts
        indicator="never"
        groupBy={(part) =>
          part.type === "tool-call" && part.toolName === "progress" ? ["group-steps"] : null
        }
      >
        {({ part }) => {
          switch (part.type) {
            case "text":
              return (
                <div className="min-w-0">
                  <StreamdownText />
                </div>
              );
            case "file":
              return <FilePart {...part} />;
            case "tool-call": {
              const Tool = toolUIs[part.toolName as keyof typeof toolUIs];
              if (part.toolName === "progress") return <></>;
              return Tool ? <Tool {...part} /> : <></>;
            }
            default:
              // Steps render in the card; part types the projection never
              // sends render nothing.
              return <></>;
          }
        }}
      </MessagePrimitive.GroupedParts>
      {run.phase === "delivered" && run.outcome === "held" && <RevisionControl run={run} />}
      <SettledNote run={run} />
    </div>
  );
}
