"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CheckIcon, Clock, XIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { formatUsdc } from "@/src/features/apps/format";
import { cn } from "@/src/lib/utils";

export type QuoteTerm = { label: string; value: string };

// Minutes and seconds left until `until`, ticking once a second while open.
function useCountdown(until: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const left = Math.max(0, Math.floor((until - now) / 1000));
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

// An agent's priced offer, read from the API: the amount leads, the terms
// sit in one row of cells, and the decision is the card's footer. Once the
// buyer has decided, the footer becomes a one-line receipt.
export function QuoteCard({
  command,
  amount,
  amountLabel,
  summary,
  terms,
  refund,
  expiresAt,
  open,
  closedLabel,
  closedTone = "neutral",
  busy,
  onAccept,
  onDecline,
  footer,
}: {
  command: string;
  amount: string;
  /** Shown instead of the formatted amount, for previews outside the app. */
  amountLabel?: string | undefined;
  summary: string;
  terms: QuoteTerm[];
  refund?: string | undefined;
  expiresAt: string;
  open: boolean;
  closedLabel?: string | undefined;
  closedTone?: "neutral" | "done";
  busy: "accept" | "decline" | null;
  onAccept: () => void;
  onDecline: () => void;
  footer?: ReactNode;
}) {
  const { left, text } = useCountdown(new Date(expiresAt).getTime(), open);
  const live = open && left > 0;

  return (
    <section
      aria-label={`Offer for /${command}`}
      className={cn(
        "relative grid w-full max-w-lg min-w-0 border bg-card",
        live ? "border-border-strong" : "border-border",
      )}
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Offer</span>
          <code className="font-mono text-primary">/{command}</code>
          {live && (
            <span className="ml-auto flex items-center gap-1.5">
              <Clock aria-hidden className="size-3.5" />
              <span className="sr-only">Valid for </span>
              <span className="font-mono tabular-nums">{text}</span>
            </span>
          )}
        </div>
        <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {amountLabel ?? formatUsdc(amount)}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
      </div>

      {terms.length > 0 && (
        <dl
          className="grid border-t border-border sm:grid-flow-col sm:auto-cols-fr"
          aria-label="Terms"
        >
          {terms.map((term) => (
            <div
              key={term.label}
              className="grid gap-0.5 border-b border-border px-4 py-2.5 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <dt className="text-xs text-muted-foreground">{term.label}</dt>
              <dd className="font-mono text-sm tabular-nums">{term.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {refund && (
        <p className="border-t border-border px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="text-foreground">Refund.</span> {refund}
        </p>
      )}

      <div className="flex min-h-14 flex-wrap items-center gap-2 border-t border-border bg-background-deep px-4 py-2.5">
        {live ? (
          <>
            <p className="mr-auto text-xs text-muted-foreground">
              The vault holds the amount until delivery.
            </p>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={onDecline}>
              {busy === "decline" && <Spinner />} Decline
            </Button>
            <Button size="sm" disabled={busy !== null} onClick={onAccept}>
              {busy === "accept" ? <Spinner /> : null}
              {busy === "accept" ? "Preparing the quote" : "Accept and pay"}
              {busy !== "accept" && <ArrowRight aria-hidden />}
            </Button>
          </>
        ) : (
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            {closedTone === "done" ? (
              <CheckIcon aria-hidden className="size-3.5 text-primary" />
            ) : (
              <XIcon aria-hidden className="size-3.5" />
            )}
            {closedLabel ?? (open ? "Expired" : "Closed")}
          </p>
        )}
      </div>
      {footer}
    </section>
  );
}
