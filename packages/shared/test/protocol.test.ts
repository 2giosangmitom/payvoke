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
  paymentTypes,
  reserveHoldAbi,
  applyDecisionAbi,
  vaultFinancialEvents,
  vaultDomain,
  type InvocationQuote,
} from "../src/protocol";

const fixture = JSON.parse(
  readFileSync(new URL("../../../docs/specs/fixtures/x402-v1.json", import.meta.url), "utf8"),
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
  const write = compiled.abi.find(
    (item: { type: string; name: string }) =>
      item.type === "function" && item.name === "applyDecision",
  );
  assert.equal(toFunctionSelector(applyDecisionAbi[0]), toFunctionSelector(write));
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

test("reserveHold write ABI matches the compiled vault selector and round-trips its structs", () => {
  // Checked against PayvokeVault's compiled Solidity ABI, not derived from a
  // second hand-written tuple encoder in this test.
  assert.equal(toFunctionSelector(reserveHoldAbi[0]), "0x73e30cc1");
  const data = encodeFunctionData({
    abi: reserveHoldAbi,
    functionName: "reserveHold",
    args: [quote, authorization, fixture.signature],
  });
  const decoded = decodeFunctionData({ abi: reserveHoldAbi, data });
  assert.equal(decoded.functionName, "reserveHold");
  assert.equal(decoded.args[0].grossAmount, quote.grossAmount);
  assert.equal(decoded.args[0].quoteKey, quote.quoteKey);
  assert.equal(decoded.args[1].quoteDigest, authorization.quoteDigest);
  assert.equal(decoded.args[1].grantEpoch, authorization.grantEpoch);
  assert.equal(decoded.args[2], fixture.signature);
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
    { ...domain, version: "2" },
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
