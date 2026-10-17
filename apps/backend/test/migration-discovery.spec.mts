import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Migrator } from "@mikro-orm/migrations";
import { MikroORM } from "@mikro-orm/postgresql";
import { expect, it } from "vitest";
import { createMikroOrmOptions } from "../src/database/mikro-orm.options.js";

class InspectableMigrator extends Migrator {
  async discover() {
    await this.resolvePaths();
    return this.discoverMigrations();
  }
}

it("discovers only source-registered migrations despite stale CommonJS build output", async () => {
  const directory = await mkdtemp(join("/tmp/opencode/", "migration-discovery-"));
  let orm: MikroORM | undefined;
  try {
    await writeFile(join(directory, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(
      join(directory, "Migration20261017020812.js"),
      'Object.defineProperty(exports, "__esModule", { value: true });',
    );
    const options = createMikroOrmOptions({
      DATABASE_URL: "postgresql://unused:unused@localhost/unused",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "unused",
      AUTH_ORIGIN: "http://localhost:3000",
      PORT: 8000,
    });
    orm = await MikroORM.init({
      ...options,
      migrations: { ...options.migrations, path: directory },
    });
    const migrations = await new InspectableMigrator(orm.em).discover();
    const sourceFiles = await readdir(new URL("../src/database/migrations/", import.meta.url));
    const expected = sourceFiles
      .filter((file) => /^Migration\d+\.ts$/.test(file))
      .map((file) => file.slice(0, -3))
      .sort();
    expect(migrations.map((migration) => migration.name).sort()).toEqual(expected);
    expect(migrations.every((migration) => migration.path === undefined)).toBe(true);
  } finally {
    await orm?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
