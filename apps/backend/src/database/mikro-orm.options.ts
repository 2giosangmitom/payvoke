import { fileURLToPath } from "node:url";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import type { ConfigService } from "@nestjs/config";
import type { Environment } from "../modules/app.module.js";

export function createMikroOrmOptions(config: ConfigService<Environment>) {
  return defineConfig({
    baseDir: fileURLToPath(new URL("../../", import.meta.url)),
    clientUrl: config.getOrThrow<string>("DATABASE_URL"),
    entities: ["dist/**/*.entity.js"],
    entitiesTs: ["src/**/*.entity.ts"],
    preferTs: import.meta.url.endsWith(".ts"),
    metadataProvider: ReflectMetadataProvider,
    ensureDatabase: false,
    extensions: [Migrator],
    migrations: {
      path: "dist/database/migrations",
      pathTs: "src/database/migrations",
      emit: "ts",
    },
  });
}
