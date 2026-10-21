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

This is not a complete payment integration. The private facilitator, durable
settlement worker, grant/balance preview and finality/recovery gate are not
implemented here. There is no public facilitator or `exact` fallback.

SDK interoperability and signing tests currently run in the backend integration
suite: `pnpm --dir apps/backend test`. Typecheck: `pnpm --dir packages/payvoke-x402 typecheck`.
