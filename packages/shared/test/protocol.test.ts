import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  recoverTypedDataAddress,
  toFunctionSelector,
  toEventSelector,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  businessKey,
  canonicalSnapshot,
  hashAuthorization,
  hashDecision,
  hashQuote,
  hashSnapshot,
  hashReceiveAuthorization,
  paymentTypes,
  fundHoldAbi,
  grantAdminAbi,
  applyDecisionAbi,
  vaultFinancialEvents,
  vaultDomain,
  receiveAuthorizationTypedData,
  targetAllowance,
  usdcDomain,
  type InvocationQuote,
} from "../src/protocol";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/x402-v2.json", import.meta.url), "utf8"),
);
const quote: InvocationQuote = {
  ...fixture.quote,
  productVersion: BigInt(fixture.quote.productVersion),
  grossAmount: BigInt(fixture.quote.grossAmount),
  feeBps: Number(fixture.quote.feeBps),
  validUntil: Number(fixture.quote.validUntil),
  deliveryDeadline: Number(fixture.quote.deliveryDeadline),
  releaseNotBefore: Number(fixture.quote.releaseNotBefore),
  resolveBy: Number(fixture.quote.resolveBy),
};
const authorization = {
  ...fixture.authorization,
  grantEpoch: BigInt(fixture.authorization.grantEpoch),
};
const domain = vaultDomain(fixture.domain.verifyingContract);

test("finance write ABI and events match the compiled vault", () => {
  const compiled = JSON.parse(
    readFileSync(
      new URL(
        "../../vault/artifacts/contracts/PayvokeVault.sol/PayvokeVault.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const compiledFunction = (name: string) =>
    compiled.abi.find(
      (item: { type: string; name: string }) => item.type === "function" && item.name === name,
    );
  for (const item of [...applyDecisionAbi, ...fundHoldAbi, ...grantAdminAbi]) {
    const write = compiledFunction(item.name);
    assert.ok(write, item.name);
    assert.equal(toFunctionSelector(item), toFunctionSelector(write), item.name);
  }
  for (const expected of vaultFinancialEvents) {
    const event = compiled.abi.find(
      (item: { type: string; name: string }) =>
        item.type === "event" && item.name === expected.name,
    );
    assert.ok(event, expected.name);
    assert.equal(toEventSelector(expected), toEventSelector(event));
    assert.deepEqual(
      expected.inputs.map((i) => "indexed" in i && !!i.indexed),
      event.inputs.map((i: { indexed: boolean }) => i.indexed),
    );
  }
});

test("funding write ABIs round-trip their structs", () => {
  const data = encodeFunctionData({
    abi: fundHoldAbi,
    functionName: "fundWithGrant",
    args: [quote, authorization, fixture.signature],
  });
  const decoded = decodeFunctionData({ abi: fundHoldAbi, data });
  assert.equal(decoded.functionName, "fundWithGrant");
  assert.equal(decoded.args[0].grossAmount, quote.grossAmount);
  assert.equal(decoded.args[0].quoteKey, quote.quoteKey);
  assert.equal(decoded.args[1]!.quoteDigest, authorization.quoteDigest);
  assert.equal(decoded.args[1]!.grantEpoch, authorization.grantEpoch);
  assert.equal(decoded.args[2], fixture.signature);
  const direct = decodeFunctionData({
    abi: fundHoldAbi,
    data: encodeFunctionData({
      abi: fundHoldAbi,
      functionName: "fundWithAuthorization",
      args: [quote, fixture.receiveSignature],
    }),
  });
  assert.equal(direct.functionName, "fundWithAuthorization");
  assert.equal(direct.args[1], fixture.receiveSignature);
});

test("the buyer's USDC authorization is bound to the quote digest and the vault", async () => {
  const vault = fixture.domain.verifyingContract as Address;
  const typed = receiveAuthorizationTypedData(quote.asset, vault, quote, fixture.quoteDigest);
  assert.deepEqual(typed.domain, usdcDomain(quote.asset));
  assert.deepEqual(typed.domain, {
    ...fixture.usdcDomain,
    verifyingContract: getAddress(fixture.usdcDomain.verifyingContract),
  });
  assert.equal(typed.message.nonce, fixture.quoteDigest);
  assert.equal(typed.message.to, vault);
  assert.equal(typed.message.value, quote.grossAmount);
  assert.equal(typed.message.validBefore, BigInt(quote.validUntil));
  assert.equal(
    hashReceiveAuthorization(vault, quote, fixture.quoteDigest),
    fixture.receiveAuthorizationStructHash,
  );
  const signature = await privateKeyToAccount(fixture.fixturePrivateKey).signTypedData(typed);
  assert.equal(signature, fixture.receiveSignature);
  assert.equal(
    await recoverTypedDataAddress({ ...typed, signature }),
    getAddress(fixture.sessionSigner),
  );
  // Another quote, vault or amount is another authorization.
  const other = { ...quote, grossAmount: quote.grossAmount + 1n };
  assert.notEqual(
    hashReceiveAuthorization(vault, other, hashQuote(domain, other)),
    fixture.receiveAuthorizationStructHash,
  );
  assert.notEqual(
    hashReceiveAuthorization(
      "0x9000000000000000000000000000000000000009",
      quote,
      fixture.quoteDigest,
    ),
    fixture.receiveAuthorizationStructHash,
  );
});

test("target allowance sums what active grants can still spend", () => {
  const now = 1_000;
  const grant = (maxTotal: bigint, spentTotal: bigint, expiresAt = 2_000, revoked = false) => ({
    config: { expiresAt, maxTotal },
    spentTotal,
    revoked,
  });
  assert.equal(
    targetAllowance(
      [
        grant(100n, 30n),
        grant(50n, 0n),
        grant(10n, 10n),
        grant(99n, 0n, 999),
        grant(99n, 0n, 2_000, true),
      ],
      now,
    ),
    120n,
  );
  assert.equal(targetAllowance([], now), 0n);
});

test("matches published EIP-712 hashes, signature and recovered session signer", async () => {
  assert.equal(hashQuote(domain, quote), fixture.quoteDigest);
  assert.equal(hashAuthorization(domain, authorization), fixture.authorizationDigest);
  const data = {
    domain,
    types: paymentTypes,
    primaryType: "DebitAuthorization",
    message: authorization,
  } as const;
  const signature = await privateKeyToAccount(fixture.fixturePrivateKey).signTypedData(data);
  assert.equal(signature, fixture.signature);
  assert.equal(
    await recoverTypedDataAddress({ ...data, signature }),
    getAddress(fixture.sessionSigner),
  );
});

test("every quote field and domain binds consent", () => {
  for (const field of paymentTypes.InvocationQuote) {
    const current = quote[field.name];
    const replacement =
      typeof current === "bigint"
        ? current + 1n
        : typeof current === "number"
          ? current + 1
          : field.type === "address"
            ? "0x9000000000000000000000000000000000000009"
            : `0x${"ab".repeat(32)}`;
    const changed = hashQuote(domain, { ...quote, [field.name]: replacement });
    assert.notEqual(changed, fixture.quoteDigest, field.name);
    assert.notEqual(
      hashAuthorization(domain, { ...authorization, quoteDigest: changed }),
      fixture.authorizationDigest,
      field.name,
    );
  }
  for (const changed of [
    { ...domain, chainId: 1 },
    { ...domain, version: "1" },
    { ...domain, name: "Other" },
    { ...domain, verifyingContract: "0x9000000000000000000000000000000000000009" as Address },
  ])
    assert.notEqual(hashAuthorization(changed, authorization), fixture.authorizationDigest);
  assert.notEqual(
    hashAuthorization(domain, { ...authorization, grantEpoch: 2n }),
    fixture.authorizationDigest,
  );
  assert.notEqual(
    hashAuthorization(domain, { ...authorization, grantId: `0x${"ab".repeat(32)}` as Hex }),
    fixture.authorizationDigest,
  );
});

test("ResolutionDecision binds approval fields", () => {
  const decision = {
    holdId: businessKey("invocation", "one"),
    decisionId: businessKey("quote", "decision-one"),
    expectedVersion: 1n,
    refundAmount: 10n,
    releaseRemainder: false,
    validUntil: 1800000000,
  };
  const digest = hashDecision(domain, decision);
  for (const field of paymentTypes.ResolutionDecision) {
    const current = decision[field.name];
    const replacement =
      typeof current === "boolean"
        ? !current
        : typeof current === "bigint"
          ? current + 1n
          : typeof current === "number"
            ? current + 1
            : `0x${"ab".repeat(32)}`;
    assert.notEqual(
      hashDecision(domain, { ...decision, [field.name]: replacement }),
      digest,
      field.name,
    );
  }
});

test("opaque IDs preserve namespace and case", () => {
  assert.equal(businessKey("invocation", "invocation_vector_1"), fixture.quote.invocationKey);
  assert.notEqual(businessKey("invocation", "ID"), businessKey("invocation", "id"));
  assert.notEqual(businessKey("session", "id"), businessKey("product", "id"));
});

test("JCS sorts keys, keeps array order, null, Unicode and ECMAScript numbers", () => {
  assert.equal(canonicalSnapshot({ z: null, a: [1e30, -0, "é"] }), '{"a":[1e+30,0,"é"],"z":null}');
  assert.equal(hashSnapshot({ b: 2, a: 1 }), hashSnapshot({ a: 1, b: 2 }));
  assert.notEqual(hashSnapshot([1, 2]), hashSnapshot([2, 1]));
  assert.notEqual(hashSnapshot("é"), hashSnapshot("e\u0301"));
  assert.equal(hashSnapshot({}), fixture.quote.inputHash);
  assert.notEqual(hashSnapshot({ a: null }), hashSnapshot({}));
});

test("invalid JSON values are rejected rather than silently omitted or transformed", () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => canonicalSnapshot({ value }));
  // @ts-expect-error deliberately invalid JSON input
  assert.throws(() => canonicalSnapshot({ missing: undefined }));
  // @ts-expect-error bigint has no JSON representation
  assert.throws(() => canonicalSnapshot({ amount: 1n }));
  // @ts-expect-error Date.toJSON must not transform snapshot input
  assert.throws(() => canonicalSnapshot(new Date()));
  const sparse: number[] = [];
  sparse.length = 1;
  assert.throws(() => canonicalSnapshot(sparse));
  assert.throws(() => canonicalSnapshot("\ud800"));
  assert.throws(() => canonicalSnapshot({ ["\udfff"]: "invalid key" }));
  const cyclic: { self?: typeof cyclic } = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalSnapshot(cyclic));
});
