# M06 — Central Payments and Refunds

**Status: production-oriented design requirements, not implemented or audited code.** Selected model: direct upfront payment, separate refunds later, no per-user smart account. Proposed recipient: platform treasury; approve this commercial model before implementation.

## Features and boundaries

- Prepare typed payment tickets bound to one canonical order and buyer wallet.
- Accept the buyer's ERC-20 payment through one central router and transfer it directly to the ticket's treasury.
- Record unique paid orders and bounded cumulative refunds on-chain.
- Execute separately authorized, treasury-funded refunds to the original payer.
- Reconcile canonical chain effects into an append-only financial journal.
- Track provider earnings, holds, payout and refund liabilities independently.
- Govern upgrades, configuration, signer rotation and route-specific emergency pauses.

The contract does not escrow money, reserve buyer balances, run agents, evaluate quality or guarantee treasury solvency. Delivery acceptance does not release the original payment; that money has already moved. x402, ERC-7710, factories, paymasters and spending mandates are outside this design.

## Deployment model and authority

One stable `PaymentRouter` business address uses an ERC-1967 proxy and UUPS-compatible implementation. Deploy and initialize atomically; disable initializers on the implementation. Use pinned, compatible OpenZeppelin upgradeable components, namespaced storage and automated storage-layout validation. [OpenZeppelin documents initialization and storage constraints](https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable); [its proxy reference distinguishes UUPS and transparent patterns](https://docs.openzeppelin.com/contracts/5.x/api/proxy).

Do not mix UUPS upgrade entrypoints with a transparent proxy. Prefer one upgrade path through `_authorizeUpgrade` restricted to a timelock controlled by a governance multisig. Proposed normal delay: 48 hours. Threshold, signer independence and recovery procedures require approval and rehearsal. The [OpenZeppelin access-control guidance](https://docs.openzeppelin.com/contracts/5.x/access-control) provides primitives; it does not choose this product's governance policy.

| Authority           | Permission                                                       | Explicit exclusions                                         |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Buyer payer         | Approve token; pay its exact signed ticket                       | Cannot pay another payer's ticket or alter amount/recipient |
| Quote signer        | Sign bounded payment tickets for persisted orders                | No treasury transfer, refund or upgrade permission          |
| Refund approver     | Authorize a cumulative refund target for an existing paid order  | Cannot redirect recipient or exceed paid amount             |
| Refund relay        | Submit an approved voucher; may be permissionless                | Cannot alter voucher fields                                 |
| Emergency guardian  | Pause new payments; revoke compromised signers                   | Cannot unpause, transfer funds or upgrade instantly         |
| Governance timelock | Upgrade, add roles/tokens, change allowed configuration, unpause | No ordinary business-decision role by default               |
| Treasury multisig   | Fund refunds, set router allowance, execute eligible payouts     | Cannot rewrite router payment/refund records                |

Use separate signer domains/keys and custody for quote, refund and governance. Support contract-signature validation for a multisig refund approver or specify a reviewed dedicated signer; test revocation behavior. Adding privileges uses timelock; emergency revocation is immediate and audited. Removing the last administrator or losing multisig quorum requires a documented recovery strategy before deployment.

## On-chain state and signed data

Store `payments[orderId] = {payer, token, amountPaid, treasury, termsCommitment, paidAt, configEpoch, refundedAmount}`. Store consumed quote IDs and refund voucher IDs, active authorities, allowed tokens, accepted configuration epochs and route pause flags. Financial values use unsigned integer base units with explicit bounds.

Reject zero amounts, zero/unsupported addresses, amounts above the configured per-payment cap and invalid expiry bounds. M03 constrains `feeBps` to `0..10000`; the router enforces the ticket's total, while fee allocation remains journal policy rather than a second token charge.

`PaymentTicket` contains `orderId`, `quoteId`, `payer`, `token`, `amount`, `treasury`, `termsCommitment`, `expiresAt`, `configEpoch` and `signerEpoch`. The EIP-712 domain includes chain ID, proxy address, name and signature version. The terms commitment is a salted hash of the complete M03 quote; the full private terms remain in application storage.

EIP-712 supplies typed encoding, not replay protection; the contract must enforce unique orders/quotes, expiry and version/epoch rules. See [EIP-712](https://eips.ethereum.org/EIPS/eip-712). Cross-language signing vectors must include chain/router/payee substitution, reordered data, leading zeros and integer bounds.

`RefundVoucher` contains `refundId`, `orderId`, `cumulativeRefundTarget`, `reasonCommitment`, `expiresAt` and `refundSignerEpoch`; its domain identifies the same chain/router and a distinct refund type. Recipient and token are derived from the recorded payment, never caller-provided. Use a target cumulative amount instead of an increment so overlapping approvals cannot accidentally double the intended total.

## Proposed contract interface

These signatures define responsibilities, not compilable ABI or implementation code.

| Function                           | Preconditions                                                                                                              | Atomic effect                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pay(ticket, quoteSignature)`      | Route enabled; valid signer/epochs/expiry; caller equals payer; unused order and quote; allowed token/treasury/amount      | Store payment and consume quote, transfer exact amount payer → treasury, emit `OrderPaid`; all revert together on failure                                          |
| `refund(voucher, refundSignature)` | Existing payment; authorized nonrevoked approval; unused refund ID; current refunded < target ≤ paid; refund route enabled | Increment refunded to target, consume voucher, transfer delta from original treasury → original payer, emit `OrderRefunded`; all revert together if transfer fails |
| `getPayment(orderId)`              | Public read                                                                                                                | Return payment and cumulative refund facts                                                                                                                         |
| `pausePayments()`                  | Guardian/governance                                                                                                        | Stop new `pay`, keep reads and safe refunds operational                                                                                                            |
| `pauseRefunds()`                   | Emergency authority, separately justified incident                                                                         | Stop refunds only if their route is unsafe; record outstanding obligations off-chain                                                                               |
| `revokeSigner/epoch(...)`          | Emergency revocation authority                                                                                             | Reject outstanding compromised tickets/vouchers without altering settled records                                                                                   |
| `configure(...)`, `unpause...()`   | Timelock                                                                                                                   | Apply reviewed token/treasury/role configuration; emit change events                                                                                               |
| `upgradeToAndCall(...)`            | UUPS authorization through timelock                                                                                        | Validated implementation upgrade and approved migration                                                                                                            |

A router retry for an already-paid order reverts with `AlreadyPaid`; the application reads its existing payment rather than initiating a new one. An expired ticket cannot fund even if the UI was previously confirmed. A transaction mined before expiry is valid regardless of indexer delay.

Token operations use reviewed SafeERC20 wrappers, checks-effects-interactions and a chain-compatible reentrancy guard. Measure balance changes to reject fee-on-transfer behavior and admit only tested non-rebasing token profiles; a wrapper alone does not guarantee exact economic receipt. [SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20) and [reentrancy utilities](https://docs.openzeppelin.com/contracts/5.x/api/utils) supply primitives, not an audit of this composition.

## Refund funding and races

Treasury grants the router a controlled token allowance for refunds. Funds remain in treasury until `refund` executes. The amount transferred is `target - recordedRefunded`; failure for insufficient balance/allowance reverts both state and voucher consumption. The entitlement remains pending in the application and can be retried after funding.

If targets 40 and 70 execute in either order on a 100-unit payment, total refunded is at most 70: the lower target after 70 is stale, not an extra 40. A later approved target 100 can return the remaining amount. Each refund approval policy must compare the new target with all existing approvals, not sum nominal voucher values. A chain race never makes cumulative refunds exceed the original payment.

Refund destinations remain the original payer even if an application wallet binding changes. Treasury rotation applies to new payments; old orders retain their treasury and need its refund balance/allowance. An alternate refund source requires an explicit reviewed protocol change, not an ad hoc transfer recorded as router success.

A revoked or expired refund voucher does not extinguish a legal/commercial entitlement: reapprove under current authority with the same cumulative target after reconciliation. No platform action can undo a completed buyer refund.

## Treasury, earnings and payout

Proposed minimum liquid coverage per token:

`requiredCoverage = unresolvedOrderExposure + eligibleClosedOrderPayables + approvedUnpaidRefundsForClosedOrders + approvedOperatingReserve`

`unresolvedOrderExposure` is the sum of `paid - confirmedRefunded` for unresolved orders. Avoid double-counting their refund approvals or unpaid earnings. Closed-order payables are net of approved refund adjustments. During payout submission, retain the liability until canonical confirmation and reserve the pending outgoing amount; uncertain transactions cannot free liquidity for another payout. Calculate coverage using spendable treasury balances, not allowances, pending incoming transfers or uncollected provider receivables.

Suspend new ticket issuance and payout when coverage fails; consider pausing `pay` if the platform cannot reliably admit new obligations. This does not make the contract enforce a reserve: treasury signers can move funds outside the router. Disclose and monitor that trust assumption.

Payout eligibility: accessible delivery, explicit acceptance or review-policy expiry, no active dispute/refund/incident hold, and coverage remains sufficient after payment. Payouts are separately signed treasury transfers to a pinned provider address. Bind payout batches to approved payable IDs and reconcile chain transaction identity before releasing the same payable again.

Use a shared database lock/state transition for refund decisions and payout scheduling. Once a payout transaction is broadcast, a later dispute cannot assume it can be canceled; freeze new payouts, reconcile the pending transaction and fund any buyer refund from platform reserves. There is no atomic cross-system guarantee between an application dispute and a treasury transaction.

## Accounting and chain reconciliation

Owned records: `PaymentIntent`, `PaymentTicket`, `ChainEffect`, `RefundEntitlement`, `RefundApproval`, `RefundSubmission`, `ProviderPayable`, `PayoutBatch`, `JournalEntry`, `ReconciliationCheckpoint`. Journal balances are per token; application business entries and on-chain effects have distinct IDs.

Payment intent states: `prepared → awaiting_signature → submitted → confirming → confirmed`, with `rejected`, `expired`, `reverted`, `unknown`. Refund states: `requested → approved → awaiting_funding | ready → submitted → confirming → confirmed`, plus denied/reverted/unknown branches. Never show approved as transferred.

Persist transaction intent before submission where the platform submits. For buyer-wallet transactions, persist order/ticket first, accept tx hash as a hint, and independently index router events even if the browser never reports the hash. Check chain, proxy, successful receipt, canonical block, order fields, cumulative state and token effects; a generic token `Transfer` alone cannot identify an order.

Use network-specific finality policy, checkpoints and independent RPC comparison. Reorg/unavailable RPC means pending or unknown, not a second payment. A deep finality violation after dispatch triggers an incident and reconciliation; do not claim it is impossible. Paid access, financial journal and outbox activate atomically in the database only once per confirmed effect.

## Upgrade and incident policy

Version signatures and configuration. Normal upgrades must preserve paid records, cumulative refunds, unique identities and semantics of outstanding tickets. If semantics change, pause payments, stop ticket issuance, expire/revoke old epochs, simulate migration and explicitly reopen with a new signature domain/version. Old orders must retain a workable refund path.

Validate storage layouts and initializers, run invariant/fork tests against populated state, rehearse governance, verify bytecode/source and publish the proposed upgrade. A failed upgrade is not repaired by blindly pointing to an old implementation: storage or migrations may make rollback unsafe. Prefer a reviewed forward fix; restore old code only after compatibility proof.

No unbounded iteration over orders, arbitrary external-call router, general treasury drain or admin rewrite of payment history. Accidental token transfers to the router are not payments. Any rescue function must be explicitly specified, timelocked and proven unable to touch accounted obligations; omit it from release one unless required.

## Required production evidence

Independent contract/security review; property/fuzz/invariant tests; token behavior and wallet tests; initialized proxy and role checks; upgrade rehearsal with old paid/refunded orders; compromised-key drills; reserve/payout/refund race drills; chain/database restore; monitoring and staffed incident response. The full [verification register](../verification.md) is mandatory before real funds. Proxy support alone satisfies none of these operational guarantees.
