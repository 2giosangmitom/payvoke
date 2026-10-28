import { Type, type Static } from "typebox";
import { loadEnv } from "@/core/runtime";
import { storageEnv } from "@/core/storage";

// No signing keys: this process only runs idempotent, non-custodial jobs.
const schema = Type.Object({
  DATABASE_URL: Type.String(),
  REDIS_URL: Type.String(),
  // Needed to verify file results (REC) and clean up abandoned uploads.
  ...storageEnv,
});
export type JobWorkerConfig = Static<typeof schema>;
export function loadJobWorkerConfig(source: NodeJS.ProcessEnv = process.env) {
  return loadEnv(schema, source);
}
