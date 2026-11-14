import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  getContract,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { grantSetupTypedData, permitTypedData, type GrantConfig } from "@payvoke/shared/protocol";
import { avalancheFuji } from "viem/chains";
import { ASSET } from "@payvoke/shared/x402";
import { VaultChain } from "@payvoke/shared/x402/chain";
import { SettlementChain } from "@payvoke/shared/x402/settlement";

// Public Hardhat fixture key. Only connect to a freshly spawned loopback node.
const admin = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
export async function localEvm(buyer: Address, relayer: Address, grantSigner: Address) {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    socket.close((err) => (err ? reject(err) : resolve())),
  );
  const process = spawn(
    "bunx",
    ["hardhat", "node", "--hostname", "127.0.0.1", "--port", String(port), "--chain-id", "43113"],
    {
      cwd: fileURLToPath(new URL("../../../../packages/vault", import.meta.url)),
      detached: true,
      stdio: "ignore",
    },
  );
  const stop = async () => {
    if (process.exitCode !== null || !process.pid) return;
    const done = new Promise<void>((resolve) => process.once("exit", () => resolve()));
    globalThis.process.kill(-process.pid, "SIGTERM");
    await done;
  };
  try {
    const rpc = `http://127.0.0.1:${port}`;
    const client = createPublicClient({ transport: http(rpc, { retryCount: 0, timeout: 2000 }) });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await client.getChainId()) === 43113) {
          ready = true;
          break;
        }
      } catch {
        /* node starting */
      }
      if (process.exitCode !== null) break;
      await delay(100);
    }
    if (!ready) throw new Error("Local Hardhat RPC did not start");
    const artifact = async (path: string) =>
      JSON.parse(
        await readFile(
          new URL(`../../../../packages/vault/artifacts/contracts/${path}`, import.meta.url),
          "utf8",
        ),
      ) as { abi: Abi; bytecode: Hex; deployedBytecode: Hex };
    const token = await artifact("test/MockUSDC.sol/MockUSDC.json");
    const vaultArtifact = await artifact("PayvokeVault.sol/PayvokeVault.json");
    const test = createTestClient({ mode: "hardhat", transport: http(rpc) });
    const adminWallet = createWalletClient({
      account: admin,
      chain: avalancheFuji,
      transport: http(rpc),
    });
    // Deploy once so EIP-712 immutables (name/version hashes) are filled, then
    // place that runtime at the Fuji USDC address the app is pinned to.
    const tokenDeploy = await adminWallet.deployContract({
      abi: token.abi,
      bytecode: token.bytecode,
    });
    const tokenAddress = (await client.waitForTransactionReceipt({ hash: tokenDeploy }))
      .contractAddress!;
    await test.setCode({
      address: ASSET,
      bytecode: (await client.getCode({ address: tokenAddress }))!,
    });
    await test.setBalance({ address: buyer, value: 10n ** 20n });
    await test.setBalance({ address: relayer, value: 10n ** 20n });
    const hash = await adminWallet.deployContract({
      abi: vaultArtifact.abi,
      bytecode: vaultArtifact.bytecode,
      args: [ASSET, admin.address, 100, 500, 3600, 30 * 86400],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error("Local vault deployment failed");
    const vault = receipt.contractAddress;
    const contract = getContract({
      address: vault,
      abi: vaultArtifact.abi,
      client: { public: client, wallet: adminWallet },
    });
    const usdc = getContract({
      address: ASSET,
      abi: token.abi,
      client: { public: client, wallet: adminWallet },
    });
    await usdc.write.mint([buyer, 10000000n]);
    const role = (await contract.read.RELAYER_ROLE()) as Hex;
    await contract.write.grantRole([role, relayer]);
    // The admin relays grant setups in tests, off the settlement relayer's nonce lane.
    await contract.write.grantRole([role, admin.address]);
    const code = await client.getCode({ address: vault });
    if (!code) throw new Error("Missing local runtime");
    const deployment = {
      chainId: 43113,
      vault,
      relayer,
      asset: ASSET,
      expectedCodeHash: keccak256(code),
      feeCapBps: 500,
      maxQuoteLifetimeSeconds: 3600,
      maxHoldSeconds: 30 * 86400,
    };
    const admission = new VaultChain(client, deployment);
    const settlement = new SettlementChain(client, deployment);
    await admission.initialize();
    await settlement.finalized();
    return {
      rpc,
      client,
      test,
      contract,
      usdc,
      vaultArtifact,
      token,
      adminWallet,
      vault,
      admission,
      settlement,
      grant: {
        signer: grantSigner,
        expiresAt: Number((await client.getBlock()).timestamp) + 86400,
        maxPerCall: 1000000n,
        periodSeconds: 3600,
        maxPerPeriod: 5000000n,
        maxTotal: 10000000n,
      },
      startBlock: receipt.blockNumber,
      // The buyer signs a grant setup and a permit for `allowance`; the admin
      // relays them, as the relayer does for setGrantWithSig in production.
      async setGrant(
        owner: LocalAccount,
        grantId: Hex,
        config: GrantConfig,
        allowance = config.maxTotal,
      ) {
        const now = Number((await client.getBlock()).timestamp);
        const deadline = now + 3600;
        const nonce = (await contract.read.grantNonces([owner.address])) as bigint;
        const permitNonce = (await usdc.read.nonces([owner.address])) as bigint;
        const setup = await owner.signTypedData(
          grantSetupTypedData(vault, { buyer: owner.address, grantId, ...config, nonce, deadline }),
        );
        const permit = await owner.signTypedData(
          permitTypedData(ASSET, {
            owner: owner.address,
            spender: vault,
            value: allowance,
            nonce: permitNonce,
            deadline: BigInt(deadline),
          }),
        );
        const tx = await contract.write.setGrantWithSig([
          owner.address,
          grantId,
          config,
          deadline,
          setup,
          { value: allowance, deadline: BigInt(deadline), signature: permit },
        ]);
        await client.waitForTransactionReceipt({ hash: tx as Hex });
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
