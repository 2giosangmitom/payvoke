import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits, toHex, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { Spinner } from "@/src/components/ui/spinner";
import { ErrorNotice, FormField } from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { GrantList } from "@/src/features/keys/autopay-keys";
import { listGrants, recordGrant } from "@/src/features/keys/grants";
import { usdc } from "@/src/features/wallet/api";
import {
  browserKeyQuery,
  forgetBrowserKey,
  saveBrowserKey,
  useBrowserKey,
} from "@/src/features/wallet/browser-key";
import { chainError, parseUsdc, useVaultWrite, vaultAccountAbi } from "@/src/features/wallet/vault";

const DAY = 86_400;
const LIFETIMES = [
  [1, "1 day"],
  [7, "7 days"],
  [30, "30 days"],
] as const;

// A name the list can tell browsers apart by.
function browserName() {
  const agent = navigator.userAgent;
  const browser = /Firefox\//.test(agent)
    ? "Firefox"
    : /Edg\//.test(agent)
      ? "Edge"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  const os = /Mac OS/.test(agent)
    ? "macOS"
    : /Windows/.test(agent)
      ? "Windows"
      : /Android/.test(agent)
        ? "Android"
        : /iPhone|iPad/.test(agent)
          ? "iOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

// Sets up one-click pay for this browser: one wallet transaction registers a
// daily-limited grant whose signer key is made and kept here.
export function EnableOneClick({
  vault,
  buyer,
  needed,
  action = "Enable one-click pay",
  onEnabled,
}: {
  vault: Address;
  buyer: Address;
  // The job about to be paid, so the per-job limit starts high enough.
  needed?: bigint;
  action?: string;
  onEnabled?: () => void | Promise<void>;
}) {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const send = useVaultWrite();
  const start = needed && needed > 10_000_000n ? needed : 10_000_000n;
  const [perJob, setPerJob] = useState(formatUnits(start, 6));
  const [perDay, setPerDay] = useState(formatUnits(start > 25_000_000n ? start : 25_000_000n, 6));
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const limits = [parseUsdc(perJob), parseUsdc(perDay)] as const;
  const limitError =
    limits[0] === null || limits[1] === null
      ? "Enter both limits in USDC, above zero."
      : limits[0] > limits[1]
        ? "The daily limit must be at least the per-job limit."
        : needed && limits[0] < needed
          ? `This job needs a per-job limit of at least ${usdc(needed)} USDC.`
          : "";

  async function enable() {
    setError("");
    setBusy(true);
    try {
      const key = generatePrivateKey();
      const signer = privateKeyToAccount(key).address;
      const grantId = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = Math.floor(Date.now() / 1000) + days * DAY;
      await send((write) =>
        write({
          address: vault,
          abi: vaultAccountAbi,
          functionName: "registerGrant",
          args: [
            grantId,
            {
              signer,
              expiresAt,
              maxPerCall: limits[0]!,
              periodSeconds: DAY,
              maxPerPeriod: limits[1]!,
              // The total spans the whole lifetime at the daily rate.
              maxTotal: limits[1]! * BigInt(days),
            },
          ],
        }),
      );
      await saveBrowserKey(vault, buyer, { grantId, key, expiresAt });
      // Listing it is a convenience; the grant works without it.
      await recordGrant({ grantId, buyer, signer, kind: "browser", name: browserName() }).catch(
        () => undefined,
      );
      await queryClient.invalidateQueries({ queryKey: browserKeyQuery(vault, buyer) });
      await queryClient.invalidateQueries({ queryKey: ["account", session?.user.id, "grants"] });
      await onEnabled?.();
    } catch (cause) {
      setError(chainError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!limitError) void enable();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Most per job" htmlFor="one-click-job">
          <Input
            id="one-click-job"
            inputMode="decimal"
            value={perJob}
            onChange={(event) => setPerJob(event.target.value)}
            className="bg-background font-mono tabular-nums"
          />
        </FormField>
        <FormField label="Most per day" htmlFor="one-click-day">
          <Input
            id="one-click-day"
            inputMode="decimal"
            value={perDay}
            onChange={(event) => setPerDay(event.target.value)}
            className="bg-background font-mono tabular-nums"
          />
        </FormField>
        <FormField label="For" htmlFor="one-click-days">
          <NativeSelect
            id="one-click-days"
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
      {limitError && <p className="text-xs text-destructive">{limitError}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Your wallet approves once. After that this browser pays within these limits without asking,
        and only from your vault balance. The key never leaves this browser; signing out deletes it.
      </p>
      <Button type="submit" disabled={busy || Boolean(limitError)} className="justify-self-start">
        {busy && <Spinner />} {busy ? "Confirm in your wallet…" : action}
      </Button>
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
    </form>
  );
}

// The Wallet page's one-click pay: this browser's key, the other browsers'
// ones, and setting it up here.
export function OneClickSection({
  vault,
  connected,
}: {
  vault: Address;
  connected: Address | undefined;
}) {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const grants = useQuery({
    queryKey: ["account", session?.user.id, "grants"],
    queryFn: listGrants,
  });
  const local = useBrowserKey(vault, connected);
  const browsers = (grants.data ?? []).filter((grant) => grant.kind === "browser");
  return (
    <div className="grid gap-4">
      {connected && !local.isLoading && !local.data && (
        <EnableOneClick vault={vault} buyer={connected} />
      )}
      {!connected && (
        <p className="text-sm text-muted-foreground">
          Connect your wallet to set up one-click pay.
        </p>
      )}
      {local.data && (
        <p className="text-sm text-muted-foreground">
          This browser pays in one click until{" "}
          {new Date(local.data.expiresAt * 1000).toLocaleDateString()}.
        </p>
      )}
      {browsers.length > 0 && (
        <GrantList
          grants={browsers}
          vault={vault}
          connected={connected}
          note={(grant) =>
            grant.grantId.toLowerCase() === local.data?.grantId.toLowerCase()
              ? "This browser"
              : null
          }
          onRemoved={async (grant) => {
            if (connected && grant.grantId.toLowerCase() === local.data?.grantId.toLowerCase()) {
              await forgetBrowserKey(vault, connected);
              await queryClient.invalidateQueries({ queryKey: browserKeyQuery(vault, connected) });
            }
          }}
        />
      )}
    </div>
  );
}
