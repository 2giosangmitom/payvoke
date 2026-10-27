import { Type, type Static } from "typebox";
import { loadEnv } from "@payvoke/server";
import { storageEnv } from "@payvoke/storage";

const schema = Type.Object({
  HOST: Type.String({ default: "127.0.0.1" }),
  PORT: Type.Integer({ default: 3001 }),
  LOG_LEVEL: Type.String({ default: "info" }),
  DATABASE_URL: Type.String(),
  // Wake-ups, job queues and the shared rate-limit store; not a source of truth.
  REDIS_URL: Type.String(),
  API_ORIGIN: Type.String(),
  WEB_ORIGIN: Type.String(),
  BETTER_AUTH_SECRET: Type.String(),
  CHAIN_ID: Type.Integer({ default: 43113 }),
  USDC_ADDRESS: Type.String({ default: "0x5425890298aed601595a70AB815c96711a31Bc65" }),
  VAULT_ADDRESS: Type.Optional(Type.String()),
  PAYMENTS_ENABLED: Type.Boolean({ default: false }),
  FACILITATOR_URL: Type.Optional(Type.String()),
  FACILITATOR_TOKEN: Type.Optional(Type.String()),
  // Buyer AG-UI replay window. A cursor older than the oldest event inside
  // this window must bootstrap from the snapshot instead.
  AGUI_CURSOR_RETENTION_SECONDS: Type.Integer({ minimum: 60, default: 604800 }),
  // S3-compatible file storage; FILES_ENABLED=true requires the S3_* settings.
  ...storageEnv,
  FILE_MAX_BYTES: Type.Integer({ minimum: 1, maximum: 1073741824, default: 26214400 }),
  FILE_UPLOAD_TTL_SECONDS: Type.Integer({ minimum: 60, maximum: 3600, default: 600 }),
  FILE_DOWNLOAD_TTL_SECONDS: Type.Integer({ minimum: 30, maximum: 3600, default: 300 }),
});

export type Config = Readonly<Static<typeof schema>>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(schema, source);
}
