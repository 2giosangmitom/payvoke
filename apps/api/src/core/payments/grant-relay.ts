import { randomUUID } from "node:crypto";
import { grantAdminAbi } from "@payvoke/shared/protocol";
import { NETWORK } from "@payvoke/shared/x402";
import type { SettlementChain } from "@payvoke/shared/x402/settlement";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeFunctionData,
  getAddress,
  keccak256,
  type Hex,
  type LocalAccount,
} from "viem";
import type { PrismaClient } from "#core/db";
import { databaseTime, type GasPolicy } from "./journal";
import {
  grantCall,
  type GrantOperationRequest,
} from "../../modules/payments/grant-operation.service";

const ACTIVE = ["PENDING", "SIGNED", "BROADCAST", "UNKNOWN"] as const;
const MAX_BROADCASTS = 3;
const LEASE_MS = 120_000;
const RETRY_MS = 5_000;

function revertName(error: unknown) {
  const revert =
    error instanceof BaseError
      ? error.walk((e) => e instanceof ContractFunctionRevertedError)
      : undefined;
  return revert instanceof ContractFunctionRevertedError
    ? (revert.data?.errorName ?? "simulation_reverted")
    : null;
}

const code = (name: string) =>
  name.replace(/[A-Z]/g, (c, i) => (i ? "_" : "") + c.toLowerCase()).slice(0, 80);

/** Submits buyer-signed grant changes from the relayer. It shares the relayer
 * lane with funding: a lane holds one transaction at a time, and an ambiguous
 * transaction keeps it until a receipt or the nonce settles what happened. */
export class GrantRelay {
  readonly owner = randomUUID();
  constructor(
    private readonly db: PrismaClient,
    private readonly chain: SettlementChain,
    private readonly signer: LocalAccount,
    private readonly budget: GasPolicy,
  ) {
    if (getAddress(signer.address) !== getAddress(chain.deployment.relayer))
      throw new Error("Grant relay deployment mismatch");
  }

  private get relayer() {
    return this.signer.address.toLowerCase();
  }

  async tick() {
    const now = new Date();
    const due = await this.db.grantOperation.findMany({
      where: {
        state: { in: [...ACTIVE] },
        nextCheckAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      orderBy: [{ nextCheckAt: "asc" }, { createdAt: "asc" }],
      take: 10,
    });
    for (const operation of due) if (await this.run(operation.id)) return true;
    return false;
  }

  private async claim(id: string) {
    return this.db.$transaction(async (tx) => {
      const now = await databaseTime(tx);
      const claimed = await tx.grantOperation.updateMany({
        where: {
          id,
          state: { in: [...ACTIVE] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          leaseOwner: this.owner,
          leaseEpoch: { increment: 1 },
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        },
      });
      return claimed.count === 1;
    });
  }

  // Every write is fenced by the lease this tick holds.
  private async update(
    id: string,
    data: Parameters<PrismaClient["grantOperation"]["update"]>[0]["data"],
  ) {
    const changed = await this.db.grantOperation.updateMany({
      where: { id, leaseOwner: this.owner },
      data,
    });
    if (!changed.count) throw new Error("grant_lease_lost");
  }

  private async release(
    id: string,
    data: Parameters<PrismaClient["grantOperation"]["update"]>[0]["data"],
  ) {
    await this.update(id, { ...data, leaseOwner: null, leaseExpiresAt: null });
  }

  private defer(id: string, reason: string) {
    return this.release(id, { errorReason: reason, nextCheckAt: new Date(Date.now() + RETRY_MS) });
  }

  private async run(id: string) {
    if (!(await this.claim(id))) return false;
    try {
      await this.process(id);
    } catch (error) {
      if (error instanceof Error && error.message === "grant_lease_lost") return true;
      await this.defer(id, "rpc_unavailable").catch(() => undefined);
    }
    return true;
  }

  private async process(id: string) {
    const operation = await this.db.grantOperation.findUniqueOrThrow({ where: { id } });
    const call = grantCall(operation.request as unknown as GrantOperationRequest);
    const data = encodeFunctionData({ abi: grantAdminAbi, ...call } as never) as Hex;
    if (!operation.signedTransaction) return this.submit(operation.id, data, call);
    return this.follow(operation);
  }

  private async submit(id: string, data: Hex, call: ReturnType<typeof grantCall>) {
    const client = this.chain.client;
    const { vault } = this.chain.deployment;
    try {
      await client.simulateContract({
        address: vault,
        abi: grantAdminAbi,
        account: this.signer.address,
        ...call,
      } as never);
    } catch (error) {
      const name = revertName(error);
      if (!name) return this.defer(id, "rpc_unavailable");
      // The vault refuses it (expired signature, used nonce, revoked grant...):
      // nothing was sent, so it ends here.
      await this.freeLane(id);
      return this.release(id, { state: "REJECTED", errorReason: code(name) });
    }
    // Take the lane: no funding or other grant transaction may be in flight.
    const taken = await this.db.$transaction(async (tx) => {
      await tx.relayerLane.upsert({
        where: { network_relayer: { network: NETWORK, relayer: this.relayer } },
        create: { network: NETWORK, relayer: this.relayer },
        update: { revision: { increment: 1 } },
      });
      const lane = await tx.relayerLane.findUniqueOrThrow({
        where: { network_relayer: { network: NETWORK, relayer: this.relayer } },
      });
      if (
        lane.activeInvocationId ||
        (lane.activeGrantOperationId && lane.activeGrantOperationId !== id)
      )
        return false;
      await tx.relayerLane.update({
        where: { network_relayer: { network: NETWORK, relayer: this.relayer } },
        data: { activeGrantOperationId: id },
      });
      return true;
    });
    if (!taken) return this.defer(id, "relayer_busy");
    const address = this.signer.address;
    const [executed, pending, balance] = await Promise.all([
      client.getTransactionCount({ address, blockTag: "latest" }),
      client.getTransactionCount({ address, blockTag: "pending" }),
      client.getBalance({ address, blockTag: "latest" }),
    ]);
    if (executed !== pending) {
      await this.freeLane(id);
      return this.defer(id, "nonce_conflict");
    }
    const [estimate, fees] = await Promise.all([
      client.estimateGas({ account: address, to: vault, data, value: 0n }),
      client.estimateFeesPerGas({ type: "eip1559", chain: null }),
    ]);
    const gas = (estimate * 120n + 99n) / 100n;
    const cost = gas * fees.maxFeePerGas;
    if (
      gas > this.budget.maxGasLimit ||
      fees.maxFeePerGas > this.budget.maxFeePerGas ||
      fees.maxPriorityFeePerGas > this.budget.maxPriorityFeePerGas ||
      cost > this.budget.maxTransactionCost ||
      balance < cost
    ) {
      await this.freeLane(id);
      return this.defer(id, balance < cost ? "insufficient_relayer_gas" : "gas_policy_exceeded");
    }
    const serialized = await this.signer.signTransaction({
      type: "eip1559",
      chainId: this.chain.deployment.chainId,
      to: vault,
      data,
      value: 0n,
      nonce: executed,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const hash = keccak256(serialized);
    // Journal before broadcast, so a crash after sending is still recoverable.
    await this.update(id, {
      state: "SIGNED",
      relayer: this.relayer,
      nonce: BigInt(executed),
      gasLimit: gas,
      maxFeePerGas: fees.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      signedTransaction: serialized,
      transactionHash: hash,
      errorReason: null,
    });
    await this.broadcast(id, serialized, hash);
  }

  private async broadcast(id: string, serialized: Hex, hash: Hex) {
    await this.update(id, { broadcastCount: { increment: 1 } });
    try {
      const returned = await this.chain.client.sendRawTransaction({
        serializedTransaction: serialized,
      });
      if (returned.toLowerCase() !== hash.toLowerCase()) throw new Error("Unexpected send hash");
      await this.release(id, {
        state: "BROADCAST",
        errorReason: "settlement_pending",
        nextCheckAt: new Date(Date.now() + RETRY_MS),
      });
    } catch {
      await this.release(id, {
        state: "UNKNOWN",
        errorReason: "broadcast_ambiguous",
        nextCheckAt: new Date(Date.now() + RETRY_MS),
      });
    }
  }

  private async follow(
    operation: Awaited<ReturnType<PrismaClient["grantOperation"]["findUniqueOrThrow"]>>,
  ) {
    const client = this.chain.client;
    const hash = operation.transactionHash as Hex;
    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash });
    } catch (error) {
      if (!(error instanceof Error && error.name === "TransactionReceiptNotFoundError"))
        throw error;
    }
    if (receipt) {
      const head = await this.chain.finalized();
      if (receipt.blockNumber > head.number) return this.defer(operation.id, "settlement_pending");
      await this.chain.canonical(receipt.blockNumber, receipt.blockHash);
      if (
        receipt.from.toLowerCase() !== this.relayer ||
        receipt.to?.toLowerCase() !== this.chain.deployment.vault.toLowerCase()
      )
        return this.quarantine(operation.id, "receipt_inconsistent");
      const now = new Date();
      await this.db.$transaction(async (tx) => {
        const changed = await tx.grantOperation.updateMany({
          where: { id: operation.id, leaseOwner: this.owner },
          data: {
            state: receipt.status === "success" ? "FINALIZED" : "REVERTED",
            errorReason: receipt.status === "success" ? null : "transaction_reverted",
            actualGasCost: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
            finalizedBlockNumber: receipt.blockNumber,
            finalizedAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        if (!changed.count) throw new Error("grant_lease_lost");
        await tx.relayerLane.updateMany({
          where: { network: NETWORK, relayer: this.relayer, activeGrantOperationId: operation.id },
          data: { activeGrantOperationId: null },
        });
      });
      return;
    }
    const nonce = await client.getTransactionCount({
      address: this.signer.address,
      blockTag: "latest",
    });
    // The nonce moved on without this transaction: something else used it.
    if (BigInt(nonce) > (operation.nonce ?? -1n))
      return this.quarantine(operation.id, "nonce_consumed");
    if (operation.broadcastCount >= MAX_BROADCASTS)
      return this.defer(operation.id, "settlement_pending");
    await this.broadcast(operation.id, operation.signedTransaction as Hex, hash);
  }

  // No proof of what the nonce did: keep the lane until an operator looks.
  private quarantine(id: string, reason: string) {
    return this.release(id, { state: "QUARANTINED", errorReason: reason });
  }

  private async freeLane(id: string) {
    await this.db.relayerLane.updateMany({
      where: { network: NETWORK, relayer: this.relayer, activeGrantOperationId: id },
      data: { activeGrantOperationId: null },
    });
  }
}
