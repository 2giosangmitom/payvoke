import envSchema from "env-schema";
import { Type, type Static } from "typebox";
import { getAddress } from "viem";
import { ASSET } from "@payvoke/x402";
import { VaultValidationError } from "@payvoke/x402/facilitator";
import type { VaultDeployment } from "@payvoke/x402/chain";

const schema = Type.Object({
  SETTLEMENT_ENABLED: Type.Boolean({ default: false }),
  HOST: Type.String({ default: "127.0.0.1" }),
  PORT: Type.Integer({ default: 3002 }),
  LOG_LEVEL: Type.String({ default: "info" }),
  DATABASE_URL: Type.String(),
  RPC_URL: Type.String(),
  FACILITATOR_TOKEN: Type.String(),
  API_ORIGIN: Type.String(),
  VAULT_ADDRESS: Type.String(),
  RELAYER_ADDRESS: Type.String(),
  EXPECTED_VAULT_CODE_HASH: Type.String(),
  VAULT_FEE_CAP_BPS: Type.Integer(),
  VAULT_MAX_QUOTE_LIFETIME_SECONDS: Type.Integer(),
  VAULT_MAX_HOLD_SECONDS: Type.Integer(),
});
export type FacilitatorConfig = Readonly<Static<typeof schema>>;
export function loadFacilitatorConfig(source: NodeJS.ProcessEnv = process.env): FacilitatorConfig {
  return envSchema<FacilitatorConfig>({ schema, data: source, env: false });
}
// Semantic policy is intentionally outside env-schema: no alternate runtime
// chain/asset switch or local-dev deployment fallback is exposed here.
export function facilitatorDeployment(
  config: Pick<
    FacilitatorConfig,
    | "RPC_URL"
    | "API_ORIGIN"
    | "VAULT_ADDRESS"
    | "RELAYER_ADDRESS"
    | "EXPECTED_VAULT_CODE_HASH"
    | "VAULT_FEE_CAP_BPS"
    | "VAULT_MAX_QUOTE_LIFETIME_SECONDS"
    | "VAULT_MAX_HOLD_SECONDS"
  >,
): VaultDeployment {
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(config.EXPECTED_VAULT_CODE_HASH) ||
    config.VAULT_FEE_CAP_BPS < 0 ||
    config.VAULT_FEE_CAP_BPS > 10000 ||
    config.VAULT_MAX_QUOTE_LIFETIME_SECONDS < 1 ||
    config.VAULT_MAX_HOLD_SECONDS <= config.VAULT_MAX_QUOTE_LIFETIME_SECONDS
  ) {
    throw new VaultValidationError("invalid_facilitator_policy", 503);
  }
  const api = new URL(config.API_ORIGIN);
  const rpc = new URL(config.RPC_URL);
  for (const url of [api, rpc]) {
    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    ) {
      throw new VaultValidationError("insecure_facilitator_transport", 503);
    }
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
