# M06 Smart Accounts and Payments

Owns account/payment bindings, usage-policy integration, reservations, settlement evidence, journal, earnings, refunds and payouts. The contract enforces spending authority; off-chain records track orders and financial obligations. The demo uses Fuji test assets only.

## Personal account and usage policy

Each buyer owns a separate smart account controlled by their wallet. A shared factory may create accounts, but balances and policy state stay separate. There is no shared prepaid vault. Create once and reuse for later deposits; login alone does not create or fund it.

```mermaid
flowchart LR
  Owner[Owner wallet] -->|Deposit| Account[Personal smart account]
  Owner -->|Set or revoke policy| Account
  Delegate[Restricted delegated authority] -->|Exact permitted operation| Account
  Account -->|Accepted payment| Treasury[Platform treasury]
  Treasury --> Refund[Refund to entitled payer account]
  Treasury --> Payout[Delayed provider payout]
```

Deposits increase token balance, not permission to spend. The user grants allowed token/chain/recipient/action scope, per-operation ceiling, aggregate budget, expiry and revocation. Delegation may execute matching quotes without a new owner signature each time. It cannot change root policy, redirect funds or withdraw the account balance. Owner keys stay in the wallet.

Show balance, submitted/settled spend, outstanding reservations and unused authority separately. Reserve maximum exposure atomically before issuing usable authority; concurrent jobs share the same cap. Owner withdrawal/recovery must account for live authorizations and prevent double use. Pause cannot erase vested withdrawal/refund rights or reverse settled transfers.

The candidate signature-based design registers structured economic fields and an order commitment, recomputes the exact digest and reserves capacity in a state-changing operation. Read-only contract-signature validation accepts only registered active authority; no generic-signature fallback may bypass it. Enforce unique commercial commitments and single-use nonce/effect identities on the actual token route.

Start with non-recycling commitment capacity. Releasing it requires permanent invalidation and proof of non-use; a consumed nonce may also mean cancellation. Refunds/deposits do not automatically restore authority or reactivate revoked digests. A policy epoch change cannot bypass a promised lifetime cap.

## Settlement and metered billing

x402 `exact` moves a known amount. The fixed-price candidate uses explicit upfront settlement before paid execution. Persist order, exact authorization and submission identity first; one adapter/worker owns settlement. Never combine independently settling middleware and workers.

Metered/hybrid sales are proposed and need a selected collection policy:

| Option                             | Money path                                                    | Limitation                                                                                 |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Upfront ceiling, refund difference | Settle the maximum, rate accepted usage, refund the remainder | Temporary overcollection, refund transactions and funded treasury liabilities              |
| Reserve then capture actual cost   | Enforce a reserved ceiling and settle accepted usage later    | Requires separately proven contract/client/facilitator support; reservation is not payment |

Neither option is silently supplied by `exact`. Do not enable metered admission until usage evidence, error/cancellation billing and collection/recovery semantics are agreed. Missing usage does not justify charging the ceiling. [M03](03-commerce-and-pricing.md) owns rates and accepted usage; M06 enforces money limits and postings.

```mermaid
flowchart LR
  Intent[Persist order and payment intent] --> Check[Check mandate and reserve exact capacity]
  Check --> Submit[Persist authority and submit once]
  Submit --> Observe[Reconcile canonical effect]
  Observe --> Decision{Outcome established?}
  Decision -->|Settled| Commit[Atomic journal, entitlement and outbox commit]
  Decision -->|Unknown| Wait[Keep same intent pending]
  Decision -->|Cannot transfer| Close[Close with evidence]
```

For upfront profiles, execution starts only after the settled effect is recorded. SQL and chain writes are not atomic; recover the gap. Verify chain/token/payer/recipient/amount, authorization, successful receipt, effect identity and finality. A facilitator response, transaction hash or verification success is insufficient. Timeouts retain the original authorization; no fresh nonce or facilitator-switch charge while the first can settle.

## Treasury and compensation

Unspent deposits stay in personal accounts. Paid order funds enter the disclosed platform treasury. This is direct payment with operator obligations, not job-acceptance escrow. Providers do not receive buyer authorizations or implement x402 by requirement.

Use append-only double-entry postings per chain/token. Settlement creates an order liability; accepted delivery allocates pending provider earnings/fees; release waits for quoted dispute holds. Refund and payout have separate approval, submission, reconciliation and unique effects. Never withdraw refundable liabilities; a multisig alone cannot enforce off-chain holds.

The fixed-price proposal refunds technical failure/deadline breach in full, including fees. Pre-claim cancellation closes execution atomically and refunds a settled order; running cancellation follows disclosed terms. Metered failure billing is a separate decision, not an implicit exception to fixed-price terms. Subjective decisions require a named human or mutual agreement and cannot allocate more than funded liabilities/reserves. Late compensation after payout needs real reserves.

## Proof still required

Test the complete owner/account/delegate/token/facilitator route on Fuji, including concurrent caps, revocation races, replay, withdrawal, contract-signature bypasses, gas and restoration. Token authorization routes may bypass ordinary account execution guards. Separate account ownership from the payer address; unsupported routes must not fall back to unguarded wallet payments.

If standard x402 cannot enforce this policy, choose an explicitly custom tested profile or defer paid use. Job escrow/capture is a separate design. Confirm organizer custody/treasury and chain requirements before enabling settlement.

## Papers used

- [A Formal Analysis of Agent Payment Protocols, v1](https://arxiv.org/abs/2609.00060v1): durable identity and authorization/effect correspondence. Prior targeted readings; no proof of this integration.
- [Authority-Inference Separation in Agentic Finance, v1](https://arxiv.org/abs/2608.30519v1): deterministic grants separate from AI proposals. Prior section readings; prototype evidence is not production enforcement.
- [AgentValve, v1](https://arxiv.org/abs/2610.12948v1): finite capacity and atomic reservation. Prior feedback/timeout/discussion readings; its trust graph is not adopted and snapshot exposure is not lifetime loss.
- [When HTTP 402 Meets the Blockchain, v1](https://arxiv.org/abs/2607.19545v1): independently reconcile settlement and constrain facilitator/sponsor exposure. Prior Discussion reading; reported deployment weaknesses may have been fixed.
