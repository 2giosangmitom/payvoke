# M03 Commerce and Pricing

Owns pricing snapshots, quotes, operation IDs, orders and entitlements. A quote fixes the commercial rules; an order records one purchase; a job executes it. An entitlement is the buyer's durable right to the purchased work/result.

## Variants and prices

An agent may offer variants such as fast, quality or research, each with declared capabilities, parameters and pricing. Resolve them from an admitted [manifest](07-provider-publishing.md), never free-form model/provider text. No silent variant switch or more expensive fallback.

| Pricing profile   | Quote fixes                                           | Final bill                                         |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Fixed             | Scope, total price, included repairs                  | Agreed total                                       |
| Metered, proposed | Rates, billable dimensions, limits and maximum charge | Accepted usage at pinned rates, within the ceiling |
| Hybrid, proposed  | Base fee plus metered rules and ceiling               | Base fee plus accepted usage, within the ceiling   |

Billable dimensions may include input/output/cache/reasoning tokens, media or tool calls only when explicitly declared. Define rounding, fees, retry costs and failure/cancellation billing before selling a profile. Calculate money in integer token units; an estimate is not an authorization limit.

## Quote and admission

```mermaid
flowchart LR
  Scope[Task, variant and parameters] --> Quote[Immutable quote with expiry]
  Quote --> Authority[Explicit approval or existing scoped mandate]
  Authority --> Order[Persist unique pending order]
  Order --> Payment[M06 reservation and settlement profile]
  Payment --> Entitlement[Activate executable entitlement]
  Entitlement --> Job[M04 job]
```

A quote binds buyer/project/funding account, brief/input commitment, agent/action/variant/version, parameters, parent artifact, output/check profile, pricing/fee/terms versions, cost ceiling or fixed total, token/chain/recipient, deadline and expiry. Show these terms before granting authority. Changed terms require a new quote.

The same account and operation key with the same fingerprint returns the original order across transports. Different fields conflict. One quote admits one order; an authorization or chain effect cannot fund two orders. Keep durable identities beyond cache expiry.

New buyer scope creates a revision order linked to its parent artifact. Repairs needed for a fixed-price promise remain in the original bounded job. Status, reconnect, retries and retained downloads do not create additional purchases. Metered attempt costs must follow the quoted retry rules without exceeding the ceiling.

## Metering trust

External providers report structured usage bound to operation, attempt, variant and pricing version. Separate cumulative snapshots from deltas, deduplicate them and distinguish live estimates from accepted final usage. Missing/conflicting evidence enters reconciliation or dispute; do not automatically bill the maximum.

Provider signatures attest the reporter, not truthful usage. Output text cannot reveal hidden prompts, cached tokens or internal model loops. Stronger evidence may come from observed upstream usage or an optional gateway, but routing all model calls through the platform is not required. Independent usage verification and the [collection/refund method](06-smart-accounts-and-payments.md#settlement-and-metered-billing) remain prerequisites for enabling metered sales.

## Papers used

- [A Formal Analysis of Agent Payment Protocols, v1](https://arxiv.org/abs/2609.00060v1): preserve intent/authorization/effect bindings and durable operation identity. Prior targeted readings; formal findings, schema witnesses and live PoCs provide different evidence.
- [Signing the Transaction but Not the Decision, v1](https://arxiv.org/abs/2609.11757v1): bind purchases to the scope the user saw. Prior structural-binding readings; AP2 findings motivate these controls but do not prove x402 defects or eliminate semantic manipulation.
