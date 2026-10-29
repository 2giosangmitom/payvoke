import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Migrate takes a session-level advisory lock, which a connection pooler
  // can leave held; the CLI uses the direct connection when one is set.
  datasource: {
    url: process.env["DATABASE_DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
