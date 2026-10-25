# Controlled Fuji payment ceremony

This tooling is ready for **operator-approved execution**, not evidence that a
Fuji deployment has happened. Build/test permission is not permission to fund
wallets, deploy or submit a payment. No provider is executed by this ceremony.

For separately approved refund/release and finalized financial projections, see
[`financial-lifecycle.md`](financial-lifecycle.md).

## Approval gate

Before any external transaction, record approval for:

- RPC endpoint, four distinct addresses (admin/deployer, dedicated relayer, buyer,
  grant signer), and provider/fee-recipient addresses. Never use Hardhat keys.
- Constructor policy: admin delay, fee cap, maximum quote/hold lifetimes.
- USDC deposit, per-payment gross amount, fee and grant limits/expiry.
- Delivery/review/resolution deadlines and the cleanup time after `resolveBy`.
- Per-transaction gas limits/prices **and total AVAX budget for the ceremony**,
  including deployment, role, allowance, deposit, grant, payment, reclaim/withdraw.
- Worker outstanding/window budgets, which are separate from operator-tx limits.

The CLI enforces a per-operator-transaction ceiling, not an aggregate spending
window. Track finalized actual costs and remaining signed liability in the
approval record before approving each next hash. Worker budgets remain enforced
by its durable journal. Do not run another sender from the relayer address.

Use a dedicated local PostgreSQL database named `payvoke_fuji_<run>`. Do not use
Neon, a shared app database or a database with other products/payments. API,
facilitator and worker must all use this same database.

## Private files

Run commands from `apps/backend`. Create `operations/private/` with mode 0700;
it is gitignored. Keep signed artifacts, prepared authorizations, private env and
approval records there or outside the repository. Files are created exclusively
with mode 0600 and fsynced; existing evidence is never overwritten. Signed bytes
and payment authorizations can be relayed by anyone who obtains them.

Copy `ceremony.example.json` into this private directory and replace **all**
placeholders with approved values. The zero-filled template is intentionally not
usable. All gas prices/costs are integer **wei**; USDC amounts are six-decimal
base-unit integers. Constructor durations are seconds, not timestamps.

Use `DOTENV_CONFIG_PATH` to load a private env file; never put keys in CLI args.
Operator CLI uses `RPC_URL` and `OPERATOR_PRIVATE_KEY`; buyer HTTP commands use
`BUYER_PRIVATE_KEY` and `GRANT_PRIVATE_KEY`. None of these belong in evidence.
The API/facilitator must never receive the relayer key. Do not print the env file.

## 1. Read-only preflight and production build

```sh
pnpm ops:fuji preflight operations/private/ceremony.json
pnpm --dir ../../packages/payvoke-vault compile:production
```

Preflight checks chain ID 43113, fixed Fuji USDC code/6 decimals, canonical
finalized RPC, distinct identities and finalized balances. After deployment it
also checks runtime codehash, constructor policy and admin identity/delay.
Unsupported `finalized` is a blocker, not a reason to use `latest`.

Keep the production artifact/build-info with the run evidence. Deploy preparation
uses its bytecode; do not recompile between preparation and receipt collection.
Runtime codehash includes constructor immutables, so obtain it from the finalized
deployment, not from the unpatched artifact runtime.

## 2. One transaction at a time

An action input is `{ "ceremony": <full ceremony object>, "action": <action> }`.
The operator explicitly reviews each action, signer, amount and policy.

```sh
pnpm ops:fuji prepare operations/private/action.json operations/private/01.signed.json
# Review the action and printed hash/nonce/gas/maxCostWei. Preparation does NOT send.
# Only after approval, with FUJI_BROADCAST_ENABLED=true in the private env:
pnpm ops:fuji broadcast operations/private/01.signed.json <approved-transaction-hash>
pnpm ops:fuji receipt operations/private/01.signed.json operations/private/01.receipt.json
```

Each artifact has a single-use `.send.json` marker written **before** network
send. A timeout/crash can consume the send authorization without sending. Never
delete the marker or reprepare a replacement to get around it. Use the persisted
hash and read-only receipt command to investigate. A pending/missing receipt or
changed nonce is not permission to deploy or spend again. No automatic fee bump,
replacement, funding or send retry exists. Do not prepare multiple unresolved
operator artifacts for the same signer/nonce.

Receipt collection requires canonical finality; it can be rerun while waiting
because the output is only written on success. A finalized `reverted` receipt is
evidence of **failure and spent gas**, not successful completion of the action.
All receipt files include actual gas cost and finalized account balances.

Supported actions, in ceremony order:

| Action JSON                                                                                                           | Signer | Notes                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `{"kind":"deploy"}`                                                                                                   | admin  | Fresh ceremony only; uses approved constructor policy            |
| `{"kind":"relayer-role"}`                                                                                             | admin  | Grants only `RELAYER_ROLE`                                       |
| `{"kind":"approve","amount":"…"}`                                                                                     | buyer  | Exact approved allowance, not unlimited                          |
| `{"kind":"deposit","amount":"…"}`                                                                                     | buyer  | Exact approved test deposit                                      |
| `{"kind":"grant","grantId":"0x…","expiresAt":0,"maxPerCall":"…","periodSeconds":0,"maxPerPeriod":"…","maxTotal":"…"}` | buyer  | Replace timestamp/period/limits; signer is ceremony grant signer |
| `{"kind":"reclaim","holdId":"0x…"}`                                                                                   | buyer  | Only after hold `resolveBy`; simulation rejects early calls      |
| `{"kind":"withdraw","amount":"…"}`                                                                                    | buyer  | Withdraw exact available amount, back to buyer                   |

The successful deployment receipt contains a `deployment` object: use it as the
new ceremony JSON for subsequent actions, including `vault`, `expectedCodeHash`
and `deploymentBlock`. Re-run preflight after granting the relayer role. Fund
wallets only through the separately approved funding procedure; no faucet or
fund-transfer command is bundled here.

## 3. Local database and HTTP preparation

Apply existing migrations to the dedicated local DB with Prisma CLI. Start API
with payments disabled first. Use the real SIWE endpoints, not an inserted session.

Create `run.json` matching `PaymentRun` in `src/operations/payment.ts`:
`apiOrigin`, `webOrigin`, `vault`, `buyer`, `sessionId`, `commandId`,
`clientRequestId`, `arguments: {"text":"controlled Fuji test"}`, `grantId`,
`grantEpoch` (decimal string), `maxAmount` (decimal string). Choose fresh IDs once;
reuse the same `clientRequestId` if quote preparation is interrupted.

```sh
pnpm ops:fuji login operations/private/run.json
```

The login command prints only buyer identity, never cookies/tokens, and signs out.
Use the returned buyer ID in `seed.json`, matching `Seed` in
`src/operations/seed.ts`. Supply the same `run`, fresh `productId`/`policyVersion`,
approved provider/fee-recipient, feeBps, quoteLifetimeSeconds, maxHoldSeconds,
resolutionGraceSeconds, deliverySeconds, reviewSeconds, grossAmount and the
approved `minGrossAmount` price floor (atomic USDC; it must cover sponsored
hold + release gas and `grossAmount` must not be below it).

```sh
# CEREMONY_DATABASE_URL must explicitly name the dedicated loopback DB.
pnpm ops:fuji seed operations/private/seed.json
pnpm ops:fuji payment-prepare operations/private/run.json operations/private/payment.json
```

Seed creates only the minimal catalog/session/policy, in a transaction. It refuses
existing products/policies and never deletes/upserts them. API identity and DB
wallet must match. This is not a catalog-management API. Payment preparation
authenticates, freezes a quote, gets the SDK challenge and saves authorization;
it does **not** submit that authorization to the settlement service.

## 4. Approved payment execution

Use deployment evidence for `VAULT_ADDRESS`, `EXPECTED_VAULT_CODE_HASH` and
`DEPLOYMENT_START_BLOCK`. Configure approved worker budgets from
`../worker.env.example`. After approval, start the three processes with:

- API `PAYMENTS_ENABLED=true`, private facilitator URL/token.
- Facilitator `SETTLEMENT_ENABLED=true`.
- Worker `EXECUTION_ENABLED=true`; relayer key only in this process.

Bind HTTP services to loopback for this ceremony. Startup capabilities, deployment
policy and finalized RPC must pass before submission. Keep provider consumers off.

```sh
# Requires FUJI_BROADCAST_ENABLED=true. Digest is printed by payment-prepare.
pnpm ops:fuji payment-submit operations/private/payment.json <approved-authorization-digest>
pnpm ops:fuji payment-poll operations/private/payment.json operations/private/status-01.json
```

Polling is single-shot, read-only, bounded and uses fresh output files. While
pending, wait/poll rather than generating another quote/authorization. Repeated
submission uses the same persisted payload and operation, never a second charge.
The runner signs out after each command and does not save auth session cookies.

Create `check.json` containing `{ "ceremony": <deployed ceremony>,
"prepared": <payment.json contents>, "transactionHash": "0x…" }` using the
real hash from polling; never manufacture a hash.

```sh
pnpm ops:fuji payment-check operations/private/check.json operations/private/chain-proof.json
pnpm ops:fuji journal-check operations/private/check.json operations/private/journal-proof.json
```

Chain proof verifies exact calldata, sender, event, canonical finalized receipt,
hold fields and signer. Journal proof checks the same intent/hash, finality
evidence, cost, released lane and unique ready handoff in one repeatable-read
snapshot. Compare chain/journal hashes and block evidence. A `held` outcome plus
one ready event is the happy path. `not_executable` preserves financial truth but
is not successful provider admission; it must not have a ready event.

## 5. Recovery, cleanup and stop condition

Record baseline balances before the payment. Check gross moves from buyer
available to held once. Replay the saved payload; restart worker after broadcast
before reconciliation; allow backfill to recover without a new browser submit.
Do not deliberately create a reorg or inject ambiguous sends on Fuji. Those are
covered by isolated local tests. Additional revoke/failure transactions require
their own approved budget, not an automatic test matrix on funded wallets.

Stop new submissions first. Do not stop reconciliation with unresolved signed,
UNKNOWN or quarantined attempts. Investigate contradictory evidence/nonce before
doing anything that could reuse the lane; no force-release endpoint is provided.

After `resolveBy`, use the approved reclaim action and collect finalized receipt,
then withdraw the available deposit and collect another receipt. Reclaim moves
funds to vault available balance; it does not itself return tokens to the wallet.
Confirm hold closed/remaining zero and wallet USDC restored. No time travel is
used on Fuji. Cleanup does not reset the historical HELD/ready payment record.

Disable payment submission/execution after all attempts are resolved, preserve
sanitized evidence/cost totals, and leave provider dispatch disabled. Completion
requires finalized payment + replay/restart proof + consistent journal + recovered
funds within budget. Report any unresolved funds explicitly; do not call a partial
run complete.

## Isolated verification (no Fuji connection)

```sh
pnpm test
pnpm test:payments:evm
```

EVM tests deploy on a spawned loopback Hardhat chain with ID 43113, exercise the
operator action tooling and SDK/HTTP runner, and test reclaim/withdraw after local
time advancement. They also verify a timeout-after-send is recovered by its stored
hash without another send. No live-chain test runs as part of the default suite.
