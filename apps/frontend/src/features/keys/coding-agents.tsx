import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useConnection, useReadContracts } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Spinner } from "@/src/components/ui/spinner";
import {
  ErrorNotice,
  FormField,
  LoadingState,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { createAccessToken, listAccessTokens, revokeAccessToken } from "@/src/features/connect/api";
import { grantState, short, spentInPeriod, type OnChain } from "@/src/features/keys/autopay-keys";
import { CopyButton, SettingsRow } from "@/src/features/keys/settings-row";
import { getWallet, usdc } from "@/src/features/wallet/api";
import { chainError, parseUsdc, useVaultWrite, vaultAccountAbi } from "@/src/features/wallet/vault";
import { apiOrigin } from "@/src/lib/api/client";
import { cn } from "@/src/lib/utils";

const DAY = 86_400;
const LIFETIMES = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
] as const;

const day = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// Shown once: the token, and with autopay the key the agent signs with.
// Payvoke keeps neither in a readable form.
type Issued = { secret: string; key: Hex | null };

function IssuedConnection({ issued, onDismiss }: { issued: Issued; onDismiss: () => void }) {
  const endpoint = new URL("/mcp", apiOrigin).href;
  const setup = [
    ...(issued.key ? [`export PAYVOKE_GRANT_KEY=${issued.key}`] : []),
    `claude mcp add --transport http payvoke ${endpoint} --header "Authorization: Bearer ${issued.secret}"`,
  ].join("\n");
  return (
    <div role="status" className="grid gap-3 border border-primary/50 bg-primary-soft p-4">
      <p className="text-sm font-medium">
        Copy this now. It is shown only once and Payvoke can&apos;t show it again.
      </p>
      <pre className="overflow-x-auto bg-background-deep p-3 font-mono text-xs leading-relaxed">
        <code>{setup}</code>
      </pre>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Run it in the shell you start Claude Code from.{" "}
        {issued.key
          ? "The agent signs payments within your limits with PAYVOKE_GRANT_KEY and sends you a link for anything above them. Anything that can read the key can spend up to these limits; revoke the connection here if in doubt."
          : "The agent sends you a link to approve each payment."}{" "}
        Other MCP hosts use <code className="font-mono break-all">{endpoint}</code> with the token
        as a bearer header.
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={setup} label="Copy setup" />
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// A USDC amount with its unit inside the field.
function LimitField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-14 font-mono tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          USDC
        </span>
      </div>
    </FormField>
  );
}

// Coding agents (MCP hosts): one access token each, optionally with an
// autopay limit. The limit is a vault grant the token is linked to: the agent
// pays what fits by itself and asks the buyer to approve the rest.
export function CodingAgents() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const { address: connected } = useConnection();
  const send = useVaultWrite();
  const queryKey = ["account", session?.user.id, "access-tokens"];
  const tokens = useQuery({ queryKey, queryFn: listAccessTokens });
  const wallet = useQuery({
    queryKey: ["account", session?.user.id, "wallet"],
    queryFn: getWallet,
  });
  const vault = (wallet.data?.vault ?? null) as Address | null;
  const [name, setName] = useState("Claude Code");
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<"ask" | "autopay">("autopay");
  const [perJob, setPerJob] = useState("5");
  const [perDay, setPerDay] = useState("100");
  const [total, setTotal] = useState("500");
  const [issued, setIssued] = useState<Issued | null>(null);

  const limits = [parseUsdc(perJob), parseUsdc(perDay), parseUsdc(total)] as const;
  const limitError =
    mode === "ask"
      ? ""
      : limits.some((value) => value === null)
        ? "Enter each limit in USDC, above zero."
        : limits[0]! > limits[1]! || limits[1]! > limits[2]!
          ? "Limits must grow: per job ≤ per day ≤ in total."
          : "";

  const create = useMutation({
    mutationFn: async (): Promise<Issued> => {
      if (mode === "ask") {
        const token = await createAccessToken(name.trim(), days);
        return { secret: token.secret, key: null };
      }
      if (!vault) throw new Error("The vault is not configured here.");
      if (!connected) throw new Error("Connect the wallet the agent pays from.");
      // The limit goes on chain first: a token is only made once it exists.
      const key = generatePrivateKey();
      const signer = privateKeyToAccount(key).address;
      const grantId = toHex(crypto.getRandomValues(new Uint8Array(32)));
      await send((write) =>
        write({
          address: vault,
          abi: vaultAccountAbi,
          functionName: "registerGrant",
          args: [
            grantId,
            {
              signer,
              expiresAt: Math.floor(Date.now() / 1000) + days * DAY,
              maxPerCall: limits[0]!,
              periodSeconds: DAY,
              maxPerPeriod: limits[1]!,
              maxTotal: limits[2]!,
            },
          ],
        }),
      );
      const token = await createAccessToken(name.trim(), days, {
        grantId,
        buyer: connected,
        signer,
      });
      return { secret: token.secret, key };
    },
    onSuccess: (data) => {
      setIssued(data);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const autopayTokens = (tokens.data ?? []).filter((token) => token.autopay);
  const chain = useReadContracts({
    allowFailure: true,
    contracts: autopayTokens.map((token) => ({
      chainId: avalancheFuji.id,
      address: vault ?? undefined,
      abi: vaultAccountAbi,
      functionName: "getGrant" as const,
      args: [token.autopay!.buyer as Address, token.autopay!.grantId as Hex] as const,
    })),
    query: { enabled: Boolean(vault), refetchInterval: 30_000 },
  });
  const onChain = (tokenId: string) =>
    chain.data?.[autopayTokens.findIndex((token) => token.id === tokenId)]?.result as
      | OnChain
      | undefined;
  const now = Math.floor(Date.now() / 1000);

  const [revokeNote, setRevokeNote] = useState("");
  // Revoking the token stops the agent at once: the vault only takes
  // payments Payvoke relays for a signed-in buyer. The grant is then revoked
  // on chain too when the paying wallet is connected.
  const revoke = useMutation({
    mutationFn: async (token: NonNullable<typeof tokens.data>[number]) => {
      setRevokeNote("");
      await revokeAccessToken(token.id);
      const grant = onChain(token.id);
      if (!token.autopay || !vault || !grant || grantState(grant, now)) return;
      if (connected?.toLowerCase() !== token.autopay.buyer.toLowerCase()) {
        setRevokeNote(
          `${token.name} is revoked. Connect ${short(token.autopay.buyer)} to also cancel its limit in the vault.`,
        );
        return;
      }
      await send((write) =>
        write({
          address: vault,
          abi: vaultAccountAbi,
          functionName: "revokeGrant",
          args: [token.autopay!.grantId as Hex],
        }),
      ).catch((cause) =>
        setRevokeNote(
          `${token.name} is revoked; cancelling its vault limit failed: ${chainError(cause)}`,
        ),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const list = tokens.isPending ? (
    <LoadingState className="py-4">Loading coding agents</LoadingState>
  ) : tokens.isError ? (
    <ErrorNotice onRetry={() => void tokens.refetch()}>
      {errorMessage(tokens.error, "Couldn't load coding agents.")}
    </ErrorNotice>
  ) : tokens.data.length === 0 ? null : (
    <section aria-labelledby="connected" className="grid gap-2">
      <h3 id="connected" className="text-sm font-medium">
        Connected{" "}
        <span className="font-mono text-muted-foreground tabular-nums">{tokens.data.length}</span>
      </h3>
      {revoke.isError && <ErrorNotice className="my-0">{errorMessage(revoke.error)}</ErrorNotice>}
      {revokeNote && <p className="text-sm text-muted-foreground">{revokeNote}</p>}
      <ul className="grid">
        {tokens.data.map((token) => {
          const grant = token.autopay ? onChain(token.id) : undefined;
          const state = grant ? grantState(grant, now) : null;
          const spent = grant ? spentInPeriod(grant, now) : 0n;
          return (
            <li
              key={token.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-t border-border py-3 first:border-t-0 first:pt-1"
            >
              <div className="grid min-w-0 gap-0.5">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="truncate">{token.name}</span>
                  <span className="shrink-0 border border-border px-1.5 text-xs text-muted-foreground">
                    {!token.autopay || state ? "Asks every time" : "Autopay"}
                  </span>
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  pvb_{token.prefix}… · used {token.lastUsedAt ? day(token.lastUsedAt) : "never"} ·
                  until {day(token.expiresAt)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(token)}
                aria-label={`Revoke ${token.name}`}
              >
                {revoke.isPending && revoke.variables?.id === token.id && <Spinner />} Revoke
              </Button>
              {token.autopay && (
                <div className="col-span-2 grid gap-1.5">
                  {!grant ? (
                    <span className="text-xs text-muted-foreground">Reading limits…</span>
                  ) : state ? (
                    <span className="text-xs text-muted-foreground">
                      Its limit is {state.toLowerCase()}, so it sends you a link for every payment.
                    </span>
                  ) : (
                    <>
                      <div className="flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
                        <span>
                          Today{" "}
                          <span className="font-mono text-foreground tabular-nums">
                            {usdc(spent)}
                          </span>{" "}
                          of {usdc(grant.config.maxPerPeriod)} USDC
                        </span>
                        <span>
                          up to {usdc(grant.config.maxPerCall)} a job ·{" "}
                          <span className="font-mono tabular-nums">
                            {usdc(grant.spentTotal)}/{usdc(grant.config.maxTotal)}
                          </span>{" "}
                          in all
                        </span>
                      </div>
                      <div aria-hidden className="h-1 w-full bg-foreground/10">
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${Math.min(100, Number((spent * 100n) / (grant.config.maxPerPeriod || 1n)))}%`,
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <SettingsRow
      id="coding-agents"
      title="Coding agents"
      description={
        <>
          Connect Claude Code, Cursor or another MCP host, one connection per machine. With an
          autopay limit it pays small jobs by itself; anything above the limit comes to you as a
          link to approve.
        </>
      }
    >
      <div className="grid gap-6">
        {/* The one-time setup goes first, where the new connection appears. */}
        {issued && <IssuedConnection issued={issued} onDismiss={() => setIssued(null)} />}
        {list}
        <form
          aria-labelledby="add-agent"
          className={cn("grid gap-5", tokens.data?.length && "border-t border-border pt-5")}
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !limitError) create.mutate();
          }}
        >
          <h3 id="add-agent" className="text-sm font-medium">
            Add a coding agent
          </h3>
          <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <FormField label="Name" htmlFor="agent-name">
              <Input
                id="agent-name"
                value={name}
                maxLength={64}
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>
            <FormField label="Valid for" htmlFor="agent-days">
              <NativeSelect
                id="agent-days"
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
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Payments</legend>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as "ask" | "autopay")}
              className="grid gap-2 sm:grid-cols-2"
            >
              {(
                [
                  [
                    "autopay",
                    "Pay by itself up to a limit",
                    "Small jobs go through; above the limit it asks you.",
                  ],
                  ["ask", "Ask me every time", "It sends you a link to approve each payment."],
                ] as const
              ).map(([value, title, detail]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-3 border border-border p-3 text-sm transition-colors hover:border-border-strong has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary-soft"
                >
                  <RadioGroupItem value={value} className="mt-0.5" />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{title}</span>
                    <span className="text-xs text-muted-foreground">{detail}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          {mode === "autopay" && (
            <div className="grid gap-3 border-l border-primary pl-4">
              <div className="grid items-start gap-3 sm:grid-cols-3">
                <LimitField
                  id="agent-per-job"
                  label="Per job"
                  value={perJob}
                  onChange={setPerJob}
                />
                <LimitField
                  id="agent-per-day"
                  label="Per day"
                  value={perDay}
                  onChange={setPerDay}
                />
                <LimitField id="agent-total" label="In total" value={total} onChange={setTotal} />
              </div>
              {limitError ? (
                <p className="text-xs text-destructive">{limitError}</p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {name.trim() || "This agent"} can pay up to{" "}
                  <span className="font-mono text-foreground">{perJob}</span> USDC a job and{" "}
                  <span className="font-mono text-foreground">{perDay}</span> USDC a day,{" "}
                  <span className="font-mono text-foreground">{total}</span> USDC in total, for{" "}
                  {days} days. The day resets at 00:00 UTC and the vault enforces every limit.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !name.trim() ||
                Boolean(limitError) ||
                (mode === "autopay" && (!vault || !connected))
              }
            >
              {create.isPending && <Spinner />}{" "}
              {create.isPending && mode === "autopay" ? "Confirm in your wallet…" : "Connect agent"}
            </Button>
            {mode === "autopay" && (
              <span className="text-xs text-muted-foreground">
                {connected
                  ? `Your wallet ${short(connected)} confirms the limit once.`
                  : "Connect your wallet to set a limit."}
              </span>
            )}
          </div>
          {create.isError && <ErrorNotice className="my-0">{chainError(create.error)}</ErrorNotice>}
        </form>
      </div>
    </SettingsRow>
  );
}
