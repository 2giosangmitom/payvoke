import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

export function createDatabase(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Migrations applied by tests and one-shot migrate jobs, oldest first.
export const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
