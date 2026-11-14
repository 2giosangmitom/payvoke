import type { Address, Hex } from "viem";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
} from "@x402/core/types";
import { NETWORK, SCHEME, SCHEME_VERSION } from "./index.js";

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
  mode: "authorization" | "grant";
  payer: Address;
  quoteDigest: Hex;
  authorizationDigest: Hex;
  block: { number: string; hash: Hex; timestamp: string };
};
export type ValidatePayment = (
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) => Promise<AdmissionObservation>;

// No SDK hooks hold security gates. The execution service independently binds
// intents and separates admission from reconciliation. The adapter has no keys.
export class VaultFacilitatorScheme implements SchemeNetworkFacilitator {
  readonly scheme = SCHEME;
  readonly caipFamily = "eip155:*";
  constructor(
    private readonly options: {
      vault: Address;
      relayer: Address;
      validate: ValidatePayment;
      settle?: (
        payload: PaymentPayload,
        requirements: PaymentRequirements,
      ) => Promise<SettleResponse>;
    },
  ) {}
  getExtra(network: Network) {
    if (network !== NETWORK) throw new VaultValidationError("unsupported_network", 400);
    return { vault: this.options.vault, schemeVersion: SCHEME_VERSION };
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
          schemeVersion: SCHEME_VERSION,
          mode: observed.mode,
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
    if (this.options.settle) return this.options.settle(payload, requirements);
    await this.options.validate(payload, requirements);
    // No dummy transaction hash, SettleResponse or abandoned queue entry.
    throw new VaultValidationError("settlement_unavailable", 503);
  }
}
