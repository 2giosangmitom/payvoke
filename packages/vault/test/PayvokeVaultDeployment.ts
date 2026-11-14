import assert from "node:assert/strict";
import { it } from "node:test";
import { network } from "hardhat";
import PayvokeVaultModule from "../ignition/modules/PayvokeVault.js";
import PayvokeVaultRolesModule from "../ignition/modules/PayvokeVaultRoles.js";

it("Ignition deploys the vault with explicit policy and admin, without assigning operational roles", async () => {
  const connection = await network.create();
  try {
    const [deployer, admin] = await connection.viem.getWalletClients();
    const token = await connection.viem.deployContract("MockUSDC");
    const { vault } = await connection.ignition.deploy(PayvokeVaultModule, {
      parameters: {
        PayvokeVaultV2: {
          asset: token.address,
          admin: admin.account.address,
          adminDelay: 100,
          feeCapBps: 500,
          maxQuoteLifetimeSeconds: 3600,
          maxHoldSeconds: 30 * 86400,
        },
      },
    });

    assert.equal((await vault.read.asset()).toLowerCase(), token.address.toLowerCase());
    assert.equal((await vault.read.defaultAdmin()).toLowerCase(), admin.account.address);
    assert.equal(await vault.read.defaultAdminDelay(), 100);
    assert.equal(await vault.read.feeCapBps(), 500);
    assert.equal(await vault.read.maxQuoteLifetimeSeconds(), 3600);
    assert.equal(await vault.read.maxHoldSeconds(), 30 * 86400);
    for (const account of [deployer, admin]) {
      assert.equal(
        await vault.read.hasRole([await vault.read.RELAYER_ROLE(), account.account.address]),
        false,
      );
      assert.equal(
        await vault.read.hasRole([await vault.read.PAUSER_ROLE(), account.account.address]),
        false,
      );
    }
  } finally {
    await connection.close();
  }
});

it("Ignition roles module grants relayer and automatic finance roles from the admin", async () => {
  const connection = await network.create();
  try {
    const [admin, relayer, approver, executor] = await connection.viem.getWalletClients();
    const token = await connection.viem.deployContract("MockUSDC");
    const { vault } = await connection.ignition.deploy(PayvokeVaultRolesModule, {
      parameters: {
        PayvokeVaultV2: {
          asset: token.address,
          admin: admin.account.address,
          adminDelay: 100,
          feeCapBps: 500,
          maxQuoteLifetimeSeconds: 3600,
          maxHoldSeconds: 30 * 86400,
        },
        PayvokeVaultV2Roles: {
          relayer: relayer.account.address,
          financeApprover: approver.account.address,
          financeExecutor: executor.account.address,
        },
      },
    });
    const has = async (role: Promise<`0x${string}`>, account: `0x${string}`) =>
      vault.read.hasRole([await role, account]);
    assert.equal(await has(vault.read.RELAYER_ROLE(), relayer.account.address), true);
    assert.equal(await has(vault.read.REFUND_APPROVER_ROLE(), approver.account.address), true);
    assert.equal(await has(vault.read.RELEASE_APPROVER_ROLE(), approver.account.address), true);
    assert.equal(await has(vault.read.FINANCE_EXECUTOR_ROLE(), executor.account.address), true);
    assert.equal(await has(vault.read.FINANCE_EXECUTOR_ROLE(), approver.account.address), false);
    assert.equal(await has(vault.read.PAUSER_ROLE(), admin.account.address), false);
  } finally {
    await connection.close();
  }
});
