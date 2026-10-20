import assert from "node:assert/strict";
import { it } from "node:test";
import { network } from "hardhat";
import PayvokeVaultModule from "../ignition/modules/PayvokeVault.js";

it("Ignition deploys the vault with explicit policy and admin, without assigning operational roles", async () => {
  const connection = await network.create();
  try {
    const [deployer, admin] = await connection.viem.getWalletClients();
    const token = await connection.viem.deployContract("MockUSDC");
    const { vault } = await connection.ignition.deploy(PayvokeVaultModule, {
      parameters: {
        PayvokeVault: {
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
