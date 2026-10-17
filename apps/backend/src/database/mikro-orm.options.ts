import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import type { Environment } from "../config/environment.js";
import { AppUserSchema } from "../modules/identity/infrastructure/app-user.schema.js";

export function createMikroOrmOptions(env: Environment) {
  return defineConfig({
    baseDir: process.cwd(),
    clientUrl: env.DATABASE_URL,
    entities: [AppUserSchema],
    ensureDatabase: false,
    extensions: [Migrator],
    schemaGenerator: {
      ignoreSchema: [
        "auth",
        "storage",
        "realtime",
        "extensions",
        "vault",
        "graphql",
        "graphql_public",
        "supabase_functions",
        "supabase_migrations",
        "net",
        "cron",
        "pgsodium",
        "pgsodium_masks",
      ],
    },
    migrations: {
      path: "dist/database/migrations",
      emit: "ts",
      snapshot: false,
    },
  });
}
