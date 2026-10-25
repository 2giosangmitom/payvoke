# Approved financial lifecycle

This is a controlled operator/verifier workflow, **not public automatic payout**.
The code has local EVM proof; deploying, funding and broadcasting on Fuji still
requires separate approval. Provider delivery/output verification and a real Fuji
run remain launch gates. No independent security audit is claimed.

## Roles and process separation

- Settlement relayer: only reserves buyer-authorized holds.
- Finance executor: a **different dedicated sender**, with FINANCE_EXECUTOR_ROLE.
- Approver: different from executor; requires REFUND_APPROVER_ROLE for refunds,
  RELEASE_APPROVER_ROLE for release, and DISPUTE_RESOLVER_ROLE whenever resolving
  a dispute (including resolveDispute=true on an undisputed hold).
- Buyer: owns dispute/reclaim and available withdrawal. Provider/platform withdraw
  only their own claimable balances. Neither worker can redirect buyer withdrawal.

Assign roles with an approved `finance-role` operator action, through the existing
prepare/hash-approve/broadcast/receipt sequence. Allowed role names are the four
finance roles above plus PAUSER_ROLE. Review the `account` in the signed artifact.
There are no default economic values or automatically assigned roles.

Approver CLI process may have APPROVER_PRIVATE_KEY but must not have
FINANCE_EXECUTOR_PRIVATE_KEY. The executor process must not have approver key.
Keys stay in private local env files, never command args, approval files or logs.
The library accepts a signer only for execution; there is no automatic approver.

## State and evidence

Original x402 payment success means a hold was finalized, not that the provider
has been paid. Keep its receipt after release/refund/reclaim. Status API includes:

- `paymentStatus`: original settlement outcome.
- `financial.status`: HELD, PARTIALLY_REFUNDED, DISPUTED, REFUNDED, RELEASED or
  RECLAIMED, with a hold snapshot and canonical finalized block/hash.

Partial refunds decrease remaining; they do not create provider/platform income.
Release allocates the remaining net with floor fee rounding. Refund/reclaim never
resets grant spend. Reclaim restores buyer available; withdrawal returns tokens.

The financial scanner has its own durable cursor, bounded 500-block ranges and
atomic event/projection updates. It observes direct-wallet events too. Orphan
holds become recovery incidents, never fabricated invocations or provider jobs.
Vault solvency/hold binding/accounting contradictions block new admission. RPC
failure is retryable and does not manufacture a balance or clear a prior block.
No operator force-clear/quarantine-release endpoint is provided.

## Finance command input

Use private files as in the main ceremony runbook. The command input has:

Use `../finance.env.example` as the disabled-by-default environment template;
load a private approver or executor copy using DOTENV_CONFIG_PATH.

```text
{
  ceremony: <deployed Ceremony, including deploymentBlock>,
  executor: <dedicated finance address>,
  gasBudget: {
    maxGasLimit, maxFeePerGas, maxPriorityFeePerGas,
    maxTransactionCost, maxOutstandingCost, maxWindowCost,
    windowSeconds
  },
  decisionId: <decision bytes32>,
  approval: {
    decision: {
      holdId, decisionId, expectedVersion, refundAmount,
      releaseRemainder, resolveDispute, validUntil
    },
    approver, signature, evidenceId: <ID or null>, reason
  }
}
```

Notation only; replace placeholders with JSON values. Decision integers are
canonical decimal strings, flags are JSON booleans, hashes lowercase bytes32.
gasBudget fields are decimal strings except windowSeconds, a JSON integer.
Amounts are USDC base units; gas prices/costs are wei. Approve every ceiling and
the overall test budget. The gas window includes finalized actual cost plus all
unresolved reserved liability, including quarantined attempts. Do not share the
executor wallet with another script/operator transaction sender.

Use a fresh decisionId once; never mutate decision/evidence/reason under that ID.
Approval expiry must not exceed hold resolveBy. An expired/stale approval does
not cause a replacement decision or signature. Explicit approval of a new ID is
required to try another business decision after a finalized failed transaction.

## Refund/release sequence

Commands below run from `apps/backend`. All database commands explicitly use
CEREMONY_DATABASE_URL, restricted to a dedicated loopback `payvoke_fuji_*` DB.

```sh
# Separate approver environment. Signing does not broadcast or enqueue.
pnpm ops:fuji finance-approve operations/private/proposal.json operations/private/approved.json
# Key-free service environment. Validate again and persist immutable approval.
pnpm ops:fuji finance-enqueue operations/private/approved.json
# Separate executor environment, with both explicit execution flags true.
pnpm ops:fuji finance-tick operations/private/approved.json
pnpm ops:fuji finance-status operations/private/approved.json
# Read-only chain access, durable index update; no signing key needed.
pnpm ops:fuji finance-sync operations/private/approved.json
```

Executor requires `FUJI_BROADCAST_ENABLED=true`, `FINANCE_EXECUTION_ENABLED=true`
and FINANCE_EXECUTOR_PRIVATE_KEY. Each tick handles only the requested decision;
it is not a background daemon and does not search for new decisions to approve.
nextCheckAt/leases are durable. Invoke subsequent ticks after the retry interval
to reconcile pending receipts; finance-status never broadcasts.

Each finance-sync is one bounded index step; repeat until `caughtUp=true`. The
returned cursor/head make backlog explicit. A successful sync never clears an
incident block or fabricates a completed finance decision.

Finance states: APPROVED → RESERVED → SIGNED → BROADCAST/UNKNOWN →
FINALIZED/REVERTED. A stale unattempted decision can become REJECTED. Contradictory
nonce/receipt/transaction evidence becomes QUARANTINED, retaining lane and budget.
Lease expiry never frees a financial reservation. At most three durable send
authorizations retransmit the exact same stored bytes; there is no replacement,
fee bump, second transaction attempt or automatic decision re-signing.

Only canonical finalized receipt identity, exact calldata, DecisionApplied event
amounts/version and hold evidence can finalize success. Lane release, receipt and
actual gas cost commit in one SQL transaction. Revert releases the consumed nonce
only after finality; the financial projection still independently reports what
happened to the hold, including decisions sent externally.

## Delivery/review gate

Refund requires a signed human/business decision, not a provider failure report.
Release additionally requires immutable evidence from the trusted output verifier
through `recordPaymentDelivery`. There is **no provider API** that grants this.
Observer time comes from PostgreSQL, never a supplied provider timestamp. An
artifact's content hash cannot change under the same version, and confirmed
access interruption cannot decrease under that version.

For controlled local/approved testing only, a trusted operator can supply
`delivery: {id,invocationId,artifactVersion,outputHash,verifier,accessInterruptionSeconds,evidenceLevel}`
in the command input and explicitly enable MANUAL_DELIVERY_ATTESTATION_ENABLED.
`evidenceLevel` is required: `SIGN`, `REC` (independent receipt, e.g. checksum and
buyer download) or `WIT` (an authorized person confirmed). It must describe what
was actually observed; it is compared with the quote's signed
`terms.verification.minEvidence` and REC/WIT do not substitute for each other:

```sh
pnpm ops:fuji finance-delivery operations/private/delivery.json
```

This command is an **attestation**, not an output validator. Do not use it to
declare unverified provider output delivered. Manual enablement does not waive
review timing or approver requirements. Later provider verification must call the
internal seam only after validating the approved output and actual access.

Every observation stores an immutable Evidence Envelope and its JCS hash; a
buyer dispute intent without an explicit hash references the latest envelope.

The business gate requires the latest observation ID pinned in the approval, an
evidence level that satisfies the signed `minEvidence` (`evidence_below_minimum`),
on-time observation, and:

`now >= max(releaseNotBefore, observationTime + reviewSeconds + interruption)`

The resulting earliest release must be strictly before resolveBy. A correction is
a new observation and conservatively starts a fresh review window. An older
unbroadcast approval cannot silently pay out a newer observation. If review no
longer fits, resolve/refund rather than altering the original signed hold.
Buyer acceptance cannot bypass this gate. No paid continuation or provider retry
is created by any finance decision.

Financial terminal state does not prove provider side effects stopped and does
not automatically free the execution/session slot. The upcoming provider state
machine must close that slot from verified execution evidence and must recheck
current hold/deadline before consuming an old ready event. This implementation
does not turn historical `InvocationReady` rows into executable jobs after refund
or reclaim; no provider consumer is enabled here.

## Buyer and payout recovery

Authenticated owner can request unsigned dispute/reclaim calldata through the
buyer financial-intents action (route defined in `src/modules/payments`). Returned status is UNSUBMITTED:
the wallet must simulate/sign/send. An offchain request is not an onchain lock;
only a finalized DisputeOpened event is projected as DISPUTED. A stale intent may
revert after a concurrent financial decision; it is never reported as successful
without chain evidence.

The operator tooling also supports `grant-update`, `grant-revoke`, `dispute`,
`withdraw-provider` and `withdraw-platform`. Withdrawal actions specify `account`
as the signer; the contract still only pays that account's own claimable funds.
No sweeping or arbitrary recipient transfer exists.

After resolveBy, buyer can reclaim even while paused/disputed. Do not submit
applyDecision after that boundary. Simulate first, collect finalized receipt and
then withdraw available. USDC freeze/blacklist can prevent token transfer; a
reverted withdrawal does not erase the claim or imply money reached the wallet.

## Verification and remaining launch gates

`pnpm test:payments:evm` exercises partial/full refund, net release/fee rounding,
provider/platform withdrawal, direct-wallet dispute/reclaim, pause, stale signing
lease fencing, timeout recovery and role revocation causing a finalized revert.
It asserts immutable original receipts, finalized projections and grant counters.
Docker mode additionally injects a real SQL finalization failure and proves lane,
receipt and cost updates roll back together. Everything runs on isolated EVM.

Still required before buyer enablement: approved Fuji deployment/full lifecycle
evidence, real provider verification/access signals, operational key/role ownership,
monitoring and incident procedures, explicit policy and budget approval. Building
this workflow does not automatically meet those gates or turn execution flags on.
