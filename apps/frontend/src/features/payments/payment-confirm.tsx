"use client";

import { useState } from "react";
import { CircleDollarSign, ShieldCheck, X } from "lucide-react";
import { useConnection, usePublicClient, useSignTypedData } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { isHex, type Address, type Hex } from "viem";
import type { QuoteDocument } from "@payvoke/shared/x402";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ErrorNotice, FormField } from "@/src/components/layout/page-kit";
import { formatUsdc } from "@/src/features/apps/format";
import { checkGrant, submitSigned } from "@/src/features/payments/api";

const readableError = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Request failed.";
const duration = (seconds: number) =>
  seconds >= 3600
    ? `${Math.round(seconds / 360) / 10} h`
    : seconds >= 60
      ? `${Math.round(seconds / 60)} min`
      : `${seconds} s`;

// Signs a Payvoke-issued quote with the buyer's delegated grant. The amount
// and terms shown always come from the quote document, never from chat text.
export function PaymentConfirm({
  quote,
  onPaid,
  onHide,
}: {
  quote: QuoteDocument;
  onPaid: (quote: QuoteDocument) => void | Promise<void>;
  onHide?: () => void;
}) {
  const [grantId, setGrantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { address, chainId } = useConnection();
  const publicClient = usePublicClient({ chainId: avalancheFuji.id });
  const { signTypedDataAsync } = useSignTypedData();
  // validateQuoteDocument already checked these terms before checkout.
  const definition = (quote.termsSnapshot as { definition: Record<string, unknown> })
    .definition as {
    deliverySeconds: number;
    reviewSeconds: number;
    refundPolicy: string;
  };

  async function authorize() {
    if (!address || chainId !== avalancheFuji.id || !publicClient)
      throw new Error("Connect the authorized signer wallet on Avalanche Fuji.");
    if (!isHex(grantId, { strict: true }) || grantId.length !== 66)
      throw new Error("Enter a valid 32-byte delegated grant ID.");
    const buyer = quote.protocolQuote.buyer as Address;
    const { epoch } = await checkGrant(quote, grantId as Hex, buyer, address, (args) =>
      publicClient.readContract(args),
    );
    await submitSigned(quote, grantId as Hex, epoch, (args) => signTypedDataAsync(args));
    await onPaid(quote);
  }

  return (
    <section
      aria-label="Quote awaiting authorization"
      className="grid max-w-lg gap-3 border border-border-strong bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <CircleDollarSign size={18} className="mt-1 shrink-0 text-primary" aria-hidden />
        <div className="grid min-w-0 gap-0.5">
          <strong className="font-mono text-lg font-semibold">
            {formatUsdc(quote.grossAmount)}
          </strong>
          <span className="text-xs text-muted-foreground">
            Quote valid until{" "}
            <span className="font-mono">
              {new Date(quote.validUntil * 1000).toLocaleTimeString()}
            </span>{" "}
            · Avalanche Fuji
          </span>
        </div>
        {onHide && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={onHide}
            aria-label="Hide quote"
          >
            <X />
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="font-mono">{duration(definition.deliverySeconds)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Review window</dt>
          <dd className="font-mono">{duration(definition.reviewSeconds)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-muted-foreground">Refund</dt>
          <dd className="break-words">{definition.refundPolicy}</dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The vault holds this amount before the app gets your request. The delivery counts as
        unverified until Payvoke checks it.
      </p>
      <FormField label="Delegated grant ID (bytes32)" htmlFor={`grant-${quote.quoteId}`}>
        <Input
          id={`grant-${quote.quoteId}`}
          value={grantId}
          onChange={(event) => setGrantId(event.target.value)}
          placeholder="0x…"
          autoComplete="off"
          className="bg-background font-mono"
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            setError("");
            setBusy(true);
            void authorize()
              .catch((cause) => setError(readableError(cause)))
              .finally(() => setBusy(false));
          }}
        >
          <ShieldCheck /> {busy ? "Authorizing…" : "Authorize in wallet"}
        </Button>
        {onHide && (
          <Button variant="outline" onClick={onHide} disabled={busy}>
            Hide
          </Button>
        )}
      </div>
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
    </section>
  );
}

export { duration as formatDuration };
