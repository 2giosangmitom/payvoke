import { useCallback } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  parseUnits,
  UserRejectedRequestError,
  type Hash,
} from "viem";
import { useConnection, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { avalancheFuji } from "wagmi/chains";

export { vaultAccountAbi } from "@payvoke/shared/protocol";

// Vault reverts a person can act on, in their words.
const reverts: Record<string, string> = {
  EnforcedPause: "The vault is paused. Try again later.",
  InsufficientBalance: "Your wallet does not hold enough USDC for this.",
  InsufficientAllowance: "The USDC allowance for the vault is below this amount.",
  InsufficientClaimable: "There is nothing for this address to claim.",
  InvalidAmount: "Enter an amount above zero.",
  InvalidConfiguration:
    "Those limits are not valid: per job ≤ per period ≤ total, and a future expiry.",
  GrantNotFound: "This grant does not exist in the vault.",
  GrantRevoked: "This grant is already revoked.",
};

export function chainError(cause: unknown) {
  if (cause instanceof BaseError) {
    if (cause.walk((error) => error instanceof UserRejectedRequestError))
      return "You declined the request in your wallet.";
    const revert = cause.walk((error) => error instanceof ContractFunctionRevertedError);
    const name =
      revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name) return reverts[name] ?? `The vault refused: ${name}.`;
    return cause.shortMessage;
  }
  return cause instanceof Error ? cause.message : "Transaction failed.";
}

// A typed USDC amount ("12.5") in atomic units, or null when it is not one.
export function parseUsdc(value: string) {
  if (!/^\d+(\.\d{0,6})?$/.test(value.trim())) return null;
  const atomic = parseUnits(value.trim(), 6);
  return atomic > 0n ? atomic : null;
}

type Write = ReturnType<typeof useWriteContract>["mutateAsync"];

// Sends a contract write from the connected wallet on Fuji, switching
// chain first, and resolves once it is mined.
export function useVaultWrite() {
  const { chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { mutateAsync: write } = useWriteContract();
  const client = usePublicClient({ chainId: avalancheFuji.id });
  return useCallback(
    async (send: (write: Write) => Promise<Hash>) => {
      if (!client) throw new Error("Avalanche Fuji is not reachable.");
      if (chainId !== avalancheFuji.id) await switchChain({ chainId: avalancheFuji.id });
      const receipt = await client.waitForTransactionReceipt({ hash: await send(write) });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      return receipt;
    },
    [chainId, client, switchChain, write],
  );
}
