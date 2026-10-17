import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import type { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";

export function createMikroOrmOptions(config: ConfigService<Environment>) {
  return defineConfig({
    baseDir: process.cwd(),
    clientUrl: config.getOrThrow<string>("DATABASE_URL"),
    entities: ["dist/**/*.entity.js"],
    entitiesTs: ["src/**/*.entity.ts"],
    preferTs: __filename.endsWith(".ts"),
    metadataProvider: ReflectMetadataProvider,
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
      pathTs: "src/database/migrations",
      emit: "ts",
      snapshot: false,
    },
  });
}
