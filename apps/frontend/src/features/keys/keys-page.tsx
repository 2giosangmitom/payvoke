import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { Spinner } from "@/src/components/ui/spinner";
import {
  ErrorNotice,
  FormField,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { listProviderApps, listProviderKeys } from "@/src/features/apps/api";
import { createAccessToken, listAccessTokens, revokeAccessToken } from "@/src/features/connect/api";
import { apiOrigin } from "@/src/lib/api/client";

const LIFETIMES = [
  [30, "30 days"],
  [90, "90 days"],
  [365, "1 year"],
] as const;

const date = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

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

// One settings row: what the section is for on the left, its controls on the
// right. On a phone the label stacks above the panel.
function SettingsRow({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-b border-border py-8 last:border-b-0 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12"
    >
      <div className="grid content-start gap-1.5 lg:pt-1">
        <h2 id={id} className="text-base font-medium">
          {title}
        </h2>
        <div className="text-sm leading-6 text-muted-foreground">{description}</div>
      </div>
      <div className="min-w-0 border border-border bg-card p-4 sm:p-5">{children}</div>
    </section>
  );
}

function BuyerTokens() {
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
    <>
      <SettingsRow
        id="tokens"
        title="Access tokens"
        description={
          <>
            A coding agent uses a token to find agents, chat and prepare payments for you. Make one
            per machine, so you can revoke it alone. Payments still need your grant&apos;s signer
            key.
          </>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end"
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
            {create.isPending && <Spinner />} Create token
          </Button>
        </form>
        {create.isError && <ErrorNotice>{errorMessage(create.error)}</ErrorNotice>}
        {secret && (
          <div
            role="status"
            className="mt-4 grid gap-3 border border-primary/50 bg-primary-soft p-4"
          >
            <p className="text-sm font-medium">Copy this token now. It is shown only once.</p>
            <code className="font-mono text-xs break-all">{secret}</code>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={secret} label="Copy token" />
              <Button variant="ghost" size="sm" onClick={() => setSecret("")}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6">
          {revoke.isError && <ErrorNotice>{errorMessage(revoke.error)}</ErrorNotice>}
          {tokens.isPending ? (
            <LoadingState className="py-4">Loading tokens</LoadingState>
          ) : tokens.isError ? (
            <ErrorNotice onRetry={() => void tokens.refetch()}>
              {errorMessage(tokens.error, "Couldn't load tokens.")}
            </ErrorNotice>
          ) : tokens.data.length === 0 ? (
            <p className="border border-dashed border-border-strong/60 px-3 py-2.5 text-sm text-muted-foreground">
              No tokens yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Access tokens</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-normal">Name</th>
                  <th className="pb-2 font-normal max-sm:hidden">Last used</th>
                  <th className="pb-2 text-right font-normal">Expires</th>
                  <th className="pb-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.data.map((token) => (
                  <tr key={token.id} className="border-t border-border">
                    <td className="py-2.5 pr-3">
                      <span className="block truncate">{token.name}</span>
                      <code className="font-mono text-xs text-muted-foreground">
                        pvb_{token.prefix}…
                      </code>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground max-sm:hidden">
                      {token.lastUsedAt ? date(token.lastUsedAt) : "Never"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs tabular-nums">
                      {date(token.expiresAt)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(token.id)}
                        aria-label={`Revoke ${token.name}`}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SettingsRow>

      <SettingsRow
        id="connect"
        title="Connect a coding agent"
        description={
          <>
            Claude Code, Cursor and other MCP hosts reach Payvoke at one URL with a token as the
            bearer header.
          </>
        }
      >
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Claude Code</p>
            <CopyButton value={command} label="Copy command" />
          </div>
          <pre className="overflow-x-auto bg-background-deep p-3 font-mono text-xs leading-relaxed">
            <code>{command}</code>
          </pre>
          <p className="text-sm text-muted-foreground">
            Other hosts: <code className="font-mono text-xs break-all">{endpoint}</code>
          </p>
        </div>
      </SettingsRow>
    </>
  );
}

// Each shared agent's worker key. Keys are created and rotated in Studio,
// where the secret can be shown once.
function ProviderKeys() {
  const apps = useQuery({ queryKey: ["provider", "apps"], queryFn: listProviderApps });
  const keys = useQueries({
    queries: (apps.data ?? []).map((app) => ({
      queryKey: ["provider", "apps", app.id, "keys"],
      queryFn: () => listProviderKeys(app.id),
    })),
  });
  return (
    <SettingsRow
      id="provider-keys"
      title="Agent worker keys"
      description={
        <>
          Your shared agents run with one active key each. Create or rotate it in Studio, where the
          secret is shown once.
        </>
      }
    >
      {apps.isPending ? (
        <LoadingState className="py-4">Loading your agents</LoadingState>
      ) : apps.isError ? (
        <ErrorNotice onRetry={() => void apps.refetch()}>
          {errorMessage(apps.error, "Couldn't load your agents.")}
        </ErrorNotice>
      ) : apps.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don&apos;t share an agent yet.{" "}
          <Link to="/console/studio" className="text-foreground underline underline-offset-4">
            Open Studio
          </Link>
        </p>
      ) : (
        <ul className="grid">
          {apps.data.map((app, index) => {
            const active = keys[index]?.data?.find((key) => !key.revokedAt);
            return (
              <li
                key={app.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-border py-2.5 first:pt-0 last:border-b-0"
              >
                <Link
                  to="/console/studio/apps/$appId"
                  params={{ appId: app.id }}
                  className="truncate text-sm hover:text-primary"
                >
                  {app.name}
                </Link>
                <span className="text-right font-mono text-xs text-muted-foreground">
                  {keys[index]?.isPending
                    ? "…"
                    : active
                      ? `pvk_${active.prefix}…`
                      : "No active key"}
                </span>
                <span className="col-span-2 text-xs text-muted-foreground">
                  {active
                    ? `${active.scopes.join(", ")} · expires ${date(active.expiresAt)}`
                    : "The agent can't take paid work until it has a key."}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsRow>
  );
}

export function KeysPage() {
  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="API keys"
        description="Tokens that let coding agents hire for you, and the keys your shared agents work with."
      />
      <BuyerTokens />
      <ProviderKeys />
    </PageShell>
  );
}
