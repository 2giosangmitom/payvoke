# M09 — Reputation and Operations

**Status: planned specification.** Owns reviews, disputes, moderation, incident cases and operational decisions. M06 owns refund transfers, journal entries and payout reconciliation.

## Features

- One review per purchased order, with edits and outcome labels; show sample size, capability/version and delivery history.
- Disclose provider samples and affiliations; flag self-purchases/coordinated reviews rather than treating transaction count as quality.
- Open an order-specific dispute with reason, artifact revision, evidence and requested resolution.
- Hold unpaid provider earnings while a timely dispute or refund is unresolved.
- Review evidence, record a human decision and send a bounded refund authorization request to M06.
- Operate admission pauses, version quarantine, alerts, support access, recovery and audited reopening.

## Dispute workflow

`open → evidence_requested → reviewing → decided → financial_action_pending → resolved`, with explicit `appealed`/`reopened` cases under approved policy. A rejected request records reasons; it does not erase the case.

Proposed ordinary filing window: 72 hours after accessible delivery. Non-delivery cases arise at the quoted deadline. Exceptional fraud/security cases and legal obligations need separately approved policy; no invented universal finality guarantee.

A case decision records buyer refund amount, fee/provider accounting adjustment, evidence digest, approver and policy version. A full refund cannot exceed paid amount less prior refunds. Subjective quality decisions require an authorized human; AI may summarize evidence but cannot authorize money movement.

Do not mark a case financially resolved until M06 confirms the refund or records an approved non-monetary outcome. A refund blocked for lack of treasury funds remains visible as owed. A prior payout cannot be undone by changing database balances: provider recovery is a separate receivable, funded by the platform in the meantime.

## Operations and incident handling

| Incident                        | Containment                                                                   | Recovery evidence                                                    |
| ------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Provider offline/unsafe version | Stop new admission; preserve running/uncertain work                           | Revalidated runtime, fenced old attempts, resolution for paid orders |
| Stream corruption               | Reject invalid input, isolate key, preserve accepted checkpoints              | Replay with no duplicate messages or execution                       |
| Treasury shortfall              | Stop new sales and payouts; retain refund queue                               | Restored liquid coverage and independent reconciliation              |
| Signer compromise               | Revoke ticket/refund authority through governed process; pause relevant route | Scope of valid/invalid tickets, repaired keys, reviewed effects      |
| Contract flaw                   | Pause new payments; assess whether refund route remains safe                  | Audited fix, timelock upgrade, state/solvency verification           |
| Database/storage loss           | Restricted mode; restore backup and immutable evidence                        | Chain replay, matched liabilities and accessible artifacts           |

Financial pause must not suppress status or support. Support access is scoped, time-limited and audited; no silent impersonation. Operator UI separates catalog review, dispute decisions, refund approval, payout and upgrade roles.

## Monitoring and recovery

Alert on unreconciled payments/refunds, outbox lag, provider uncertainty, queue deadlines, output failures, inaccessible delivery, payout holds, reserve coverage, signer changes and pending upgrades. Trace IDs connect order/run/artifact/case/effect without logging credentials, signed private URLs or raw user prompts.

Back up database, object bytes/manifests, configuration and required recovery material under separate controls. Reconcile chain state after restore before enabling any financial action. Proposed operational targets must be load-tested and staffed before becoming customer SLAs.

Owned records: `Review`, `DisputeCase`, `Decision`, `Incident`, `ModerationAction`, `SupportAccessGrant`, `OperationalHold`. Proposed UI/API routes live under `/operator`, `/v1/operator`, and buyer `/v1/orders/:id/disputes`.

## Acceptance conditions

An unpaid/non-owner cannot review another order. Dispute races block payout scheduling transactionally. Evidence is immutable and access-controlled. An approved-but-unfunded refund remains outstanding. Restore cannot duplicate payment/refund/payout effects. Reopening requires evidence and a named approver, not just a green health endpoint.
