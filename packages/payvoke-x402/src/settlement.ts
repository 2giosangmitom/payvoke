import {
  holdReservedEvent,
  vaultAdmissionAbi,
  type InvocationQuote,
  type DebitAuthorization,
} from "@payvoke/protocol";
import {
  createPublicClient,
  custom,
  decodeEventLog,
  getAddress,
  zeroAddress,
  type EIP1193RequestFn,
  type Hex,
  type PublicClient,
} from "viem";
import { VaultValidationError } from "./facilitator.js";
import type { VaultDeployment } from "./chain.js";

export type SettlementProof = {
  transactionHash: Hex;
  receiptBlockNumber: bigint;
  receiptBlockHash: Hex;
  finalizedBlockNumber: bigint;
  finalizedBlockHash: Hex;
  actualGasCost: bigint;
  outcome: "held" | "reverted" | "not_executable";
};
export type SettlementInspection =
  | { kind: "missing" }
  | { kind: "confirming"; number: bigint; hash: Hex }
  | { kind: "finalized"; proof: SettlementProof };
function check(ok: boolean, code: string): asserts ok {
  if (!ok) throw new VaultValidationError(code, 503);
}
export class SettlementChain {
  constructor(
    readonly client: PublicClient,
    readonly deployment: Readonly<VaultDeployment>,
  ) {}
  static fromRpc(request: EIP1193RequestFn, deployment: VaultDeployment) {
    return new SettlementChain(
      createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }),
      deployment,
    );
  }
  async finalized() {
    check((await this.client.getChainId()) === this.deployment.chainId, "chain_mismatch");
    const block = await this.client.getBlock({ blockTag: "finalized" });
    check(block.number !== null && block.hash !== null, "finality_unavailable");
    return { number: block.number, hash: block.hash, timestamp: block.timestamp };
  }
  async canonical(number: bigint, hash: Hex) {
    const block = await this.client.getBlock({ blockNumber: number });
    check(
      block.number === number && block.hash?.toLowerCase() === hash.toLowerCase(),
      "snapshot_changed",
    );
  }
  async inspect(input: {
    hash: Hex;
    data: Hex;
    nonce: bigint;
    quote: InvocationQuote;
    authorization: DebitAuthorization;
    authorizationDigest: Hex;
  }): Promise<SettlementInspection> {
    const head = await this.finalized();
    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: input.hash });
    } catch (error) {
      if (error instanceof Error && error.name === "TransactionReceiptNotFoundError")
        return { kind: "missing" };
      throw error;
    }
    const transaction = await this.client.getTransaction({ hash: input.hash });
    check(
      transaction.hash.toLowerCase() === input.hash.toLowerCase() &&
        transaction.chainId === this.deployment.chainId &&
        transaction.from.toLowerCase() === this.deployment.relayer.toLowerCase() &&
        transaction.to?.toLowerCase() === this.deployment.vault.toLowerCase() &&
        transaction.value === 0n &&
        BigInt(transaction.nonce) === input.nonce &&
        transaction.input.toLowerCase() === input.data.toLowerCase(),
      "transaction_inconsistent",
    );
    check(
      receipt.transactionHash.toLowerCase() === input.hash.toLowerCase() &&
        receipt.from.toLowerCase() === this.deployment.relayer.toLowerCase() &&
        receipt.to?.toLowerCase() === this.deployment.vault.toLowerCase() &&
        transaction.blockHash === receipt.blockHash &&
        transaction.blockNumber === receipt.blockNumber,
      "receipt_inconsistent",
    );
    await this.canonical(receipt.blockNumber, receipt.blockHash);
    if (receipt.blockNumber > head.number)
      return { kind: "confirming", number: receipt.blockNumber, hash: receipt.blockHash };
    const proof = {
      transactionHash: input.hash,
      receiptBlockNumber: receipt.blockNumber,
      receiptBlockHash: receipt.blockHash,
      finalizedBlockNumber: head.number,
      finalizedBlockHash: head.hash,
      actualGasCost: receipt.gasUsed * receipt.effectiveGasPrice,
    };
    const hold = await this.client.readContract({
      address: this.deployment.vault,
      abi: vaultAdmissionAbi,
      functionName: "getHold",
      args: [input.quote.invocationKey],
      blockNumber: head.number,
    });
    if (receipt.status === "reverted") {
      // A concurrently created hold must be recovered, not reported as unpaid.
      check(getAddress(hold.buyer) === zeroAddress, "reverted_with_existing_hold");
      await this.canonical(head.number, head.hash);
      return { kind: "finalized", proof: { ...proof, outcome: "reverted" } };
    }
    check(receipt.status === "success", "receipt_inconsistent");
    const matches = receipt.logs.filter((log) => {
      if (log.address.toLowerCase() !== this.deployment.vault.toLowerCase() || log.removed)
        return false;
      try {
        const { args } = decodeEventLog({
          abi: [holdReservedEvent],
          data: log.data,
          topics: log.topics,
        });
        return (
          args.holdId.toLowerCase() === input.quote.invocationKey.toLowerCase() &&
          args.buyer.toLowerCase() === input.quote.buyer.toLowerCase() &&
          args.quoteDigest.toLowerCase() === input.authorization.quoteDigest.toLowerCase() &&
          args.authorizationDigest.toLowerCase() === input.authorizationDigest.toLowerCase() &&
          args.gross === input.quote.grossAmount &&
          log.transactionHash === input.hash &&
          log.blockHash === receipt.blockHash
        );
      } catch {
        return false;
      }
    });
    check(matches.length === 1, "hold_event_inconsistent");
    const q = input.quote;
    check(
      hold.quoteDigest.toLowerCase() === input.authorization.quoteDigest.toLowerCase() &&
        hold.authorizationDigest.toLowerCase() === input.authorizationDigest.toLowerCase() &&
        getAddress(hold.buyer) === getAddress(q.buyer) &&
        getAddress(hold.provider) === getAddress(q.provider) &&
        getAddress(hold.feeRecipient) === getAddress(q.feeRecipient) &&
        hold.gross === q.grossAmount &&
        hold.feeBps === q.feeBps &&
        hold.deliveryDeadline === q.deliveryDeadline &&
        hold.releaseNotBefore === q.releaseNotBefore &&
        hold.resolveBy === q.resolveBy &&
        hold.grantId.toLowerCase() === input.authorization.grantId.toLowerCase(),
      "hold_inconsistent",
    );
    await this.canonical(receipt.blockNumber, receipt.blockHash);
    await this.canonical(head.number, head.hash);
    return {
      kind: "finalized",
      proof: {
        ...proof,
        outcome:
          hold.closed ||
          hold.disputed ||
          hold.remaining !== q.grossAmount ||
          head.timestamp >= BigInt(q.deliveryDeadline)
            ? "not_executable"
            : "held",
      },
    };
  }
}
