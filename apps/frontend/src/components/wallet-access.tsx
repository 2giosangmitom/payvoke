"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { authClient } from "@/src/lib/auth-client";

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function walletError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  if (/reject|denied|cancel|user refused/i.test(message))
    return "The wallet request was cancelled. You can try again.";
  if (/fetch|network|failed to connect/i.test(message))
    return "Cannot reach the authentication service. Check that the API is running.";
  return message.length > 160 ? "Unable to complete the request. Please try again." : message;
}

type WalletAccessProps = { label?: string; variant?: "header" | "hero" | "secondary" };

export function WalletAccess({ label = "Connect wallet", variant = "header" }: WalletAccessProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"sign" | "logout" | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const navigate = useNavigate();
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
      void navigate({ to: "/app" });
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

  const buttonLabel =
    sessionMatches && address ? shortAddress(address) : isConnected && address ? "Sign in" : label;

  return (
    <>
      <Button
        size="lg"
        className={
          variant === "hero"
            ? "wallet-cta wallet-cta-hero"
            : variant === "secondary"
              ? "wallet-cta wallet-cta-secondary"
              : "wallet-cta"
        }
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        aria-label={sessionMatches && address ? `Account ${address}` : buttonLabel}
      >
        {sessionMatches && address ? (
          <span className="online-dot" aria-hidden="true" />
        ) : (
          <Wallet size={16} strokeWidth={1.7} />
        )}
        {buttonLabel}
        {variant === "hero" ? <ArrowRight size={16} /> : <ChevronDown size={14} />}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            setOpen(value);
            setError("");
          }
        }}
      >
        <DialogContent className="wallet-dialog" showCloseButton={!pending}>
          <DialogHeader className="wallet-dialog-header">
            <div className="dialog-symbol">
              <Wallet size={20} strokeWidth={1.5} />
            </div>
            <p className="eyebrow">PAYVOKE / IDENTITY</p>
            <DialogTitle className="wallet-title">
              {sessionMatches ? "Your account" : "Sign in with Ethereum"}
            </DialogTitle>
            <DialogDescription className="wallet-subtitle">
              {sessionMatches
                ? "Your wallet is authenticated on Payvoke."
                : "Connect a wallet and sign a message to continue. No transaction or gas fee is required."}
            </DialogDescription>
          </DialogHeader>

          {!isConnected ? (
            <div className="wallet-options">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  className="wallet-option"
                  disabled={pending}
                  onClick={async () => {
                    setError("");
                    try {
                      await connectAsync({ connector });
                    } catch (cause) {
                      setError(walletError(cause));
                    }
                  }}
                >
                  <span className="wallet-option-icon">
                    {/metamask/i.test(connector.name) ? (
                      <WalletMetamask size={26} />
                    ) : /rabby/i.test(connector.name) ? (
                      <WalletRabby size={26} />
                    ) : (
                      <Wallet size={23} strokeWidth={1.5} />
                    )}
                  </span>
                  <span>{connector.name}</span>
                  {isConnecting ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              ))}
              {connectors.length === 0 && (
                <p className="wallet-help">
                  No injected wallet detected. Install an Ethereum wallet extension to continue.
                </p>
              )}
            </div>
          ) : (
            <div className="wallet-connected">
              <div className="account-row">
                <span className="account-avatar">
                  <Wallet size={20} />
                </span>
                <div>
                  <span className="account-label">CONNECTED WALLET</span>
                  <strong>{address && shortAddress(address)}</strong>
                </div>
                <Check size={17} className="text-primary" />
              </div>
              <div className="chain-row">
                <NetworkAvalancheFuji size={22} />
                <span>Avalanche Fuji</span>
                <span className={correctChain ? "chain-ok" : "chain-wrong"}>
                  {correctChain ? "CONNECTED" : "SWITCH REQUIRED"}
                </span>
              </div>
              {sessionMatches ? (
                <>
                  <div className="wallet-success">
                    <ShieldCheck size={17} /> Signed in securely
                  </div>
                  <Button
                    className="dialog-action"
                    onClick={() => {
                      setOpen(false);
                      void navigate({ to: "/app" });
                    }}
                  >
                    Open workspace <ArrowRight size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    className="dialog-outline"
                    disabled={pending}
                    onClick={logOut}
                  >
                    {busy === "logout" ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <LogOut size={16} />
                    )}{" "}
                    Sign out & disconnect
                  </Button>
                </>
              ) : !correctChain ? (
                <Button
                  className="dialog-action"
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
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <NetworkAvalancheFuji size={19} />
                  )}
                  Switch to Avalanche Fuji
                </Button>
              ) : (
                <Button
                  className="dialog-action"
                  disabled={pending || sessionLoading}
                  onClick={signIn}
                >
                  {busy === "sign" ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                  {busy === "sign" ? "Awaiting signature…" : "Sign in with Ethereum"}
                  {busy !== "sign" && <ArrowRight size={17} />}
                </Button>
              )}
              {!sessionMatches && (
                <button
                  type="button"
                  className="wallet-disconnect"
                  disabled={pending}
                  onClick={async () => {
                    await disconnectAsync();
                    setVerifiedAddress(null);
                  }}
                >
                  Use a different wallet
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="wallet-error" role="alert">
              <X size={15} />
              {error}
            </p>
          )}
          <div className="wallet-dialog-foot">
            <ShieldCheck size={14} /> SECURE SIGN-IN · NO GAS FEES · FUJI TESTNET
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
