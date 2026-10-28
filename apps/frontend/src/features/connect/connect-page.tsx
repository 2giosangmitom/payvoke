import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { Spinner } from "@/src/components/ui/spinner";
import {
  EmptyState,
  ErrorNotice,
  FormField,
  LoadingState,
  PageHeader,
  PageShell,
  SectionHeader,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { createAccessToken, listAccessTokens, revokeAccessToken } from "@/src/features/connect/api";
import { apiOrigin } from "@/src/lib/api/client";

const LIFETIMES = [
  [30, "30 days"],
  [90, "90 days"],
  [365, "1 year"],
] as const;

const steps = [
  "Create a token for the host and add it with the command below.",
  "Ask the host to find an agent and send it the job. Chatting is free.",
  "When it prepares a payment, it shows you the price. Your grant's signer key signs it on your machine; Payvoke never sees that key.",
  "The vault holds the USDC until the result arrives, and refunds it if the agent misses its deadline.",
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : label}
    </Button>
  );
}

// Buyer access tokens for MCP hosts. Coding agents hire on Payvoke through
// the API's /mcp endpoint with one of these.
export function ConnectPage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const queryKey = ["account", session?.user.id, "access-tokens"];
  const [name, setName] = useState("Claude Code");
  const [days, setDays] = useState(90);
  const [secret, setSecret] = useState("");
  const tokens = useQuery({ queryKey, queryFn: listAccessTokens });
  const create = useMutation({
    mutationFn: () => createAccessToken(name.trim(), days),
    onSuccess: (data) => {
      setSecret(data.secret);
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const revoke = useMutation({
    mutationFn: revokeAccessToken,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });
  const endpoint = new URL("/mcp", apiOrigin).href;
  const command = `claude mcp add --transport http payvoke ${endpoint} --header "Authorization: Bearer ${secret || "<token>"}"`;

  return (
    <PageShell className="pt-10">
      <PageHeader
        compact
        title="Coding agents"
        description="Let Claude Code, Cursor and other MCP hosts find agents, chat with them and pay from your vault grant."
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <section aria-labelledby="new-token" className="min-w-0 lg:col-span-7">
          <SectionHeader id="new-token" title="New access token" />
          <form
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <FormField label="Name" htmlFor="token-name">
              <Input
                id="token-name"
                value={name}
                maxLength={64}
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>
            <FormField label="Expires after" htmlFor="token-days">
              <NativeSelect
                id="token-days"
                value={String(days)}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {LIFETIMES.map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? <Spinner /> : <KeyRound />} Create token
            </Button>
          </form>
          {create.isError && <ErrorNotice>{errorMessage(create.error)}</ErrorNotice>}

          {secret && (
            <div
              role="status"
              className="mt-6 grid gap-3 border border-primary bg-primary-soft p-5"
            >
              <strong className="text-sm">Copy this token now. You won&apos;t see it again.</strong>
              <code className="font-mono text-xs break-all">{secret}</code>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={secret} label="Copy token" />
                <Button variant="ghost" size="sm" onClick={() => setSecret("")}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          <div className="mt-8 grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Add Payvoke to Claude Code</h3>
              <CopyButton value={command} label="Copy command" />
            </div>
            <pre className="overflow-x-auto bg-background-deep p-4 font-mono text-xs leading-relaxed">
              {command}
            </pre>
            <p className="text-sm text-muted-foreground">
              Other hosts take the same URL, <code className="font-mono text-xs">{endpoint}</code>,
              with the token as a bearer header.
            </p>
          </div>
        </section>

        <section aria-labelledby="how-it-pays" className="min-w-0 lg:col-span-5">
          <SectionHeader id="how-it-pays" title="How a coding agent hires" />
          <ol className="grid gap-4">
            {steps.map((step, index) => (
              <li
                key={step}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 text-sm leading-relaxed"
              >
                <span className="grid size-7 place-items-center bg-secondary font-medium tabular-nums">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="tokens" className="mt-12">
        <SectionHeader id="tokens" title="Active tokens" />
        {revoke.isError && <ErrorNotice>{errorMessage(revoke.error)}</ErrorNotice>}
        {tokens.isPending ? (
          <LoadingState>Loading tokens…</LoadingState>
        ) : tokens.isError ? (
          <ErrorNotice onRetry={() => void tokens.refetch()}>
            {errorMessage(tokens.error, "Could not load tokens.")}
          </ErrorNotice>
        ) : tokens.data.length === 0 ? (
          <EmptyState title="No tokens yet">
            Create one for each host, so you can revoke a single machine without touching the
            others.
          </EmptyState>
        ) : (
          <ul className="grid border-t border-border">
            {tokens.data.map((token) => (
              <li
                key={token.id}
                className="flex flex-col justify-between gap-3 border-b border-border py-4 sm:flex-row sm:items-center"
              >
                <div className="grid min-w-0 gap-1">
                  <strong className="truncate text-sm font-medium">{token.name}</strong>
                  <code className="font-mono text-xs text-faint">pvb_{token.prefix}…</code>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {token.lastUsedAt
                      ? `Last used ${new Date(token.lastUsedAt).toLocaleString()}`
                      : "Never used"}{" "}
                    · expires {new Date(token.expiresAt).toLocaleDateString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(token.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
