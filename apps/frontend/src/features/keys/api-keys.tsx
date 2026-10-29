import { useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits, toHex, type Address, type Hex } from "viem";
import { useConnection, useReadContracts } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
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
import {
  createAccessToken,
  extendAccessToken,
  linkAccessTokenGrant,
  listAccessTokens,
  revokeAccessToken,
  type AccessToken,
} from "@/src/features/connect/api";
import { grantState, short, spentInPeriod, type OnChain } from "@/src/features/keys/autopay-keys";
import { CodeBlock } from "@/src/features/keys/settings-row";
import { getWallet, usdc } from "@/src/features/wallet/api";
import { chainError, parseUsdc, useVaultWrite, vaultAccountAbi } from "@/src/features/wallet/vault";

const DAY = 86_400;
const LIFETIMES = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
  [365, "1 year"],
] as const;
const DEFAULT_LIMITS = { perJob: "5", perDay: "100", total: "500" };

const day = (value: string | Date | number) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const newGrantId = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

// A key made before keys paid by themselves: its signer was a separate key
// Payvoke cannot derive, so it can only ask.
const isLegacy = (token: AccessToken) =>
  !token.signer ||
  Boolean(token.autopay && token.autopay.signer.toLowerCase() !== token.signer.toLowerCase());

type Mode = "ask" | "autopay";

// The payment choice and its three limits, shared by create and edit.
function useLimitsForm(initial: { mode: Mode; perJob: string; perDay: string; total: string }) {
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [perJob, setPerJob] = useState(initial.perJob);
  const [perDay, setPerDay] = useState(initial.perDay);
  const [total, setTotal] = useState(initial.total);
  const limits = [parseUsdc(perJob), parseUsdc(perDay), parseUsdc(total)] as const;
  const error =
    mode === "ask"
      ? ""
      : limits.some((value) => value === null)
        ? "Enter each limit in USDC, above zero."
        : limits[0]! > limits[1]! || limits[1]! > limits[2]!
          ? "Limits must grow: per job ≤ per day ≤ in total."
          : "";
  return { mode, setMode, perJob, setPerJob, perDay, setPerDay, total, setTotal, limits, error };
}
type LimitsForm = ReturnType<typeof useLimitsForm>;

// A grant for `signer` with the form's limits, counted per day.
const grantConfig = (signer: Address, expiresAt: number, form: LimitsForm) => ({
  signer,
  expiresAt,
  maxPerCall: form.limits[0]!,
  periodSeconds: DAY,
  maxPerPeriod: form.limits[1]!,
  maxTotal: form.limits[2]!,
});

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

function PaymentsFields({
  form,
  id,
  until,
  wallet,
  autopayLocked,
}: {
  form: LimitsForm;
  id: string;
  until: Date;
  wallet: string;
  autopayLocked?: string;
}) {
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Payments</legend>
        <RadioGroup
          value={form.mode}
          onValueChange={(value) => form.setMode(value as Mode)}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(
            [
              [
                "autopay",
                "Pay by itself up to a limit",
                autopayLocked ?? "Small jobs go through; above the limit it asks you.",
              ],
              ["ask", "Ask me every time", "It sends you a link to approve each payment."],
            ] as const
          ).map(([value, title, detail]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 border border-border p-3 text-sm transition-colors hover:border-border-strong has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary-soft has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-60"
            >
              <RadioGroupItem
                value={value}
                className="mt-0.5"
                disabled={value === "autopay" && Boolean(autopayLocked)}
              />
              <span className="grid gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-xs text-muted-foreground">{detail}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      {form.mode === "autopay" && (
        <div className="grid gap-3 border-l border-primary pl-4">
          <div className="grid items-start gap-3 sm:grid-cols-3">
            <LimitField
              id={`${id}-per-job`}
              label="Per job"
              value={form.perJob}
              onChange={form.setPerJob}
            />
            <LimitField
              id={`${id}-per-day`}
              label="Per day"
              value={form.perDay}
              onChange={form.setPerDay}
            />
            <LimitField
              id={`${id}-total`}
              label="In total"
              value={form.total}
              onChange={form.setTotal}
            />
          </div>
          {form.error ? (
            <p className="text-xs text-destructive">{form.error}</p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              The agent can pay up to{" "}
              <span className="font-mono text-foreground">{form.perJob}</span> USDC a job and{" "}
              <span className="font-mono text-foreground">{form.perDay}</span> USDC a day,{" "}
              <span className="font-mono text-foreground">{form.total}</span> USDC in total, until{" "}
              {day(until)}. The day resets at 00:00 UTC and the vault enforces every limit. {wallet}
            </p>
          )}
        </div>
      )}
    </>
  );
}

// Shown once: Payvoke keeps only a hash of the key.
type Issued = { secret: string; autopay: boolean; autopayError: string | null };

function IssuedKey({ issued, onDone }: { issued: Issued; onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Copy your API key</DialogTitle>
        <DialogDescription>
          It is shown only once and Payvoke can&apos;t show it again.
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-3">
        <CodeBlock code={issued.secret} title="API key" label="Copy API key" />
        {issued.autopayError ? (
          <Alert variant="destructive">
            <AlertDescription>
              The key works, but setting its limit failed: {issued.autopayError} Until you set one
              with Edit, it asks you to approve every payment.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {issued.autopay
              ? "This key is all your agent needs: it pays within your limits by itself and sends you a link for anything above them. Anyone with the key can spend up to these limits; revoke it here if in doubt."
              : "Your agent sends you a link to approve each payment."}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done, connect my agent</Button>
      </DialogFooter>
    </>
  );
}

function CreateKeyDialog({ vault, onChanged }: { vault: Address | null; onChanged: () => void }) {
  const { address: connected } = useConnection();
  const send = useVaultWrite();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const form = useLimitsForm({ mode: "autopay", ...DEFAULT_LIMITS });
  const [issued, setIssued] = useState<Issued | null>(null);
  const until = new Date(Date.now() + days * DAY * 1000);

  const create = useMutation({
    mutationFn: async (): Promise<Issued> => {
      const autopay = form.mode === "autopay";
      if (autopay && !vault) throw new Error("The vault is not configured here.");
      if (autopay && !connected) throw new Error("Connect the wallet the agent pays from.");
      const token = await createAccessToken(name.trim(), days);
      if (!autopay) return { secret: token.secret, autopay, autopayError: null };
      // The key exists first, so its derived signer can go into the grant.
      try {
        const grantId = newGrantId();
        await send((write) =>
          write({
            address: vault!,
            abi: vaultAccountAbi,
            functionName: "registerGrant",
            args: [
              grantId,
              grantConfig(token.signer as Address, seconds(new Date(token.expiresAt)), form),
            ],
          }),
        );
        await linkAccessTokenGrant(token.id, { grantId, buyer: connected! });
        return { secret: token.secret, autopay, autopayError: null };
      } catch (cause) {
        return { secret: token.secret, autopay, autopayError: chainError(cause) };
      }
    },
    onSuccess: (data) => setIssued(data),
    onSettled: onChanged,
  });

  // Closing forgets the shown key and starts the next one from a clean form.
  const onOpenChange = (next: boolean) => {
    if (!next && create.isPending) return;
    setOpen(next);
    if (!next) {
      setIssued(null);
      setName("");
      create.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Create API key
      </Button>
      <DialogContent className="gap-5 sm:max-w-xl" showCloseButton={!create.isPending}>
        {issued ? (
          <IssuedKey
            issued={issued}
            onDone={() => {
              onOpenChange(false);
              document.getElementById("connect-agent")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        ) : (
          <form
            className="grid min-w-0 gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && !form.error) create.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Your agent harness uses it to find, hire and pay agents. Make one for each machine
                or harness so you can revoke them one by one.
              </DialogDescription>
            </DialogHeader>
            <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <FormField label="Name" htmlFor="key-name">
                <Input
                  id="key-name"
                  value={name}
                  maxLength={64}
                  placeholder="Claude Code on my laptop"
                  onChange={(event) => setName(event.target.value)}
                />
              </FormField>
              <FormField label="Valid for" htmlFor="key-days">
                <NativeSelect
                  id="key-days"
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
            <PaymentsFields
              form={form}
              id="key"
              until={until}
              wallet={
                connected
                  ? `Your wallet ${short(connected)} confirms the limit once.`
                  : "Connect your wallet to set a limit."
              }
            />
            {create.isError && (
              <ErrorNotice className="my-0">{chainError(create.error)}</ErrorNotice>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={create.isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  create.isPending ||
                  !name.trim() ||
                  Boolean(form.error) ||
                  (form.mode === "autopay" && (!vault || !connected))
                }
              >
                {create.isPending && <Spinner />}{" "}
                {create.isPending && form.mode === "autopay"
                  ? "Confirm in your wallet…"
                  : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Changes a key's validity and payments: the vault grant is updated in
// place, registered for the key's signer when it has none that can pay, or
// revoked to make the key ask; the key's own expiry follows the grant's.
function EditKeyForm({
  token,
  grant,
  vault,
  onDone,
}: {
  token: AccessToken;
  grant: OnChain | undefined;
  vault: Address | null;
  onDone: () => void;
}) {
  const { address: connected } = useConnection();
  const send = useVaultWrite();
  const now = Math.floor(Date.now() / 1000);
  const legacy = isLegacy(token);
  const live = !legacy && grant && !grantState(grant, now) ? grant : null;
  const form = useLimitsForm(
    live
      ? {
          mode: "autopay",
          perJob: formatUnits(live.config.maxPerCall, 6),
          perDay: formatUnits(live.config.maxPerPeriod, 6),
          total: formatUnits(live.config.maxTotal, 6),
        }
      : { mode: "ask", ...DEFAULT_LIMITS },
  );
  const current = new Date(token.expiresAt);
  const extensions = LIFETIMES.filter(([days]) => Date.now() + days * DAY * 1000 > +current);
  const [extend, setExtend] = useState(0);
  const until = extend ? new Date(Date.now() + extend * DAY * 1000) : current;

  const limitsChanged =
    !live ||
    form.limits[0] !== live.config.maxPerCall ||
    form.limits[1] !== live.config.maxPerPeriod ||
    form.limits[2] !== live.config.maxTotal;
  // What the vault must do, if anything.
  const chainStep =
    form.mode === "autopay"
      ? live
        ? limitsChanged || extend
          ? "update"
          : null
        : "register"
      : live
        ? "revoke"
        : null;
  const payer = live ? (token.autopay!.buyer as Address) : connected;
  const walletProblem = !chainStep
    ? ""
    : !vault
      ? "The vault is not configured here."
      : !connected
        ? "Connect your wallet to change this key's limit."
        : payer && connected.toLowerCase() !== payer.toLowerCase()
          ? `Connect ${short(payer)}, the wallet this limit pays from.`
          : "";

  const save = useMutation({
    mutationFn: async () => {
      const expiresAt = seconds(until);
      if (chainStep === "update")
        await send((write) =>
          write({
            address: vault!,
            abi: vaultAccountAbi,
            functionName: "updateGrant",
            args: [
              token.autopay!.grantId as Hex,
              {
                ...grantConfig(live!.config.signer, expiresAt, form),
                periodSeconds: live!.config.periodSeconds,
              },
            ],
          }),
        );
      if (chainStep === "register") {
        const grantId = newGrantId();
        await send((write) =>
          write({
            address: vault!,
            abi: vaultAccountAbi,
            functionName: "registerGrant",
            args: [grantId, grantConfig(token.signer as Address, expiresAt, form)],
          }),
        );
        await linkAccessTokenGrant(token.id, { grantId, buyer: connected! });
      }
      if (chainStep === "revoke")
        await send((write) =>
          write({
            address: vault!,
            abi: vaultAccountAbi,
            functionName: "revokeGrant",
            args: [token.autopay!.grantId as Hex],
          }),
        );
      if (extend) await extendAccessToken(token.id, extend);
    },
    onSuccess: onDone,
  });

  const reading = Boolean(token.autopay && !legacy && !grant);
  return (
    <form
      className="grid min-w-0 gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!form.error && !walletProblem) save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit {token.name}</DialogTitle>
        <DialogDescription>
          Changes apply to the agent at once; it keeps using the same key.
        </DialogDescription>
      </DialogHeader>
      <FormField label="Valid until" htmlFor="edit-days">
        <NativeSelect
          id="edit-days"
          value={String(extend)}
          onChange={(event) => setExtend(Number(event.target.value))}
        >
          <NativeSelectOption value="0">{day(current)} (now)</NativeSelectOption>
          {extensions.map(([days, label]) => (
            <NativeSelectOption key={days} value={days}>
              {label} from today
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      {reading ? (
        <LoadingState className="py-2">Reading limits</LoadingState>
      ) : (
        <PaymentsFields
          form={form}
          id="edit"
          until={until}
          autopayLocked={
            legacy
              ? "This key was made before keys could pay by themselves. Create a new key to use autopay."
              : undefined
          }
          wallet={
            walletProblem ||
            (chainStep && connected ? `Your wallet ${short(connected)} confirms the change.` : "")
          }
        />
      )}
      {walletProblem && form.mode === "ask" && (
        <p className="text-xs text-muted-foreground">{walletProblem}</p>
      )}
      {save.isError && <ErrorNotice className="my-0">{chainError(save.error)}</ErrorNotice>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={save.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            save.isPending ||
            reading ||
            Boolean(form.error) ||
            Boolean(walletProblem) ||
            (!chainStep && !extend)
          }
        >
          {save.isPending && <Spinner />}{" "}
          {save.isPending && chainStep ? "Confirm in your wallet…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditKeyDialog(props: {
  token: AccessToken;
  grant: OnChain | undefined;
  vault: Address | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${props.token.name}`}
      >
        Edit
      </Button>
      <DialogContent className="gap-5 sm:max-w-xl">
        {/* Mounted per opening, so the form starts from the key's current state. */}
        {open && (
          <EditKeyForm
            {...props}
            onDone={() => {
              setOpen(false);
              props.onChanged();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// The buyer's API keys (MCP access tokens), each with its autopay limit read
// from the vault.
export function ApiKeys() {
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
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void chain.refetch();
  };

  const [revokeNote, setRevokeNote] = useState("");
  // Revoking the key stops the agent at once: Payvoke only signs and relays
  // payments for a live key. The grant is then revoked on chain too when the
  // paying wallet is connected.
  const revoke = useMutation({
    mutationFn: async (token: AccessToken) => {
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
    <LoadingState className="py-4">Loading API keys</LoadingState>
  ) : tokens.isError ? (
    <ErrorNotice onRetry={() => void tokens.refetch()}>
      {errorMessage(tokens.error, "Couldn't load API keys.")}
    </ErrorNotice>
  ) : tokens.data.length === 0 ? (
    <div className="grid justify-items-center gap-2 px-4 py-10 text-center">
      <KeyRound aria-hidden="true" className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">No API keys yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Create one, then follow the steps below to connect your agent.
      </p>
    </div>
  ) : (
    <ul className="grid">
      {tokens.data.map((token) => {
        const legacy = isLegacy(token);
        const grant = token.autopay && !legacy ? onChain(token.id) : undefined;
        const state = grant ? grantState(grant, now) : null;
        const spent = grant ? spentInPeriod(grant, now) : 0n;
        const autopay = Boolean(token.autopay && !legacy && grant && !state);
        return (
          <li
            key={token.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-t border-border px-4 py-3 first:border-t-0 sm:px-5"
          >
            <div className="grid min-w-0 gap-0.5">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span className="truncate">{token.name}</span>
                <span className="shrink-0 border border-border px-1.5 text-xs text-muted-foreground">
                  {autopay ? "Autopay" : "Asks every time"}
                </span>
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                pvb_{token.prefix}… · used {token.lastUsedAt ? day(token.lastUsedAt) : "never"} ·
                until {day(token.expiresAt)}
              </span>
            </div>
            <div className="flex items-center">
              <EditKeyDialog token={token} grant={grant} vault={vault} onChanged={refresh} />
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(token)}
                aria-label={`Revoke ${token.name}`}
              >
                {revoke.isPending && revoke.variables?.id === token.id && <Spinner />} Revoke
              </Button>
            </div>
            {legacy ? (
              <span className="col-span-2 text-xs text-muted-foreground">
                Made before keys could pay by themselves. Recreate it to use autopay.
              </span>
            ) : (
              token.autopay && (
                <div className="col-span-2 grid gap-1.5">
                  {!grant ? (
                    <span className="text-xs text-muted-foreground">Reading limits…</span>
                  ) : state ? (
                    <span className="text-xs text-muted-foreground">
                      Its limit is {state.toLowerCase()}, so it sends you a link for every payment.
                      Use Edit to set a new one.
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
              )
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section aria-labelledby="api-keys-title" className="grid gap-4 border-b border-border py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h2 id="api-keys-title" className="text-base font-medium">
            Keys
            {tokens.data?.length ? (
              <span className="ml-2 font-mono text-sm text-muted-foreground tabular-nums">
                {tokens.data.length}
              </span>
            ) : null}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            One key is all an agent harness needs. With an autopay limit it pays small jobs by
            itself; anything above comes to you as a link to approve.
          </p>
        </div>
        <CreateKeyDialog vault={vault} onChanged={refresh} />
      </div>
      {revoke.isError && <ErrorNotice className="my-0">{errorMessage(revoke.error)}</ErrorNotice>}
      {revokeNote && <p className="text-sm text-muted-foreground">{revokeNote}</p>}
      <div className="min-w-0 border border-border bg-card">{list}</div>
    </section>
  );
}
