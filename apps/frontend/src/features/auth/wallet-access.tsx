"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useConnect, useConnection, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { createSiweMessage } from "viem/siwe";
import { isAddress } from "viem";
import { NetworkAvalancheFuji, WalletMetamask, WalletRabby } from "@web3icons/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { authClient } from "@/src/features/auth/auth-client";
import { cn } from "@/src/lib/utils";

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function walletError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  if (/reject|denied|cancel|user refused/i.test(message))
    return "The wallet request was cancelled. You can try again.";
  if (/fetch|network|failed to connect/i.test(message))
    return "Sign-in is unavailable right now. Please try again shortly.";
  return message.length > 160 ? "Unable to complete the request. Please try again." : message;
}

type WalletAccessProps = { label?: string; variant?: "header" | "hero" | "secondary" };

export function WalletAccess({ label = "Sign in", variant = "header" }: WalletAccessProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"sign" | "logout" | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, chainId, isConnected } = useConnection();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { data: session, isPending: sessionLoading, refetch } = authClient.useSession();

  const sessionAddress = session?.user?.name;
  const sessionMatches = Boolean(
    session &&
    address &&
    ((sessionAddress &&
      isAddress(sessionAddress) &&
      sessionAddress.toLowerCase() === address.toLowerCase()) ||
      (verifiedAddress && verifiedAddress.toLowerCase() === address.toLowerCase())),
  );
  const correctChain = chainId === avalancheFuji.id;
  const pending = isConnecting || isSwitching || busy !== null;

  async function signIn() {
    if (!address || !isConnected || !correctChain) return;
    setBusy("sign");
    setError("");
    try {
      // Sign out an earlier session when authenticating a different wallet.
      if (session && !sessionMatches) {
        const signOut = await authClient.signOut();
        if (signOut.error) throw new Error(signOut.error.message);
        queryClient.removeQueries({ queryKey: ["account"] });
      }
      const challenge = await authClient.siwe.nonce();
      if (challenge.error || !challenge.data?.nonce) {
        throw new Error(challenge.error?.message || "Could not generate a sign-in challenge.");
      }
      const issuedAt = new Date();
      const message = createSiweMessage({
        address,
        chainId: avalancheFuji.id,
        domain: window.location.host,
        uri: window.location.origin,
        version: "1",
        nonce: challenge.data.nonce,
        issuedAt,
        expirationTime: new Date(issuedAt.getTime() + 5 * 60 * 1000),
      });
      const signature = await signMessageAsync({ message });
      const verified = await authClient.siwe.verify({ message, signature });
      if (verified.error || !verified.data) {
        throw new Error(verified.error?.message || "Signature verification failed.");
      }
      setVerifiedAddress(address);
      await refetch();
      setOpen(false);
      void navigate({ to: "/console" });
    } catch (cause) {
      setError(walletError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function logOut() {
    setBusy("logout");
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
      queryClient.removeQueries({ queryKey: ["account"] });
      setVerifiedAddress(null);
      await disconnectAsync();
      await refetch();
      setOpen(false);
      void navigate({ to: "/" });
    } catch (cause) {
      setError(walletError(cause));
    } finally {
      setBusy(null);
    }
  }

  const signedIn = sessionMatches && address;
  const buttonLabel = signedIn ? shortAddress(address) : isConnected && address ? "Sign in" : label;
  const openDialog = () => {
    setError("");
    setOpen(true);
  };

  return (
    <>
      {variant === "header" ? (
        // In the site header: a quiet text button while signed out, the
        // account's address once signed in.
        <Button
          variant={signedIn ? "outline" : "ghost"}
          className="h-10 px-3"
          onClick={openDialog}
          aria-label={signedIn ? `Account ${address}` : buttonLabel}
        >
          {signedIn && <span aria-hidden="true" className="size-2 bg-primary" />}
          <span className={cn(signedIn && "font-mono text-[13px] max-sm:hidden")}>
            {buttonLabel}
          </span>
          {signedIn && <ChevronDown className="max-sm:hidden" />}
        </Button>
      ) : (
        <Button
          size="lg"
          variant={variant === "secondary" ? "outline" : "default"}
          onClick={openDialog}
          aria-label={signedIn ? `Account ${address}` : buttonLabel}
        >
          {signedIn ? (
            <span aria-hidden="true" className="size-1.5 bg-current" />
          ) : (
            <Wallet strokeWidth={1.7} />
          )}
          <span>{buttonLabel}</span>
          {variant === "hero" ? <ArrowRight /> : <ChevronDown />}
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            setOpen(value);
            setError("");
          }
        }}
      >
        <DialogContent className="gap-5 sm:max-w-md" showCloseButton={!pending}>
          <DialogHeader className="gap-3">
            <div className="grid size-11 place-items-center border border-border-strong bg-background-deep text-primary">
              <Wallet size={20} strokeWidth={1.5} />
            </div>
            <DialogTitle className="text-2xl">
              {sessionMatches ? "Your account" : "Sign in"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {sessionMatches
                ? "This wallet is signed in to Payvoke."
                : "Connect a wallet and sign a message. There is no transaction and no gas fee."}
            </DialogDescription>
          </DialogHeader>

          {!isConnected ? (
            <div className="grid gap-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  disabled={pending}
                  className="flex items-center gap-3 border border-border bg-background-deep px-4 py-3 text-left text-sm font-medium transition-colors hover:border-primary disabled:opacity-50"
                  onClick={async () => {
                    setError("");
                    try {
                      await connectAsync({ connector });
                    } catch (cause) {
                      setError(walletError(cause));
                    }
                  }}
                >
                  <span className="grid size-8 place-items-center">
                    {/metamask/i.test(connector.name) ? (
                      <WalletMetamask size={26} />
                    ) : /rabby/i.test(connector.name) ? (
                      <WalletRabby size={26} />
                    ) : (
                      <Wallet size={23} strokeWidth={1.5} />
                    )}
                  </span>
                  <span className="flex-1">{connector.name}</span>
                  {isConnecting ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <ArrowRight size={17} className="text-primary" />
                  )}
                </button>
              ))}
              {connectors.length === 0 && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No browser wallet found. Install a wallet such as MetaMask or Rabby to continue.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center gap-3 border border-border bg-background-deep p-3.5">
                <span className="grid size-9 place-items-center bg-primary-soft text-primary">
                  <Wallet size={18} />
                </span>
                <div className="grid flex-1 gap-0.5">
                  <span className="font-mono text-[10px] tracking-wider text-faint uppercase">
                    Connected wallet
                  </span>
                  <strong className="font-mono text-sm font-medium">
                    {address && shortAddress(address)}
                  </strong>
                </div>
                <Check size={17} className="text-primary" />
              </div>
              <div className="flex items-center gap-2.5 border border-border px-3.5 py-2.5 text-sm">
                <NetworkAvalancheFuji size={20} />
                <span className="flex-1">Avalanche Fuji</span>
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-wider uppercase",
                    correctChain ? "text-primary" : "text-warning",
                  )}
                >
                  {correctChain ? "Connected" : "Switch required"}
                </span>
              </div>
              {sessionMatches ? (
                <>
                  <p className="flex items-center gap-2 text-sm text-primary">
                    <ShieldCheck size={16} /> Signed in
                  </p>
                  <Button
                    size="lg"
                    onClick={() => {
                      setOpen(false);
                      void navigate({ to: "/console" });
                    }}
                  >
                    Open console <ArrowRight />
                  </Button>
                  <Button size="lg" variant="outline" disabled={pending} onClick={logOut}>
                    {busy === "logout" ? <LoaderCircle className="animate-spin" /> : <LogOut />}
                    Sign out and disconnect
                  </Button>
                </>
              ) : !correctChain ? (
                <Button
                  size="lg"
                  disabled={pending}
                  onClick={async () => {
                    setError("");
                    try {
                      await switchChainAsync({ chainId: avalancheFuji.id });
                    } catch (cause) {
                      setError(walletError(cause));
                    }
                  }}
                >
                  {isSwitching ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <NetworkAvalancheFuji size={19} />
                  )}
                  Switch to Avalanche Fuji
                </Button>
              ) : (
                <Button size="lg" disabled={pending || sessionLoading} onClick={signIn}>
                  {busy === "sign" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                  {busy === "sign" ? "Waiting for signature…" : "Sign in"}
                  {busy !== "sign" && <ArrowRight />}
                </Button>
              )}
              {!sessionMatches && (
                <Button
                  variant="link"
                  size="sm"
                  className="justify-self-center text-muted-foreground"
                  disabled={pending}
                  onClick={async () => {
                    await disconnectAsync();
                    setVerifiedAddress(null);
                  }}
                >
                  Use a different wallet
                </Button>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 bg-destructive-soft px-3.5 py-3 text-sm text-destructive"
            >
              <X size={15} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
          <p className="flex items-center gap-2 border-t border-border pt-4 font-mono text-[10px] tracking-wide text-faint">
            <ShieldCheck size={13} /> Signing only proves you own the wallet. No gas.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
