import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

// A remote database can take over two seconds to open a connection, past
// Prisma's 2s/5s transaction defaults; a hung connect still fails in 10s.
// Each pooled connection holds its own buffers, so the pool stays small.
export function createDatabase(connectionString: string, max = 5) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10000, max }),
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });
}

// Migrations applied by tests and one-shot migrate jobs, oldest first.
export const migrationsDirectory = new URL("../../../prisma/migrations/", import.meta.url);
