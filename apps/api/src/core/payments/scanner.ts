import { holdReservedEvent } from "@payvoke/shared/protocol";
import type { SettlementChain } from "@payvoke/shared/x402/settlement";
import { VaultValidationError } from "@payvoke/shared/x402/facilitator";
import type { PrismaClient } from "#core/db";

// Finalized logs are recovery wakeups, never standalone successful receipts.
export async function scanFinalizedHolds(
  db: PrismaClient,
  chain: SettlementChain,
  startBlock: bigint,
) {
  if (startBlock < 1n) throw new Error("Deployment start block must be positive");
  const id = `${chain.deployment.chainId}:${chain.deployment.vault.toLowerCase()}`;
  const checkpoint = await chain.finalized();
  let cursor = await db.settlementScanCursor.findUnique({ where: { id } });
  if (!cursor) {
    if (checkpoint.number < startBlock) return;
    const parent = await chain.client.getBlock({ blockNumber: startBlock - 1n });
    if (!parent.hash) throw new VaultValidationError("snapshot_unavailable", 503);
    cursor = await db.settlementScanCursor.upsert({
      where: { id },
      update: {},
      create: { id, blockNumber: startBlock - 1n, blockHash: parent.hash },
    });
  }
  await chain.canonical(cursor.blockNumber, cursor.blockHash as `0x${string}`);
  if (checkpoint.number < cursor.blockNumber)
    throw new VaultValidationError("finality_regressed", 503);
  if (checkpoint.number === cursor.blockNumber) return;
  // The public Fuji RPC rejects eth_getLogs spans over 100 blocks.
  const end =
    checkpoint.number < cursor.blockNumber + 100n ? checkpoint.number : cursor.blockNumber + 100n;
  const block = await chain.client.getBlock({ blockNumber: end });
  if (!block.hash) throw new VaultValidationError("snapshot_unavailable", 503);
  const logs = await chain.client.getLogs({
    address: chain.deployment.vault,
    event: holdReservedEvent,
    fromBlock: cursor.blockNumber + 1n,
    toBlock: end,
    strict: true,
  });
  await chain.canonical(end, block.hash);
  await chain.canonical(checkpoint.number, checkpoint.hash);
  await db.$transaction(async (tx) => {
    // Cursor CAS prevents two scanners committing the same range concurrently.
    const advanced = await tx.settlementScanCursor.updateMany({
      where: { id, blockNumber: cursor!.blockNumber, blockHash: cursor!.blockHash },
      data: { blockNumber: end, blockHash: block.hash! },
    });
    if (!advanced.count) return;
    for (const log of logs) {
      if (log.removed || !log.transactionHash || log.logIndex === null)
        throw new Error("Invalid finalized log");
      const operation = await tx.settlementOperation.findUnique({
        where: { invocationKey: log.args.holdId },
        include: { attempt: true },
      });
      if (
        !operation ||
        operation.attempt?.transactionHash !== log.transactionHash ||
        operation.quoteDigest !== log.args.quoteDigest ||
        operation.authorizationDigest !== log.args.authorizationDigest ||
        operation.state === "QUARANTINED" ||
        operation.state === "REJECTED"
      ) {
        const incidentId = `${id}:${log.transactionHash}:${log.logIndex}`;
        await tx.settlementIncident.upsert({
          where: { id: incidentId },
          update: {},
          create: {
            id: incidentId,
            transactionHash: log.transactionHash,
            invocationKey: log.args.holdId,
            reason: "hold_recovery_required",
          },
        });
      } else if (operation.state === "PENDING") {
        await tx.settlementOperation.update({
          where: { invocationId: operation.invocationId },
          data: { nextCheckAt: new Date(0) },
        });
      }
    }
  });
}
