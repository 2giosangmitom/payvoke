# User experience specification

**Target UX, not implemented screens.** The product should make task scope, current status and the next valid action clear. Users should not need to understand Gateway leases, event IDs or proxy mechanics to complete work.

## Information architecture

| Audience | Route / surface                                                                       | Primary purpose                                           |
| -------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Visitor  | `/`, `/explore`, `/agents/:slug`                                                      | Understand the product and discover capabilities          |
| Buyer    | `/starred`, `/workspaces`, `/workspace/:id`                                           | Save agents, prepare tasks and converse                   |
| Buyer    | `/checkout/:orderId`                                                                  | Review fixed terms, approve token if needed and pay       |
| Buyer    | `/orders`, `/orders/:id`                                                              | Track work, results, cancellation, refund and receipts    |
| Buyer    | `/settings/profile`, `/settings/wallets`, `/settings/connections`                     | Profile, linked wallets and external client grants        |
| Provider | `/provider`, `/provider/listings/:id`, `/provider/applications/:id`                   | Listing, capabilities, credentials, integration and tests |
| Provider | `/provider/runs`, `/provider/earnings`                                                | Work health, held earnings and confirmed payouts          |
| Operator | `/operator/reviews`, `/operator/disputes`, `/operator/finance`, `/operator/incidents` | Role-specific review and operational decisions            |

No “fund account” page in the target journey. Wallet connection happens when needed for payment; browsing and brief preparation do not require it.

## Discovery and listing

Agent cards show task-oriented name, one-sentence purpose, supported output, starting fixed price and a precise availability/evidence label. Do not show model/framework jargon as the primary value proposition. Saved unavailable agents remain visibly unavailable; do not swap them silently.

Listing detail contains capability tabs, sample outputs with provenance, input requirements, supported files, variant comparison, fixed price, delivery estimate versus contractual deadline, repairs, data-sharing disclosure and refund policy. Primary action: **Prepare task**. A listing with only declaration review shows **Not available for purchase** with an explanation.

Provider claims and platform-observed evidence are visually distinct. Use labels such as “Runtime tested · version 3 · 20 tasks” or “File format checked”, not a universal “Verified” checkmark.

## Workspace composition

Desktop: workspace/conversation navigation, central thread, and a collapsible task panel containing selected agent, brief, files, active order and deliverable. Mobile: one primary thread with accessible drawers/tabs for task and result; no hidden financial action dependent on hover.

The composer shows the addressed agent and capability, remaining session turns when applicable, attachment chips and a slash-command menu. Switching agent starts a new context and asks the user to select what to share. Unassigned mode is clearly labelled “Prepare your task”; it cannot look like a provider is already executing.

Submitting a paid task before purchase creates a quote card. The call to action is **Review price**, not an ambiguous **Send** that charges. Within a purchased session use **Send to [agent]** and show remaining limits. On exhaustion show **Review a new task**, never auto-renew.

## Checkout

Display the exact order snapshot:

- Agent, capability, variant, scope summary, selected files/context and required outputs.
- Total in token units and readable decimals; included platform fee; gas shown separately as an estimate.
- Chain, payer wallet, payment contract and immediate treasury recipient with explorer/details disclosure.
- Delivery deadline rule, review window, included repairs, cancellation/refund policy and data-use terms.
- Plain statement: **Payment is transferred immediately. Any approved refund is a separate transfer.**

Sequence: sign in → connect correct wallet/network → review → **Approve [token amount]** if required → **Pay [amount]** → submitted → confirming → paid. Avoid unlimited approval by default. Wallet prompts and screen amounts must match; payer/variant changes return to quote review.

Keep order identity and recovery visible. Closing the wallet or declining a signature is not an error that creates another order. If a transaction is pending, show **View transaction** and **Check status**; never suggest paying again simply because the browser timed out. Explain that token approval alone is not payment.

Production requires tested wallet/network switching and a gas-insufficient state. A fiat estimate, if added later, must be labelled approximate and cannot change the quoted token amount.

## Work and delivery states

| State shown              | What the buyer sees                                             | Valid action                                         |
| ------------------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| Awaiting payment         | Quote expiry and exact terms                                    | Resume checkout or abandon unpaid order              |
| Confirming payment       | Transaction reference and pending verification                  | Check status; do not pay again                       |
| Paid, queued             | Payment confirmed, provider queue and deadline                  | View terms; request cancellation                     |
| Running                  | Bounded progress and provisional output                         | Continue allowed interaction or request cancellation |
| Waiting for input        | Declared form/question and remaining time                       | Supply input; see timeout consequence                |
| Reconnecting             | Last saved content remains visible                              | Wait/retry read connection                           |
| Execution status unknown | Work may still be running; platform is reconciling              | Contact support; no blind restart                    |
| Checking output          | Provider finished; required checks pending                      | Wait or inspect provisional content                  |
| Ready for review         | Final revision, check results and review deadline               | Download, accept, repair if included, or dispute     |
| Completed                | Accepted explicitly or review period ended, labelled separately | Download/export; buy a new revision                  |
| Failed / expired         | What failed and applicable resolution                           | View refund request/status                           |

Use provider progress as qualitative status unless a meaningful denominator exists; never invent a percentage. Auto-scroll only when the user is at the bottom. Preserve keyboard focus and do not announce every streamed token to screen readers.

## Result and repair

Show the final artifact separately from the transcript, with filename/type/size, preview, check profile/results and immutable revision. State what checks did not establish. **Accept result** confirms the selected revision; refreshing cannot accept it.

**Request included repair** collects the failing promised requirement, shows remaining allowance and any proposed deadline change. New scope goes through a new quote. **Open dispute** asks for reason, desired resolution and selected evidence, then shows the earnings hold and response status. It does not claim that funds were escrowed or refunded.

Delivery notifications link to canonical status. An access outage shows a service issue and adjusted review timing under policy, not a countdown that silently expires while the result is unavailable.

## Refund and payout UX

Buyer refund timeline: requested → under review → approved [amount] → awaiting funds / processing → transaction confirming → refunded. Display original payer as destination, policy reasoning and transaction reference. Do not display “Refunded” at approval or transaction submission.

Provider earnings distinguish estimated gross, held amount, eligible payable, payout pending, paid, and post-payout recovery owed. Show platform fee and refund adjustments with reasons. A dispute hold is not a reversal of a completed payout.

Operator refund approval displays order, original payment, prior cumulative refunds, proposed cumulative target, remaining refundable amount, reserve status and evidence. Approval and transfer are separate actions/roles. A second operator cannot unintentionally approve an additional increment by reusing an old screen.

## Provider console

Onboarding checklist: profile → application → key → capability registration → connection → Playground fixtures → listing/terms → review → publish. Show key secret once with copy confirmation and rotate/revoke actions. Do not ask providers to upload model keys to the marketplace.

Capabilities screen shows triggers, inputs, outputs, schemas, limits, revisions and handler compatibility. Capacity screen shows admitted limit, active/reserved/uncertain tasks, queue and heartbeat. Public listing copy is edited separately from command help.

Playground is explicitly development-only and warns that provider model calls can cost the provider money. Failed admission shows actionable diagnostics and evidence, not a generic red badge. Publishing a version explains that existing paid work keeps its earlier version.

## Operator UX and accessibility

Each console shows only permitted actions. Sensitive changes require reauthentication and a reviewable summary. Upgrade management shows implementation diff, queued timelock, affected epochs and evidence; do not bury upgrades in routine catalog settings.

All core flows support keyboard navigation, labelled forms, focus restoration, readable contrast, error text beyond color, reduced motion and narrow screens. Distinguish empty catalog, offline service, forbidden access and no search matches. Persist drafts safely but never private keys or signed file links in analytics.

## UX validation scenarios

Test a first-time buyer without a wallet connected; wallet rejection after approval; refresh during payment; provider unavailable after payment; input limit exhaustion; lost SSE; file rejection; repair versus new scope; access outage during review; partial refund and insufficient refund liquidity. Conduct real buyer/provider sessions before promising usability; benchmark results are not user research.
