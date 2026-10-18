# Product scope and decisions

**Status: design proposal, not implementation.** User-confirmed decisions are marked **Selected**; other defaults form a coherent review baseline rather than approved commercial terms.

## Product and actors

A buyer purchases bounded work with a known price and delivery criteria. A provider sells an independently operated capability. Operators review integrations, resolve disputes and run the platform. An external client is another authorized buyer interface, not an implicit spending authority.

A user may be both buyer and provider. Release one has single-owner workspaces. The platform is trusted for admission, delivery checks, refund decisions and upgrade governance; this is not a trustless marketplace.

## Decisions

| ID  | Decision                                                        | Status and consequence                                                            |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D01 | No per-user smart account                                       | Selected; buyer pays from a wallet                                                |
| D02 | Direct upfront payment; refund later                            | Selected; no escrow, reservation/capture or acceptance-triggered release          |
| D03 | One central upgradeable business contract                       | Selected direction; UUPS/ERC-1967 and governance details are proposed             |
| D04 | English specification                                           | Selected                                                                          |
| D05 | Platform treasury receives payment; provider payout is separate | Proposed; defines who must fund refunds                                           |
| D06 | Fixed price per task or bounded conversation session            | Proposed release-one scope; no provider-reported usage billing                    |
| D07 | One chain and allowlisted ERC-20                                | Fuji/test USDC for rehearsal; production network/token requires separate approval |
| D08 | One listing version, capability and variant per order           | No automatic cross-provider or more expensive fallback                            |
| D09 | Explicit addressed message or slash command                     | An unassigned message cannot dispatch work or charge                              |
| D10 | Technical checks precede delivery; buyer acceptance is separate | Neither provider success nor AG-UI completion proves useful work                  |
| D11 | Web first, MCP later through the same commands                  | External clients use buyer-facing wallet checkout                                 |

## Release scope

| Stage                      | Included                                                                                           | Exit condition                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| P0: specification          | Domain, payment/refund policy, capability/event contract, UX and threat model                      | Blocking product/security decisions reviewed                     |
| P1: testnet vertical slice | Discover → quote → pay → execute → deliver → accept or refund; provider onboarding                 | End-to-end chain/provider tests and corresponding failure drills |
| P2: production candidate   | Governance, audits, refund coverage, payout/dispute console, monitoring, restore and accessible UX | Evidence in the verification register, with owners and approvals |
| P3: expansion              | MCP, additional tested capabilities and output profiles                                            | Same operation identity and money invariants across channels     |

Out of release one: metered/hybrid/subscription pricing, automatic spending, agent-to-agent hiring, multi-provider DAGs, shared workspaces, arbitrary uploaded provider code executed by the platform, unlimited paid chat, cross-chain payments, proprietary tokens and autonomous AI financial decisions.

## Proposed commercial baseline

- Quotes expire after 15 minutes. Expiry constrains payment inclusion, not job completion. A valid payment mined before expiry must still reconcile if indexed later.
- A quote declares delivery duration, review duration, turn limits, output/file limits, included repairs and refund policy version. Delivery deadline starts at the finalized payment's block timestamp; finality lag consumes the budget and must be considered in quoting.
- Review window: proposed 72 hours from verified, accessible delivery. A timely application dispute holds unpaid provider earnings; it cannot reverse a payment or claw back a prior payout.
- After the review window, no dispute means commercial completion and payout eligibility. This does not claim explicit buyer acceptance or objective quality.
- A repair within scope is included only if stated in the quote. While under repair/dispute, unpaid earnings remain held. Deadline extensions require recorded buyer agreement and a finite limit; no hidden reset.
- No valid delivery by the quoted deadline: full refund entitlement under the proposed policy. Provider compute cost is the provider's risk. Mid-run cancellation uses the pinned policy and may need human allocation.
- Total price includes the disclosed platform fee; blockchain gas is separate. Refunds do not promise reimbursement of gas.
- Provisional payout policy: no payout until completion and no open dispute/refund. Retain sufficient liquid treasury assets for all unresolved orders. Payout delay is an accounting rule, not on-chain escrow.
- Retain delivered artifacts for at least 90 days after closure; open disputes extend evidence retention. Exact deletion and personal-data policies must be approved before production.

## Open decisions

| ID  | Decision needed                                           | Current baseline                                                    | Owner / deadline                          |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| O01 | Payment recipient and commercial seller                   | Platform treasury; platform responsible for buyer refunds           | Product/operations before contract freeze |
| O02 | Fee percentage, taxes and invoices                        | Formula only; no invented percentage or legal classification        | Product/operations before public checkout |
| O03 | Refund authority and dispute response targets             | Dedicated refund approver; human-reviewed subjective disputes       | Product/security before contract freeze   |
| O04 | Review window, included repairs, cancellation allocations | 72 hours; per-capability repair limit; full refund for non-delivery | Product before live quotes                |
| O05 | Network/token, treasury, multisig threshold and timelock  | Testnet rehearsal; proposed 48-hour upgrade delay                   | Security/operations before deployment     |
| O06 | Refund treasury funding and post-payout losses            | Full unresolved-order coverage plus approved operating reserve      | Finance/operations before paid admission  |
| O07 | Retention, allowed content and data-processing terms      | Minimum necessary disclosure and pinned policy versions             | Product/operations before production      |
| O08 | Platform clarification assistant funding                  | Disclosed platform quota, never implicit wallet spending            | Product before enabling model calls       |

Changing a decision requires updating its owning module, workflow, protocol and UX together. This specification does not authorize deployment or real-fund use.
