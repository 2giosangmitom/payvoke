import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  broadcastOperation,
  loadJson,
  operationReceipt,
  preflight,
  prepareOperation,
  validateOperation,
  type Action,
  type Ceremony,
  type SignedOperation,
} from "../src/operations/fuji";
import { localEvm } from "@payvoke/testkit/local-evm";

test("Fuji ceremony tooling signs offline, sends once, verifies finality and withdraws on isolated EVM", async (t) => {
  if (process.env.PAYMENTS_TEST_EVM !== "1") {
    t.skip("Requires isolated EVM flag");
    return;
  }
  const buyer = privateKeyToAccount(generatePrivateKey());
  const relayer = privateKeyToAccount(generatePrivateKey());
  const grantSigner = privateKeyToAccount(generatePrivateKey());
  const evm = await localEvm(buyer.address, relayer.address, grantSigner.address);
  t.after(evm.stop);
  const directory = await mkdtemp("/tmp/opencode/fuji-operations-");
  t.after(() => rm(directory, { recursive: true }));
  let ceremony: Ceremony = {
    admin: evm.adminWallet.account.address,
    buyer: buyer.address,
    relayer: relayer.address,
    grantSigner: grantSigner.address,
    adminDelay: 100,
    feeCapBps: 500,
    maxQuoteLifetimeSeconds: 120,
    maxHoldSeconds: 600,
    maxGas: "5000000",
    maxFeePerGas: "10000000000",
    maxPriorityFeePerGas: "1000000000",
    maxTransactionCost: "50000000000000000",
  };
  const report = await preflight(evm.client, ceremony);
  assert.equal(report.chainId, 43113);
  let index = 0;
  async function execute(action: Action, signer = buyer) {
    const path = `${directory}/${index++}.json`;
    const nonce = await evm.client.getTransactionCount({ address: signer.address });
    const prepared = await prepareOperation(evm.client, ceremony, action, signer, path);
    assert.equal(
      await evm.client.getTransactionCount({ address: signer.address }),
      nonce,
      "prepare never sends",
    );
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const op = await loadJson<SignedOperation>(path);
    await assert.rejects(prepareOperation(evm.client, ceremony, action, signer, path), /EEXIST/);
    await assert.rejects(
      broadcastOperation(evm.client, op, path, `0x${"0".repeat(64)}`),
      /Approve/,
    );
    await assert.rejects(validateOperation({ ...op, nonce: op.nonce + 1 }), /Invalid signed/);
    await broadcastOperation(evm.client, op, path, prepared.transactionHash);
    await assert.rejects(broadcastOperation(evm.client, op, path, prepared.transactionHash));
    assert.equal(
      JSON.parse(await readFile(`${path}.send.json`, "utf8")).transactionHash,
      prepared.transactionHash,
    );
    const result = await operationReceipt(evm.client, op);
    assert.equal(result.status, "success");
    assert.ok(result.actualGasCostWei > 0n);
    return result;
  }
  const deployed = await execute({ kind: "deploy" }, evm.adminWallet.account);
  assert.ok(deployed.deployment);
  ceremony = deployed.deployment;
  await execute({ kind: "relayer-role" }, evm.adminWallet.account);
  await execute({ kind: "approve", amount: "200000" });
  await execute({ kind: "deposit", amount: "200000" });
  await execute({
    kind: "grant",
    grantId: `0x${"c".repeat(64)}`,
    ...evm.grant,
    maxPerCall: "100000",
    maxPerPeriod: "200000",
    maxTotal: "200000",
  });
  await execute({ kind: "withdraw", amount: "200000" });
  const final = await preflight(evm.client, ceremony);
  assert.equal(final.balances.find((b) => b.address === buyer.address)?.usdcUnits, 10000000n);
  assert.ok(ceremony.expectedCodeHash);
  assert.ok(ceremony.deploymentBlock);
  const path = `${directory}/ambiguous.json`;
  const prepared = await prepareOperation(
    evm.client,
    ceremony,
    { kind: "approve", amount: "1" },
    buyer,
    path,
  );
  const op = await loadJson<SignedOperation>(path);
  const send = evm.client.sendRawTransaction.bind(evm.client);
  const hook = t.mock.method(
    evm.client,
    "sendRawTransaction",
    async (args: Parameters<typeof send>[0]) => {
      await send(args);
      throw new Error("timeout after execution");
    },
  );
  await assert.rejects(
    broadcastOperation(evm.client, op, path, prepared.transactionHash),
    /timeout/,
  );
  hook.mock.restore();
  await assert.rejects(broadcastOperation(evm.client, op, path, prepared.transactionHash));
  assert.equal((await operationReceipt(evm.client, op)).status, "success");
});
