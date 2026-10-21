import canonicalize from "canonicalize";
import type { TypedDataToPrimitiveTypes } from "abitype";
import {
  hashTypedData,
  keccak256,
  toBytes,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";

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
    { name: "resolveDispute", type: "bool" },
    { name: "validUntil", type: "uint48" },
  ],
} as const;

type Messages = TypedDataToPrimitiveTypes<typeof paymentTypes>;
export type InvocationQuote = Messages["InvocationQuote"];
export type DebitAuthorization = Messages["DebitAuthorization"];
export type ResolutionDecision = Messages["ResolutionDecision"];

// Minimal write ABI derived from the same canonical structs as EIP-712. Keep
// transaction-journal calldata checks independent of generated build artifacts.
export const reserveHoldAbi = [
  {
    type: "function",
    name: "reserveHold",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quote", type: "tuple", components: paymentTypes.InvocationQuote },
      { name: "authorization", type: "tuple", components: paymentTypes.DebitAuthorization },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "holdId", type: "bytes32" }],
  },
] as const;

// Local tests may supply their isolated chain ID; deployed Payvoke v1 uses Fuji.
export function vaultDomain(vault: Address, chainId = 43113) {
  return { name: "PayvokeVault", version: "1", chainId, verifyingContract: vault } as const;
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
