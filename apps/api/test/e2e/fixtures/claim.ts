import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/core/db";
import { SettlementJournal } from "@/core/payments/journal";

const [schema, invocationId, owner] = process.argv.slice(2);
if (!/^payment_test_[a-f0-9]{32}$/.test(schema ?? "") || !invocationId || !owner) {
  throw new Error("Expected isolated test schema and operation");
}
const pool = new Pool({
  // Inherited from the parent test run, which owns the schema.
  connectionString: process.env.PAYMENTS_TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
try {
  const journal = new SettlementJournal(db, {
    vault: "0x1111111111111111111111111111111111111111",
    resourceUrl: "https://api.payvoke.test/v1/invocations",
  });
  const claim = await journal.claim(invocationId, owner);
  console.log(
    JSON.stringify(claim, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  );
} finally {
  await db.$disconnect();
  await pool.end();
}
