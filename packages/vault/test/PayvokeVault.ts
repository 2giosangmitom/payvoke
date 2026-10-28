import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256 } from "viem";
import { VaultChain } from "@payvoke/shared/x402/chain";
import {
  businessKey,
  hashAuthorization,
  hashDecision,
  hashQuote,
  paymentTypes,
  vaultDomain,
  type InvocationQuote,
  type ResolutionDecision,
} from "@payvoke/shared/protocol";

describe("PayvokeVault / viem session authorization", async () => {
  const { viem, networkHelpers } = await network.create();
  const client = await viem.getPublicClient();
  const [admin, buyer, provider, executor, approver] = await viem.getWalletClients();
  // Public test-only key, never part of runtime/client package exports.
  const signer = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  async function fixture() {
    const token = await viem.deployContract("MockUSDC");
    const vault = await viem.deployContract("PayvokeVault", [
      token.address,
      admin.account.address,
      100,
      500,
      3600,
      30 * 86400,
    ]);
    await vault.write.grantRole([await vault.read.RELAYER_ROLE(), admin.account.address]);
    await token.write.mint([buyer.account.address, 1000000n]);
    await token.write.approve([vault.address, 1000000n], { account: buyer.account });
    await vault.write.deposit([1000000n], { account: buyer.account });
    const now = await networkHelpers.time.latest();
    const grantId = businessKey("session", "test-grant");
    await vault.write.registerGrant(
      [
        grantId,
        {
          signer: signer.address,
          expiresAt: now + 86400,
          maxPerCall: 100000n,
          periodSeconds: 3600,
          maxPerPeriod: 200000n,
          maxTotal: 500000n,
        },
      ],
      { account: buyer.account },
    );
    const quote: InvocationQuote = {
      invocationKey: businessKey("invocation", "one"),
      quoteKey: businessKey("quote", "one"),
      buyer: buyer.account.address,
      usageSessionKey: businessKey("session", "one"),
      productKey: businessKey("product", "one"),
      productVersion: 1n,
      commandKey: businessKey("command", "one"),
      inputHash: businessKey("quote", "input"),
      termsHash: businessKey("quote", "terms"),
      policyHash: businessKey("quote", "policy"),
      provider: provider.account.address,
      asset: token.address,
      grossAmount: 10000n,
      feeBps: 200,
      feeRecipient: admin.account.address,
      validUntil: now + 60,
      deliveryDeadline: now + 120,
      releaseNotBefore: now + 180,
      resolveBy: now + 240,
    };
    const domain = vaultDomain(vault.address, await client.getChainId());
    const authorization = { quoteDigest: hashQuote(domain, quote), grantId, grantEpoch: 1n };
    const signature = await signer.signTypedData({
      domain,
      types: paymentTypes,
      primaryType: "DebitAuthorization",
      message: authorization,
    });
    return { token, vault, quote, domain, authorization, signature };
  }

  async function admissionReader(f: Awaited<ReturnType<typeof fixture>>) {
    const code = await client.getCode({ address: f.vault.address });
    assert.ok(code);
    const reader = VaultChain.fromRpc(client.transport.request, {
      chainId: await client.getChainId(),
      asset: f.token.address,
      vault: f.vault.address,
      relayer: admin.account.address,
      expectedCodeHash: keccak256(code),
      feeCapBps: 500,
      maxQuoteLifetimeSeconds: 3600,
      maxHoldSeconds: 30 * 86400,
    });
    await reader.initialize();
    return reader;
  }

  it("previews reserveHold against real local contracts without spending or consuming the grant", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    const observation = await reader.validate(
      f.quote,
      f.authorization,
      f.signature,
      async () => {},
    );
    assert.equal(observation.kind, "new-admission");
    assert.equal(await f.vault.read.availableBalance([buyer.account.address]), 1000000n);
    assert.equal(
      (await f.vault.read.getGrant([buyer.account.address, f.authorization.grantId])).spentTotal,
      0n,
    );
    assert.equal(await f.vault.read.totalHeld(), 0n);
    await f.vault.write.reserveHold([f.quote, f.authorization, f.signature]);
    assert.equal(await f.vault.read.totalHeld(), f.quote.grossAmount);
  });

  it("rechecks revocation on the real chain rather than trusting an earlier valid preview", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    await reader.validate(f.quote, f.authorization, f.signature, async () => {});
    await f.vault.write.revokeGrant([f.authorization.grantId], { account: buyer.account });
    await assert.rejects(
      reader.validate(f.quote, f.authorization, f.signature, async () => {}),
      /grant_revoked/,
    );
    await viem.assertions.revertWithCustomError(
      f.vault.write.reserveHold([f.quote, f.authorization, f.signature]),
      f.vault,
      "GrantRevoked",
    );
  });

  it("matches real vault balance and relayer-role admission failures", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    await f.vault.write.withdrawAvailable([1000000n - f.quote.grossAmount + 1n], {
      account: buyer.account,
    });
    await assert.rejects(
      reader.validate(f.quote, f.authorization, f.signature, async () => {}),
      /insufficient_available/,
    );
    await viem.assertions.revertWithCustomError(
      f.vault.write.reserveHold([f.quote, f.authorization, f.signature]),
      f.vault,
      "InsufficientAvailable",
    );
    await f.vault.write.revokeRole([await f.vault.read.RELAYER_ROLE(), admin.account.address]);
    await assert.rejects(
      reader.validate(f.quote, f.authorization, f.signature, async () => {}),
      /unauthorized_relayer/,
    );
  });

  it("recognizes an existing local hold after grant revocation, expiry and relayer role removal", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    await f.vault.write.reserveHold([f.quote, f.authorization, f.signature]);
    await f.vault.write.revokeGrant([f.authorization.grantId], { account: buyer.account });
    await f.vault.write.revokeRole([await f.vault.read.RELAYER_ROLE(), admin.account.address]);
    await networkHelpers.time.increaseTo(f.quote.resolveBy + 1);
    const observation = await reader.validate(f.quote, f.authorization, f.signature, async () => {
      throw new Error("Must not admit again");
    });
    assert.equal(observation.kind, "existing-hold");
    assert.equal(await f.vault.read.totalHeld(), f.quote.grossAmount);
  });

  it("hashes and verifies the same quote/authorization as viem, then holds once", async () => {
    const { vault, token, quote, domain, authorization, signature } =
      await networkHelpers.loadFixture(fixture);
    assert.equal(await vault.read.hashQuote([quote]), hashQuote(domain, quote));
    assert.equal(
      await vault.read.hashAuthorization([authorization]),
      hashAuthorization(domain, authorization),
    );
    const hash = await vault.write.reserveHold([quote, authorization, signature]);
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    assert.equal(await vault.read.availableBalance([buyer.account.address]), 990000n);
    assert.equal(
      (await vault.read.getHold([quote.invocationKey])).authorizationDigest,
      hashAuthorization(domain, authorization),
    );
    await vault.write.reserveHold([quote, authorization, signature]);
    assert.equal(await vault.read.totalHeld(), 10000n);
    assert.equal(await token.read.balanceOf([vault.address]), 1000000n);
    const events = await client.getContractEvents({
      address: vault.address,
      abi: vault.abi,
      eventName: "HoldReserved",
      fromBlock: 0n,
      strict: true,
    });
    assert.equal(events.length, 1);
  });

  it("rejects signatures for another chain or another vault", async () => {
    const { vault, quote, domain, authorization } = await networkHelpers.loadFixture(fixture);
    for (const wrong of [
      { ...domain, chainId: 1 },
      { ...domain, verifyingContract: provider.account.address },
    ]) {
      const signature = await signer.signTypedData({
        domain: wrong,
        types: paymentTypes,
        primaryType: "DebitAuthorization",
        message: authorization,
      });
      await viem.assertions.revertWithCustomError(
        vault.write.reserveHold([quote, authorization, signature]),
        vault,
        "InvalidSignature",
      );
    }
    assert.equal(await vault.read.totalHeld(), 0n);
  });

  it("completes deposit/grant/hold/partial refunds/release/withdraw with viem approvals", async () => {
    const { vault, token, quote, domain, authorization, signature } =
      await networkHelpers.loadFixture(fixture);
    await vault.write.grantRole([
      await vault.read.FINANCE_EXECUTOR_ROLE(),
      executor.account.address,
    ]);
    await vault.write.grantRole([
      await vault.read.REFUND_APPROVER_ROLE(),
      approver.account.address,
    ]);
    await vault.write.grantRole([
      await vault.read.RELEASE_APPROVER_ROLE(),
      approver.account.address,
    ]);
    await vault.write.reserveHold([quote, authorization, signature]);

    async function resolve(refundAmount: bigint, releaseRemainder: boolean) {
      const hold = await vault.read.getHold([quote.invocationKey]);
      const decision: ResolutionDecision = {
        holdId: quote.invocationKey,
        decisionId: businessKey("quote", `decision-${hold.version}`),
        expectedVersion: hold.version,
        refundAmount,
        releaseRemainder,
        validUntil: quote.resolveBy,
      };
      assert.equal(await vault.read.hashDecision([decision]), hashDecision(domain, decision));
      const approval = await approver.signTypedData({
        domain,
        types: paymentTypes,
        primaryType: "ResolutionDecision",
        message: decision,
      });
      const tx = await vault.write.applyDecision([decision, approver.account.address, approval], {
        account: executor.account,
      });
      assert.equal((await client.waitForTransactionReceipt({ hash: tx })).status, "success");
    }

    await resolve(1111n, false);
    await resolve(2222n, false);
    await networkHelpers.time.increaseTo(quote.releaseNotBefore);
    await resolve(0n, true);
    assert.equal(await vault.read.providerClaimable([provider.account.address]), 6534n);
    assert.equal(await vault.read.platformClaimable([admin.account.address]), 133n);
    await vault.write.withdrawProvider([6534n], { account: provider.account });
    await vault.write.withdrawPlatform([133n]);
    await vault.write.withdrawAvailable([993333n], { account: buyer.account });
    assert.equal(await token.read.balanceOf([vault.address]), 0n);
    assert.equal(await token.read.balanceOf([buyer.account.address]), 993333n);
    assert.equal(await token.read.balanceOf([provider.account.address]), 6534n);
    assert.equal(await token.read.balanceOf([admin.account.address]), 133n);
    assert.equal(
      (await vault.read.getGrant([buyer.account.address, authorization.grantId])).spentTotal,
      10000n,
    );
    const events = await client.getContractEvents({
      address: vault.address,
      abi: vault.abi,
      eventName: "DecisionApplied",
      fromBlock: 0n,
      strict: true,
    });
    assert.equal(events.length, 3);
  });

  it("checks every signed decision field and rejects cross-domain approvals", async () => {
    const { vault, quote, domain, authorization, signature } =
      await networkHelpers.loadFixture(fixture);
    await vault.write.grantRole([
      await vault.read.FINANCE_EXECUTOR_ROLE(),
      executor.account.address,
    ]);
    for (const role of [
      await vault.read.REFUND_APPROVER_ROLE(),
      await vault.read.RELEASE_APPROVER_ROLE(),
    ]) {
      await vault.write.grantRole([role, approver.account.address]);
    }
    await vault.write.reserveHold([quote, authorization, signature]);
    await networkHelpers.time.increaseTo(quote.releaseNotBefore);
    const decision: ResolutionDecision = {
      holdId: quote.invocationKey,
      decisionId: businessKey("quote", "approval-mutation"),
      expectedVersion: 1n,
      refundAmount: 1n,
      releaseRemainder: false,
      validUntil: quote.resolveBy,
    };
    const data = {
      domain,
      types: paymentTypes,
      primaryType: "ResolutionDecision",
      message: decision,
    } as const;
    const approval = await approver.signTypedData(data);
    for (const field of paymentTypes.ResolutionDecision) {
      const value = decision[field.name];
      const changed =
        typeof value === "boolean"
          ? !value
          : typeof value === "bigint"
            ? value + 1n
            : typeof value === "number"
              ? value + 1
              : businessKey("quote", "changed");
      const expected =
        field.name === "holdId"
          ? "HoldNotFound"
          : field.name === "expectedVersion"
            ? "HoldVersionMismatch"
            : "InvalidSignature";
      await viem.assertions.revertWithCustomError(
        vault.write.applyDecision(
          [{ ...decision, [field.name]: changed }, approver.account.address, approval],
          { account: executor.account },
        ),
        vault,
        expected,
      );
    }
    for (const wrongDomain of [
      { ...domain, chainId: 1 },
      { ...domain, verifyingContract: quote.asset },
      { ...domain, version: "2" },
    ]) {
      const wrongApproval = await approver.signTypedData({ ...data, domain: wrongDomain });
      await viem.assertions.revertWithCustomError(
        vault.write.applyDecision([decision, approver.account.address, wrongApproval], {
          account: executor.account,
        }),
        vault,
        "InvalidSignature",
      );
    }
    assert.equal((await vault.read.getHold([quote.invocationKey])).remaining, 10000n);
    assert.equal(await vault.read.usedDecisionIds([decision.decisionId]), false);
  });

  it("reclaims a hold after its deadline without approver or relayer availability", async () => {
    const { vault, token, quote, authorization, signature } =
      await networkHelpers.loadFixture(fixture);
    await vault.write.reserveHold([quote, authorization, signature]);
    await vault.write.grantRole([await vault.read.PAUSER_ROLE(), admin.account.address]);
    await vault.write.pause();
    await networkHelpers.time.increaseTo(quote.resolveBy);
    await vault.write.reclaim([quote.invocationKey], { account: buyer.account });
    await vault.write.withdrawAvailable([1000000n], { account: buyer.account });
    assert.equal(await token.read.balanceOf([vault.address]), 0n);
    assert.equal(await token.read.balanceOf([buyer.account.address]), 1000000n);
    assert.equal((await vault.read.getHold([quote.invocationKey])).closed, true);
  });

  it("matches the exact published vector at its fixed domain address and Fuji chain ID", async () => {
    const vector = JSON.parse(
      readFileSync(new URL("../../shared/test/fixtures/x402-v1.json", import.meta.url), "utf8"),
    );
    const connection = await network.create({ override: { chainId: 43113 } });
    try {
      const token = await connection.viem.deployContract("MockUSDC");
      const deployed = await connection.viem.deployContract("PayvokeVault", [
        token.address,
        admin.account.address,
        100,
        500,
        3600,
        30 * 86400,
      ]);
      const publicClient = await connection.viem.getPublicClient();
      const code = await publicClient.getCode({ address: deployed.address });
      // EIP712 rebuilds its domain when address(this) differs from its cached deployment.
      await connection.networkHelpers.setCode(vector.domain.verifyingContract, code!);
      const vault = await connection.viem.getContractAt(
        "PayvokeVault",
        vector.domain.verifyingContract,
      );
      const quote = {
        ...vector.quote,
        productVersion: BigInt(vector.quote.productVersion),
        grossAmount: BigInt(vector.quote.grossAmount),
        feeBps: Number(vector.quote.feeBps),
        validUntil: Number(vector.quote.validUntil),
        deliveryDeadline: Number(vector.quote.deliveryDeadline),
        releaseNotBefore: Number(vector.quote.releaseNotBefore),
        resolveBy: Number(vector.quote.resolveBy),
      };
      assert.equal(await vault.read.hashQuote([quote]), vector.quoteDigest);
      assert.equal(
        await vault.read.hashAuthorization([
          { ...vector.authorization, grantEpoch: BigInt(vector.authorization.grantEpoch) },
        ]),
        vector.authorizationDigest,
      );
    } finally {
      await connection.close();
    }
  });
});
