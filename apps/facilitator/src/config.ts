import { Type, type Static } from "typebox";
import { deploymentEnv, loadEnv } from "@payvoke/server";

const schema = Type.Object({
  SETTLEMENT_ENABLED: Type.Boolean({ default: false }),
  HOST: Type.String({ default: "127.0.0.1" }),
  PORT: Type.Integer({ default: 3002 }),
  LOG_LEVEL: Type.String({ default: "info" }),
  DATABASE_URL: Type.String(),
  // Settlement wake-ups only; the journal in Postgres stays authoritative.
  REDIS_URL: Type.String(),
  FACILITATOR_TOKEN: Type.String(),
  ...deploymentEnv,
});
export type FacilitatorConfig = Readonly<Static<typeof schema>>;
export function loadFacilitatorConfig(source: NodeJS.ProcessEnv = process.env): FacilitatorConfig {
  return loadEnv(schema, source);
}
