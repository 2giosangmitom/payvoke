// Fuji smoke test of PayvokeVault v2 against Circle's real USDC (FiatToken v2.2):
// A) a wallet-funded job (EIP-3009) refunded in full; B) a gasless grant with a
// permit, a grant-funded job released to a fresh provider, and a gasless revoke.
// Uses the operator keys in apps/api/.env (relayer, approver, executor) and the
// buyer key FUJI_PRIVATE_KEY in packages/vault/.env, which needs ~0.02 Fuji USDC.
// Moves real testnet funds:   bun scripts/fuji-smoke.ts   (from packages/vault)
// Prints only addresses, hashes and balances.
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
  keccak256,
  stringToHex,
  type Hex,
  type Address,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import {
  businessKey,
  grantRevokeTypedData,
  grantSetupTypedData,
  hashQuote,
  paymentTypes,
  permitTypedData,
  receiveAuthorizationTypedData,
  vaultAccountAbi,
  vaultDomain,
  usdcAbi,
  type InvocationQuote,
} from "@payvoke/shared/protocol";

const env = (path: string) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim()];
      }),
  );
const api = env(new URL("../../../apps/api/.env", import.meta.url).pathname);
const vaultEnv = env(new URL("../.env", import.meta.url).pathname);
const key = (v: string) => (v.startsWith("0x") ? v : `0x${v}`) as Hex;
const buyer = privateKeyToAccount(key(vaultEnv.FUJI_PRIVATE_KEY));
const relayer = privateKeyToAccount(key(api.RELAYER_PRIVATE_KEY));
const approver = privateKeyToAccount(key(api.FINANCE_APPROVER_PRIVATE_KEY));
const executor = privateKeyToAccount(key(api.FINANCE_EXECUTOR_PRIVATE_KEY));
const VAULT = "0xc8d77919e1D9A473eB8D45C729613943eaF6f034" as Address;
const USDC = "0x5425890298aed601595a70AB815c96711a31Bc65" as Address;
const transport = http("https://api.avax-test.network/ext/bc/C/rpc");
const pub = createPublicClient({ chain: avalancheFuji, transport });
const as = (account: typeof buyer) =>
  createWalletClient({ chain: avalancheFuji, transport, account });
const vault = { address: VAULT, abi: vaultAccountAbi } as const;
const fmt = (v: bigint) => (Number(v) / 1e6).toFixed(6);
const bal = (a: Address) =>
  pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [a] });
const now = async () => Number((await pub.getBlock()).timestamp);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(
  label: string,
  account: typeof buyer,
  request: Parameters<ReturnType<typeof as>["writeContract"]>[0],
) {
  const [latest, pending] = await Promise.all([
    pub.getTransactionCount({ address: account.address, blockTag: "latest" }),
    pub.getTransactionCount({ address: account.address, blockTag: "pending" }),
  ]);
  if (latest !== pending) throw new Error(`${label}: ${account.address} has a pending transaction`);
  await pub.simulateContract({ ...request, account } as never);
  const hash = await as(account).writeContract(request as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: ${receipt.status} ${hash} (block ${receipt.blockNumber})`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return receipt;
}

function quote(
  id: string,
  gross: bigint,
  provider: Address,
  t: number,
  review = 1,
): InvocationQuote {
  return {
    invocationKey: businessKey("invocation", id),
    quoteKey: businessKey("quote", id),
    buyer: buyer.address,
    usageSessionKey: businessKey("session", id),
    productKey: businessKey("product", "smoke"),
    productVersion: 1n,
    commandKey: businessKey("command", "smoke"),
    inputHash: keccak256(stringToHex(`input:${id}`)),
    termsHash: keccak256(stringToHex("terms")),
    policyHash: keccak256(stringToHex("policy")),
    provider,
    asset: USDC,
    grossAmount: gross,
    feeBps: 500,
    feeRecipient: buyer.address,
    validUntil: t + 300,
    deliveryDeadline: t + 360,
    releaseNotBefore: t + 360 + review,
    resolveBy: t + 3600,
  };
}

async function decide(q: InvocationQuote, refundAmount: bigint, releaseRemainder: boolean) {
  const hold = await pub.readContract({
    ...vault,
    functionName: "getHold",
    args: [q.invocationKey],
  });
  const decision = {
    holdId: q.invocationKey,
    decisionId: keccak256(stringToHex(`${q.invocationKey}:${hold.version}`)),
    expectedVersion: hold.version,
    refundAmount,
    releaseRemainder,
    validUntil: q.resolveBy - 1,
  };
  const signature = await approver.signTypedData({
    domain: vaultDomain(VAULT),
    types: paymentTypes,
    primaryType: "ResolutionDecision",
    message: decision,
  });
  return send(releaseRemainder ? "applyDecision release" : "applyDecision refund", executor, {
    ...vault,
    functionName: "applyDecision",
    args: [decision, approver.address, signature],
  } as never);
}

const run = Date.now().toString(36);
const start = await bal(buyer.address);
console.log(`buyer ${buyer.address} starts with ${fmt(start)} USDC`);

console.log("A. Wallet-funded job (EIP-3009 ReceiveWithAuthorization), then full refund");
const qa = quote(`smoke-a-${run}`, 10_000n, approver.address, await now());
const da = hashQuote(vaultDomain(VAULT), qa);
const sa = await buyer.signTypedData(receiveAuthorizationTypedData(USDC, VAULT, qa, da));
await send("fundWithAuthorization", relayer, {
  ...vault,
  functionName: "fundWithAuthorization",
  args: [qa, sa],
} as never);
const ha = await pub.readContract({ ...vault, functionName: "getHold", args: [qa.invocationKey] });
console.log(
  `  hold: source ${ha.source}, remaining ${fmt(ha.remaining)}, authorization used ${await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "authorizationState", args: [buyer.address, da] })}`,
);
console.log(`  buyer after funding: ${fmt(await bal(buyer.address))} USDC`);
await decide(qa, qa.grossAmount, false);
console.log(`  buyer after refund: ${fmt(await bal(buyer.address))} USDC (start ${fmt(start)})`);

console.log("B. Gasless grant (GrantSetup + permit), grant-funded job, release, gasless revoke");
const spendKey = privateKeyToAccount(generatePrivateKey());
const grantId = toHex(crypto.getRandomValues(new Uint8Array(32)));
const provider = privateKeyToAccount(generatePrivateKey()).address;
let t = await now();
const config = {
  signer: spendKey.address,
  expiresAt: t + 3600,
  maxPerCall: 20_000n,
  periodSeconds: 86400,
  maxPerPeriod: 20_000n,
  maxTotal: 20_000n,
};
const avaxBefore = await pub.getBalance({ address: buyer.address });
const nonce = await pub.readContract({
  ...vault,
  functionName: "grantNonces",
  args: [buyer.address],
});
const permitNonce = await pub.readContract({
  address: USDC,
  abi: usdcAbi,
  functionName: "nonces",
  args: [buyer.address],
});
const setup = await buyer.signTypedData(
  grantSetupTypedData(VAULT, {
    buyer: buyer.address,
    grantId,
    ...config,
    nonce,
    deadline: t + 900,
  }),
);
const permit = await buyer.signTypedData(
  permitTypedData(USDC, {
    owner: buyer.address,
    spender: VAULT,
    value: 20_000n,
    nonce: permitNonce,
    deadline: BigInt(t + 900),
  }),
);
await send("setGrantWithSig", relayer, {
  ...vault,
  functionName: "setGrantWithSig",
  args: [
    buyer.address,
    grantId,
    config,
    t + 900,
    setup,
    { value: 20_000n, deadline: BigInt(t + 900), signature: permit },
  ],
} as never);
console.log(
  `  allowance ${fmt(await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [buyer.address, VAULT] }))} USDC, grant epoch ${(await pub.readContract({ ...vault, functionName: "getGrant", args: [buyer.address, grantId] })).epoch}`,
);
const qb = quote(`smoke-b-${run}`, 10_000n, provider, await now(), 1);
const authorization = { quoteDigest: hashQuote(vaultDomain(VAULT), qb), grantId, grantEpoch: 1n };
const debit = await spendKey.signTypedData({
  domain: vaultDomain(VAULT),
  types: paymentTypes,
  primaryType: "DebitAuthorization",
  message: authorization,
});
await send("fundWithGrant", relayer, {
  ...vault,
  functionName: "fundWithGrant",
  args: [qb, authorization, debit],
} as never);
console.log(
  `  allowance left ${fmt(await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [buyer.address, VAULT] }))} USDC`,
);
const wait = qb.releaseNotBefore - (await now()) + 3;
console.log(`  waiting ${wait}s for the review window to pass…`);
await sleep(wait * 1000);
while ((await now()) < qb.releaseNotBefore) await sleep(3000);
await decide(qb, 0n, true);
console.log(`  provider received ${fmt(await bal(provider))} USDC (expected 0.009500)`);
t = await now();
const revoke = await buyer.signTypedData(
  grantRevokeTypedData(VAULT, {
    buyer: buyer.address,
    grantId,
    nonce: nonce + 1n,
    deadline: t + 900,
  }),
);
const permit0 = await buyer.signTypedData(
  permitTypedData(USDC, {
    owner: buyer.address,
    spender: VAULT,
    value: 0n,
    nonce: permitNonce + 1n,
    deadline: BigInt(t + 900),
  }),
);
await send("revokeGrantWithSig", relayer, {
  ...vault,
  functionName: "revokeGrantWithSig",
  args: [
    buyer.address,
    grantId,
    t + 900,
    revoke,
    { value: 0n, deadline: BigInt(t + 900), signature: permit0 },
  ],
} as never);
const g = await pub.readContract({
  ...vault,
  functionName: "getGrant",
  args: [buyer.address, grantId],
});
console.log(
  `  revoked ${g.revoked}, allowance ${fmt(await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [buyer.address, VAULT] }))} USDC`,
);
console.log(
  `  buyer AVAX spent on the grant flow: ${avaxBefore - (await pub.getBalance({ address: buyer.address }))} wei`,
);
const end = await bal(buyer.address);
console.log(
  `buyer ends with ${fmt(end)} USDC (net ${fmt(end - start)}: the 0.0095 provider payout; the 0.0005 fee came back to this fee recipient)`,
);
console.log(
  `vault: totalHeld ${await pub.readContract({ ...vault, functionName: "totalHeld" })}, totalClaimable ${await pub.readContract({ ...vault, functionName: "totalClaimable" })}, USDC ${fmt(await bal(VAULT))}`,
);
console.log(`last block ${await pub.getBlockNumber()}`);
