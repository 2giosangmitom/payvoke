import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, formatUnits, type Address } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { ErrorNotice, FormField } from "@/src/components/layout/page-kit";
import { usdc } from "@/src/features/wallet/api";
import { chainError, parseUsdc, useVaultWrite, vaultAccountAbi } from "@/src/features/wallet/vault";

// Wagmi caches every contract read; after a write the balances on screen
// read again.
function useRefreshChain() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => ["readContract", "readContracts"].includes(String(query.queryKey[0])),
    });
}

// Runs one money move with its pending, error and done states.
function useMove() {
  const refresh = useRefreshChain();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // `move` may relabel the pending state as it reaches each wallet prompt.
  const run = async (label: string, move: (step: (label: string) => void) => Promise<string>) => {
    setError("");
    setDone("");
    setBusy(label);
    try {
      setDone(await move(setBusy));
      await refresh();
    } catch (cause) {
      setError(chainError(cause));
    } finally {
      setBusy("");
    }
  };
  return { busy, error, done, run };
}

function AmountForm({
  id,
  label,
  max,
  action,
  busy,
  onSubmit,
}: {
  id: string;
  label: string;
  max: bigint | null;
  action: string;
  busy: string;
  onSubmit: (amount: bigint) => void;
}) {
  const [value, setValue] = useState("");
  const amount = parseUsdc(value);
  const over = amount !== null && max !== null && amount > max;
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (amount !== null && !over) onSubmit(amount);
      }}
    >
      <FormField
        label={label}
        htmlFor={id}
        hint={
          max === null ? undefined : (
            <>
              Up to{" "}
              <button
                type="button"
                className="font-mono text-foreground underline underline-offset-4"
                onClick={() => setValue(formatUnits(max, 6))}
              >
                {usdc(max)} USDC
              </button>
            </>
          )
        }
      >
        <div className="relative">
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={value}
            aria-invalid={over || undefined}
            onChange={(event) => setValue(event.target.value)}
            className="pr-14 font-mono tabular-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            USDC
          </span>
        </div>
      </FormField>
      {over && <p className="text-xs text-destructive">That is more than you have here.</p>}
      <Button type="submit" disabled={Boolean(busy) || amount === null || over}>
        {busy && <Spinner />} {busy || action}
      </Button>
    </form>
  );
}

// Deposits from the connected wallet, approving the vault for the exact
// amount first when the allowance is short.
function useDeposit(token: Address, vault: Address | null, address: Address | undefined) {
  const send = useVaultWrite();
  const client = usePublicClient({ chainId: avalancheFuji.id });
  return async (amount: bigint, step: (label: string) => void) => {
    if (!vault || !address || !client) throw new Error("Connect your wallet on Avalanche Fuji.");
    const allowance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, vault],
    });
    if (allowance < amount) {
      step("Approve in your wallet…");
      await send((write) =>
        write({ address: token, abi: erc20Abi, functionName: "approve", args: [vault, amount] }),
      );
    }
    step("Confirm the deposit…");
    await send((write) =>
      write({ address: vault, abi: vaultAccountAbi, functionName: "deposit", args: [amount] }),
    );
  };
}

// Tops the vault up by exactly what a payment is short of.
export function QuickDeposit({
  token,
  vault,
  address,
  amount,
}: {
  token: Address;
  vault: Address;
  address: Address | undefined;
  amount: bigint;
}) {
  const depositTo = useDeposit(token, vault, address);
  const move = useMove();
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={Boolean(move.busy) || !address}
        onClick={() =>
          void move.run("Checking allowance…", async (step) => {
            await depositTo(amount, step);
            return `Deposited ${usdc(amount)} USDC.`;
          })
        }
      >
        {move.busy && <Spinner />} {move.busy || `Deposit ${usdc(amount)} USDC`}
      </Button>
      {move.error && <ErrorNotice className="my-0">{move.error}</ErrorNotice>}
    </div>
  );
}

// Moves USDC between the connected wallet and its vault balance.
export function FundsPanel({
  token,
  vault,
  address,
  wallet,
  available,
}: {
  token: Address;
  vault: Address | null;
  address: Address | undefined;
  wallet: bigint | null;
  available: bigint | null;
}) {
  const send = useVaultWrite();
  const depositTo = useDeposit(token, vault, address);
  const move = useMove();

  if (!vault)
    return <p className="text-sm text-muted-foreground">The vault is not configured here.</p>;
  if (!address)
    return (
      <p className="text-sm text-muted-foreground">Connect your wallet to deposit or withdraw.</p>
    );

  const deposit = (amount: bigint) =>
    move.run("Checking allowance…", async (step) => {
      await depositTo(amount, step);
      return `Deposited ${usdc(amount)} USDC.`;
    });
  const withdraw = (amount: bigint) =>
    move.run("Withdrawing…", async () => {
      await send((write) =>
        write({
          address: vault,
          abi: vaultAccountAbi,
          functionName: "withdrawAvailable",
          args: [amount],
        }),
      );
      return `Withdrew ${usdc(amount)} USDC to your wallet.`;
    });

  return (
    <Tabs defaultValue="deposit" className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="deposit">Deposit</TabsTrigger>
        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
      </TabsList>
      <TabsContent value="deposit" className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Move USDC from your wallet into the vault. Jobs you hire are paid from there.
        </p>
        <AmountForm
          id="deposit-amount"
          label="Amount"
          max={wallet}
          action="Deposit"
          busy={move.busy}
          onSubmit={deposit}
        />
      </TabsContent>
      <TabsContent value="withdraw" className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Take your available vault balance back. Money held for jobs stays until they settle.
        </p>
        <AmountForm
          id="withdraw-amount"
          label="Amount"
          max={available}
          action="Withdraw"
          busy={move.busy}
          onSubmit={withdraw}
        />
      </TabsContent>
      {move.error && <ErrorNotice className="my-0">{move.error}</ErrorNotice>}
      {move.done && (
        <p role="status" className="text-sm text-primary">
          {move.done}
        </p>
      )}
    </Tabs>
  );
}

// A provider cashes out from the payout address the vault credited. The
// connected wallet must be that address.
export function EarningsWithdraw({
  vault,
  address,
  payouts,
}: {
  vault: Address | null;
  address: Address | undefined;
  payouts: Address[];
}) {
  const send = useVaultWrite();
  const move = useMove();
  const payout = payouts.find((item) => item.toLowerCase() === address?.toLowerCase());
  const claimable = useReadContract({
    chainId: avalancheFuji.id,
    address: vault ?? undefined,
    abi: vaultAccountAbi,
    functionName: "providerClaimable",
    args: payout ? [payout] : undefined,
    query: { enabled: Boolean(vault && payout) },
  });
  if (!vault || !payouts.length) return null;
  if (!payout)
    return (
      <p className="text-sm text-muted-foreground">
        To withdraw earnings, connect the payout address your agents are paid to.
      </p>
    );
  const amount = claimable.data ?? 0n;
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        disabled={Boolean(move.busy) || amount === 0n}
        onClick={() =>
          void move.run("Withdrawing…", async () => {
            await send((write) =>
              write({
                address: vault,
                abi: vaultAccountAbi,
                functionName: "withdrawProvider",
                args: [amount],
              }),
            );
            return `Withdrew ${usdc(amount)} USDC to ${payout.slice(0, 6)}…${payout.slice(-4)}.`;
          })
        }
      >
        {move.busy && <Spinner />}{" "}
        {move.busy || (amount === 0n ? "Nothing to withdraw yet" : `Withdraw ${usdc(amount)} USDC`)}
      </Button>
      {move.error && <ErrorNotice className="my-0">{move.error}</ErrorNotice>}
      {move.done && (
        <p role="status" className="text-sm text-primary">
          {move.done}
        </p>
      )}
    </div>
  );
}
