import { Type, type Static } from "typebox";
import { deploymentEnv, loadEnv } from "@payvoke/server";
import { validateGasPolicy } from "./worker";

const schema = Type.Object({
  EXECUTION_ENABLED: Type.Boolean({ default: false }),
  DATABASE_URL: Type.String(),
  ...deploymentEnv,
  RELAYER_PRIVATE_KEY: Type.String(),
  DEPLOYMENT_START_BLOCK: Type.String(),
  GAS_MAX_LIMIT: Type.String(),
  GAS_MAX_FEE_PER_GAS: Type.String(),
  GAS_MAX_PRIORITY_FEE_PER_GAS: Type.String(),
  GAS_MAX_TRANSACTION_COST: Type.String(),
  GAS_MAX_OUTSTANDING_COST: Type.String(),
  GAS_WINDOW_SECONDS: Type.Integer(),
  GAS_MAX_WINDOW_COST: Type.String(),
});
export type WorkerConfig = Static<typeof schema>;
export function loadWorkerConfig(source: NodeJS.ProcessEnv = process.env) {
  return loadEnv(schema, source);
}
export function workerGasPolicy(config: WorkerConfig) {
  const integer = (s: string) => {
    if (!/^(0|[1-9][0-9]*)$/.test(s)) throw new Error("Invalid worker policy");
    return BigInt(s);
  };
  const policy = {
    maxGasLimit: integer(config.GAS_MAX_LIMIT),
    maxFeePerGas: integer(config.GAS_MAX_FEE_PER_GAS),
    maxPriorityFeePerGas: integer(config.GAS_MAX_PRIORITY_FEE_PER_GAS),
    maxTransactionCost: integer(config.GAS_MAX_TRANSACTION_COST),
    maxOutstandingCost: integer(config.GAS_MAX_OUTSTANDING_COST),
    windowSeconds: config.GAS_WINDOW_SECONDS,
    maxWindowCost: integer(config.GAS_MAX_WINDOW_COST),
  };
  validateGasPolicy(policy);
  if (integer(config.DEPLOYMENT_START_BLOCK) < 1n)
    throw new Error("Invalid deployment start block");
  return policy;
}
