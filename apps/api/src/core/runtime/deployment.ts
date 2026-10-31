import { z } from "zod";
import { getAddress } from "viem";
import { ASSET } from "@payvoke/shared/x402";
import { VaultValidationError } from "@payvoke/shared/x402/facilitator";
import type { VaultDeployment } from "@payvoke/shared/x402/chain";
import { envInteger, envString, isSafeServiceUrl } from "./env";

// Shared by every process that talks to the deployed vault. Values come from an
// approved deployment manifest (packages/vault/ignition/deployments).
export const deploymentEnv = {
  API_ORIGIN: envString(),
  RPC_URL: envString(),
  VAULT_ADDRESS: envString(),
  RELAYER_ADDRESS: envString(),
  EXPECTED_VAULT_CODE_HASH: envString(),
  VAULT_FEE_CAP_BPS: envInteger(),
  VAULT_MAX_QUOTE_LIFETIME_SECONDS: envInteger(),
  VAULT_MAX_HOLD_SECONDS: envInteger(),
};
export type DeploymentEnv = z.output<z.ZodObject<typeof deploymentEnv>>;

// Semantic policy is intentionally outside the env schema: no alternate runtime
// chain/asset switch or local-dev deployment fallback is exposed here.
export function vaultDeployment(config: DeploymentEnv): VaultDeployment {
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(config.EXPECTED_VAULT_CODE_HASH) ||
    config.VAULT_FEE_CAP_BPS < 0 ||
    config.VAULT_FEE_CAP_BPS > 10000 ||
    config.VAULT_MAX_QUOTE_LIFETIME_SECONDS < 1 ||
    config.VAULT_MAX_HOLD_SECONDS <= config.VAULT_MAX_QUOTE_LIFETIME_SECONDS
  ) {
    throw new VaultValidationError("invalid_facilitator_policy", 503);
  }
  for (const url of [new URL(config.API_ORIGIN), new URL(config.RPC_URL)]) {
    if (!isSafeServiceUrl(url))
      throw new VaultValidationError("insecure_facilitator_transport", 503);
  }
  return {
    chainId: 43113,
    asset: ASSET,
    vault: getAddress(config.VAULT_ADDRESS),
    relayer: getAddress(config.RELAYER_ADDRESS),
    expectedCodeHash: config.EXPECTED_VAULT_CODE_HASH as `0x${string}`,
    feeCapBps: config.VAULT_FEE_CAP_BPS,
    maxQuoteLifetimeSeconds: config.VAULT_MAX_QUOTE_LIFETIME_SECONDS,
    maxHoldSeconds: config.VAULT_MAX_HOLD_SECONDS,
  };
}
