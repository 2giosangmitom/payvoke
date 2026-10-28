import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { migrationsDirectory } from "@/core/db";

export type TestPostgres = {
  connectionString: string;
  // Present only for the in-process PGlite bridge, whose quirks some tests skip.
  embedded?: PGlite;
  stop(): Promise<void>;
};

// Uses an explicit external Postgres when given, otherwise an embedded PGlite
// behind a loopback socket. Never falls back to DATABASE_URL.
export async function startTestPostgres(external?: string): Promise<TestPostgres> {
  if (external) return { connectionString: external, stop: async () => {} };
  const embedded = await PGlite.create();
  const socket = new PGLiteSocketServer({ db: embedded, port: 0, host: "127.0.0.1" });
  await socket.start();
  return {
    connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
    embedded,
    async stop() {
      await socket.stop();
      await embedded.close();
    },
  };
}

// Migrations oldest first, rewritten to run inside a per-test schema.
export async function readMigrations() {
  const names = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: (await readFile(new URL(`${name}/migration.sql`, migrationsDirectory), "utf8")).replace(
        'CREATE SCHEMA IF NOT EXISTS "public";',
        "",
      ),
    })),
  );
}
