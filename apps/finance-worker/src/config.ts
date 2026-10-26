import { Type, type Static } from "typebox";
import { deploymentEnv, loadEnv } from "@payvoke/server";
import { validateGasPolicy } from "@payvoke/payments/worker";

const schema = Type.Object({
  EXECUTION_ENABLED: Type.Boolean({ default: false }),
  DATABASE_URL: Type.String(),
  // Wake-ups and job queues only; the journal in Postgres stays authoritative.
  REDIS_URL: Type.String(),
  ...deploymentEnv,
  FINANCE_APPROVER_PRIVATE_KEY: Type.String(),
  FINANCE_EXECUTOR_PRIVATE_KEY: Type.String(),
  GAS_MAX_LIMIT: Type.String(),
  GAS_MAX_FEE_PER_GAS: Type.String(),
  GAS_MAX_PRIORITY_FEE_PER_GAS: Type.String(),
  GAS_MAX_TRANSACTION_COST: Type.String(),
  GAS_MAX_OUTSTANDING_COST: Type.String(),
  GAS_WINDOW_SECONDS: Type.Integer(),
  GAS_MAX_WINDOW_COST: Type.String(),
});
export type FinanceWorkerConfig = Static<typeof schema>;
export function loadFinanceWorkerConfig(source: NodeJS.ProcessEnv = process.env) {
  return loadEnv(schema, source);
}
export function financeGasPolicy(config: FinanceWorkerConfig) {
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
  return policy;
}
