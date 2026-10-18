import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import type { Environment } from "../config/environment.js";
import { AppUserSchema } from "../modules/identity/infrastructure/app-user.schema.js";
import { workspaceSchemas } from "../modules/workspace/infrastructure/workspace.schemas.js";
import { Migration20261017070519 } from "./migrations/Migration20261017070519.js";
import { Migration20261017100000 } from "./migrations/Migration20261017100000.js";
import { Migration20261018010000 } from "./migrations/Migration20261018010000.js";
import { publishingSchemas } from "../modules/publishing/infrastructure/publishing.schemas.js";
import { providerGatewaySchemas } from "../modules/provider-gateway/infrastructure/provider.schemas.js";
import { Migration20261018020000 } from "./migrations/Migration20261018020000.js";
import { Migration20261018030000 } from "./migrations/Migration20261018030000.js";

// Source-controlled allowlist: obsolete files left in dist must never become migrations.
export const applicationMigrations = [
  Migration20261017070519,
  Migration20261017100000,
  Migration20261018010000,
  Migration20261018020000,
  Migration20261018030000,
];

export function createMikroOrmOptions(env: Environment) {
  return defineConfig({
    baseDir: process.cwd(),
    clientUrl: env.DATABASE_URL,
    entities: [AppUserSchema, ...workspaceSchemas, ...publishingSchemas, ...providerGatewaySchemas],
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
