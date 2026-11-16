import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, Zap } from "lucide-react";
import type { QuoteDocument } from "@payvoke/shared/x402";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { apiOrigin } from "@/src/lib/api/client";
import { formatUsdc } from "@/src/features/apps/format";
import type { CommandOption, CommandRevision } from "@/src/features/chat/api";
import { SchemaForm } from "@/src/features/chat/schema-form";
import { CodeBlock } from "@/src/features/keys/settings-row";
import { orderInstant, type InstantOrder } from "@/src/features/payments/api";
import { PaymentConfirm } from "@/src/features/payments/payment-confirm";

// A placeholder per argument, typed like the option, for the curl example.
function sampleValue(option: CommandOption) {
  if (option.type === "BOOLEAN") return true;
  if (option.type === "INTEGER" || option.type === "NUMBER") return 1;
  return `<${option.name}>`;
}

export function instantCurl(appId: string, command: string, revision: CommandRevision) {
  const options = revision.options.filter((option) => option.type !== "FILE");
  const required = options.filter((option) => option.required);
  const shown = required.length ? required : options.slice(0, 1);
  const body = JSON.stringify({
    arguments: Object.fromEntries(shown.map((option) => [option.name, sampleValue(option)])),
  });
  const url = new URL(
    `/v1/x402/apps/${encodeURIComponent(appId)}/commands/${encodeURIComponent(command)}`,
    apiOrigin,
  ).href;
  return [
    `curl -i -X POST ${url} \\`,
    `  -H "Authorization: Bearer $PAYVOKE_TOKEN" \\`,
    `  -H "Idempotency-Key: $(uuidgen)" \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${body.replaceAll("'", "'\\''")}'`,
  ].join("\n");
}

// "Hire over x402" under an instant command in the store: the raw 402 round
// trip for scripts and agents, and for a signed-in buyer the same purchase
// from the browser. Both land in a DIRECT thread with no chat.
export function InstantHire({
  appId,
  appName,
  command,
  description,
  revision,
  signedIn,
  available,
}: {
  appId: string;
  appName: string;
  command: string;
  description: string;
  revision: CommandRevision;
  signedIn: boolean;
  available: boolean;
}) {
  const [hiring, setHiring] = useState(false);
  const price = formatUsdc(revision.instantGrossAmount);
  return (
    <details className="group/x402 mt-4 border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 pt-4 text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <Zap aria-hidden className="size-3.5 text-primary" />
        <span className="font-medium text-foreground">Hire over x402</span>
        <span className="font-mono text-xs tabular-nums">{price} · no chat</span>
        <ChevronDown
          aria-hidden
          className="ml-auto size-3.5 transition-transform duration-150 ease-out group-open/x402:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="grid gap-4 pt-4">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          One request, a fixed price. The first call answers{" "}
          <code className="font-mono text-foreground">402</code> with a quote for {price}; sign it
          and send the same request again with{" "}
          <code className="font-mono text-foreground">PAYMENT-SIGNATURE</code>. The vault holds the
          USDC until {appName} delivers, and refunds it if it doesn&apos;t.
        </p>
        <CodeBlock title="402 challenge" code={instantCurl(appId, command, revision)} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {signedIn && (
            <Button disabled={!available} onClick={() => setHiring(true)}>
              <Zap /> {available ? `Hire instantly · ${price}` : "Agent offline"}
            </Button>
          )}
          <Link
            to="/docs/$section"
            params={{ section: "x402" }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            x402 guide <ArrowUpRight size={15} aria-hidden />
          </Link>
        </div>
      </div>
      {hiring && (
        <HireDialog
          appId={appId}
          command={command}
          description={description}
          revision={revision}
          onClose={() => setHiring(false)}
        />
      )}
    </details>
  );
}

// Arguments first, then the quote the 402 carried, paid like any other quote.
function HireDialog({
  appId,
  command,
  description,
  revision,
  onClose,
}: {
  appId: string;
  command: string;
  description: string;
  revision: CommandRevision;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ordered, setOrdered] = useState<{ quote: QuoteDocument; order: InstantOrder } | null>(
    null,
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono text-primary">/{command}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {ordered ? (
          <PaymentConfirm
            quote={ordered.quote}
            order={ordered.order}
            onPaid={async (quote) => {
              await queryClient.invalidateQueries({ queryKey: ["account"] });
              await navigate({
                to: "/console/chat/$threadId",
                params: { threadId: quote.sessionId },
              });
            }}
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Fixed price {formatUsdc(revision.instantGrossAmount)}. You see the quote before
              anything is signed.
            </p>
            <SchemaForm
              schema={revision.inputSchema}
              submitLabel="Get quote"
              submitIcon={<Zap />}
              onSubmit={async (values) =>
                setOrdered(await orderInstant({ appId, command, arguments: values }))
              }
              footer={
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              }
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
