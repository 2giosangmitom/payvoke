import { createPublicClient, getAddress, http, type Address, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { vaultAdmissionAbi } from "@payvoke/shared/protocol";
import type { QuoteDocument } from "@payvoke/shared/x402";
import type { Cradle } from "../../container";
import type { Config } from "../../config";

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

// Reads a grant and a buyer's free vault balance. Null without a vault.
export type GrantReader = {
  grant(buyer: Address, grantId: Hex): Promise<OnChainGrant>;
  available(buyer: Address): Promise<bigint>;
};

export function createGrantReader(config: Config): GrantReader | null {
  if (!config.VAULT_ADDRESS) return null;
  const vault = getAddress(config.VAULT_ADDRESS);
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
    available: (buyer) =>
      client.readContract({
        address: vault,
        abi: vaultAdmissionAbi,
        functionName: "availableBalance",
        args: [buyer],
      }),
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
  available: bigint;
  // Why the grant cannot pay at all right now, if it cannot.
  blocked: "revoked" | "expired" | "not_found" | null;
};

// Why a quote goes to the buyer for approval instead of being autopaid.
export type ApprovalReason =
  | "no_autopay"
  | "revoked"
  | "expired"
  | "not_found"
  | "over_per_call"
  | "over_daily"
  | "over_total"
  | "low_balance"
  | "chain_unavailable";

// A coding agent's spending policy is its access token's linked vault grant.
// The vault enforces the limits; reading them here first lets the agent pay
// what fits and send the buyer an approval link for the rest, instead of
// signing a debit the vault would refuse.
export class AutopayService {
  private readonly db: Cradle["db"];
  private readonly reader: Cradle["grantReader"];

  constructor({ db, grantReader }: Cradle) {
    this.db = db;
    this.reader = grantReader;
  }

  // The token's limits with today's spending, or null when the token has no
  // autopay grant. Throws when the chain cannot be read.
  async limits(tokenId: string): Promise<Limits | null> {
    const row = await this.db.vaultGrant.findUnique({ where: { tokenId } });
    if (!row) return null;
    if (!this.reader) throw new Error("chain_unavailable");
    const buyer = getAddress(row.buyer);
    const [grant, available] = await Promise.all([
      this.reader.grant(buyer, row.grantId as Hex),
      this.reader.available(buyer),
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
      available,
      blocked:
        grant.epoch === 0n
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

  private async buyer(tokenId: string) {
    const row = await this.db.vaultGrant.findUnique({
      where: { tokenId },
      select: { buyer: true },
    });
    return row?.buyer.toLowerCase();
  }

  // Whether the token's grant can pay this quote by itself.
  async decide(
    tokenId: string,
    quote: QuoteDocument,
  ): Promise<{ autopay: Limits } | { approve: ApprovalReason; limits: Limits | null }> {
    let limits: Limits | null;
    try {
      limits = await this.limits(tokenId);
    } catch {
      return { approve: "chain_unavailable", limits: null };
    }
    if (!limits) return { approve: "no_autopay", limits };
    if (limits.blocked) return { approve: limits.blocked, limits };
    if (quote.protocolQuote.buyer.toLowerCase() !== (await this.buyer(tokenId)))
      return { approve: "no_autopay", limits };
    const amount = BigInt(quote.grossAmount);
    if (amount > limits.maxPerCall) return { approve: "over_per_call", limits };
    if (limits.spentToday + amount > limits.maxPerDay) return { approve: "over_daily", limits };
    if (limits.spentTotal + amount > limits.maxTotal) return { approve: "over_total", limits };
    if (limits.available < amount) return { approve: "low_balance", limits };
    return { autopay: limits };
  }
}
