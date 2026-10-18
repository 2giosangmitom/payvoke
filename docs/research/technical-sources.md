# Technical sources and adopted boundaries

Checked on 2026-10-18 using primary documentation. These sources describe primitives/protocols; the marketplace policy and composition remain proposed design decisions. Pin concrete package versions and test compatibility during implementation.

| Source                                                                                              | What it supports                                                       | What this design must still prove                                                      |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [OpenZeppelin proxy reference](https://docs.openzeppelin.com/contracts/5.x/api/proxy)               | ERC-1967/UUPS structure and upgrade authorization distinction          | Correct deployed proxy/implementation pairing, custody and secure authorization        |
| [Writing upgradeable contracts](https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable) | Initializers, implementation locking and storage-layout restrictions   | Safe initialized deployment and populated-state migrations                             |
| [OpenZeppelin access control](https://docs.openzeppelin.com/contracts/5.x/access-control)           | Role/timelock building blocks                                          | Multisig threshold, delay, emergency powers, recovery and operator separation          |
| [SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20)                            | ERC-20 call wrappers                                                   | Exact token receipt, allowed token behavior and treasury liquidity                     |
| [OpenZeppelin utilities](https://docs.openzeppelin.com/contracts/5.x/api/utils)                     | Reentrancy and pause primitives                                        | Correct integration and chain compatibility; no automatic coverage guarantee           |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712)                                                   | Typed signing and domain separation; replay protection is not included | One-order identity, expiry, epochs, cumulative refund semantics and UI binding         |
| [AG-UI event reference](https://docs.ag-ui.com/concepts/events)                                     | Run/text and other event families                                      | Pinned subset, authorization, durable acknowledgment and marketplace lifecycle mapping |
| [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)   | HTTP authorization and resource-bound access                           | Named client compatibility, per-workspace scopes and wallet checkout separation        |

UUPS with a timelock is a selected design proposal, not a claim that it is always safer than every alternative. AG-UI is used at the presentation boundary; it does not define payment, artifact acceptance or refund authority. MCP access does not give an LLM spending permission.

arXiv sources are reviewed separately in the [design evidence](design-evidence.md), with pinned versions, reading scope and concrete requirements and tests.
