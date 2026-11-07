import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";
import { avalancheFuji } from "viem/chains";
import { ASSET } from "@payvoke/shared/x402";
import { usdcAbi, vaultAdmissionAbi } from "@payvoke/shared/protocol";
import type { QuoteDocument } from "@payvoke/shared/x402";
import type { Cradle } from "../../container";
import type { Config } from "../../config";
import type { RiskSignal } from "./payment-risk.service";
import { fundingThrottled } from "#core/payments/validation";

export type OnChainGrant = {
  config: {
    signer: Address;
    expiresAt: number;
    maxPerCall: bigint;
    periodSeconds: number;
    maxPerPeriod: bigint;
    maxTotal: bigint;
  };
  epoch: bigint;
  spentTotal: bigint;
  spentInPeriod: bigint;
  currentPeriod: bigint;
  revoked: boolean;
};

// A relayed grant change, as the vault takes it.
export type GrantCall =
  | {
      functionName: "setGrantWithSig";
      args: readonly [
        Address,
        Hex,
        OnChainGrant["config"],
        number,
        Hex,
        { value: bigint; deadline: bigint; signature: Hex },
      ];
    }
  | {
      functionName: "revokeGrantWithSig";
      args: readonly [
        Address,
        Hex,
        number,
        Hex,
        { value: bigint; deadline: bigint; signature: Hex },
      ];
    };

// Chain reads for grants and wallet funding. Null without a vault.
export type GrantReader = {
  grant(buyer: Address, grantId: Hex): Promise<OnChainGrant>;
  // What the buyer's wallet can put into a job: its USDC and the vault allowance.
  wallet(buyer: Address): Promise<{ balance: bigint; allowance: bigint }>;
  // The nonce the buyer's next grant signature must carry.
  nonce(buyer: Address): Promise<bigint>;
  // Checks a buyer signature the way the vault does: ECDSA or ERC-1271/6492.
  verify(typed: TypedDataDefinition & { address: Address; signature: Hex }): Promise<boolean>;
  // Simulates a relayed grant change from the relayer; the vault's revert, or null.
  simulate(call: GrantCall): Promise<string | null>;
};

export function createGrantReader(config: Config): GrantReader | null {
  if (!config.VAULT_ADDRESS) return null;
  const vault = getAddress(config.VAULT_ADDRESS);
  const relayer = config.RELAYER_ADDRESS ? getAddress(config.RELAYER_ADDRESS) : undefined;
  const client = createPublicClient({
    chain: avalancheFuji,
    transport: http(config.RPC_URL, { retryCount: 1, timeout: 10000 }),
  });
  return {
    grant: async (buyer, grantId) =>
      (await client.readContract({
        address: vault,
        abi: vaultAdmissionAbi,
        functionName: "getGrant",
        args: [buyer, grantId],
      })) as OnChainGrant,
    wallet: async (buyer) => {
      const [balance, allowance] = await Promise.all([
        client.readContract({
          address: ASSET,
          abi: usdcAbi,
          functionName: "balanceOf",
          args: [buyer],
        }),
        client.readContract({
          address: ASSET,
          abi: usdcAbi,
          functionName: "allowance",
          args: [buyer, vault],
        }),
      ]);
      return { balance, allowance };
    },
    nonce: (buyer) =>
      client.readContract({
        address: vault,
        abi: vaultAdmissionAbi,
        functionName: "grantNonces",
        args: [buyer],
      }),
    verify: async (typed) => {
      try {
        return await client.verifyTypedData(typed);
      } catch {
        return false;
      }
    },
    simulate: async (call) => {
      if (!relayer) return "relayer_unavailable";
      try {
        await client.simulateContract({
          address: vault,
          abi: vaultAdmissionAbi,
          account: relayer,
          ...call,
        } as never);
        return null;
      } catch (error) {
        const revert =
          error instanceof BaseError
            ? error.walk((e) => e instanceof ContractFunctionRevertedError)
            : undefined;
        if (revert instanceof ContractFunctionRevertedError)
          return revert.data?.errorName ?? "simulation_reverted";
        throw error;
      }
    },
  };
}

export type Limits = {
  grantId: Hex;
  grantEpoch: bigint;
  signer: Address;
  expiresAt: number;
  maxPerCall: bigint;
  maxPerDay: bigint;
  maxTotal: bigint;
  spentToday: bigint;
  spentTotal: bigint;
  // What the buyer's wallet holds, and what the vault may still pull from it.
  balance: bigint;
  allowance: bigint;
  // Why the grant cannot pay at all right now, if it cannot.
  // `recreate_key`: the key predates signing with the key alone, so its
  // grant's signer is not one Payvoke can derive.
  blocked: "revoked" | "expired" | "not_found" | "recreate_key" | null;
};

// Why a quote goes to the buyer for approval instead of being autopaid.
export type ApprovalReason =
  | "no_autopay"
  | "recreate_key"
  | "revoked"
  | "expired"
  | "not_found"
  | "over_per_call"
  | "over_daily"
  | "over_total"
  | "low_wallet_balance"
  | "low_allowance"
  | "funding_throttled"
  | "chain_unavailable"
  | RiskSignal;

// An API key's spending policy is its linked vault grant, whose signer is
// derived from the key. The vault pulls each job from the buyer's wallet
// through the allowance, within the grant's limits; reading them here first
// lets the agent pay what fits and send the buyer an approval link for the
// rest, instead of signing a debit the vault would refuse.
export class AutopayService {
  private readonly db: Cradle["db"];
  private readonly reader: Cradle["grantReader"];
  private readonly risk: Cradle["paymentRiskService"];

  constructor({ db, grantReader, paymentRiskService }: Cradle) {
    this.db = db;
    this.reader = grantReader;
    this.risk = paymentRiskService;
  }

  // The token's limits with today's spending, or null when the token has no
  // autopay grant. `signer` is the token's derived signer, null on older
  // keys. Throws when the chain cannot be read.
  async limits(tokenId: string, signer: string | null): Promise<Limits | null> {
    const row = await this.db.vaultGrant.findUnique({ where: { tokenId } });
    if (!row) return null;
    if (!this.reader) throw new Error("chain_unavailable");
    const buyer = getAddress(row.buyer);
    const [grant, wallet] = await Promise.all([
      this.reader.grant(buyer, row.grantId as Hex),
      this.reader.wallet(buyer),
    ]);
    const now = Math.floor(Date.now() / 1000);
    const period = grant.config.periodSeconds || 1;
    // The vault counts spending per fixed period: a day resets at 00:00 UTC.
    const spentToday =
      grant.currentPeriod === BigInt(Math.floor(now / period)) ? grant.spentInPeriod : 0n;
    return {
      grantId: row.grantId as Hex,
      grantEpoch: grant.epoch,
      signer: getAddress(row.signer),
      expiresAt: Number(grant.config.expiresAt),
      maxPerCall: grant.config.maxPerCall,
      maxPerDay: grant.config.maxPerPeriod,
      maxTotal: grant.config.maxTotal,
      spentToday,
      spentTotal: grant.spentTotal,
      balance: wallet.balance,
      allowance: wallet.allowance,
      blocked:
        !signer || signer.toLowerCase() !== row.signer.toLowerCase()
          ? "recreate_key"
          : grant.epoch === 0n
            ? "not_found"
            : grant.revoked
              ? "revoked"
              : Number(grant.config.expiresAt) <= now
                ? "expired"
                : grant.config.signer.toLowerCase() !== row.signer.toLowerCase()
                  ? "not_found"
                  : null,
    };
  }

  private async owner(tokenId: string) {
    const row = await this.db.vaultGrant.findUnique({
      where: { tokenId },
      select: { buyer: true, userId: true },
    });
    return row ? { buyer: row.buyer.toLowerCase(), userId: row.userId } : null;
  }

  // Whether the token's grant can pay this quote by itself. A quote within
  // the caps still goes to the buyer when the risk layer flags it.
  async decide(
    tokenId: string,
    signer: string | null,
    quote: QuoteDocument,
  ): Promise<
    { autopay: Limits } | { approve: ApprovalReason; limits: Limits | null; risk?: RiskSignal[] }
  > {
    let limits: Limits | null;
    try {
      limits = await this.limits(tokenId, signer);
    } catch {
      return { approve: "chain_unavailable", limits: null };
    }
    if (!limits) return { approve: "no_autopay", limits };
    if (limits.blocked) return { approve: limits.blocked, limits };
    const owner = await this.owner(tokenId);
    if (!owner || quote.protocolQuote.buyer.toLowerCase() !== owner.buyer)
      return { approve: "no_autopay", limits };
    if (await fundingThrottled(this.db, owner.userId))
      return { approve: "funding_throttled", limits };
    const amount = BigInt(quote.grossAmount);
    if (amount > limits.maxPerCall) return { approve: "over_per_call", limits };
    if (limits.spentToday + amount > limits.maxPerDay) return { approve: "over_daily", limits };
    if (limits.spentTotal + amount > limits.maxTotal) return { approve: "over_total", limits };
    if (limits.allowance < amount) return { approve: "low_allowance", limits };
    if (limits.balance < amount) return { approve: "low_wallet_balance", limits };
    const risk = await this.risk.assess(quote.quoteId);
    if (risk.length) return { approve: risk[0], limits, risk };
    return { autopay: limits };
  }
}
