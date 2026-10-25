# Payvoke x402 adapters

Uses the published `@x402/core@2.28.0` artifact, matching the source version studied
at revision `faa1c694c66a3732aaabbce93bdae140e521a67d`. Wire rules follow
`docs/specs/02-x402-and-vault.md`, not the built-in EVM `exact` scheme.

Implemented:

- Strict canonical EIP-712 quote decoding and snapshot/root consistency checks.
- Server scheme with atomic USDC prices, capability checks and `upfront` only.
- Client scheme signing `DebitAuthorization` with a local grant signer, not the
  SIWE identity. It rejects mismatched requirements, expired quotes, spend-cap
  violations and untrusted resource URLs/methods through the core client hook.
- Authorization persistence callback must complete before a payload is returned.
  The caller must persist idempotently and reuse that record on network retries.
- `readPaymentIntent` checks persisted quote consistency, strict envelope fields,
  resource/method, canonical authorization integers and EOA signature integrity.
  A recovered signer is not proof of active onchain grant ownership.

Register `VaultClientScheme` with `x402Client` from `@x402/core/client`. Supply an
already approved quote, the authenticated buyer, configured vault/resource URL,
grant signer/ID/epoch, explicit atomic spend cap and durable `persist` callback.
Do not derive trusted configuration from a 402 response. Verify the command's
approved input schema hash and the user's intended session/command/arguments
before approving the quote. No HTTP auto-retry/redirect wrapper is provided.

`@payvoke/x402/facilitator` provides the SDK scheme adapter; the backend hosts it
behind service authentication. Both verify and settle call the supplied
authoritative validator directly, not security hooks. Verify returns only a
preview. Without an execution service, settle validates then throws
`settlement_unavailable` (HTTP 503). The backend can explicitly supply its durable
settlement service; the adapter remains key/Prisma-free.

`@payvoke/x402/chain` provides `VaultChain`: startup deployment checks, pinned-block
grant/balance/cap validation, exact reserveHold simulation and canonical block-hash
recheck. `VaultChain.fromRpc` adapts a raw EIP-1193 request function, allowing local
Hardhat tests to reuse the production reader across different viem peer trees.
The backend production factory fixes Fuji/USDC; alternate deployments are supplied
explicitly only by the isolated local-contract test harness.

`@payvoke/x402/settlement` validates finalized transaction/receipt/event/hold
evidence and distinguishes confirming, finalized revert, executable hold and
non-executable paid hold. The backend owns signing, gas budgets, journal and
atomic HELD/ready persistence. No public facilitator or `exact` fallback exists.
No preview reserves funds or guarantees future execution. Fuji deployment/E2E
and provider delivery are not part of the local settlement milestone.

SDK interoperability and signing tests currently run in the backend integration
suite: `pnpm --dir tests/payments-e2e test`. Typecheck: `pnpm --dir packages/payvoke-x402 typecheck`.
