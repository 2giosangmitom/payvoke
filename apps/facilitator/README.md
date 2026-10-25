# Facilitator

Private x402 facilitator, deployed separately from the API. It does not register
Better Auth, browser CORS or paid gateway routes. Every x402 facilitator route
(supported/verify/settle) requires `Authorization: Bearer <service token>`
using `@fastify/bearer-auth`. Keep it on loopback/private networking; use TLS for
remote transport. Rate limits are process-local and bodies are limited to 8 KiB.

```sh
cp .env.example .env
# Fill in the service token shared with the API, the runtime DB and approved deployment values.
pnpm --filter facilitator dev
```

Do not point a test at Neon. The implementation tests use mock RPC plus isolated
PGlite/Docker PostgreSQL; local vault integration uses Hardhat's simulated EVM.
No Fuji deployment, funding or external-chain transaction is performed by tests.

The facilitator needs only the public `RELAYER_ADDRESS`, not its private key.
It does not need `WEB_ORIGIN`/`BETTER_AUTH_SECRET`. Use a random service token of
at least 32 bytes (e.g. `openssl rand -base64 32`), independently of the browser
auth secret. The server checks Fuji chain ID, fixed USDC/6 decimals, relayer role,
active DB policy, deployment caps and `EXPECTED_VAULT_CODE_HASH` before listening.
The codehash must describe the approved **deployed runtime**, including constructor
immutables, not an unpatched compiler artifact template.

`@payvoke/x402/chain` owns the reusable viem reader and `@payvoke/x402/facilitator`
implements `SchemeNetworkFacilitator`. New admission reads grant/signer/epoch,
balance, pause/role, fees/deadlines and spending caps at one numbered block,
simulates exact `reserveHold` calldata from the configured relayer with no value,
then checks that block's hash again. Fixed-period counters use chain timestamp;
cap comparisons avoid unsigned subtraction underflow. RPC failures/reorgs are
retryable infrastructure errors, not "insufficient funds".

Before new admission, persisted requirements must exactly match the frozen
quote. The recovered EOA must match the onchain grant signer. Buyer suspension,
session ownership and product availability are checked again. Existing matching
holds bypass new-admission expiry/revocation/pause gates, but are only classified
as observations: **this does not establish finality or a successful receipt**.
An unresolved attempt requires reconciliation; an orphan hold or inconsistent
journal requires recovery. Neither path creates a replacement operation.

Verify is read-only. A valid result contains `extra.admission="preview"`, a
classification and observed block metadata; no nonce/intent/lane is reserved.
Settle defaults to validation-only: valid previews return HTTP 503
`settlement_unavailable`. With explicit `SETTLEMENT_ENABLED=true`, new submissions
are independently validated and durably journaled. Existing intents are bound to
the same quote/authorization before reading their prior state, without applying
new-admission expiry/grant checks again. Neither HTTP process signs or broadcasts.
When execution mode is enabled, startup tolerates missing relayer role for receipt
recovery; the role is still mandatory on every new-admission validation.

The pinned `HTTPFacilitatorClient` accepts the supported and verify results.
A 503 JSON error without `success` is a transport exception in core 2.28.0, not a
`SettleResponse` or payment receipt. This behavior is covered through SDK HTTP
calls routed into `Fastify.inject()`. Core's HTTP orchestration may synthesize an
empty-transaction failure receipt from a transport error; the gateway explicitly
discards it, never forwards exception text, and returns a retryable status with
`Location` instead. Known broadcast/UNKNOWN transactions use the SDK's pending
receipt and 402 response, not another charge. Core's automatic settle retry reads
the same operation. A finalized success returns 202 with `PAYMENT-RESPONSE`;
`beforeHandlerSettlement` is echoed without settling a second time.
