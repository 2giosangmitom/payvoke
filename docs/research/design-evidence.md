# Research supporting the design

Primary arXiv sources used by the current specification, reviewed on 2026-10-18. Selected relevant fulltext sections and pinned versions were checked; experiments were not reproduced. These findings inform requirements and tests, not production certification.

| Source                                            | Applied requirement                                                       | Verification gate |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ----------------- |
| AgentDojo                                         | Test useful completion and unauthorized effects under malicious input     | V13               |
| A Formal Analysis of Agent Payment Protocols      | Bind payment to terms and preserve one operation across retries           | V02, V04, V09     |
| Signing the Transaction but Not the Decision      | Bind checkout to the displayed scope, amount and economic recipient       | V02, V14          |
| SoK: Decentralized Agent Economic Infrastructure  | Use output evidence in delivery, refund and payout decisions              | V08, V10          |
| Authority-Inference Separation in Agentic Finance | Enforce financial authority independently of model output                 | V03, V13          |
| τ-bench                                           | Test repeated useful execution and required process steps                 | V05, V06          |
| MCPTox                                            | Reject metadata-driven tool and parameter substitution in external access | V13, V15          |

Gate definitions are in [verification](../verification.md). Product-specific tests below are adaptations of the findings, not results demonstrated for this marketplace.

## AgentDojo — 2406.13352v3

**Verified title/version:** _AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents_, v3, 2024-11-24. Read the [version-specific abstract and history](https://arxiv.org/abs/2406.13352v3), and [fulltext v3](https://arxiv.org/html/2406.13352v3) §3.1 on state/user/injection tasks, §3.4 on metrics, and §4.3, including tool-isolation limitations.

**Finding and limits:** M02 correctly motivates measuring both useful completion and unauthorized effects. Filtering tools can still fail when an allowed tool can accomplish the attacker's objective. The paper does not establish that provenance labels or separated context provide complete protection.

**Design/test use:** inject instructions into listings and provider results; measure benign utility, utility under attack and attacker success separately. Verify that legitimate work remains possible without cross-workspace reads, expanded capabilities or unauthorized router payments/refunds. Blocking every action is not a successful usability-preserving defense. These product scenarios extend the benchmark; they are not tested marketplace guarantees.

## A Formal Analysis of Agent Payment Protocols — 2609.00060v1

**Verified title/version:** _A Formal Analysis of Agent Payment Protocols_, v1. Read the [abstract](https://arxiv.org/abs/2609.00060v1) and [version-labelled fulltext](https://arxiv.org/html/2609.00060v1) §III-A/B, §VI-C _Complete Terms Binding_, VI-D _Single Payment, Single Effect_, VI-E _Pay–Service–Compensation Correspondence_, and §VII limitations.

**Finding and limits:** an MPP retry after a lost response can duplicate accounting; the described repair atomically records request key, cost and result. An ACP schema witness lacking idempotency is a different evidence class from a production exploit. The paper also links payment to recoverable service entitlement. M03/M06's durable identity and authorization/effect claims are appropriate if formal traces, schema witnesses and runtime PoCs remain distinguished.

**Design/test use:** bind buyer, order, quote commitment, token, chain, router and treasury recipient to authority. Recover the same operation after a lost response or web/MCP retry. Test one payment effect being claimed by two orders and service failure after payment. The latter requires an explicit, separately funded refund path; a compensation correspondence is not proof that treasury liquidity exists or transfers are reversible.

## Signing the Transaction but Not the Decision — 2609.11757v1

**Verified title/version:** _Signing the Transaction but Not the Decision: Whisper Attacks and a Binding Defense for AP2_, v1. Read the [abstract](https://arxiv.org/abs/2609.11757v1) and [version-labelled fulltext](https://arxiv.org/html/2609.11757v1) §5/§§5.1–5.4, §7.6 and the start of §7.7.

**Finding and limits:** A-VIP binds credentials to sessions, carts to displayed snapshots, payees and mandate chains. Structural binding does not detect manipulated choices that still match the listing: §7.6 reports **0/68 Selection Whisper carts blocked**. M03's caveat is justified; AP2 results do not establish x402 defects. A faithful snapshot does not establish fair pricing or a choice aligned with the user's intentions.

**Design/test use:** display the pinned variant, scope, total, treasury recipient and refund terms before approval. Test substituted variants, added fees, changed recipients and approval reused for another order. Distinguish the router address, immediate treasury recipient and eventual provider payout beneficiary. A common router must not conceal a changed economic destination. Snapshot binding still needs semantic review and usability testing.

## SoK: Decentralized Agent Economic Infrastructure — 2610.01756v1

**Verified title/version:** _SoK: Decentralized Agent Economic Infrastructure_, v1. Read the [abstract](https://arxiv.org/abs/2610.01756v1) and [version-labelled fulltext](https://arxiv.org/html/2610.01756v1) §§II-A–C, V-A–D and the beginning of VI.

**Finding and limits:** valid approval alone does not prove task conformance; evidence must actually constrain downstream economic decisions. A correct but unavailable verifier can also prevent payment for conforming work. M05's distinction is useful, but controlled/local-EVM experiments do not certify this product or resolve subjective quality disputes.

**Design/test use:** because buyer payment precedes delivery, output evidence cannot be a prerequisite for that already-completed transfer. Bind evidence instead to delivery acceptance, refund decisions and separate provider payout eligibility. Test substituted artifacts, receipts for another task, evaluator unavailability and competing refund/payout decisions. Define a recovery authority and funded compensation path. Do not describe the router as holding money until acceptance.

## Authority-Inference Separation in Agentic Finance — 2608.30519v1

**Verified title/version:** _Authority-Inference Separation in Agentic Finance: First-Line Control, Blockchain Enforcement, and Replayable Assurance_, v1. Read the [abstract](https://arxiv.org/abs/2608.30519v1) and [version-labelled fulltext](https://arxiv.org/html/2608.30519v1) Table 2, §4.2, the start of §4.3, §7.2/Table 8 and §7.3.

**Finding and limits:** independent deterministic control grants authority bound to exact intent, expiry and nonce; execution adapters must enforce it. The prototype's **0/36 unauthorized effects** concerns fixed fixtures, not a real-world safety rate. Settlement receipts do not prove delivery. M06's separation is appropriate, but the prototype does not establish production enforcement or require personal smart accounts.

**Design/test use:** agents propose; policy grants capabilities; the router/payment worker enforces them. Link events to intent and evidence; expose actionable denial reasons. Test stale policy, replay, recipient/route substitution and bypass paths. For the upgradeable router, explicitly test whether implementation or configuration changes invalidate assumptions in outstanding grants. That upgrade concern is an audit proposal, not a theorem supplied by this paper.

## τ-bench — 2406.12045v1

**Verified title/version:** _τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains_, v1, 2024-06-17. Read the [abstract/version history](https://arxiv.org/abs/2406.12045v1) and [fulltext v1](https://arxiv.org/html/2406.12045v1), §3 Task instances/Reward/Pass^k passages, domain passages, §4.2 and §6.

**Finding and limits:** M07 appropriately emphasizes final-state checks and repeated trials. `pass^k` requires all trials to succeed; `pass@k` requires at least one. **A successful reward can still coexist with a violated user-confirmation requirement.** Final-state correctness therefore does not prove process compliance. Simulated users are not real usability evidence.

**Design/test use:** admission fixtures check final state and event order: consent before payment, confirmed upfront payment before dispatch, and authorized refund/payout decisions. Reconnect must not create another operation. Record configuration, sample size and repeated-trial consistency separately from best-of-many success. Do not grant a capability badge based on a single favorable run.

## MCPTox — 2508.14925v1

**Verified title/version:** _MCPTox: A Benchmark for Tool Poisoning Attack on Real-World MCP Servers_, v1, 2025-08-19. Read the [abstract/version history](https://arxiv.org/abs/2508.14925v1) and [fulltext v1](https://arxiv.org/html/2508.14925v1) §§3.1–3.2, §4.4 failure-mode passages and §5. The cited v1 was used, not v2.

**Finding and limits:** malicious metadata can redirect an agent into using a legitimate tool with harmful actions or parameters even if the malicious tool never executes. Single-turn evaluation and human-guided, semi-automated payloads limit coverage. M08's motivation is sound, but the effectiveness of platform-controlled metadata is not evaluated as a defense in this paper.

**Design/test use:** poison listings to substitute quote IDs, workspace, treasury recipient or price ceiling; enforce the pinned quote and principal's authority server-side. Tool allowlisting alone is insufficient. UX must distinguish declared provider capability from granted execution authority; descriptive text cannot add financial tools or authorize refunds.
