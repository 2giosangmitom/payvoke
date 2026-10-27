import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPublicClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VaultChain } from "@payvoke/x402/chain";
import { SettlementChain } from "@payvoke/x402/settlement";
import { ASSET } from "@payvoke/x402";
import { PrismaClient } from "@payvoke/db";
import { SettlementWorker } from "@payvoke/payments/worker";

const [schema, rpc, vault, codeHash, key] = process.argv.slice(2);
if (
  !/^payment_test_[a-f0-9]{32}$/.test(schema ?? "") ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(rpc ?? "") ||
  !/^0x[a-fA-F0-9]{64}$/.test(key ?? "") ||
  !/^0x[a-fA-F0-9]{64}$/.test(codeHash ?? "")
)
  throw new Error("Expected isolated local worker fixture");
const pool = new Pool({
  // Inherited from the parent test run, which owns the schema.
  connectionString: process.env.PAYMENTS_TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
try {
  const signer = privateKeyToAccount(key as Hex);
  const deployment = {
    chainId: 43113,
    vault: getAddress(vault),
    relayer: signer.address,
    asset: ASSET,
    expectedCodeHash: codeHash as Hex,
    feeCapBps: 500,
    maxQuoteLifetimeSeconds: 3600,
    maxHoldSeconds: 30 * 86400,
  };
  const client = createPublicClient({ transport: http(rpc, { timeout: 10000, retryCount: 0 }) });
  const admission = new VaultChain(client, deployment);
  await admission.initialize({ requireRelayerRole: false });
  const worker = new SettlementWorker(
    db,
    admission,
    new SettlementChain(client, deployment),
    signer,
    "https://api.payvoke.test/v1/invocations",
    {
      maxGasLimit: 1000000n,
      maxFeePerGas: 10000000000n,
      maxPriorityFeePerGas: 2000000000n,
      maxTransactionCost: 10n ** 16n,
      maxOutstandingCost: 10n ** 16n,
      windowSeconds: 3600,
      maxWindowCost: 10n ** 17n,
    },
  );
  console.log(await worker.tick());
} finally {
  await db.$disconnect();
  await pool.end();
}
