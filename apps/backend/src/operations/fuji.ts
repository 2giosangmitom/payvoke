import { open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  encodeDeployData,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  keccak256,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import { ASSET } from "@payvoke/x402";
import { VaultChain, type VaultDeployment } from "@payvoke/x402/chain";
import { parseFinancialJson } from "@payvoke/server";

export const operationsAbi = parseAbi([
  "function grantRole(bytes32 role,address account)",
  "function deposit(uint256 amount)",
  "function registerGrant(bytes32 grantId,(address signer,uint48 expiresAt,uint256 maxPerCall,uint32 periodSeconds,uint256 maxPerPeriod,uint256 maxTotal) config)",
  "function updateGrant(bytes32 grantId,(address signer,uint48 expiresAt,uint256 maxPerCall,uint32 periodSeconds,uint256 maxPerPeriod,uint256 maxTotal) config)",
  "function revokeGrant(bytes32 grantId)",
  "function openDispute(bytes32 holdId,bytes32 evidenceHash)",
  "function withdrawProvider(uint256 amount)",
  "function withdrawPlatform(uint256 amount)",
  "function reclaim(bytes32 holdId)",
  "function withdrawAvailable(uint256 amount)",
  "function availableBalance(address buyer) view returns(uint256)",
  "function defaultAdmin() view returns(address)",
  "function defaultAdminDelay() view returns(uint48)",
]);
export type Ceremony = {
  admin: Address;
  relayer: Address;
  buyer: Address;
  grantSigner: Address;
  adminDelay: number;
  feeCapBps: number;
  maxQuoteLifetimeSeconds: number;
  maxHoldSeconds: number;
  maxGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  maxTransactionCost: string;
  vault?: Address;
  expectedCodeHash?: Hex;
  deploymentBlock?: string;
};
export type Action =
  | { kind: "deploy" }
  | { kind: "relayer-role" }
  | {
      kind: "finance-role";
      role:
        | "FINANCE_EXECUTOR_ROLE"
        | "REFUND_APPROVER_ROLE"
        | "RELEASE_APPROVER_ROLE"
        | "DISPUTE_RESOLVER_ROLE"
        | "PAUSER_ROLE";
      account: Address;
    }
  | { kind: "withdraw-provider" | "withdraw-platform"; amount: string; account: Address }
  | { kind: "dispute"; holdId: Hex; evidenceHash: Hex }
  | { kind: "grant-revoke"; grantId: Hex }
  | { kind: "approve" | "deposit" | "withdraw"; amount: string }
  | {
      kind: "grant" | "grant-update";
      grantId: Hex;
      expiresAt: number;
      maxPerCall: string;
      periodSeconds: number;
      maxPerPeriod: string;
      maxTotal: string;
    }
  | { kind: "reclaim"; holdId: Hex };
export type SignedOperation = {
  version: 1;
  action: Action;
  sender: Address;
  nonce: number;
  transactionHash: Hex;
  signedTransaction: Hex;
  // Constructor policy remains recoverable even if deployment receipt polling fails.
  ceremony: Ceremony;
};
export function integer(value: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Expected canonical unsigned integer");
  return BigInt(value);
}
export async function saveExclusive(path: string, value: unknown) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(
      JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n",
    );
    await file.sync();
  } finally {
    await file.close();
  }
  const directory = await open(dirname(path), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
export async function loadJson<T>(path: string): Promise<T> {
  return parseFinancialJson(await readFile(path, "utf8"));
}
export function deployment(c: Ceremony): VaultDeployment {
  if (!c.vault || !c.expectedCodeHash || !/^0x[\da-fA-F]{64}$/.test(c.expectedCodeHash))
    throw new Error("Missing approved deployment evidence");
  return {
    chainId: 43113,
    asset: ASSET,
    vault: getAddress(c.vault),
    relayer: getAddress(c.relayer),
    expectedCodeHash: c.expectedCodeHash,
    feeCapBps: c.feeCapBps,
    maxQuoteLifetimeSeconds: c.maxQuoteLifetimeSeconds,
    maxHoldSeconds: c.maxHoldSeconds,
  };
}
export async function preflight(client: PublicClient, c: Ceremony) {
  if ((await client.getChainId()) !== 43113) throw new Error("Expected Fuji chain ID 43113");
  const block = await client.getBlock({ blockTag: "finalized" });
  if (!block.hash || block.number === null) throw new Error("Finalized RPC unavailable");
  const canonical = await client.getBlock({ blockNumber: block.number });
  if (canonical.hash !== block.hash) throw new Error("Finalized snapshot changed");
  const code = await client.getCode({ address: ASSET, blockNumber: block.number });
  if (
    !code ||
    code === "0x" ||
    (await client.readContract({
      address: ASSET,
      abi: erc20Abi,
      functionName: "decimals",
      blockNumber: block.number,
    })) !== 6
  )
    throw new Error("Fixed Fuji USDC unavailable or invalid");
  for (const address of [c.admin, c.relayer, c.buyer, c.grantSigner]) {
    if (getAddress(address) === "0x0000000000000000000000000000000000000000")
      throw new Error("Zero ceremony identity");
  }
  if (new Set([c.admin, c.relayer, c.buyer, c.grantSigner].map((a) => a.toLowerCase())).size !== 4)
    throw new Error("Use distinct admin, relayer, buyer and grant signer addresses");
  const balances = await Promise.all(
    [c.admin, c.relayer, c.buyer].map(async (address) => ({
      address,
      avaxWei: await client.getBalance({ address, blockNumber: block.number }),
      usdcUnits: await client.readContract({
        address: ASSET,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber: block.number,
      }),
    })),
  );
  if (c.vault) {
    await new VaultChain(client, deployment(c)).initialize({ requireRelayerRole: false });
    const [admin, delay] = await Promise.all([
      client.readContract({
        address: c.vault,
        abi: operationsAbi,
        functionName: "defaultAdmin",
        blockNumber: block.number,
      }),
      client.readContract({
        address: c.vault,
        abi: operationsAbi,
        functionName: "defaultAdminDelay",
        blockNumber: block.number,
      }),
    ]);
    if (getAddress(admin) !== getAddress(c.admin) || delay !== c.adminDelay)
      throw new Error("Deployment admin policy mismatch");
  }
  if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash)
    throw new Error("Finalized snapshot changed");
  return {
    chainId: 43113,
    asset: ASSET,
    finalizedBlock: block.number,
    finalizedHash: block.hash,
    balances,
  };
}
export async function vaultArtifact() {
  return loadJson<{ abi: Abi; bytecode: Hex }>(
    new URL(
      "../../../../packages/payvoke-vault/artifacts/contracts/PayvokeVault.sol/PayvokeVault.json",
      import.meta.url,
    ).pathname,
  );
}
async function call(c: Ceremony, action: Action) {
  if (
    ![
      "deploy",
      "relayer-role",
      "approve",
      "deposit",
      "withdraw",
      "grant",
      "grant-update",
      "grant-revoke",
      "reclaim",
      "dispute",
      "withdraw-provider",
      "withdraw-platform",
      "finance-role",
    ].includes(action.kind)
  )
    throw new Error("Unknown operation");
  if (action.kind === "deploy") {
    if (c.vault) throw new Error("Refuse another deployment in an existing ceremony");
    if (
      !Number.isSafeInteger(c.adminDelay) ||
      c.adminDelay < 1 ||
      !Number.isSafeInteger(c.feeCapBps) ||
      c.feeCapBps < 0 ||
      c.feeCapBps > 10000 ||
      !Number.isSafeInteger(c.maxQuoteLifetimeSeconds) ||
      c.maxQuoteLifetimeSeconds < 1 ||
      !Number.isSafeInteger(c.maxHoldSeconds) ||
      c.maxHoldSeconds <= c.maxQuoteLifetimeSeconds
    )
      throw new Error("Invalid constructor policy");
    const artifact = await vaultArtifact();
    return {
      sender: c.admin,
      to: undefined,
      data: encodeDeployData({
        ...artifact,
        args: [
          ASSET,
          c.admin,
          c.adminDelay,
          c.feeCapBps,
          c.maxQuoteLifetimeSeconds,
          c.maxHoldSeconds,
        ],
      }),
    };
  }
  if (!c.vault) throw new Error("Deployment required");
  if (action.kind === "finance-role") {
    if (
      ![
        "FINANCE_EXECUTOR_ROLE",
        "REFUND_APPROVER_ROLE",
        "RELEASE_APPROVER_ROLE",
        "DISPUTE_RESOLVER_ROLE",
        "PAUSER_ROLE",
      ].includes(action.role) ||
      getAddress(action.account) === "0x0000000000000000000000000000000000000000"
    )
      throw new Error("Invalid role assignment");
    return {
      sender: c.admin,
      to: c.vault,
      data: encodeFunctionData({
        abi: operationsAbi,
        functionName: "grantRole",
        args: [keccak256(stringToHex(action.role)), getAddress(action.account)],
      }),
    };
  }
  if (action.kind === "grant-revoke")
    return {
      sender: c.buyer,
      to: c.vault,
      data: encodeFunctionData({
        abi: operationsAbi,
        functionName: "revokeGrant",
        args: [action.grantId],
      }),
    };
  if (action.kind === "dispute")
    return {
      sender: c.buyer,
      to: c.vault,
      data: encodeFunctionData({
        abi: operationsAbi,
        functionName: "openDispute",
        args: [action.holdId, action.evidenceHash],
      }),
    };
  if (action.kind === "withdraw-provider" || action.kind === "withdraw-platform") {
    if (integer(action.amount) === 0n) throw new Error("Amount must be positive");
    return {
      sender: getAddress(action.account),
      to: c.vault,
      data: encodeFunctionData({
        abi: operationsAbi,
        functionName: action.kind === "withdraw-provider" ? "withdrawProvider" : "withdrawPlatform",
        args: [integer(action.amount)],
      }),
    };
  }
  if (action.kind === "relayer-role")
    return {
      sender: c.admin,
      to: c.vault,
      data: encodeFunctionData({
        abi: operationsAbi,
        functionName: "grantRole",
        args: [keccak256(stringToHex("RELAYER_ROLE")), c.relayer],
      }),
    };
  if (action.kind === "grant" || action.kind === "grant-update")
    return {
      sender: c.buyer,
      to: c.vault,
      data: encodeFunctionData({
        abi: operationsAbi,
        functionName: action.kind === "grant" ? "registerGrant" : "updateGrant",
        args: [
          action.grantId,
          {
            signer: c.grantSigner,
            expiresAt: action.expiresAt,
            maxPerCall: integer(action.maxPerCall),
            periodSeconds: action.periodSeconds,
            maxPerPeriod: integer(action.maxPerPeriod),
            maxTotal: integer(action.maxTotal),
          },
        ],
      }),
    };
  if (action.kind === "reclaim")
    return {
      sender: c.buyer,
      to: c.vault,
      data: encodeFunctionData({
        abi: operationsAbi,
        functionName: "reclaim",
        args: [action.holdId],
      }),
    };
  if (!("amount" in action)) throw new Error("Unknown amount operation");
  const amount = integer(action.amount);
  if (amount === 0n) throw new Error("Amount must be positive");
  if (action.kind === "approve")
    return {
      sender: c.buyer,
      to: ASSET,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [c.vault, amount] }),
    };
  return {
    sender: c.buyer,
    to: c.vault,
    data: encodeFunctionData({
      abi: operationsAbi,
      functionName: action.kind === "deposit" ? "deposit" : "withdrawAvailable",
      args: [amount],
    }),
  };
}
export async function prepareOperation(
  client: PublicClient,
  c: Ceremony,
  action: Action,
  signer: LocalAccount,
  path: string,
) {
  await preflight(client, c);
  const target = await call(c, action);
  if (getAddress(signer.address) !== getAddress(target.sender))
    throw new Error("Wrong signer for action");
  const [latest, pending, estimate, balance] = await Promise.all([
    client.getTransactionCount({ address: signer.address, blockTag: "latest" }),
    client.getTransactionCount({ address: signer.address, blockTag: "pending" }),
    client.estimateGas({ account: signer.address, to: target.to, data: target.data, value: 0n }),
    client.getBalance({ address: signer.address }),
  ]);
  if (latest !== pending) throw new Error("Unresolved pending nonce; reconcile first");
  const gas = (estimate * 120n + 99n) / 100n;
  const maxFeePerGas = integer(c.maxFeePerGas),
    maxPriorityFeePerGas = integer(c.maxPriorityFeePerGas);
  if (
    gas > integer(c.maxGas) ||
    maxFeePerGas === 0n ||
    maxPriorityFeePerGas > maxFeePerGas ||
    gas * maxFeePerGas > integer(c.maxTransactionCost) ||
    balance < gas * maxFeePerGas
  )
    throw new Error("Gas budget or balance exceeded");
  const signedTransaction = await signer.signTransaction({
    chainId: 43113,
    type: "eip1559",
    nonce: latest,
    to: target.to,
    data: target.data,
    value: 0n,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  const result: SignedOperation = {
    version: 1,
    action,
    ceremony: c,
    sender: signer.address,
    nonce: latest,
    signedTransaction,
    transactionHash: keccak256(signedTransaction),
  };
  // A signed artifact is sensitive. Exclusive creation prevents accidental replacement.
  await saveExclusive(path, result);
  return {
    transactionHash: result.transactionHash,
    sender: result.sender,
    nonce: latest,
    gas,
    maxCostWei: gas * maxFeePerGas,
  };
}
export async function validateOperation(op: SignedOperation) {
  if (!/^0x02[\da-fA-F]+$/.test(op.signedTransaction))
    throw new Error("Expected EIP-1559 signed bytes");
  const tx = parseTransaction(op.signedTransaction);
  const target = await call(op.ceremony, op.action);
  if (
    op.version !== 1 ||
    keccak256(op.signedTransaction) !== op.transactionHash ||
    getAddress(
      await recoverTransactionAddress({
        serializedTransaction: op.signedTransaction as `0x02${string}`,
      }),
    ) !== getAddress(target.sender) ||
    getAddress(op.sender) !== getAddress(target.sender) ||
    tx.chainId !== 43113 ||
    tx.type !== "eip1559" ||
    tx.nonce !== op.nonce ||
    tx.to?.toLowerCase() !== target.to?.toLowerCase() ||
    tx.data !== target.data ||
    (tx.value ?? 0n) !== 0n ||
    !tx.gas ||
    tx.gas > integer(op.ceremony.maxGas) ||
    !tx.maxFeePerGas ||
    tx.maxFeePerGas > integer(op.ceremony.maxFeePerGas) ||
    tx.maxPriorityFeePerGas === undefined ||
    tx.maxPriorityFeePerGas > integer(op.ceremony.maxPriorityFeePerGas) ||
    tx.maxPriorityFeePerGas > tx.maxFeePerGas ||
    tx.gas * tx.maxFeePerGas > integer(op.ceremony.maxTransactionCost)
  )
    throw new Error("Invalid signed operation");
  return tx;
}
export async function broadcastOperation(
  client: PublicClient,
  op: SignedOperation,
  path: string,
  approvedHash: string,
) {
  await validateOperation(op);
  if (approvedHash !== op.transactionHash)
    throw new Error("Approve the exact persisted transaction hash");
  await preflight(client, op.ceremony);
  const [executed, pending] = await Promise.all([
    client.getTransactionCount({ address: op.sender, blockTag: "latest" }),
    client.getTransactionCount({ address: op.sender, blockTag: "pending" }),
  ]);
  if (executed !== op.nonce || pending !== op.nonce)
    throw new Error("Nonce changed; use receipt command, do not sign again");
  // Single-use durable marker BEFORE send. A timeout/crash is never auto-retried.
  await saveExclusive(`${path}.send.json`, {
    transactionHash: op.transactionHash,
    authorizedAt: new Date().toISOString(),
  });
  const hash = await client.sendRawTransaction({ serializedTransaction: op.signedTransaction });
  if (hash !== op.transactionHash)
    throw new Error("Unexpected broadcast hash; reconcile persisted hash");
  return { transactionHash: hash };
}
export async function operationReceipt(client: PublicClient, op: SignedOperation) {
  const transaction = await validateOperation(op);
  if ((await client.getChainId()) !== 43113) throw new Error("Wrong chain");
  const receipt = await client.getTransactionReceipt({ hash: op.transactionHash });
  const head = await client.getBlock({ blockTag: "finalized" });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (
    !head.hash ||
    head.number === null ||
    head.number < receipt.blockNumber ||
    block.hash !== receipt.blockHash ||
    receipt.transactionHash !== op.transactionHash ||
    receipt.from.toLowerCase() !== op.sender.toLowerCase() ||
    (receipt.to?.toLowerCase() ?? undefined) !== transaction.to?.toLowerCase() ||
    receipt.gasUsed > transaction.gas! ||
    receipt.effectiveGasPrice > transaction.maxFeePerGas!
  )
    throw new Error("Receipt not canonical finalized");
  const headCheck = await client.getBlock({ blockNumber: head.number });
  if (headCheck.hash !== head.hash) throw new Error("Finalized snapshot changed");
  let deployed: Ceremony | undefined;
  if (receipt.status === "success" && op.action.kind === "deploy") {
    if (!receipt.contractAddress) throw new Error("Missing deployment address");
    const code = await client.getCode({
      address: receipt.contractAddress,
      blockNumber: receipt.blockNumber,
    });
    if (!code || code === "0x") throw new Error("Missing runtime");
    deployed = {
      ...op.ceremony,
      vault: receipt.contractAddress,
      expectedCodeHash: keccak256(code),
      deploymentBlock: receipt.blockNumber.toString(),
    };
    await preflight(client, deployed);
  }
  return {
    transactionHash: op.transactionHash,
    status: receipt.status,
    receiptBlock: receipt.blockNumber,
    receiptBlockHash: receipt.blockHash,
    finalizedBlock: head.number,
    finalizedBlockHash: head.hash,
    actualGasCostWei: receipt.gasUsed * receipt.effectiveGasPrice,
    deployment: deployed,
    balances: (await preflight(client, deployed ?? op.ceremony)).balances,
    buyerAvailable: (deployed ?? op.ceremony).vault
      ? await client.readContract({
          address: (deployed ?? op.ceremony).vault!,
          abi: operationsAbi,
          functionName: "availableBalance",
          args: [op.ceremony.buyer],
          blockNumber: head.number,
        })
      : undefined,
  };
}
