import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeftIcon, ArrowRightIcon, MailCheckIcon, MailIcon, WalletIcon } from "lucide-react";
import { siSupabase } from "simple-icons";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { WalletSignIn } from "~/components/wallet-sign-in";
import { getSupabase } from "~/lib/supabase";

function accountLabel(user: User): string {
  if (user.email) return user.email;
  const address = user.identities?.find((identity) => identity.provider === "web3")?.identity_data
    ?.address;
  return typeof address === "string" ? address : "Wallet account";
}

export function SignInDialog() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const resendAvailableAt = useRef(0);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"methods" | "email" | "sent" | "wallet" | "other-wallets">(
    "methods",
  );
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [walletPending, setWalletPending] = useState(false);
  const busy = pending || walletPending;
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedInAccount, setSignedInAccount] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    try {
      const auth = getSupabase().auth;
      const {
        data: { subscription },
      } = auth.onAuthStateChange((_event, session) => {
        authEventReceived = true;
        if (active) {
          setSignedInAccount(session ? accountLabel(session.user) : null);
          setCheckingSession(false);
          if (session) setOpen(false);
        }
      });
      void auth
        .getSession()
        .then(({ data, error: sessionError }) => {
          if (active && !authEventReceived) {
            if (sessionError) setError("Couldn't restore your session. Please sign in again.");
            setSignedInAccount(data.session ? accountLabel(data.session.user) : null);
          }
        })
        .catch(() => {
          if (active) setError("Couldn't restore your session. Please sign in again.");
        })
        .finally(() => {
          if (active) setCheckingSession(false);
        });
      return () => {
        active = false;
        subscription.unsubscribe();
      };
    } catch {
      setCheckingSession(false);
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldown(Math.max(0, Math.ceil((resendAvailableAt.current - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!pending) contentRef.current?.querySelector<HTMLElement>("[data-auth-focus]")?.focus();
  }, [step, pending]);

  async function sendLink() {
    if (busy) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const recipient = email.trim();
      const { error: authError } = await getSupabase().auth.signInWithOtp({
        email: recipient,
        options: { emailRedirectTo: new URL("/", window.location.origin).href },
      });
      if (authError) {
        setError(
          authError.status === 429
            ? "Too many requests. Please wait a moment before trying again."
            : "Couldn't send your sign-in link. Check your email address and try again.",
        );
        return;
      }
      setEmail(recipient);
      setStep("sent");
      resendAvailableAt.current = Date.now() + 60_000;
      setCooldown(60);
      setNotice("Sign-in link sent. Check your inbox and spam folder.");
    } catch {
      setError("Sign-in is unavailable. Check your connection or contact the site administrator.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "email") void sendLink();
  }

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const { error: authError } = await getSupabase().auth.signOut();
      if (authError) throw authError;
      setSignedInAccount(null);
      setStep("methods");
      setEmail("");
      setNotice("");
    } catch {
      setError("Couldn't sign out. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (signedInAccount) {
    return (
      <div className="flex max-w-full flex-col items-start gap-3">
        <p role="status" className="max-w-full truncate text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{signedInAccount}</span>
        </p>
        <Button variant="outline" disabled={pending} onClick={signOut}>
          {pending ? "Signing out…" : "Sign out"}
        </Button>
        {error && <FieldError>{error}</FieldError>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" disabled={checkingSession} />}>
        {checkingSession ? "Checking session…" : "Sign in"}
        <ArrowRightIcon data-icon="inline-end" />
      </DialogTrigger>
      <DialogContent
        ref={contentRef}
        initialFocus={() =>
          contentRef.current?.querySelector<HTMLElement>("[data-auth-focus]") ?? true
        }
        className="flex min-h-[280px] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-y-auto pt-10 motion-reduce:animate-none"
      >
        {step !== "methods" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            className="absolute top-2 left-2"
            disabled={busy}
            onClick={() => {
              setStep(step === "sent" ? "email" : step === "other-wallets" ? "wallet" : "methods");
              setError("");
              setNotice("");
            }}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
        )}
        <DialogHeader className="items-center gap-3 text-center">
          {step === "sent" && (
            <div
              className="flex size-10 items-center justify-center rounded-lg bg-muted"
              aria-hidden="true"
            >
              <MailCheckIcon className="size-5 text-muted-foreground" />
            </div>
          )}
          {(step === "wallet" || step === "other-wallets") && (
            <div
              className="flex size-10 items-center justify-center rounded-lg bg-muted"
              aria-hidden="true"
            >
              <WalletIcon className="size-5 text-muted-foreground" />
            </div>
          )}
          <DialogTitle>
            {step === "methods"
              ? "Log in or sign up"
              : step === "email"
                ? "Continue with email"
                : step === "sent"
                  ? "Check your inbox"
                  : "Select your wallet"}
          </DialogTitle>
          <DialogDescription
            className={step === "email" || step === "sent" ? "text-sm leading-relaxed" : "sr-only"}
          >
            {step === "methods" ? (
              "Choose email or a wallet to sign in to AgentNe."
            ) : step === "wallet" || step === "other-wallets" ? (
              "Choose the wallet you want to sign in with."
            ) : step === "email" ? (
              "Sign in or create an account with your email."
            ) : (
              <>
                We sent a sign-in link to{" "}
                <span className="break-all font-medium text-foreground">{email.trim()}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {step === "methods" && (
          <div className="mt-6 flex flex-col gap-2">
            <Button
              data-auth-focus
              type="button"
              variant="outline"
              size="lg"
              className="w-full justify-start gap-3"
              onClick={() => {
                setStep("email");
                setError("");
              }}
            >
              <span
                className="flex size-6 items-center justify-center rounded-md bg-muted"
                aria-hidden="true"
              >
                <MailIcon className="size-4 text-muted-foreground" />
              </span>
              Continue with email
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full justify-start gap-3"
              onClick={() => {
                setStep("wallet");
                setError("");
              }}
            >
              <span
                className="flex size-6 items-center justify-center rounded-md bg-muted"
                aria-hidden="true"
              >
                <WalletIcon className="size-4 text-muted-foreground" />
              </span>
              Continue with a wallet
            </Button>
            {error && <FieldError>{error}</FieldError>}
          </div>
        )}
        {step === "email" && (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-5" aria-busy={pending}>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor={`${id}-input`}>Email address</FieldLabel>
              <Input
                key="email"
                data-auth-focus
                ref={inputRef}
                id={`${id}-input`}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                disabled={busy}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
                aria-invalid={!!error}
              />
              <FieldDescription id={`${id}-help`} className="text-xs leading-relaxed">
                No password needed. We'll email you a sign-in link.
              </FieldDescription>
              {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              {pending ? "Sending link…" : "Send sign-in link"}
              {!pending && <ArrowRightIcon data-icon="inline-end" />}
            </Button>
          </form>
        )}
        {step === "sent" && (
          <div className="mt-6 flex flex-col gap-4" aria-busy={pending}>
            <p
              data-auth-focus
              tabIndex={-1}
              className="text-center text-sm leading-relaxed text-muted-foreground outline-none"
            >
              Open the email and click the link to finish signing in.
            </p>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              No email? Check your spam folder or resend the link below.
            </p>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full tabular-nums"
                disabled={pending || cooldown > 0}
                onClick={sendLink}
              >
                {pending
                  ? "Sending link…"
                  : cooldown > 0
                    ? `Resend link in ${cooldown}s`
                    : "Resend link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={pending}
                onClick={() => {
                  setStep("email");
                  setError("");
                  setNotice("");
                }}
              >
                Change email
              </Button>
            </div>
            <p role="status" className="sr-only">
              {notice}
            </p>
          </div>
        )}
        {(step === "wallet" || step === "other-wallets") && (
          <div className="mt-6">
            <WalletSignIn
              disabled={busy}
              onPendingChange={setWalletPending}
              showOthers={step === "other-wallets"}
              onShowOthers={() => setStep("other-wallets")}
            />
          </div>
        )}
        <div className="mt-auto flex items-center justify-center gap-1.5 pt-8 text-xs text-muted-foreground">
          Secured by
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
            <path d={siSupabase.path} />
          </svg>
          <span className="font-semibold">Supabase</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
