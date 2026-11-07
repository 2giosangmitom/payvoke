import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  ContractFunctionRevertedError,
  encodeErrorResult,
  getAddress,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  FUNDING_SOURCE,
  hashAuthorization,
  hashQuote,
  hashReceiveAuthorization,
  paymentTypes,
  vaultAdmissionAbi,
  vaultDomain,
} from "@payvoke/shared/protocol";
import { readQuote } from "@payvoke/shared/x402";
import { matchingHold, mockVault } from "#test/kit/vault-reader";

const vector = JSON.parse(
  readFileSync(
    new URL("../../../packages/shared/test/fixtures/x402-v2.json", import.meta.url),
    "utf8",
  ),
);
const vault = getAddress(vector.domain.verifyingContract);
const relayer = privateKeyToAccount(generatePrivateKey());
const signer = privateKeyToAccount(generatePrivateKey());
async function fixture() {
  const now = Math.floor(Date.now() / 1000);
  const q = {
    ...readQuote(vector.quote),
    validUntil: now + 120,
    deliveryDeadline: now + 180,
    releaseNotBefore: now + 210,
    resolveBy: now + 270,
  };
  const authorization = {
    quoteDigest: hashQuote(vaultDomain(vault), q),
    grantId: vector.authorization.grantId as `0x${string}`,
    grantEpoch: 1n,
  };
  const signature = await signer.signTypedData({
    domain: vaultDomain(vault),
    types: paymentTypes,
    primaryType: "DebitAuthorization",
    message: authorization,
  });
  // The buyer's own USDC authorization for this quote (wallet funding).
  const walletSignature = `0x${"11".repeat(65)}` as `0x${string}`;
  const mock = mockVault(q, vault, signer.address, relayer.address);
  await mock.chain.initialize();
  mock.calls.length = 0;
  return {
    ...mock,
    q,
    authorization,
    signature,
    walletSignature,
    async validate() {
      return mock.chain.validate(q, { mode: "grant", authorization, signature }, async () => {});
    },
    async validateWallet() {
      return mock.chain.validate(
        q,
        { mode: "authorization", signature: walletSignature },
        async () => {},
      );
    },
  };
}

describe("vault onchain admission preview", () => {
  it("pins all state reads and simulation to one numbered block and rechecks its hash", async () => {
    const f = await fixture();
    const result = await f.validate();
    assert.equal(result.kind, "new-admission");
    assert.equal(result.block.number, "10");
    for (const call of f.calls.filter((c) => !["chainId", "block"].includes(c.method)))
      assert.equal(call.blockNumber, 10n);
    const simulation = f.calls.find((c) => c.method === "simulate")!;
    assert.equal(simulation.account, relayer.address);
    assert.deepEqual(simulation.args, [f.q, f.authorization, f.signature]);
    assert.equal(f.calls.at(-1)?.method, "block");
  });
  const cases: [string, (f: Awaited<ReturnType<typeof fixture>>) => void][] = [
    [
      "grant_not_found",
      (f) => {
        f.state.grant.epoch = 0n;
      },
    ],
    [
      "grant_revoked",
      (f) => {
        f.state.grant.revoked = true;
      },
    ],
    [
      "grant_expired",
      (f) => {
        f.state.grant.config.expiresAt = Number(f.state.now);
      },
    ],
    [
      "grant_epoch_mismatch",
      (f) => {
        f.state.grant.epoch = 2n;
      },
    ],
    [
      "invalid_signature",
      (f) => {
        f.state.grant.config.signer = relayer.address;
      },
    ],
    [
      "insufficient_allowance",
      (f) => {
        f.state.allowance = f.q.grossAmount - 1n;
      },
    ],
    [
      "insufficient_balance",
      (f) => {
        f.state.balance = f.q.grossAmount - 1n;
      },
    ],
    [
      "per_call_limit_exceeded",
      (f) => {
        f.state.grant.config.maxPerCall = f.q.grossAmount - 1n;
      },
    ],
    [
      "period_limit_exceeded",
      (f) => {
        f.state.grant.spentInPeriod = f.state.grant.config.maxPerPeriod + 1n;
      },
    ],
    [
      "total_limit_exceeded",
      (f) => {
        f.state.grant.spentTotal = f.state.grant.config.maxTotal + 1n;
      },
    ],
    [
      "vault_paused",
      (f) => {
        f.state.paused = true;
      },
    ],
    [
      "unauthorized_relayer",
      (f) => {
        f.state.role = false;
      },
    ],
    [
      "quote_expired",
      (f) => {
        f.state.now = BigInt(f.q.validUntil);
      },
    ],
    [
      "fee_cap_exceeded",
      (f) => {
        f.state.feeCap = f.q.feeBps - 1;
      },
    ],
    [
      "deadline_invalid",
      (f) => {
        f.state.holdCap = 1;
      },
    ],
    [
      "invalid_asset",
      (f) => {
        f.state.asset = zeroAddress;
      },
    ],
    [
      "invalid_grant_configuration",
      (f) => {
        f.state.grant.config.periodSeconds = 0;
      },
    ],
  ];
  for (const [code, mutate] of cases)
    it(`rejects ${code} without simulation`, async () => {
      const f = await fixture();
      mutate(f);
      await assert.rejects(f.validate(), new RegExp(code));
      assert.ok(!f.calls.some((c) => c.method === "simulate"));
    });
  it("resets period usage only when the chain fixed period changes; total usage remains", async () => {
    const f = await fixture();
    f.state.grant.spentInPeriod = f.state.grant.config.maxPerPeriod;
    f.state.grant.currentPeriod--;
    assert.equal((await f.validate()).kind, "new-admission");
    f.state.grant.spentTotal = f.state.grant.config.maxTotal;
    await assert.rejects(f.validate(), /total_limit_exceeded/);
  });
  it("classifies matching holds before pause, revocation or expiry, without simulating again", async () => {
    const f = await fixture();
    f.state.hold = matchingHold(
      f.q,
      hashAuthorization(vaultDomain(vault), f.authorization),
      f.authorization.quoteDigest,
      f.authorization.grantId,
    );
    f.state.now = BigInt(f.q.resolveBy + 1);
    f.state.paused = true;
    f.state.role = false;
    f.state.grant.revoked = true;
    const observation = await f.chain.validate(
      f.q,
      { mode: "grant", authorization: f.authorization, signature: f.signature },
      async () => {
        throw new Error("Must not admit again");
      },
    );
    assert.equal(observation.kind, "existing-hold");
    assert.ok(
      !f.calls.some((c) => ["simulate", "getGrant", "balanceOf", "allowance"].includes(c.method)),
    );
    // The same job paid from the wallet is another authorization: a conflict.
    await assert.rejects(f.validateWallet(), /invocation_conflict/);
    f.state.hold.authorizationDigest = `0x${"0".repeat(64)}`;
    await assert.rejects(f.validate(), /invocation_conflict/);
  });
  it("rejects inconsistent economics even when hold digests match", async () => {
    const f = await fixture();
    f.state.hold = matchingHold(
      f.q,
      hashAuthorization(vaultDomain(vault), f.authorization),
      f.authorization.quoteDigest,
      f.authorization.grantId,
    );
    f.state.hold.gross++;
    await assert.rejects(f.validate(), /hold_inconsistent/);
  });
  it("treats RPC failure and a changed snapshot as retryable, not invalid payment", async () => {
    const f = await fixture();
    f.state.rpcError = true;
    await assert.rejects(
      f.validate(),
      (e: unknown) => e instanceof Error && e.message === "rpc_unavailable",
    );
    f.state.rpcError = false;
    f.state.snapshotChanged = true;
    await assert.rejects(f.validate(), /snapshot_changed/);
    f.state.grant.revoked = true;
    await assert.rejects(
      f.validate(),
      /snapshot_changed/,
      "do not attribute rejection to an orphaned block",
    );
  });
  it("fails startup on chain, code, asset, decimals, caps and role mismatch", async () => {
    const mutations = [
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.chainId = 1;
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.code = "0x";
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.asset = zeroAddress;
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.decimals = 18;
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.feeCap++;
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.quoteCap++;
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.holdCap++;
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.role = false;
      },
    ];
    for (const mutate of mutations) {
      const f = await fixture();
      mutate(f);
      await assert.rejects(f.chain.initialize());
    }
  });

  it("maps decoded contract reverts but never interprets RPC errors as insufficient funds", async () => {
    const f = await fixture();
    f.state.simulationError = new ContractFunctionRevertedError({
      abi: vaultAdmissionAbi,
      functionName: "fundWithGrant",
      data: encodeErrorResult({ abi: vaultAdmissionAbi, errorName: "GrantRevoked" }),
    });
    await assert.rejects(f.validate(), /grant_revoked/);
    f.state.simulationError = new ContractFunctionRevertedError({
      abi: vaultAdmissionAbi,
      functionName: "fundWithGrant",
      data: "0x12345678",
    });
    await assert.rejects(f.validate(), /simulation_reverted/);
    f.state.simulationError = new Error("credentials and RPC error");
    await assert.rejects(f.validate(), /rpc_unavailable/);
  });

  it("accepts exact spending boundaries and rejects one atomic unit over the remaining cap", async () => {
    const f = await fixture();
    f.state.balance = f.q.grossAmount;
    f.state.allowance = f.q.grossAmount;
    f.state.grant.config.maxPerCall = f.q.grossAmount;
    f.state.grant.spentInPeriod = f.state.grant.config.maxPerPeriod - f.q.grossAmount;
    f.state.grant.spentTotal = f.state.grant.config.maxTotal - f.q.grossAmount;
    assert.equal((await f.validate()).kind, "new-admission");
    f.state.grant.spentInPeriod++;
    await assert.rejects(f.validate(), /period_limit_exceeded/);
    f.state.grant.spentInPeriod--;
    f.state.grant.spentTotal++;
    await assert.rejects(f.validate(), /total_limit_exceeded/);
  });

  it("admits a wallet-funded quote: unused authorization, verified signature, enough USDC", async () => {
    const f = await fixture();
    const result = await f.validateWallet();
    assert.equal(result.kind, "new-admission");
    assert.equal(result.mode, "authorization");
    assert.equal(result.payer, f.q.buyer);
    const simulation = f.calls.find((c) => c.method === "simulate")!;
    assert.deepEqual(simulation.args, [f.q, f.walletSignature]);
    // A wallet payment reads neither the grant nor the allowance.
    assert.ok(!f.calls.some((c) => ["getGrant", "allowance"].includes(c.method)));
    assert.ok(f.calls.some((c) => c.method === "verifyTypedData"));
  });
  const walletCases: [string, (f: Awaited<ReturnType<typeof fixture>>) => void][] = [
    ["authorization_used", (f) => void (f.state.authorizationUsed = true)],
    ["invalid_signature", (f) => void (f.state.signatureValid = false)],
    ["insufficient_balance", (f) => void (f.state.balance = f.q.grossAmount - 1n)],
    ["quote_expired", (f) => void (f.state.now = BigInt(f.q.validUntil))],
    ["vault_paused", (f) => void (f.state.paused = true)],
  ];
  for (const [code, mutate] of walletCases)
    it(`rejects a wallet payment with ${code} without simulation`, async () => {
      const f = await fixture();
      mutate(f);
      await assert.rejects(f.validateWallet(), new RegExp(code));
      assert.ok(!f.calls.some((c) => c.method === "simulate"));
    });
  it("classifies an existing wallet-funded hold by its receive authorization digest", async () => {
    const f = await fixture();
    f.state.hold = matchingHold(
      f.q,
      hashReceiveAuthorization(vault, f.q, f.authorization.quoteDigest),
      f.authorization.quoteDigest,
      zeroHash,
      FUNDING_SOURCE.authorization,
    );
    f.state.authorizationUsed = true;
    assert.equal((await f.validateWallet()).kind, "existing-hold");
    f.state.hold.source = FUNDING_SOURCE.grant;
    await assert.rejects(f.validateWallet(), /hold_inconsistent/);
  });
});
