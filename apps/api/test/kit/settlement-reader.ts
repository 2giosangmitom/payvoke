import {
  encodeEventTopics,
  encodeAbiParameters,
  parseTransaction,
  TransactionReceiptNotFoundError,
  type PublicClient,
  type Hex,
} from "viem";
import { holdReservedEvent, type InvocationQuote } from "@payvoke/shared/protocol";
import { SettlementChain } from "@payvoke/shared/x402/settlement";
import type { VaultDeployment } from "@payvoke/shared/x402/chain";
import { emptyHold, matchingHold } from "./vault-reader";

export function mockSettlement(
  q: InvocationQuote,
  deployment: VaultDeployment,
  digests: { quoteDigest: Hex; authorizationDigest: Hex; grantId: Hex },
) {
  const hashFor = (number: bigint) => `0x${number.toString(16).padStart(64, "0")}` as Hex;
  const state = {
    finalized: true,
    now: BigInt(q.validUntil - 60),
    receipt: null as any,
    transaction: null as any,
    sent: [] as Hex[],
    nonce: 0,
    pendingNonce: 0,
    balance: 10n ** 18n,
    gas: 400000n,
    maxFee: 2000000000n,
    priority: 1000000000n,
    sendMode: "accept" as "accept" | "timeout-after" | "timeout-before" | "revert",
    hold: emptyHold(),
    snapshotChanged: false,
    rpcError: false,
    logs: [] as any[],
  };
  const client = {
    async getChainId() {
      return 43113;
    },
    async getBlock({ blockTag, blockNumber }: { blockTag?: string; blockNumber?: bigint }) {
      if (state.rpcError) throw new Error("secret RPC credential");
      const number =
        blockNumber ?? (blockTag === "finalized" ? (state.finalized ? 12n : 10n) : 12n);
      return {
        number,
        hash: state.snapshotChanged && blockNumber !== undefined ? hashFor(999n) : hashFor(number),
        timestamp: state.now,
      };
    },
    async getTransactionReceipt({ hash }: { hash: Hex }) {
      if (!state.receipt) throw new TransactionReceiptNotFoundError({ hash });
      return state.receipt;
    },
    async getTransaction() {
      return state.transaction;
    },
    async readContract() {
      return state.hold;
    },
    async getTransactionCount({ blockTag }: { blockTag: string }) {
      return blockTag === "pending" ? state.pendingNonce : state.nonce;
    },
    async getBalance() {
      return state.balance;
    },
    async estimateGas() {
      return state.gas;
    },
    async estimateFeesPerGas() {
      return { maxFeePerGas: state.maxFee, maxPriorityFeePerGas: state.priority };
    },
    async sendRawTransaction({ serializedTransaction }: { serializedTransaction: Hex }) {
      const { keccak256 } = await import("viem");
      state.sent.push(serializedTransaction);
      if (state.sendMode === "timeout-before") throw new Error("timeout");
      const hash = keccak256(serializedTransaction);
      const tx = parseTransaction(serializedTransaction);
      state.transaction = {
        ...tx,
        hash,
        value: tx.value ?? 0n,
        from: deployment.relayer,
        input: tx.data,
        blockHash: hashFor(11n),
        blockNumber: 11n,
      };
      const log = {
        address: deployment.vault,
        data: encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
          [digests.quoteDigest, digests.authorizationDigest, q.grossAmount],
        ),
        topics: encodeEventTopics({
          abi: [holdReservedEvent],
          eventName: "HoldReserved",
          args: { holdId: q.invocationKey, buyer: q.buyer },
        }),
        transactionHash: hash,
        blockHash: hashFor(11n),
        blockNumber: 11n,
        logIndex: 0,
        removed: false,
        args: { holdId: q.invocationKey, buyer: q.buyer, ...digests, gross: q.grossAmount },
      };
      state.receipt = {
        transactionHash: hash,
        from: deployment.relayer,
        to: deployment.vault,
        blockHash: hashFor(11n),
        blockNumber: 11n,
        status: state.sendMode === "revert" ? "reverted" : "success",
        gasUsed: 300000n,
        effectiveGasPrice: 1500000000n,
        logs: state.sendMode === "revert" ? [] : [log],
      };
      if (state.sendMode !== "revert") {
        state.hold = matchingHold(
          q,
          digests.authorizationDigest,
          digests.quoteDigest,
          digests.grantId,
        );
        state.logs = [log];
      }
      state.nonce = Number(tx.nonce) + 1;
      state.pendingNonce = state.nonce;
      if (state.sendMode === "timeout-after") throw new Error("timeout");
      return hash;
    },
    async getLogs() {
      return state.logs;
    },
  };
  return { chain: new SettlementChain(client as unknown as PublicClient, deployment), state };
}
