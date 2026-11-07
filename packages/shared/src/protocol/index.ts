import canonicalize from "canonicalize";
import type { TypedDataToPrimitiveTypes } from "abitype";
import {
  hashStruct,
  hashTypedData,
  keccak256,
  toBytes,
  parseAbi,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";

// EIP-712 types signed against the vault's own domain.
export const paymentTypes = {
  InvocationQuote: [
    { name: "invocationKey", type: "bytes32" },
    { name: "quoteKey", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "usageSessionKey", type: "bytes32" },
    { name: "productKey", type: "bytes32" },
    { name: "productVersion", type: "uint64" },
    { name: "commandKey", type: "bytes32" },
    { name: "inputHash", type: "bytes32" },
    { name: "termsHash", type: "bytes32" },
    { name: "policyHash", type: "bytes32" },
    { name: "provider", type: "address" },
    { name: "asset", type: "address" },
    { name: "grossAmount", type: "uint256" },
    { name: "feeBps", type: "uint16" },
    { name: "feeRecipient", type: "address" },
    { name: "validUntil", type: "uint48" },
    { name: "deliveryDeadline", type: "uint48" },
    { name: "releaseNotBefore", type: "uint48" },
    { name: "resolveBy", type: "uint48" },
  ],
  DebitAuthorization: [
    { name: "quoteDigest", type: "bytes32" },
    { name: "grantId", type: "bytes32" },
    { name: "grantEpoch", type: "uint64" },
  ],
  ResolutionDecision: [
    { name: "holdId", type: "bytes32" },
    { name: "decisionId", type: "bytes32" },
    { name: "expectedVersion", type: "uint64" },
    { name: "refundAmount", type: "uint256" },
    { name: "releaseRemainder", type: "bool" },
    { name: "validUntil", type: "uint48" },
  ],
  GrantSetup: [
    { name: "buyer", type: "address" },
    { name: "grantId", type: "bytes32" },
    { name: "signer", type: "address" },
    { name: "expiresAt", type: "uint48" },
    { name: "maxPerCall", type: "uint256" },
    { name: "periodSeconds", type: "uint32" },
    { name: "maxPerPeriod", type: "uint256" },
    { name: "maxTotal", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
  ],
  GrantRevoke: [
    { name: "buyer", type: "address" },
    { name: "grantId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
  ],
} as const;

// EIP-712 types signed against USDC's domain (FiatToken v2.2).
export const usdcTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type Messages = TypedDataToPrimitiveTypes<typeof paymentTypes>;
type UsdcMessages = TypedDataToPrimitiveTypes<typeof usdcTypes>;
export type InvocationQuote = Messages["InvocationQuote"];
export type DebitAuthorization = Messages["DebitAuthorization"];
export type ResolutionDecision = Messages["ResolutionDecision"];
export type GrantSetup = Messages["GrantSetup"];
export type GrantRevoke = Messages["GrantRevoke"];
export type ReceiveAuthorization = UsdcMessages["ReceiveWithAuthorization"];
export type UsdcPermit = UsdcMessages["Permit"];
export type GrantConfig = {
  signer: Address;
  expiresAt: number;
  maxPerCall: bigint;
  periodSeconds: number;
  maxPerPeriod: bigint;
  maxTotal: bigint;
};
// The vault's Permit argument: an empty signature leaves the allowance alone.
export type VaultPermit = { value: bigint; deadline: bigint; signature: Hex };
export const NO_PERMIT: VaultPermit = { value: 0n, deadline: 0n, signature: "0x" };

export const FUNDING_SOURCE = { authorization: 1, grant: 2 } as const;
export type FundingMode = keyof typeof FUNDING_SOURCE;

const quoteTuple = { type: "tuple", components: paymentTypes.InvocationQuote } as const;
const grantConfigTuple = {
  type: "tuple",
  components: [
    { name: "signer", type: "address" },
    { name: "expiresAt", type: "uint48" },
    { name: "maxPerCall", type: "uint256" },
    { name: "periodSeconds", type: "uint32" },
    { name: "maxPerPeriod", type: "uint256" },
    { name: "maxTotal", type: "uint256" },
  ],
} as const;
const permitTuple = {
  type: "tuple",
  components: [
    { name: "value", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "signature", type: "bytes" },
  ],
} as const;

// Minimal write ABIs derived from the same canonical structs as EIP-712. Keep
// transaction-journal calldata checks independent of generated build artifacts.
export const fundHoldAbi = [
  {
    type: "function",
    name: "fundWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quote", ...quoteTuple },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "holdId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "fundWithGrant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quote", ...quoteTuple },
      { name: "authorization", type: "tuple", components: paymentTypes.DebitAuthorization },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "holdId", type: "bytes32" }],
  },
] as const;

export const grantAdminAbi = [
  {
    type: "function",
    name: "setGrantWithSig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "grantId", type: "bytes32" },
      { name: "config", ...grantConfigTuple },
      { name: "deadline", type: "uint48" },
      { name: "signature", type: "bytes" },
      { name: "permit", ...permitTuple },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeGrantWithSig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "grantId", type: "bytes32" },
      { name: "deadline", type: "uint48" },
      { name: "signature", type: "bytes" },
      { name: "permit", ...permitTuple },
    ],
    outputs: [],
  },
] as const;

const vaultErrors = [
  "error Unauthorized()",
  "error EnforcedPause()",
  "error InvalidAsset()",
  "error InvalidConfiguration()",
  "error InvalidAmount()",
  "error InvalidSignature()",
  "error SignatureExpired()",
  "error GrantNotFound()",
  "error GrantRevoked()",
  "error GrantExpired()",
  "error GrantEpochMismatch()",
  "error InsufficientAllowance()",
  "error InsufficientBalance()",
  "error AuthorizationUsed()",
  "error AuthorizationRejected()",
  "error PermitFailed()",
  "error PerCallLimitExceeded()",
  "error PeriodLimitExceeded()",
  "error TotalLimitExceeded()",
  "error FeeCapExceeded()",
  "error QuoteExpired()",
  "error DeadlineInvalid()",
  "error InvocationConflict()",
] as const;

// The USDC reads admission needs (FiatToken v2.2).
export const usdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function authorizationState(address authorizer,bytes32 nonce) view returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// Read/simulation ABI for the non-upgradeable v2 vault. The write structs still
// come from paymentTypes above, not a second copy of the quote field order.
export const vaultAdmissionAbi = [
  ...fundHoldAbi,
  ...grantAdminAbi,
  ...parseAbi([
    "function getGrant(address buyer, bytes32 grantId) view returns (((address signer,uint48 expiresAt,uint256 maxPerCall,uint32 periodSeconds,uint256 maxPerPeriod,uint256 maxTotal) config,uint64 epoch,uint256 spentTotal,uint256 spentInPeriod,uint64 currentPeriod,bool revoked) grant)",
    "function getHold(bytes32 holdId) view returns ((bytes32 quoteDigest,bytes32 authorizationDigest,address buyer,address provider,address feeRecipient,uint256 gross,uint256 refunded,uint256 remaining,uint256 providerReleased,uint256 feeReleased,uint16 feeBps,uint48 deliveryDeadline,uint48 releaseNotBefore,uint48 resolveBy,bool closed,uint64 version,bytes32 grantId,uint8 source) hold)",
    "function grantNonces(address buyer) view returns (uint256)",
    "function asset() view returns (address)",
    "function decimals() view returns (uint8)",
    "function feeCapBps() view returns (uint16)",
    "function maxQuoteLifetimeSeconds() view returns (uint48)",
    "function maxHoldSeconds() view returns (uint48)",
    "function paused() view returns (bool)",
    "function hasRole(bytes32 role,address account) view returns (bool)",
    ...vaultErrors,
  ]),
] as const;

export const holdFundedEvent = parseAbi([
  "event HoldFunded(bytes32 indexed holdId, address indexed buyer, bytes32 quoteDigest, bytes32 authorizationDigest, uint256 gross, uint8 source)",
])[0];

export const grantEvents = parseAbi([
  "event GrantSet(address indexed buyer, bytes32 indexed grantId, uint64 epoch)",
  "event GrantRevoked(address indexed buyer, bytes32 indexed grantId, uint64 epoch)",
]);

export const applyDecisionAbi = [
  {
    type: "function",
    name: "applyDecision",
    stateMutability: "nonpayable",
    inputs: [
      { name: "decision", type: "tuple", components: paymentTypes.ResolutionDecision },
      { name: "approver", type: "address" },
      { name: "approvalSignature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
// Every event that moves money into, inside or out of the vault.
export const vaultFinancialEvents = parseAbi([
  "event HoldFunded(bytes32 indexed holdId,address indexed buyer,bytes32 quoteDigest,bytes32 authorizationDigest,uint256 gross,uint8 source)",
  "event DecisionApplied(bytes32 indexed holdId,bytes32 indexed decisionId,uint64 version,uint256 refundAmount,uint256 providerAmount,uint256 feeAmount)",
  "event HoldReclaimed(bytes32 indexed holdId,address indexed buyer,uint256 amount)",
  "event PaymentDeferred(bytes32 indexed holdId,address indexed account,uint256 amount)",
  "event Claimed(address indexed account,address indexed to,uint256 amount)",
]);
export const vaultFinanceAbi = [
  ...vaultAdmissionAbi,
  ...applyDecisionAbi,
  ...vaultFinancialEvents,
  ...parseAbi([
    "function reclaim(bytes32 holdId)",
    "function usedDecisionIds(bytes32 id) view returns(bool)",
    "function totalHeld() view returns(uint256)",
    "function totalClaimable() view returns(uint256)",
    "function claimable(address account) view returns(uint256)",
    "error DecisionReplay()",
    "error HoldVersionMismatch()",
    "error HoldClosed()",
    "error ReleaseTooEarly()",
    "error ResolutionExpired()",
    "error NoEffect()",
    "error HoldNotFound()",
    "error ReclaimTooEarly()",
  ]),
] as const;

// What a buyer or provider sends from their own wallet: the grant escape hatch
// and withdrawing a payout the vault could not deliver.
export const vaultAccountAbi = [
  ...vaultFinanceAbi,
  ...grantEvents,
  ...parseAbi([
    "function revokeGrant(bytes32 grantId)",
    "function claim(address to)",
    "error InsufficientClaimable()",
  ]),
] as const;

// Local tests may supply their isolated chain ID; deployed Payvoke v2 uses Fuji.
export function vaultDomain(vault: Address, chainId = 43113) {
  return { name: "PayvokeVault", version: "2", chainId, verifyingContract: vault } as const;
}

// Circle's FiatToken v2.2 domain. Fuji USDC answers name "USD Coin", version "2".
export function usdcDomain(asset: Address, chainId = 43113) {
  return { name: "USD Coin", version: "2", chainId, verifyingContract: asset } as const;
}

export function hashQuote(domain: TypedDataDomain, quote: InvocationQuote): Hex {
  return hashTypedData({
    domain,
    types: paymentTypes,
    primaryType: "InvocationQuote",
    message: quote,
  });
}

export function hashAuthorization(domain: TypedDataDomain, authorization: DebitAuthorization): Hex {
  return hashTypedData({
    domain,
    types: paymentTypes,
    primaryType: "DebitAuthorization",
    message: authorization,
  });
}

export function hashDecision(domain: TypedDataDomain, decision: ResolutionDecision): Hex {
  return hashTypedData({
    domain,
    types: paymentTypes,
    primaryType: "ResolutionDecision",
    message: decision,
  });
}

// The one USDC authorization that funds `quote`: to the vault, for the gross
// amount, valid until the quote expires, with the quote digest as its nonce.
export function receiveAuthorization(
  vault: Address,
  quote: InvocationQuote,
  quoteDigest: Hex,
): ReceiveAuthorization {
  return {
    from: quote.buyer,
    to: vault,
    value: quote.grossAmount,
    validAfter: 0n,
    validBefore: BigInt(quote.validUntil),
    nonce: quoteDigest,
  };
}

// EIP-712 typed data the buyer's wallet signs to pay one quote.
export function receiveAuthorizationTypedData(
  asset: Address,
  vault: Address,
  quote: InvocationQuote,
  quoteDigest: Hex,
  chainId = 43113,
) {
  return {
    domain: usdcDomain(asset, chainId),
    types: usdcTypes,
    primaryType: "ReceiveWithAuthorization",
    message: receiveAuthorization(vault, quote, quoteDigest),
  } as const;
}

// The struct hash the vault records as an authorization-funded hold's
// authorization digest (PayvokeVault.hashReceiveAuthorization).
export function hashReceiveAuthorization(
  vault: Address,
  quote: InvocationQuote,
  quoteDigest: Hex,
): Hex {
  return hashStruct({
    data: receiveAuthorization(vault, quote, quoteDigest),
    primaryType: "ReceiveWithAuthorization",
    types: usdcTypes,
  });
}

export function grantSetupTypedData(vault: Address, message: GrantSetup, chainId = 43113) {
  return {
    domain: vaultDomain(vault, chainId),
    types: paymentTypes,
    primaryType: "GrantSetup",
    message,
  } as const;
}

export function grantRevokeTypedData(vault: Address, message: GrantRevoke, chainId = 43113) {
  return {
    domain: vaultDomain(vault, chainId),
    types: paymentTypes,
    primaryType: "GrantRevoke",
    message,
  } as const;
}

export function permitTypedData(asset: Address, message: UsdcPermit, chainId = 43113) {
  return {
    domain: usdcDomain(asset, chainId),
    types: usdcTypes,
    primaryType: "Permit",
    message,
  } as const;
}

// The allowance a buyer's active grants need: what each can still spend in total.
export function targetAllowance(
  grants: {
    config: { expiresAt: number | bigint; maxTotal: bigint };
    spentTotal: bigint;
    revoked: boolean;
  }[],
  now = Math.floor(Date.now() / 1000),
) {
  return grants.reduce(
    (sum, grant) =>
      grant.revoked ||
      Number(grant.config.expiresAt) <= now ||
      grant.spentTotal >= grant.config.maxTotal
        ? sum
        : sum + grant.config.maxTotal - grant.spentTotal,
    0n,
  );
}

export function businessKey(
  kind: "invocation" | "quote" | "session" | "product" | "command",
  id: string,
): Hex {
  return keccak256(toBytes(`payvoke:${kind}:${id}`));
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Accept JSON data, not objects with toJSON/getters or values silently omitted by JSON.stringify.
// Raw JSON duplicate-key rejection belongs at the HTTP parser, before objects reach this API.
export function canonicalSnapshot(value: Json): string {
  const active = new Set<object>();
  function validateString(text: string): void {
    for (const character of text) {
      const code = character.codePointAt(0)!;
      if (code >= 0xd800 && code <= 0xdfff) throw new Error("Invalid Unicode in snapshot");
    }
  }
  function validate(item: Json): void {
    if (typeof item === "string") return validateString(item);
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || item === null || active.has(item)) {
      throw new Error("Snapshot must contain only finite JSON data");
    }
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    ) {
      throw new Error("Snapshot must contain only plain JSON objects");
    }
    active.add(item);
    if (Array.isArray(item)) {
      if (
        Object.getPrototypeOf(item) !== Array.prototype ||
        Reflect.ownKeys(item).length !== item.length + 1
      ) {
        throw new Error("Invalid JSON array");
      }
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || !("value" in descriptor)) throw new Error("Invalid JSON array");
        validate(descriptor.value);
      }
    } else {
      for (const key of Reflect.ownKeys(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) {
          throw new Error("Invalid JSON property");
        }
        validateString(key);
        validate(descriptor.value);
      }
    }
    active.delete(item);
  }
  validate(value);
  return canonicalize(value)!;
}

export function hashSnapshot(value: Json): Hex {
  return keccak256(toBytes(canonicalSnapshot(value)));
}
