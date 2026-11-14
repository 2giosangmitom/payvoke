import { useCallback } from "react";
import { erc20Abi, type Address, type Hex } from "viem";
import { useConnection, usePublicClient, useSignTypedData, useSwitchChain } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import {
  grantRevokeTypedData,
  grantSetupTypedData,
  permitTypedData,
  usdcAbi,
  vaultAdmissionAbi,
  type GrantConfig,
} from "@payvoke/shared/protocol";
import { ASSET } from "@payvoke/shared/x402";
import { getGrantOperation, submitGrantOperation } from "@/src/features/keys/grants";

// Signatures stay valid this long; the relayer submits within seconds.
const SIGNATURE_LIFETIME = 3600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// What the relayer said when it gave up, in the buyer's words.
const reasons: Record<string, string> = {
  invalid_signature: "The vault did not accept the signature. Try again.",
  signature_expired: "The signature expired before it reached the vault. Try again.",
  permit_failed: "USDC did not accept the spending approval. Try again.",
  grant_revoked: "This limit was already revoked.",
  invalid_configuration:
    "Those limits are not valid: per job ≤ per period ≤ total, and a future expiry.",
  transaction_reverted: "The vault refused the change on chain.",
};

// Waits until the relayer's transaction is final, or the change stops for good.
async function settle(id: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const operation = await getGrantOperation(id);
    if (operation.state === "FINALIZED") return operation;
    if (["REJECTED", "REVERTED", "QUARANTINED"].includes(operation.state))
      throw new Error(
        reasons[operation.errorReason ?? ""] ??
          `The change did not go through (${operation.errorReason ?? operation.state}).`,
      );
    await sleep(2_000);
  }
  throw new Error("The change is still being confirmed. Check again in a minute.");
}

// The USDC allowance after a grant change: what the other grants still need,
// plus what this one may still spend. The vault pulls each job through it.
export function nextAllowance(current: bigint, removed: bigint, added: bigint) {
  const kept = current > removed ? current - removed : 0n;
  return kept + added;
}

// Creates, updates and revokes spending grants without gas: the connected
// wallet signs the grant change and a USDC permit, and Payvoke's relayer
// submits both in one vault call.
export function useGrantChanges(vault: Address | null) {
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const client = usePublicClient({ chainId: avalancheFuji.id });

  const prepare = useCallback(
    async (buyer: Address) => {
      if (!vault) throw new Error("The vault is not configured here.");
      if (!client) throw new Error("Avalanche Fuji is not reachable.");
      if (address?.toLowerCase() !== buyer.toLowerCase())
        throw new Error(
          `Connect ${buyer.slice(0, 6)}…${buyer.slice(-4)}, the wallet this limit pays from.`,
        );
      // A wallet signs typed data only for the chain it is on.
      if (chainId !== avalancheFuji.id) await switchChain({ chainId: avalancheFuji.id });
      const [nonce, permitNonce, allowance, block] = await Promise.all([
        client.readContract({
          address: vault,
          abi: vaultAdmissionAbi,
          functionName: "grantNonces",
          args: [buyer],
        }),
        client.readContract({
          address: ASSET,
          abi: usdcAbi,
          functionName: "nonces",
          args: [buyer],
        }),
        client.readContract({
          address: ASSET,
          abi: erc20Abi,
          functionName: "allowance",
          args: [buyer, vault],
        }),
        client.getBlock(),
      ]);
      const deadline = Number(block.timestamp) + SIGNATURE_LIFETIME;
      return { vault, nonce, permitNonce, allowance, deadline };
    },
    [address, chainId, client, switchChain, vault],
  );

  const permit = useCallback(
    async (buyer: Address, vault: Address, value: bigint, nonce: bigint, deadline: number) => ({
      value: value.toString(),
      deadline: String(deadline),
      signature: await signTypedDataAsync(
        permitTypedData(ASSET, {
          owner: buyer,
          spender: vault,
          value,
          nonce,
          deadline: BigInt(deadline),
        }),
      ),
    }),
    [signTypedDataAsync],
  );

  // `previousTotal` is what an existing grant could still spend before this
  // change, so the allowance moves by the difference.
  const setGrant = useCallback(
    async (input: {
      buyer: Address;
      grantId: Hex;
      config: GrantConfig;
      previousRemaining?: bigint;
      spent?: bigint;
    }) => {
      const p = await prepare(input.buyer);
      const remaining = input.config.maxTotal - (input.spent ?? 0n);
      const allowance = nextAllowance(
        p.allowance,
        input.previousRemaining ?? 0n,
        remaining > 0n ? remaining : 0n,
      );
      const signature = await signTypedDataAsync(
        grantSetupTypedData(p.vault, {
          buyer: input.buyer,
          grantId: input.grantId,
          ...input.config,
          nonce: p.nonce,
          deadline: p.deadline,
        }),
      );
      const operation = await submitGrantOperation({
        kind: "set",
        buyer: input.buyer,
        grantId: input.grantId,
        config: {
          signer: input.config.signer,
          expiresAt: input.config.expiresAt,
          maxPerCall: input.config.maxPerCall.toString(),
          periodSeconds: input.config.periodSeconds,
          maxPerPeriod: input.config.maxPerPeriod.toString(),
          maxTotal: input.config.maxTotal.toString(),
        },
        deadline: p.deadline,
        signature,
        permit: await permit(input.buyer, p.vault, allowance, p.permitNonce, p.deadline),
      });
      return settle(operation.id);
    },
    [permit, prepare, signTypedDataAsync],
  );

  // `remaining` is what the grant could still spend; the allowance drops by it.
  const revokeGrant = useCallback(
    async (input: { buyer: Address; grantId: Hex; remaining: bigint }) => {
      const p = await prepare(input.buyer);
      const allowance = nextAllowance(p.allowance, input.remaining, 0n);
      const signature = await signTypedDataAsync(
        grantRevokeTypedData(p.vault, {
          buyer: input.buyer,
          grantId: input.grantId,
          nonce: p.nonce,
          deadline: p.deadline,
        }),
      );
      const operation = await submitGrantOperation({
        kind: "revoke",
        buyer: input.buyer,
        grantId: input.grantId,
        deadline: p.deadline,
        signature,
        ...(allowance !== p.allowance
          ? { permit: await permit(input.buyer, p.vault, allowance, p.permitNonce, p.deadline) }
          : {}),
      });
      return settle(operation.id);
    },
    [permit, prepare, signTypedDataAsync],
  );

  return { setGrant, revokeGrant };
}
