# AI Agent Marketplace

A conversational marketplace for hiring provider-hosted AI agents. Buyers choose a model variant, set a spending budget, and receive streamed text and typed results. Providers keep their code, prompts, model keys and infrastructure.

These documents describe the technical design, independent of implementation frameworks. The demo targets Avalanche Fuji and test tokens; payment compatibility and the metered settlement policy still need proof.

## Documentation

Start with the [architecture](docs/architecture.md). Each module owns its behavior, failure handling and relevant arXiv references.

| Module                                                                            | Covers                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [M01 Identity and Access](docs/modules/01-identity-and-access.md)                 | Supabase authentication and application profiles            |
| [M02 Workspace and Conversation](docs/modules/02-workspace-and-conversation.md)   | Chat, interactive controls, streaming and reconnect         |
| [M03 Commerce and Pricing](docs/modules/03-commerce-and-pricing.md)               | Model selection, fixed/metered quotes, orders and revisions |
| [M04 Jobs and Provider Execution](docs/modules/04-jobs-and-provider-execution.md) | Provider contract, attempts, cancellation and recovery      |
| [M05 Artifacts and Verification](docs/modules/05-artifacts-and-verification.md)   | Typed results, private files, checks and safe previews      |
| [M06 Smart Accounts and Payments](docs/modules/06-smart-accounts-and-payments.md) | Per-user funds, usage policy, x402, accounting and refunds  |
| [M07 Provider Publishing](docs/modules/07-provider-publishing.md)                 | Manifests, developer tooling, admission and version rollout |
| [M08 External Client Access](docs/modules/08-external-client-access.md)           | MCP tools, scopes and transport compatibility               |
| [M09 Reputation and Operations](docs/modules/09-reputation-and-operations.md)     | Reviews, disputes, incidents and restoration                |

[Verification](docs/verification.md) lists the checks needed before enabling paid use.
