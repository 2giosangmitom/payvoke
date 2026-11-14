import {
  hashSnapshot,
  vaultFinanceAbi,
  vaultFinancialEvents,
  type Json,
} from "@payvoke/shared/protocol";
import { readQuote, type QuoteDocument } from "@payvoke/shared/x402";
import { VaultValidationError } from "@payvoke/shared/x402/facilitator";
import type { SettlementChain } from "@payvoke/shared/x402/settlement";
import { erc20Abi, getAddress, zeroAddress, type Hex } from "viem";
import { Prisma, type PrismaClient } from "#core/db";

export function financialJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}
export class FinancialInvariantError extends Error {}
export function financialDeployment(chain: SettlementChain) {
  return `${chain.deployment.chainId}:${chain.deployment.vault.toLowerCase()}`;
}
export async function readFinalizedHold(
  chain: SettlementChain,
  holdId: Hex,
  at?: Awaited<ReturnType<SettlementChain["finalized"]>>,
) {
  const block = at ?? (await chain.finalized());
  const hold = await chain.client.readContract({
    address: chain.deployment.vault,
    abi: vaultFinanceAbi,
    functionName: "getHold",
    args: [holdId],
    blockNumber: block.number,
  });
  if (getAddress(hold.buyer) === zeroAddress) throw new Error("hold_not_found");
  if (
    hold.gross !== hold.refunded + hold.remaining + hold.providerReleased + hold.feeReleased ||
    (hold.closed ? hold.remaining !== 0n : hold.remaining === 0n)
  )
    throw new FinancialInvariantError("hold_accounting_mismatch");
  await chain.canonical(block.number, block.hash);
  return { hold, block };
}

// Separate cursor from admission recovery. Every projection is an observation
// at one canonical finalized block, never an independent source of credit.
// An unclosed hold seen in a scanned batch, with the chain deadlines that
// finance acts on. Callers schedule wake-ups from these; the scan stays the truth.
export type OpenHold = { invocationId: string; deliveryDeadline: bigint; releaseNotBefore: bigint };

export async function scanFinancialLifecycle(
  db: PrismaClient,
  chain: SettlementChain,
  startBlock: bigint,
) {
  const vault = chain.deployment.vault.toLowerCase();
  const deploymentId = financialDeployment(chain);
  const id = `finance:${deploymentId}`;
  try {
    if (startBlock < 1n) throw new Error("Invalid deployment start block");
    const head = await chain.finalized();
    let cursor = await db.settlementScanCursor.findUnique({ where: { id } });
    if (!cursor) {
      if (head.number < startBlock)
        return {
          caughtUp: false,
          reason: "deployment_not_finalized",
          open: [],
          chainTime: head.timestamp,
        };
      const parent = await chain.client.getBlock({ blockNumber: startBlock - 1n });
      if (!parent.hash) throw new Error("snapshot_unavailable");
      cursor = await db.settlementScanCursor.upsert({
        where: { id },
        update: {},
        create: { id, blockNumber: startBlock - 1n, blockHash: parent.hash },
      });
    }
    // A finalized head below the cursor means this RPC node lags (the public
    // Fuji endpoint is load-balanced); Avalanche finality does not roll back.
    // Retry next tick like the admission scanners do. A replaced block still
    // latches below, through the cursor's hash check.
    if (head.number < cursor.blockNumber) throw new VaultValidationError("finality_regressed", 503);
    await chain.canonical(cursor.blockNumber, cursor.blockHash as Hex);
    if (head.number === cursor.blockNumber)
      return {
        caughtUp: true,
        cursorBlock: cursor.blockNumber,
        finalizedHead: head.number,
        open: [],
        chainTime: head.timestamp,
      };
    // The public Fuji RPC rejects eth_getLogs spans over 100 blocks.
    const end = head.number < cursor.blockNumber + 100n ? head.number : cursor.blockNumber + 100n;
    const block = await chain.client.getBlock({ blockNumber: end });
    if (!block.hash) throw new Error("snapshot_unavailable");
    const client = chain.client;
    const logs = await client.getLogs({
      address: chain.deployment.vault,
      events: vaultFinancialEvents,
      fromBlock: cursor.blockNumber + 1n,
      toBlock: end,
      strict: true,
    });
    if (
      logs.some(
        (log) =>
          log.address.toLowerCase() !== vault ||
          log.blockNumber === null ||
          log.blockNumber <= cursor!.blockNumber ||
          log.blockNumber > end ||
          log.removed ||
          !log.transactionHash ||
          !log.blockHash ||
          log.logIndex === null ||
          log.logIndex < 0,
      )
    )
      throw new FinancialInvariantError("financial_log_inconsistent");
    const read = {
      address: chain.deployment.vault,
      abi: vaultFinanceAbi,
      blockNumber: end,
    } as const;
    const [held, claimable, tokens] = await Promise.all([
      client.readContract({ ...read, functionName: "totalHeld" }),
      client.readContract({ ...read, functionName: "totalClaimable" }),
      client.readContract({
        address: chain.deployment.asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [chain.deployment.vault],
        blockNumber: end,
      }),
    ]);
    // Buyers keep no balance in the vault: it only owes open holds and payouts
    // it could not deliver.
    if (tokens < held + claimable) throw new FinancialInvariantError("vault_insolvent");
    const holdIds = [
      ...new Set(logs.flatMap((log) => ("holdId" in log.args ? [log.args.holdId!] : []))),
    ];
    const snapshots: {
      holdId: Hex;
      hold: Awaited<ReturnType<typeof readFinalizedHold>>["hold"];
      invocationId: string | null;
    }[] = [];
    for (const holdId of holdIds) {
      const hold = await client.readContract({ ...read, functionName: "getHold", args: [holdId] });
      if (
        getAddress(hold.buyer) === zeroAddress ||
        hold.gross !== hold.refunded + hold.remaining + hold.providerReleased + hold.feeReleased ||
        (hold.closed ? hold.remaining !== 0n : hold.remaining === 0n)
      )
        throw new FinancialInvariantError("hold_accounting_mismatch");
      const operation = await db.settlementOperation.findUnique({
        where: { invocationKey: holdId },
        include: { invocation: { include: { quote: true } } },
      });
      if (operation) {
        const q = readQuote(
          (operation.invocation.quote.document as unknown as QuoteDocument).protocolQuote,
        );
        if (
          operation.quoteDigest !== hold.quoteDigest ||
          operation.authorizationDigest !== hold.authorizationDigest ||
          getAddress(q.buyer) !== getAddress(hold.buyer) ||
          getAddress(q.provider) !== getAddress(hold.provider) ||
          getAddress(q.feeRecipient) !== getAddress(hold.feeRecipient) ||
          q.grossAmount !== hold.gross ||
          q.feeBps !== hold.feeBps ||
          q.deliveryDeadline !== hold.deliveryDeadline ||
          q.releaseNotBefore !== hold.releaseNotBefore ||
          q.resolveBy !== hold.resolveBy
        )
          throw new FinancialInvariantError("hold_binding_mismatch");
      }
      snapshots.push({ holdId, hold, invocationId: operation?.invocationId ?? null });
    }
    for (const number of new Set(logs.map((log) => log.blockNumber))) {
      const canonical = await client.getBlock({ blockNumber: number! });
      if (
        logs.some(
          (log) =>
            log.blockNumber === number &&
            (log.removed ||
              log.blockHash !== canonical.hash ||
              !log.transactionHash ||
              log.logIndex === null),
        )
      )
        throw new FinancialInvariantError("financial_log_inconsistent");
    }
    await chain.canonical(end, block.hash);
    await chain.canonical(head.number, head.hash);
    const committed = await db.$transaction(async (tx) => {
      const advanced = await tx.settlementScanCursor.updateMany({
        where: { id, blockNumber: cursor!.blockNumber, blockHash: cursor!.blockHash },
        data: { blockNumber: end, blockHash: block.hash! },
      });
      if (!advanced.count) return false;
      for (const log of logs) {
        await tx.vaultFinancialEvent.create({
          data: {
            id: `${deploymentId}:${log.transactionHash}:${log.logIndex}`,
            vault,
            name: log.eventName,
            holdId: "holdId" in log.args ? log.args.holdId : null,
            transactionHash: log.transactionHash!,
            blockNumber: log.blockNumber!,
            blockHash: log.blockHash!,
            logIndex: log.logIndex!,
            data: financialJson(log.args),
          },
        });
      }
      for (const { holdId, hold, invocationId } of snapshots) {
        const previous = await tx.vaultHoldProjection.findUnique({ where: { holdId } });
        const snapshot = financialJson(hold);
        if (
          previous &&
          (previous.version > hold.version ||
            previous.blockNumber > end ||
            (previous.version === hold.version &&
              hashSnapshot(previous.snapshot as Json) !== hashSnapshot(snapshot as Json)))
        )
          throw new FinancialInvariantError("hold_projection_inconsistent");
        const reclaimed = await tx.vaultFinancialEvent.findFirst({
          where: { vault, holdId, name: "HoldReclaimed" },
        });
        const status = reclaimed
          ? "RECLAIMED"
          : hold.closed
            ? hold.providerReleased + hold.feeReleased > 0n
              ? "RELEASED"
              : "REFUNDED"
            : hold.refunded > 0n
              ? "PARTIALLY_REFUNDED"
              : "HELD";
        const data = {
          vault,
          invocationId,
          status,
          snapshot,
          version: hold.version,
          blockNumber: end,
          blockHash: block.hash!,
        };
        await tx.vaultHoldProjection.upsert({
          where: { holdId },
          create: { holdId, ...data },
          update: data,
        });
        if (!invocationId)
          await tx.settlementIncident.upsert({
            where: { id: `${deploymentId}:orphan:${holdId}` },
            update: {},
            create: {
              id: `${deploymentId}:orphan:${holdId}`,
              transactionHash: logs.find((l) => "holdId" in l.args && l.args.holdId === holdId)!
                .transactionHash!,
              invocationKey: holdId,
              reason: "hold_recovery_required",
            },
          });
      }
      await tx.vaultFinancialHealth.upsert({
        where: { id: deploymentId },
        create: { id: deploymentId },
        update: {},
      });
      return true;
    });
    const latest = await db.settlementScanCursor.findUniqueOrThrow({ where: { id } });
    const open: OpenHold[] = committed
      ? snapshots.flatMap(({ hold, invocationId }) =>
          !hold.closed && invocationId
            ? [
                {
                  invocationId,
                  deliveryDeadline: BigInt(hold.deliveryDeadline),
                  releaseNotBefore: BigInt(hold.releaseNotBefore),
                },
              ]
            : [],
        )
      : [];
    return {
      caughtUp: latest.blockNumber >= head.number,
      cursorBlock: latest.blockNumber,
      finalizedHead: head.number,
      open,
      chainTime: head.timestamp,
    };
  } catch (error) {
    const reason =
      error instanceof FinancialInvariantError
        ? error.message
        : error instanceof VaultValidationError && error.code === "snapshot_changed"
          ? "finalized_snapshot_changed"
          : null;
    if (reason)
      await db.vaultFinancialHealth.upsert({
        where: { id: deploymentId },
        create: { id: deploymentId, blocked: true, reason },
        update: { blocked: true, reason },
      });
    throw error;
  }
}
