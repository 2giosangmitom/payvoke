# Verification and production-readiness register

**This is a plan for evidence, not a list of passing tests.** All gates below start **Not demonstrated** for vNext. Existing prototype tests cannot be relabelled as proof of this redesigned system.

## Acceptance register

| Gate                      | Required evidence                                                                                           | Responsible area            | Release                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------- |
| V01 Identity              | Session/wallet challenge replay, cross-owner access, role separation and recovery tests                     | M01                         | P1                            |
| V02 Scope and consent     | Quote/UI/ticket canonical vectors, changed payer/variant/recipient rejection, idempotent order tests        | M02/M03                     | P1                            |
| V03 Central contract      | Unit/property/fuzz/invariant suite over real ERC-20 behavior and failure tokens                             | M06/security                | P1 then independent review P2 |
| V04 Chain admission       | Real testnet pay → finality → journal → one run; expired/late/reverted/reorg cases                          | M03/M04/M06                 | P1                            |
| V05 Provider runtime      | Real SDK → Gateway → database; duplicate delivery, lost ack, restart and uncertainty                        | M04                         | P1                            |
| V06 Capability/capacity   | Schema/profile negotiation, last-slot race, stale heartbeat and old-revision drain                          | M04/M07                     | P1                            |
| V07 Streaming             | Sequence conflicts, batch partial commit, snapshot/tail race, slow readers and proxy disconnect             | M02/M04                     | P1                            |
| V08 Artifacts             | Partial upload, wrong digest/type, malware/quarantine, isolation and retained downloads                     | M05                         | P1                            |
| V09 Refunds               | Actual funded full/partial refunds, overlapping targets, insufficient balance/allowance and lost receipt    | M06/M09                     | P1                            |
| V10 Treasury/payout       | Balanced journal, coverage, dispute/payout races, post-payout refund loss and receipt deduplication         | M06/M09                     | P2                            |
| V11 Upgrades              | Populated-state upgrade simulation, layout/initializer checks, epoch handling and timelock rehearsal        | Security/governance         | P2                            |
| V12 Recovery              | Database/object restore followed by canonical chain reconciliation and safe reopening                       | Operations                  | P2                            |
| V13 Adversarial content   | Injection utility/attack metrics; forbidden effects blocked at command boundary                             | M02/M04/M08                 | P2; MCP-specific before P3    |
| V14 UX                    | Buyer/provider/operator sessions, accessible mobile/keyboard flow, honest payment/refund labels             | Product                     | P2                            |
| V15 External access       | Named MCP client/version, scoped tokens, checkout binding and cross-channel idempotency                     | M08                         | P3                            |
| V16 Operational readiness | Approved policies/addresses, staffed alerts, reserve funding, key custody and independent security sign-off | Product/security/operations | P2                            |

Each evidence record must include commit/build, dependency/protocol versions, environment and addresses, fixture, expected/actual outcome, logs/transaction IDs, date, reviewer and unresolved findings. Gate status is one of `not_demonstrated`, `failed`, `passed_for_test_profile`, `approved_for_release`; the last requires an accountable approval, not a test runner label.

## Contract invariants

1. An order and quote can be paid at most once; paid amount is positive and exact.
2. `0 <= refundedAmount <= amountPaid` for every order under arbitrary call sequences.
3. Refund recipient/token derive from the paid record; no caller can redirect them.
4. Failed token transfers revert record changes and voucher consumption.
5. Overlapping cumulative refund targets cannot over-refund; replay cannot create another effect.
6. Payment/refund signatures cannot replay across chain, router, type or invalid epochs.
7. No unauthorized account can initialize, upgrade, configure or unpause; implementation initialization is disabled.
8. Upgrades preserve paid/refunded amounts, consumed identities and usable refund paths.
9. Pausing new sales leaves safe reads and independently controlled refund recovery available.
10. Router balance is not represented as escrow; unexpected direct token transfers cannot fund an order.

These invariants do not prove treasury solvency, honest dispute decisions or useful agent output. Test those boundaries separately.

## Required failure drills

- Crash before/after payment submission, canonical confirmation, journal commit, outbox dispatch and provider acceptance.
- Drop a wallet callback after successful payment; index the order from chain without buyer resubmission.
- Include payment just before quote expiry and index it after the application marked the order expired.
- Lose provider acknowledgment after model execution; resume the same assignment or preserve uncertainty.
- Replay changed event bytes at an existing sequence; submit from an obsolete attempt or another application.
- Refresh during a session's last permitted turn and race two responses to the same input request.
- Complete output upload partially; swap artifact revision; inject active content into previews.
- Approve refund targets 40 and 70 concurrently; execute in either order; lose receipts and retry.
- Empty treasury or revoke allowance before refund; show the remaining entitlement and halt unsafe payouts.
- Broadcast a payout, then receive a valid dispute; reconcile payout and cover refund without assuming transaction reversal.
- Rotate treasury/signers with outstanding tickets and old paid orders; retain old-order refund support.
- Upgrade with populated state, migrate safely, simulate failed governance execution and reject unsafe rollback.
- Restore a backup older than confirmed payments/refunds/payouts; replay effects without double spending.
- Exercise finality/RPC disagreement and storage outage during buyer review; suspend unsafe transitions.

## Production release checklist

Freeze the supported network/token profile, compiler/library/protocol versions and contract addresses. Verify source and deployed bytecode. Complete independent review covering governance and treasury controls as well as business functions. Resolve critical/high findings under a documented policy; record accepted residual risks and owners.

Demonstrate the full testnet vertical slice using named wallets and a real provider integration, with synthetic low-cost fixtures where appropriate. Real model trials need explicit cost budgets. Measure queue/runtime/stream behavior under expected load and test proxy limits; set service targets only from evidence and staffing.

Configure treasury coverage alerts, refund liquidity, multisig/timelock custody, backup restoration, sensitive logging rules, retention jobs, support escalation and incident runbooks. Approve commercial seller/recipient/refund terms and required jurisdictional review before taking customer funds. No automatic mainnet enablement follows a successful testnet run.

## Research-driven evaluation

Use the [design evidence](research/design-evidence.md) as test inspiration, not certification. AgentDojo motivates measuring useful completion and prohibited effects separately; τ-bench motivates repeated trials plus process/trace checks. Record sample counts, task distributions, latency, cost and limitations; distinguish provider assertions, observed checks and human judgment.
