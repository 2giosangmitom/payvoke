import {
  keccak256,
  zeroAddress,
  type Address,
  type ContractFunctionReturnType,
  type Hex,
  type PublicClient,
} from "viem";
import { FUNDING_SOURCE, vaultAdmissionAbi, type InvocationQuote } from "@payvoke/shared/protocol";
import { ASSET } from "@payvoke/shared/x402";
import { VaultChain } from "@payvoke/shared/x402/chain";

type Grant = ContractFunctionReturnType<typeof vaultAdmissionAbi, "view", "getGrant">;
type Hold = ContractFunctionReturnType<typeof vaultAdmissionAbi, "view", "getHold">;
export const blockHash = `0x${"a".repeat(64)}` as Hex;
export const code = "0x60006000" as const;
export function emptyHold(): Hold {
  const zero = `0x${"0".repeat(64)}` as Hex;
  return {
    quoteDigest: zero,
    authorizationDigest: zero,
    buyer: zeroAddress,
    provider: zeroAddress,
    feeRecipient: zeroAddress,
    gross: 0n,
    refunded: 0n,
    remaining: 0n,
    providerReleased: 0n,
    feeReleased: 0n,
    feeBps: 0,
    deliveryDeadline: 0,
    releaseNotBefore: 0,
    resolveBy: 0,
    closed: false,
    version: 0n,
    grantId: zero,
    source: 0,
  };
}
export function matchingHold(
  q: InvocationQuote,
  digest: Hex,
  quoteDigest: Hex,
  grantId: Hex,
  source: number = FUNDING_SOURCE.grant,
): Hold {
  return {
    ...emptyHold(),
    quoteDigest,
    authorizationDigest: digest,
    buyer: q.buyer,
    provider: q.provider,
    feeRecipient: q.feeRecipient,
    gross: q.grossAmount,
    remaining: q.grossAmount,
    feeBps: q.feeBps,
    deliveryDeadline: q.deliveryDeadline,
    releaseNotBefore: q.releaseNotBefore,
    resolveBy: q.resolveBy,
    grantId,
    source,
    version: 1n,
  };
}
export function mockVault(q: InvocationQuote, vault: Address, signer: Address, relayer: Address) {
  const now = BigInt(q.validUntil - 120);
  const grant: Grant = {
    config: {
      signer,
      expiresAt: Number(now) + 86400,
      maxPerCall: 1000000n,
      periodSeconds: 3600,
      maxPerPeriod: 2000000n,
      maxTotal: 3000000n,
    },
    epoch: 1n,
    spentTotal: 0n,
    spentInPeriod: 0n,
    currentPeriod: now / 3600n,
    revoked: false,
  };
  const state = {
    chainId: 43113,
    now,
    hold: emptyHold(),
    grant,
    // The buyer's wallet: USDC, allowance for the vault, and whether its
    // authorization for this quote is already used.
    balance: 10000000n,
    allowance: 10000000n,
    authorizationUsed: false,
    signatureValid: true,
    paused: false,
    role: true,
    feeCap: 500,
    quoteCap: 3600,
    holdCap: 30 * 86400,
    asset: ASSET as Address,
    decimals: 6,
    code: code as Hex,
    snapshotChanged: false,
    rpcError: false,
    simulationError: undefined as Error | undefined,
  };
  const calls: { method: string; blockNumber?: bigint; account?: Address; args?: unknown }[] = [];
  const broken = () => {
    if (state.rpcError)
      throw new Error("https://secret-rpc.test/key SQL credentials must not escape");
  };
  const client = {
    async getChainId() {
      broken();
      calls.push({ method: "chainId" });
      return state.chainId;
    },
    async getBlock(options: { blockNumber?: bigint }) {
      broken();
      calls.push({ method: "block", blockNumber: options.blockNumber });
      return {
        number: 10n,
        timestamp: state.now,
        hash:
          options.blockNumber !== undefined && state.snapshotChanged
            ? `0x${"b".repeat(64)}`
            : blockHash,
      };
    },
    async getCode(options: { blockNumber?: bigint }) {
      broken();
      calls.push({ method: "code", ...options });
      return state.code;
    },
    async readContract(options: { functionName: string; blockNumber?: bigint }) {
      broken();
      calls.push({ method: options.functionName, blockNumber: options.blockNumber });
      switch (options.functionName) {
        case "getHold":
          return state.hold;
        case "getGrant":
          return state.grant;
        case "asset":
          return state.asset;
        case "decimals":
          return state.decimals;
        case "hasRole":
          return state.role;
        case "paused":
          return state.paused;
        case "feeCapBps":
          return state.feeCap;
        case "maxQuoteLifetimeSeconds":
          return state.quoteCap;
        case "maxHoldSeconds":
          return state.holdCap;
        case "balanceOf":
          return state.balance;
        case "allowance":
          return state.allowance;
        case "authorizationState":
          return state.authorizationUsed;
        default:
          throw new Error("Unexpected mock read");
      }
    },
    async verifyTypedData() {
      broken();
      calls.push({ method: "verifyTypedData" });
      return state.signatureValid;
    },
    async simulateContract(options: { blockNumber?: bigint; account?: Address; args: unknown }) {
      broken();
      calls.push({ method: "simulate", ...options });
      if (state.simulationError) throw state.simulationError;
      return { result: q.invocationKey };
    },
  };
  const chain = new VaultChain(client as unknown as PublicClient, {
    chainId: 43113,
    asset: ASSET,
    vault,
    relayer,
    expectedCodeHash: keccak256(code),
    feeCapBps: 500,
    maxQuoteLifetimeSeconds: 3600,
    maxHoldSeconds: 30 * 86400,
  });
  return { chain, state, calls };
}
