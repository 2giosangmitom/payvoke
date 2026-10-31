import { Type, type Static } from "typebox";
import { loadEnv, type DeploymentEnv } from "#core/runtime";
import { storageEnv } from "#core/storage";

const optionalText = () => Type.Optional(Type.String());
const optionalInteger = () => Type.Optional(Type.Integer());

const schema = Type.Object({
  HOST: Type.String({ default: "127.0.0.1" }),
  PORT: Type.Integer({ default: 3001 }),
  LOG_LEVEL: Type.String({ default: "info" }),
  DATABASE_URL: Type.String(),
  // Postgres connections per process; the API and its workers share them.
  DATABASE_POOL_MAX: Type.Integer({ minimum: 1, maximum: 50, default: 5 }),
  // Wake-ups, job queues and the shared rate-limit store; not a source of truth.
  REDIS_URL: Type.String(),
  API_ORIGIN: Type.String(),
  WEB_ORIGIN: Type.String(),
  BETTER_AUTH_SECRET: Type.String(),
  CHAIN_ID: Type.Integer({ default: 43113 }),
  USDC_ADDRESS: Type.String({ default: "0x5425890298aed601595a70AB815c96711a31Bc65" }),
  VAULT_ADDRESS: optionalText(),
  // true runs the in-process facilitator and needs the vault deployment below.
  PAYMENTS_ENABLED: Type.Boolean({ default: false }),
  // false = verify/preview only. true durably journals new submissions for the
  // settlement worker; journaling signs nothing.
  SETTLEMENT_ENABLED: Type.Boolean({ default: false }),
  // Vault deployment (packages/vault/ignition/deployments), required by the
  // facilitator and both signing workers.
  RPC_URL: optionalText(),
  RELAYER_ADDRESS: optionalText(),
  EXPECTED_VAULT_CODE_HASH: optionalText(),
  VAULT_FEE_CAP_BPS: optionalInteger(),
  VAULT_MAX_QUOTE_LIFETIME_SECONDS: optionalInteger(),
  VAULT_MAX_HOLD_SECONDS: optionalInteger(),
  // S3-compatible file storage; FILES_ENABLED=true requires the S3_* settings.
  ...storageEnv,
  FILE_MAX_BYTES: Type.Integer({ minimum: 1, maximum: 1073741824, default: 26214400 }),
  FILE_UPLOAD_TTL_SECONDS: Type.Integer({ minimum: 60, maximum: 3600, default: 600 }),
  FILE_DOWNLOAD_TTL_SECONDS: Type.Integer({ minimum: 30, maximum: 3600, default: 300 }),
  // Free pre-sale buyer messages per chat thread between paid invocations.
  PRESALE_MESSAGE_LIMIT: Type.Integer({ minimum: 1, maximum: 500, default: 20 }),

  // --- Workers, run inside this process ---
  // Keyless: delivery verification and upload cleanup.
  JOB_WORKER_ENABLED: Type.Boolean({ default: true }),
  // Signs and sends reserveHold with the relayer key.
  SETTLEMENT_WORKER_ENABLED: Type.Boolean({ default: false }),
  RELAYER_PRIVATE_KEY: optionalText(),
  // First block scanned for finalized holds (the vault deployment block).
  DEPLOYMENT_START_BLOCK: optionalText(),
  // Automatic refunds and releases with two distinct wallets.
  FINANCE_WORKER_ENABLED: Type.Boolean({ default: false }),
  FINANCE_APPROVER_PRIVATE_KEY: optionalText(),
  FINANCE_EXECUTOR_PRIVATE_KEY: optionalText(),
  // Gas budgets: integer strings in wei. Each signing wallet has its own.
  SETTLEMENT_GAS_MAX_LIMIT: optionalText(),
  SETTLEMENT_GAS_MAX_FEE_PER_GAS: optionalText(),
  SETTLEMENT_GAS_MAX_PRIORITY_FEE_PER_GAS: optionalText(),
  SETTLEMENT_GAS_MAX_TRANSACTION_COST: optionalText(),
  SETTLEMENT_GAS_MAX_OUTSTANDING_COST: optionalText(),
  SETTLEMENT_GAS_WINDOW_SECONDS: optionalInteger(),
  SETTLEMENT_GAS_MAX_WINDOW_COST: optionalText(),
  FINANCE_GAS_MAX_LIMIT: optionalText(),
  FINANCE_GAS_MAX_FEE_PER_GAS: optionalText(),
  FINANCE_GAS_MAX_PRIORITY_FEE_PER_GAS: optionalText(),
  FINANCE_GAS_MAX_TRANSACTION_COST: optionalText(),
  FINANCE_GAS_MAX_OUTSTANDING_COST: optionalText(),
  FINANCE_GAS_WINDOW_SECONDS: optionalInteger(),
  FINANCE_GAS_MAX_WINDOW_COST: optionalText(),
});

export type Config = Readonly<Static<typeof schema>>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(schema, source);
}

// The full vault deployment. Missing values fail startup instead of silently
// disabling a check.
export function deploymentConfig(config: Config): DeploymentEnv {
  const value = {
    API_ORIGIN: config.API_ORIGIN,
    RPC_URL: config.RPC_URL,
    VAULT_ADDRESS: config.VAULT_ADDRESS,
    RELAYER_ADDRESS: config.RELAYER_ADDRESS,
    EXPECTED_VAULT_CODE_HASH: config.EXPECTED_VAULT_CODE_HASH,
    VAULT_FEE_CAP_BPS: config.VAULT_FEE_CAP_BPS,
    VAULT_MAX_QUOTE_LIFETIME_SECONDS: config.VAULT_MAX_QUOTE_LIFETIME_SECONDS,
    VAULT_MAX_HOLD_SECONDS: config.VAULT_MAX_HOLD_SECONDS,
  };
  if (Object.values(value).some((entry) => entry === undefined))
    throw new Error("Payments require the vault deployment configuration");
  return value as DeploymentEnv;
}

// A signing worker's gas budget; every value is required and none is inferred.
export function gasBudget(config: Config, wallet: "SETTLEMENT" | "FINANCE") {
  const integer = (name: string) => {
    const value = config[`${wallet}_GAS_${name}` as keyof Config];
    if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
      throw new Error("Invalid worker policy");
    return BigInt(value);
  };
  const windowSeconds = config[`${wallet}_GAS_WINDOW_SECONDS`];
  if (windowSeconds === undefined) throw new Error("Invalid worker policy");
  return {
    maxGasLimit: integer("MAX_LIMIT"),
    maxFeePerGas: integer("MAX_FEE_PER_GAS"),
    maxPriorityFeePerGas: integer("MAX_PRIORITY_FEE_PER_GAS"),
    maxTransactionCost: integer("MAX_TRANSACTION_COST"),
    maxOutstandingCost: integer("MAX_OUTSTANDING_COST"),
    windowSeconds,
    maxWindowCost: integer("MAX_WINDOW_COST"),
  };
}
