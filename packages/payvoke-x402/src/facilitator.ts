import type { Address, Hex } from "viem";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
} from "@x402/core/types";
import { NETWORK, SCHEME } from "./index.js";

export class VaultValidationError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode = 422,
  ) {
    super(code);
  }
}

export type AdmissionObservation = {
  kind: "new-admission" | "existing-hold";
  payer: Address;
  quoteDigest: Hex;
  authorizationDigest: Hex;
  block: { number: string; hash: Hex; timestamp: string };
};
export type ValidatePayment = (
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) => Promise<AdmissionObservation>;

// No SDK hooks hold security gates. Both entry points call the authoritative
// validator directly, and settle deliberately has no broadcast implementation.
export class VaultFacilitatorScheme implements SchemeNetworkFacilitator {
  readonly scheme = SCHEME;
  readonly caipFamily = "eip155:*";
  constructor(
    private readonly options: { vault: Address; relayer: Address; validate: ValidatePayment },
  ) {}
  getExtra(network: Network) {
    if (network !== NETWORK) throw new VaultValidationError("unsupported_network", 400);
    return { vault: this.options.vault, schemeVersion: "1" };
  }
  getSigners(network: string) {
    return network === NETWORK ? [this.options.relayer] : [];
  }
  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    try {
      const observed = await this.options.validate(payload, requirements);
      return {
        isValid: true,
        payer: observed.payer,
        extra: {
          schemeVersion: "1",
          classification: observed.kind,
          block: observed.block,
          admission: "preview",
        },
      };
    } catch (error) {
      if (error instanceof VaultValidationError && error.statusCode < 500) {
        return { isValid: false, invalidReason: error.code };
      }
      throw error;
    }
  }
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    await this.options.validate(payload, requirements);
    // No dummy transaction hash, SettleResponse or abandoned queue entry.
    throw new VaultValidationError("settlement_unavailable", 503);
  }
}
