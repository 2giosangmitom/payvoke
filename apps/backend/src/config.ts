import envSchema from "env-schema";
import { Type, type Static } from "typebox";

const schema = Type.Object({
  HOST: Type.String({ default: "127.0.0.1" }),
  PORT: Type.Integer({ default: 3001 }),
  LOG_LEVEL: Type.String({ default: "info" }),
  PROCESS_ROLE: Type.String({ default: "api" }),
  DATABASE_URL: Type.String(),
  API_ORIGIN: Type.String(),
  WEB_ORIGIN: Type.String(),
  BETTER_AUTH_SECRET: Type.String(),
  CHAIN_ID: Type.Integer({ default: 43113 }),
  USDC_ADDRESS: Type.String({ default: "0x5425890298aed601595a70AB815c96711a31Bc65" }),
  RPC_URL: Type.Optional(Type.String()),
  VAULT_ADDRESS: Type.Optional(Type.String()),
  PAYMENTS_ENABLED: Type.Boolean({ default: false }),
});

export type Config = Readonly<Static<typeof schema>>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  return envSchema<Config>({ schema, data: source, env: false });
}

export const logRedaction = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.headers["payment-signature"]',
    'req.headers["payment-required"]',
    'req.headers["payment-response"]',
    'res.headers["set-cookie"]',
    "req.body",
    "res.body",
    "DATABASE_URL",
    "RPC_URL",
    "BETTER_AUTH_SECRET",
    "config",
    "token",
    "signature",
    "signedTransaction",
    "privateKey",
    "signedUrl",
    "*.token",
    "*.signature",
    "*.signedTransaction",
    "*.privateKey",
    "*.signedUrl",
  ],
  censor: "[REDACTED]",
};
