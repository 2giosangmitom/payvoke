import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

// A remote database can take over two seconds to open a connection, past
// Prisma's 2s/5s transaction defaults; a hung connect still fails in 10s.
export function createDatabase(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10000 }),
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });
}

// Migrations applied by tests and one-shot migrate jobs, oldest first.
export const migrationsDirectory = new URL("../../../prisma/migrations/", import.meta.url);
