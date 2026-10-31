"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, ShieldCheck, X, Zap } from "lucide-react";
import { useConnection, usePublicClient, useReadContract, useSignTypedData } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import type { Address, Hex } from "viem";
import { vaultAdmissionAbi } from "@payvoke/shared/protocol";
import type { QuoteDocument } from "@payvoke/shared/x402";
import { Button } from "@/src/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { Spinner } from "@/src/components/ui/spinner";
import { ErrorNotice, FormField } from "@/src/components/layout/page-kit";
import { formatUsdc } from "@/src/features/apps/format";
import { authClient } from "@/src/features/auth/auth-client";
import { listGrants } from "@/src/features/keys/grants";
import { checkGrant, submitSigned } from "@/src/features/payments/api";
import { usdc } from "@/src/features/wallet/api";
import {
  browserKeyQuery,
  forgetBrowserKey,
  loadBrowserKey,
  useBrowserKey,
  type BrowserKey,
} from "@/src/features/wallet/browser-key";
import { EnableOneClick } from "@/src/features/wallet/one-click-pay";
import { chainError } from "@/src/features/wallet/vault";
import { QuickDeposit } from "@/src/features/wallet/vault-actions";

const duration = (seconds: number) =>
  seconds >= 3600
    ? `${Math.round(seconds / 360) / 10} h`
    : seconds >= 60
      ? `${Math.round(seconds / 60)} min`
      : `${seconds} s`;
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// Seconds left until `until`, ticking once a second.
function useSecondsLeft(until: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, until - now);
}

// Pays a Payvoke-issued quote. The amount and terms shown always come from
// the quote document, never from chat text. This browser's one-click key
// signs when it has one; otherwise the buyer sets one up with one wallet
// approval, or signs this payment in the wallet with a grant it already has.
export function PaymentConfirm({
  quote,
  onPaid,
  onHide,
  embedded = false,
}: {
  quote: QuoteDocument;
  onPaid: (quote: QuoteDocument) => void | Promise<void>;
  onHide?: () => void;
  // Inside a job card, which already shows the amount, command and terms.
  embedded?: boolean;
}) {
  const vault = quote.vault as Address;
  const buyer = quote.protocolQuote.buyer as Address;
  const amount = BigInt(quote.grossAmount);
  const left = useSecondsLeft(quote.validUntil);
  const queryClient = useQueryClient();
  const { address, chainId } = useConnection();
  const publicClient = usePublicClient({ chainId: avalancheFuji.id });
  const { signTypedDataAsync } = useSignTypedData();
  const { data: session } = authClient.useSession();
  const browserKey = useBrowserKey(vault, buyer);
  const available = useReadContract({
    chainId: avalancheFuji.id,
    address: vault,
    abi: vaultAdmissionAbi,
    functionName: "availableBalance",
    args: [buyer],
    query: { refetchInterval: 15_000 },
  });
  const grants = useQuery({
    queryKey: ["account", session?.user.id, "grants"],
    queryFn: listGrants,
  });
  // Grants the connected wallet itself signs for.
  const walletGrants = (grants.data ?? []).filter(
    (grant) =>
      grant.signer.toLowerCase() === address?.toLowerCase() &&
      grant.buyer.toLowerCase() === buyer.toLowerCase(),
  );
  const [walletGrant, setWalletGrant] = useState("");
  const [signInWallet, setSignInWallet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // validateQuoteDocument already checked these terms before checkout.
  const definition = (quote.termsSnapshot as { definition: Record<string, unknown> })
    .definition as {
    deliverySeconds: number;
    reviewSeconds: number;
    refundPolicy: string;
  };

  const isBuyer = address?.toLowerCase() === buyer.toLowerCase();
  const shortfall =
    available.data !== undefined && available.data < amount ? amount - available.data : 0n;
  const expired = left === 0;

  async function run(pay: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await pay();
      await onPaid(quote);
    } catch (cause) {
      setError(chainError(cause));
    } finally {
      setBusy(false);
    }
  }

  const read = (args: Parameters<Parameters<typeof checkGrant>[4]>[0]) =>
    publicClient!.readContract(args);

  // One click: this browser's key signs; no wallet prompt.
  async function payWithKey(key: BrowserKey) {
    if (!publicClient) throw new Error("Avalanche Fuji is not reachable.");
    let epoch: bigint;
    try {
      ({ epoch } = await checkGrant(quote, key.grantId, buyer, key.signer, read));
    } catch (cause) {
      // A revoked or expired key is no use; set up a new one.
      if (cause instanceof Error && cause.message.startsWith("Grant is missing")) {
        await forgetBrowserKey(vault, buyer);
        await queryClient.invalidateQueries({ queryKey: browserKeyQuery(vault, buyer) });
        throw new Error("This browser's one-click key was revoked or expired. Set it up again.");
      }
      throw cause;
    }
    await submitSigned(quote, key.grantId, epoch, (args) => key.account.signTypedData(args));
  }

  async function payInWallet() {
    const grantId = (walletGrant || walletGrants[0]?.grantId) as Hex | undefined;
    if (!address || chainId !== avalancheFuji.id || !publicClient)
      throw new Error("Connect your wallet on Avalanche Fuji.");
    if (!grantId) throw new Error("This wallet has no grant to sign with.");
    const { epoch } = await checkGrant(quote, grantId, buyer, address, read);
    await submitSigned(quote, grantId, epoch, (args) => signTypedDataAsync(args));
  }

  let action;
  if (expired)
    action = (
      <p className="text-sm text-muted-foreground">
        This quote expired. Accept the offer again for a new one.
      </p>
    );
  else if (browserKey.data && !signInWallet)
    action = (
      <div className="grid gap-2">
        <Button
          disabled={busy || shortfall > 0n}
          className="justify-self-start"
          onClick={() => void run(() => payWithKey(browserKey.data!))}
        >
          {busy ? <Spinner /> : <Zap />} {busy ? "Paying…" : `Pay ${formatUsdc(quote.grossAmount)}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          One-click pay from this browser, within the limits you set.
        </p>
      </div>
    );
  else if (browserKey.isLoading)
    action = <p className="text-sm text-muted-foreground">Checking this browser</p>;
  else if (!isBuyer)
    action = (
      <p className="text-sm text-muted-foreground">
        Connect {short(buyer)}, the wallet this quote is for, to pay.
      </p>
    );
  else if (signInWallet && walletGrants.length)
    action = (
      <div className="grid gap-3">
        {walletGrants.length > 1 && (
          <FormField label="Grant" htmlFor={`grant-${quote.quoteId}`}>
            <NativeSelect
              id={`grant-${quote.quoteId}`}
              value={walletGrant || walletGrants[0].grantId}
              onChange={(event) => setWalletGrant(event.target.value)}
            >
              {walletGrants.map((grant) => (
                <NativeSelectOption key={grant.id} value={grant.grantId}>
                  {grant.name} · {grant.grantId.slice(0, 10)}…
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || shortfall > 0n} onClick={() => void run(payInWallet)}>
            <ShieldCheck /> {busy ? "Confirm in your wallet…" : "Sign in wallet"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setSignInWallet(false)}>
            Use one-click pay
          </Button>
        </div>
      </div>
    );
  else
    action = (
      <div className="grid gap-3 border-t border-border pt-3">
        <p className="text-sm font-medium">Pay in one click from now on</p>
        <EnableOneClick
          vault={vault}
          buyer={buyer}
          needed={amount}
          action={`Enable and pay ${formatUsdc(quote.grossAmount)}`}
          onEnabled={async () => {
            const key = await loadBrowserKey(vault, buyer);
            if (key) await run(() => payWithKey(key));
          }}
        />
        {walletGrants.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => setSignInWallet(true)}
          >
            Sign this one in your wallet instead
          </Button>
        )}
      </div>
    );

  const countdown = expired ? (
    "Quote expired"
  ) : (
    <>
      Quote valid for{" "}
      <span className="font-mono text-foreground tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
      </span>
    </>
  );
  const balance = (
    <span className="font-mono text-foreground tabular-nums">
      {available.data === undefined ? "…" : `${usdc(available.data)} USDC`}
    </span>
  );
  const shortBy = shortfall > 0n && !expired && (
    <div className="grid gap-2 border-l border-warning pl-3">
      <p className="text-sm">
        Your vault is <span className="font-mono tabular-nums">{usdc(shortfall)} USDC</span> short.
      </p>
      {isBuyer ? (
        <QuickDeposit
          token={quote.asset as Address}
          vault={vault}
          address={address}
          amount={shortfall}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Connect {short(buyer)} to deposit.</p>
      )}
    </div>
  );

  if (embedded)
    return (
      <div aria-label="Quote awaiting payment" role="group" className="grid gap-3">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{countdown}</span>
          <span>Vault balance {balance}</span>
        </p>
        {shortBy}
        {action}
        {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
      </div>
    );

  return (
    <section
      aria-label="Quote awaiting payment"
      className="grid max-w-lg gap-3 border border-border-strong bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <CircleDollarSign size={18} className="mt-1 shrink-0 text-primary" aria-hidden />
        <div className="grid min-w-0 gap-0.5">
          <strong className="font-mono text-lg font-semibold">
            {formatUsdc(quote.grossAmount)}
          </strong>
          <span className="text-xs text-muted-foreground">{countdown} · Avalanche Fuji</span>
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
        The vault holds this amount before the agent gets your request and refunds it if the job
        isn&apos;t delivered. Vault balance {balance}.
      </p>
      {shortBy}
      {action}
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
    </section>
  );
}

export { duration as formatDuration };
