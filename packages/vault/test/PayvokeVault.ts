import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, zeroHash, type Hex } from "viem";
import { VaultChain } from "@payvoke/shared/x402/chain";
import {
  FUNDING_SOURCE,
  NO_PERMIT,
  businessKey,
  grantSetupTypedData,
  hashAuthorization,
  hashDecision,
  hashQuote,
  hashReceiveAuthorization,
  paymentTypes,
  permitTypedData,
  receiveAuthorizationTypedData,
  vaultDomain,
  type GrantConfig,
  type InvocationQuote,
  type ResolutionDecision,
} from "@payvoke/shared/protocol";

describe("PayvokeVault / viem funding and settlement", async () => {
  const { viem, networkHelpers } = await network.create();
  const client = await viem.getPublicClient();
  const chainId = await client.getChainId();
  const [admin, buyer, provider, executor, approver] = await viem.getWalletClients();
  // Public test-only key, never part of runtime/client package exports.
  const signer = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );
  const FUNDS = 1000000n;

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
    await token.write.mint([buyer.account.address, FUNDS]);
    const now = await networkHelpers.time.latest();
    const grantId = businessKey("session", "test-grant");
    const config: GrantConfig = {
      signer: signer.address,
      expiresAt: now + 86400,
      maxPerCall: 100000n,
      periodSeconds: 3600,
      maxPerPeriod: 200000n,
      maxTotal: 500000n,
    };
    const deadline = now + 3600;
    const setup = await buyer.signTypedData(
      grantSetupTypedData(
        vault.address,
        { buyer: buyer.account.address, grantId, ...config, nonce: 0n, deadline },
        chainId,
      ),
    );
    const permit = await buyer.signTypedData(
      permitTypedData(
        token.address,
        {
          owner: buyer.account.address,
          spender: vault.address,
          value: config.maxTotal,
          nonce: 0n,
          deadline: BigInt(deadline),
        },
        chainId,
      ),
    );
    await vault.write.setGrantWithSig([
      buyer.account.address,
      grantId,
      config,
      deadline,
      setup,
      { value: config.maxTotal, deadline: BigInt(deadline), signature: permit },
    ]);
    const quote = quoteFor("one", buyer.account.address, token.address, now);
    const domain = vaultDomain(vault.address, chainId);
    const quoteDigest = hashQuote(domain, quote);
    const authorization = { quoteDigest, grantId, grantEpoch: 1n };
    const signature = await signer.signTypedData({
      domain,
      types: paymentTypes,
      primaryType: "DebitAuthorization",
      message: authorization,
    });
    const buyerSignature = await buyer.signTypedData(
      receiveAuthorizationTypedData(token.address, vault.address, quote, quoteDigest, chainId),
    );
    return {
      token,
      vault,
      quote,
      domain,
      quoteDigest,
      authorization,
      signature,
      buyerSignature,
      grantId,
    };
  }

  function quoteFor(id: string, buyerAddress: Hex, asset: Hex, now: number): InvocationQuote {
    return {
      invocationKey: businessKey("invocation", id),
      quoteKey: businessKey("quote", id),
      buyer: buyerAddress,
      usageSessionKey: businessKey("session", id),
      productKey: businessKey("product", "one"),
      productVersion: 1n,
      commandKey: businessKey("command", "one"),
      inputHash: businessKey("quote", "input"),
      termsHash: businessKey("quote", "terms"),
      policyHash: businessKey("quote", "policy"),
      provider: provider.account.address,
      asset,
      grossAmount: 10000n,
      feeBps: 200,
      feeRecipient: admin.account.address,
      validUntil: now + 60,
      deliveryDeadline: now + 120,
      releaseNotBefore: now + 180,
      resolveBy: now + 240,
    };
  }

  async function admissionReader(f: Awaited<ReturnType<typeof fixture>>) {
    const code = await client.getCode({ address: f.vault.address });
    assert.ok(code);
    const reader = VaultChain.fromRpc(client.transport.request, {
      chainId,
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

  const grantIntent = (f: Awaited<ReturnType<typeof fixture>>) =>
    ({ mode: "grant", authorization: f.authorization, signature: f.signature }) as const;
  const walletIntent = (f: Awaited<ReturnType<typeof fixture>>) =>
    ({ mode: "authorization", signature: f.buyerSignature }) as const;

  it("previews both funding modes against real contracts without moving funds", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    for (const intent of [walletIntent(f), grantIntent(f)]) {
      const observation = await reader.validate(f.quote, intent, async () => {});
      assert.equal(observation.kind, "new-admission");
      assert.equal(observation.mode, intent.mode);
    }
    assert.equal(await f.token.read.balanceOf([buyer.account.address]), FUNDS);
    assert.equal((await f.vault.read.getGrant([buyer.account.address, f.grantId])).spentTotal, 0n);
    assert.equal(await f.vault.read.totalHeld(), 0n);
    await f.vault.write.fundWithAuthorization([f.quote, f.buyerSignature]);
    assert.equal(await f.vault.read.totalHeld(), f.quote.grossAmount);
    assert.equal(
      await f.token.read.balanceOf([buyer.account.address]),
      FUNDS - f.quote.grossAmount,
    );
  });

  it("rechecks revocation on the real chain rather than trusting an earlier valid preview", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    await reader.validate(f.quote, grantIntent(f), async () => {});
    await f.vault.write.revokeGrant([f.grantId], { account: buyer.account });
    await assert.rejects(
      reader.validate(f.quote, grantIntent(f), async () => {}),
      /grant_revoked/,
    );
    await viem.assertions.revertWithCustomError(
      f.vault.write.fundWithGrant([f.quote, f.authorization, f.signature]),
      f.vault,
      "GrantRevoked",
    );
  });

  it("matches real wallet balance, allowance, used authorization and relayer-role failures", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    await f.token.write.approve([f.vault.address, f.quote.grossAmount - 1n], {
      account: buyer.account,
    });
    await assert.rejects(
      reader.validate(f.quote, grantIntent(f), async () => {}),
      /insufficient_allowance/,
    );
    await viem.assertions.revertWithCustomError(
      f.vault.write.fundWithGrant([f.quote, f.authorization, f.signature]),
      f.vault,
      "InsufficientAllowance",
    );
    await f.token.write.transfer([provider.account.address, FUNDS - f.quote.grossAmount + 1n], {
      account: buyer.account,
    });
    await assert.rejects(
      reader.validate(f.quote, walletIntent(f), async () => {}),
      /insufficient_balance/,
    );
    await viem.assertions.revertWithCustomError(
      f.vault.write.fundWithAuthorization([f.quote, f.buyerSignature]),
      f.vault,
      "InsufficientBalance",
    );
    const forged = await provider.signTypedData(
      receiveAuthorizationTypedData(
        f.token.address,
        f.vault.address,
        f.quote,
        f.quoteDigest,
        chainId,
      ),
    );
    await assert.rejects(
      reader.validate(f.quote, { mode: "authorization", signature: forged }, async () => {}),
      /invalid_signature/,
    );
    await f.vault.write.revokeRole([await f.vault.read.RELAYER_ROLE(), admin.account.address]);
    await assert.rejects(
      reader.validate(f.quote, walletIntent(f), async () => {}),
      /unauthorized_relayer/,
    );
  });

  it("verifies a contract wallet buyer through ERC-1271 the way USDC v2.2 does", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    const wallet = await viem.deployContract("ContractApprover", [buyer.account.address]);
    await f.token.write.mint([wallet.address, FUNDS]);
    const now = await networkHelpers.time.latest();
    const quote = quoteFor("wallet", wallet.address, f.token.address, now);
    const quoteDigest = hashQuote(f.domain, quote);
    const typed = receiveAuthorizationTypedData(
      f.token.address,
      f.vault.address,
      quote,
      quoteDigest,
      chainId,
    );
    // ContractApprover checks a raw ECDSA signature of the owner over the digest.
    const signature = await buyer.signTypedData(typed);
    const observation = await reader.validate(
      quote,
      { mode: "authorization", signature },
      async () => {},
    );
    assert.equal(observation.payer.toLowerCase(), wallet.address.toLowerCase());
    await f.vault.write.fundWithAuthorization([quote, signature]);
    assert.equal(
      (await f.vault.read.getHold([quote.invocationKey])).buyer.toLowerCase(),
      wallet.address.toLowerCase(),
    );
    await wallet.write.setEnabled([false]);
    const second = quoteFor("wallet-2", wallet.address, f.token.address, now);
    const secondSignature = await buyer.signTypedData(
      receiveAuthorizationTypedData(
        f.token.address,
        f.vault.address,
        second,
        hashQuote(f.domain, second),
        chainId,
      ),
    );
    await assert.rejects(
      reader.validate(
        second,
        { mode: "authorization", signature: secondSignature },
        async () => {},
      ),
      /invalid_signature/,
    );
  });

  it("recognizes existing holds after revocation, expiry and relayer role removal", async () => {
    const f = await networkHelpers.loadFixture(fixture);
    const reader = await admissionReader(f);
    await f.vault.write.fundWithGrant([f.quote, f.authorization, f.signature]);
    await f.vault.write.revokeGrant([f.grantId], { account: buyer.account });
    await f.vault.write.revokeRole([await f.vault.read.RELAYER_ROLE(), admin.account.address]);
    await networkHelpers.time.increaseTo(f.quote.resolveBy + 1);
    const observation = await reader.validate(f.quote, grantIntent(f), async () => {
      throw new Error("Must not admit again");
    });
    assert.equal(observation.kind, "existing-hold");
    // The same job paid the other way is a conflict, not a second hold.
    await assert.rejects(
      reader.validate(f.quote, walletIntent(f), async () => {}),
      /invocation_conflict/,
    );
    assert.equal(await f.vault.read.totalHeld(), f.quote.grossAmount);
  });

  it("hashes the same quote, debit and USDC authorization as viem, then holds once", async () => {
    const { vault, token, quote, domain, quoteDigest, authorization, buyerSignature } =
      await networkHelpers.loadFixture(fixture);
    assert.equal(await vault.read.hashQuote([quote]), quoteDigest);
    assert.equal(
      await vault.read.hashAuthorization([authorization]),
      hashAuthorization(domain, authorization),
    );
    assert.equal(
      await vault.read.hashReceiveAuthorization([quote]),
      hashReceiveAuthorization(vault.address, quote, quoteDigest),
    );
    const hash = await vault.write.fundWithAuthorization([quote, buyerSignature]);
    assert.equal((await client.waitForTransactionReceipt({ hash })).status, "success");
    const hold = await vault.read.getHold([quote.invocationKey]);
    assert.equal(
      hold.authorizationDigest,
      hashReceiveAuthorization(vault.address, quote, quoteDigest),
    );
    assert.equal(hold.source, FUNDING_SOURCE.authorization);
    assert.equal(hold.grantId, zeroHash);
    await vault.write.fundWithAuthorization([quote, buyerSignature]);
    assert.equal(await vault.read.totalHeld(), 10000n);
    assert.equal(await token.read.balanceOf([vault.address]), 10000n);
    const events = await client.getContractEvents({
      address: vault.address,
      abi: vault.abi,
      eventName: "HoldFunded",
      fromBlock: 0n,
      strict: true,
    });
    assert.equal(events.length, 1);
  });

  it("rejects signatures for another chain or another vault", async () => {
    const { vault, token, quote, domain, quoteDigest, authorization } =
      await networkHelpers.loadFixture(fixture);
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
        vault.write.fundWithGrant([quote, authorization, signature]),
        vault,
        "InvalidSignature",
      );
    }
    const otherVault = await buyer.signTypedData(
      receiveAuthorizationTypedData(
        token.address,
        provider.account.address,
        quote,
        quoteDigest,
        chainId,
      ),
    );
    await viem.assertions.revertWithCustomError(
      vault.write.fundWithAuthorization([quote, otherVault]),
      vault,
      "AuthorizationRejected",
    );
    assert.equal(await vault.read.totalHeld(), 0n);
  });

  it("completes grant funding, partial refunds and release straight to wallets", async () => {
    const { vault, token, quote, domain, authorization, signature, grantId } =
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
    await vault.write.fundWithGrant([quote, authorization, signature]);

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

    const providerBefore = await token.read.balanceOf([provider.account.address]);
    const feeBefore = await token.read.balanceOf([admin.account.address]);
    await resolve(1111n, false);
    await resolve(2222n, false);
    await networkHelpers.time.increaseTo(quote.releaseNotBefore);
    await resolve(0n, true);
    assert.equal(await token.read.balanceOf([vault.address]), 0n);
    assert.equal(await token.read.balanceOf([buyer.account.address]), FUNDS - 10000n + 3333n);
    assert.equal((await token.read.balanceOf([provider.account.address])) - providerBefore, 6534n);
    assert.equal((await token.read.balanceOf([admin.account.address])) - feeBefore, 133n);
    assert.equal(await vault.read.totalClaimable(), 0n);
    assert.equal((await vault.read.getGrant([buyer.account.address, grantId])).spentTotal, 10000n);
    const events = await client.getContractEvents({
      address: vault.address,
      abi: vault.abi,
      eventName: "DecisionApplied",
      fromBlock: 0n,
      strict: true,
    });
    assert.equal(events.length, 3);
  });

  it("revokes a grant from a buyer signature and lowers the allowance", async () => {
    const { vault, token, grantId } = await networkHelpers.loadFixture(fixture);
    const now = await networkHelpers.time.latest();
    const deadline = now + 600;
    const revoke = await buyer.signTypedData({
      domain: vaultDomain(vault.address, chainId),
      types: paymentTypes,
      primaryType: "GrantRevoke",
      message: { buyer: buyer.account.address, grantId, nonce: 1n, deadline },
    });
    const permit = await buyer.signTypedData(
      permitTypedData(
        token.address,
        {
          owner: buyer.account.address,
          spender: vault.address,
          value: 0n,
          nonce: 1n,
          deadline: BigInt(deadline),
        },
        chainId,
      ),
    );
    await vault.write.revokeGrantWithSig([
      buyer.account.address,
      grantId,
      deadline,
      revoke,
      { value: 0n, deadline: BigInt(deadline), signature: permit },
    ]);
    assert.equal((await vault.read.getGrant([buyer.account.address, grantId])).revoked, true);
    assert.equal(await token.read.allowance([buyer.account.address, vault.address]), 0n);
    await viem.assertions.revertWithCustomError(
      vault.write.revokeGrantWithSig([buyer.account.address, grantId, deadline, revoke, NO_PERMIT]),
      vault,
      "InvalidSignature",
    );
  });

  it("checks every signed decision field and rejects cross-domain approvals", async () => {
    const { vault, quote, domain, buyerSignature } = await networkHelpers.loadFixture(fixture);
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
    await vault.write.fundWithAuthorization([quote, buyerSignature]);
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
      { ...domain, version: "1" },
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
    const { vault, token, quote, buyerSignature } = await networkHelpers.loadFixture(fixture);
    await vault.write.fundWithAuthorization([quote, buyerSignature]);
    await vault.write.grantRole([await vault.read.PAUSER_ROLE(), admin.account.address]);
    await vault.write.pause();
    await networkHelpers.time.increaseTo(quote.resolveBy);
    await vault.write.reclaim([quote.invocationKey], { account: buyer.account });
    assert.equal(await token.read.balanceOf([vault.address]), 0n);
    assert.equal(await token.read.balanceOf([buyer.account.address]), FUNDS);
    assert.equal((await vault.read.getHold([quote.invocationKey])).closed, true);
  });

  it("matches the exact published vector at its fixed domain address and Fuji chain ID", async () => {
    const vector = JSON.parse(
      readFileSync(new URL("../../shared/test/fixtures/x402-v2.json", import.meta.url), "utf8"),
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
      assert.equal(
        await vault.read.hashReceiveAuthorization([quote]),
        vector.receiveAuthorizationStructHash,
      );
    } finally {
      await connection.close();
    }
  });
});
