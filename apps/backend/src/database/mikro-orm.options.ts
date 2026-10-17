import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import type { Environment } from "../config/environment.js";
import { AppUserSchema } from "../modules/identity/infrastructure/app-user.schema.js";
import { workspaceSchemas } from "../modules/workspace/infrastructure/workspace.schemas.js";
import { Migration20261017070519 } from "./migrations/Migration20261017070519.js";
import { Migration20261017100000 } from "./migrations/Migration20261017100000.js";

// Source-controlled allowlist: obsolete files left in dist must never become migrations.
export const applicationMigrations = [Migration20261017070519, Migration20261017100000];

export function createMikroOrmOptions(env: Environment) {
  return defineConfig({
    baseDir: process.cwd(),
    clientUrl: env.DATABASE_URL,
    entities: [AppUserSchema, ...workspaceSchemas],
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
      migrationsList: applicationMigrations,
      emit: "ts",
      snapshot: false,
    },
  });
}
