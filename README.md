# AgentNe — product and system specification

A marketplace for hiring provider-operated AI agents. Buyers purchase bounded work; providers retain their code, prompts, model credentials and infrastructure.

**vNext design · 2026-10-18 · Not implemented.** This documentation specifies the intended product. APIs, events, contract functions and screens are proposed interfaces, not claims about the existing prototype.

## Reading order

1. [Product scope and decisions](docs/product/scope.md).
2. [Business workflows](docs/business-workflows.md) and [user experience](docs/product/ux.md).
3. [Architecture and ownership](docs/architecture.md).
4. [Agent capabilities and capacity](docs/protocols/agent-capabilities.md), then [events and streaming](docs/protocols/agent-events.md).
5. [Verification and production gates](docs/verification.md).
6. [Research supporting the design](docs/research/design-evidence.md) and [technical sources](docs/research/technical-sources.md).

## Modules

| Module                                                                              | Planned responsibility                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [M01 Identity and Access](docs/modules/01-identity-and-access.md)                   | Application identity, wallet binding, roles and authorization              |
| [M02 Workspace and Conversation](docs/modules/02-workspace-and-conversation.md)     | Briefs, addressed conversations, inputs and interaction                    |
| [M03 Commerce and Pricing](docs/modules/03-commerce-and-pricing.md)                 | Fixed pricing, immutable quotes, orders and consent                        |
| [M04 Jobs and Provider Execution](docs/modules/04-jobs-and-provider-execution.md)   | Gateway, admission, capacity, runs, attempts and recovery                  |
| [M05 Artifacts and Verification](docs/modules/05-artifacts-and-verification.md)     | Outputs, checks, delivery, acceptance and retention                        |
| [M06 Central Payments and Refunds](docs/modules/06-central-payments-and-refunds.md) | Direct payment router, treasury refunds, accounting and upgrade governance |
| [M07 Provider Publishing](docs/modules/07-provider-publishing.md)                   | Listings, capability manifests, admission and version rollout              |
| [M08 External Client Access](docs/modules/08-external-client-access.md)             | MCP access, scoped clients and shared checkout                             |
| [M09 Reputation and Operations](docs/modules/09-reputation-and-operations.md)       | Reviews, disputes, incident response and recovery                          |

## Design changes

The user-selected payment model is **direct upfront payment with subsequent refunds**, using a central upgradeable business contract. Per-user smart accounts, account factories, delegated spending and x402 facilitators are removed from the target design. A proxy, implementation, timelock and multisig are infrastructure for that central contract, not accounts deployed per buyer.

The proposed recipient is the platform treasury; provider payouts are separate. This recipient and commercial seller model still need product approval. Funds are not escrowed and refunds are not guaranteed by the original transfer. The design makes refund funding and failure states explicit.

“Production-ready” is a set of required evidence, not a property established by adding a proxy. No code, deployment, migration or payment enablement is included in this documentation task.

## Existing prototype

- [Backend](apps/backend/README.md), [frontend](apps/frontend/README.md), [contracts](packages/contracts/README.md) and [provider SDK](packages/provider-sdk/README.md) describe the existing prototype and may differ from vNext.
- Implementation must begin with an explicit prototype-to-spec gap assessment. Do not infer that these proposed endpoints already exist.
