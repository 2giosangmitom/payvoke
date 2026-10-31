import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  ErrorNotice,
  PageSkeleton,
  PageHeader,
  PageShell,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { getThread } from "@/src/features/chat/api";
import { getPendingQuote } from "@/src/features/payments/api";
import { PaymentConfirm } from "@/src/features/payments/payment-confirm";

// Where an AI assistant's approval link lands (MCP request_payment). The API
// only returns the quote to the buyer it was issued to, so a link opened by
// anyone else shows nothing. The agent never sees this page or its key.
export function ApprovePage({ quoteId }: { quoteId: string }) {
  const queryClient = useQueryClient();
  const [paid, setPaid] = useState(false);
  const quote = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => getPendingQuote(quoteId),
    staleTime: 10_000,
    enabled: !paid,
  });
  const document = quote.data?.quote ?? null;
  const thread = useQuery({
    queryKey: ["thread", document?.sessionId],
    queryFn: () => getThread(document!.sessionId),
    enabled: Boolean(document),
  });
  const agent = thread.data?.app.name ?? "the agent";
  const threadId = document?.sessionId;

  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="Approve payment"
        description="Your AI assistant wants to pay for this job. Approve only if you asked for it."
      />
      <div className="grid max-w-2xl gap-6 py-8">
        {paid ? (
          <section
            role="status"
            className="grid gap-3 border border-primary/50 bg-primary-soft p-5"
          >
            <p className="flex items-center gap-2 font-medium">
              <CircleCheck size={18} className="text-primary" aria-hidden /> Paid. {agent} is
              starting.
            </p>
            <p className="text-sm text-muted-foreground">
              The vault holds the payment until the job is delivered. You can go back to your coding
              agent; it follows the job with get_job.
            </p>
            {threadId && (
              <Button
                variant="outline"
                className="justify-self-start"
                render={<Link to="/console/chat/$threadId" params={{ threadId }} />}
              >
                Follow the job in the chat
              </Button>
            )}
          </section>
        ) : quote.isPending ? (
          <PageSkeleton label="Loading the payment" />
        ) : quote.isError ? (
          <ErrorNotice onRetry={() => void quote.refetch()}>
            {errorMessage(quote.error, "Couldn't load this payment.")}
          </ErrorNotice>
        ) : !document ? (
          <section className="grid gap-3 border border-border p-5">
            <p className="font-medium">This payment link has expired or was already used.</p>
            <p className="text-sm text-muted-foreground">
              Ask your AI assistant for a new link, or check your payments in Activity.
            </p>
            <Button
              variant="outline"
              className="justify-self-start"
              render={<Link to="/console/activity" />}
            >
              Open Activity
            </Button>
          </section>
        ) : (
          <>
            <section aria-labelledby="job" className="grid gap-2">
              <h2 id="job" className="text-base font-medium">
                Job for {agent}
              </h2>
              <pre className="max-h-64 overflow-auto bg-background-deep p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                {JSON.stringify(document.effectiveArguments, null, 2)}
              </pre>
              {threadId && (
                <Link
                  to="/console/chat/$threadId"
                  params={{ threadId }}
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Read the whole chat with {agent}
                </Link>
              )}
            </section>
            <PaymentConfirm
              quote={document}
              onPaid={async () => {
                setPaid(true);
                await queryClient.invalidateQueries({ queryKey: ["quote", quoteId] });
              }}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
