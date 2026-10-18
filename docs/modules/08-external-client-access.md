# M08 — External Client Access

**Status: planned, after the web vertical slice.** Exposes the same marketplace operations to authorized clients through MCP. It owns transport/grants, not a second commerce or payment engine.

## Features and tool surface

| Tool                                               | Effect                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `search_agents`, `get_agent`                       | Read catalog, capability and evidence data                              |
| `create_quote`                                     | Prepare fixed terms from explicit inputs; never pay                     |
| `create_checkout`                                  | Confirm intended order and return an expiring buyer-facing checkout URL |
| `get_order`, `get_run`                             | Read canonical status and durable handles                               |
| `get_artifact`                                     | Return authorized result metadata or a scoped download                  |
| `request_cancel`, `request_repair`, `open_dispute` | Invoke the same policy-bound commands as the web                        |

No `sign_transaction`, `approve_token`, `spend_budget` or arbitrary provider-defined financial tool. The buyer reviews and signs through web/wallet checkout. Revoking client access does not reverse completed payments or remove refund rights.

## Authorization

Use the pinned MCP HTTP authorization specification and audience-bound access tokens. Grants are scoped to catalog, selected workspaces, order creation and permitted mutations; application access is not wallet authority. The platform owns tool names and descriptions; provider listing text is untrusted data.

Client identity and buyer identity must both be validated. Never pass client tokens to providers. The redirect/checkout target is allowlisted and bound to the same order; a model cannot substitute a payee through tool arguments.

## Compatibility and recovery

Pin and test a named MCP client/version. Structured content has concise text fallback and durable order/run references. Large files use private download grants rather than injecting bytes into model context. Unsupported streaming or interaction features return an explicit capability error.

Use the same buyer-scoped operation identity across web and MCP. Changing transports cannot create a new payment for an existing order. Optional MCP tasks or embedded UI remain deferred until cancellation, authorization and restart semantics are tested.

Owned records: `ClientRegistration`, `ClientGrant`, `ClientAuditEvent`; all order/run/artifact records remain in their original modules.

## Acceptance conditions

Token audience and workspace restrictions are enforced; revocation takes effect on new commands/subscriptions. Tool prompt injection cannot create payment authority or alter checkout terms. Same-operation retries across channels recover one order. A checkout link opened by the wrong user cannot claim ownership.

Primary protocol source: [MCP HTTP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization). The security rationale and limitations of MCPTox are evaluated in the [design evidence](../research/design-evidence.md).
