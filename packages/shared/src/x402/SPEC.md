# Scheme: `payvoke-escrow` on EVM

## Summary

`payvoke-escrow` is an x402 v2 payment scheme for paid work that is not delivered in
the same HTTP response: a job an AI agent runs for minutes or hours. It keeps the
standard x402 round trip (`402 PAYMENT-REQUIRED` → sign → retry with
`PAYMENT-SIGNATURE`), but the payment does not go to the seller. It goes into a
per-job escrow hold in `PayvokeVault`. The hold is released to the seller when the
work is delivered on time, and refunded to the buyer when it is not.

The client signs once per job. That signature is bound to one immutable quote and
can only fund that quote.

| Field          | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| x402 version   | 2                                                                                   |
| Scheme         | `payvoke-escrow`                                                                    |
| Scheme version | `"2"` (`extra.schemeVersion`)                                                       |
| Network        | `eip155:43113` (Avalanche Fuji)                                                     |
| Asset          | Circle USDC (FiatToken v2.2), `0x5425890298aed601595a70AB815c96711a31Bc65`          |
| `payTo`        | the `PayvokeVault` contract, never the seller                                       |
| Payment flow   | `upfront`: the hold is final before the resource answers                            |
| Reference code | `packages/shared/src/x402/index.ts`, `client.ts`, `facilitator.ts`, `settlement.ts` |

## Use case, and how it differs from `exact`

`exact` is built for a resource that is delivered in the response: an article, an API
call, a file. The client signs a transfer, the facilitator settles it, the server
answers. If the server then fails, the money is already with the seller. There is no
refund in the protocol.

An AI agent job is different:

- The result arrives later, after the HTTP request is over.
- The job can fail, time out or be late.
- The buyer is often another AI agent, which cannot chase a refund by email.

`payvoke-escrow` answers that with three changes:

1. **Destination.** `payTo` is the vault. Funds sit in a hold keyed by the job.
2. **Binding.** The signature commits to a full EIP-712 quote: buyer, seller, agent,
   command version, input hash, terms hash, policy hash, price, fee and four
   deadlines. Nothing in the quote can change after signing.
3. **Lifecycle.** The hold has exactly three exits: release to the seller, refund to
   the buyer, or reclaim by the buyer after the resolution deadline.

## PaymentRequirements

A resource server builds one `PaymentRequirements` per quote with
`paymentRequirements(document)`. Every field is derived from the persisted quote
document. Nothing is computed per request.

```json
{
  "scheme": "payvoke-escrow",
  "network": "eip155:43113",
  "asset": "0x5425890298aed601595a70AB815c96711a31Bc65",
  "amount": "500000",
  "payTo": "0xc8d77919e1D9A473eB8D45C729613943eaF6f034",
  "maxTimeoutSeconds": 300,
  "extra": {
    "schemeVersion": "2",
    "paymentFlow": "upfront",
    "vault": "0xc8d77919e1D9A473eB8D45C729613943eaF6f034",
    "invocationId": "inv_…",
    "quoteId": "qt_…",
    "quoteDigest": "0x…",
    "quote": { "invocationKey": "0x…", "…": "19 InvocationQuote fields" },
    "funding": ["authorization", "grant"],
    "eip3009": {
      "primaryType": "ReceiveWithAuthorization",
      "name": "USD Coin",
      "version": "2",
      "validAfter": "0",
      "validBefore": "1763200000",
      "nonce": "0x…"
    }
  }
}
```

| Field                 | Meaning                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `amount`              | The quote's `grossAmount`, atomic USDC (6 decimals). The buyer pays exactly this; the fee comes out on release.       |
| `payTo`               | The vault address. A client must refuse a `payvoke-escrow` requirement whose `payTo` is not the vault it trusts.      |
| `maxTimeoutSeconds`   | The quote lifetime. After `quote.validUntil` the signature can no longer fund anything.                               |
| `extra.schemeVersion` | `"2"`. Server, client and facilitator must all agree.                                                                 |
| `extra.paymentFlow`   | `"upfront"`. The hold is settled and finalized before the resource is served.                                         |
| `extra.vault`         | Same as `payTo`. Also the `verifyingContract` of the quote's EIP-712 domain (`PayvokeVault`, version `2`).            |
| `extra.invocationId`  | The job id. `quote.invocationKey = keccak256("payvoke:invocation:" + invocationId)` and becomes the hold id.          |
| `extra.quoteId`       | The quote id. `quote.quoteKey = keccak256("payvoke:quote:" + quoteId)`.                                               |
| `extra.quoteDigest`   | EIP-712 hash of `quote` under the vault domain. Used as the EIP-3009 nonce and in the grant debit.                    |
| `extra.quote`         | The `InvocationQuote` struct, every integer as a canonical decimal string (`WireQuote`).                              |
| `extra.funding`       | The payload kinds the server accepts: `authorization` and `grant`.                                                    |
| `extra.eip3009`       | The exact `ReceiveWithAuthorization` parameters for the `authorization` kind. `to` is the vault, `value` is `amount`. |

`InvocationQuote` fields: `invocationKey`, `quoteKey`, `buyer`, `usageSessionKey`,
`productKey`, `productVersion`, `commandKey`, `inputHash`, `termsHash`, `policyHash`,
`provider`, `asset`, `grossAmount`, `feeBps`, `feeRecipient`, `validUntil`,
`deliveryDeadline`, `releaseNotBefore`, `resolveBy`.

The quote is per buyer: `quote.buyer` is the buyer's wallet, so a 402 challenge is
only issued to an authenticated buyer.

### The PAYMENT-REQUIRED response

The base64 `PAYMENT-REQUIRED` header carries the standard x402 v2 `PaymentRequired`,
with no extensions:

- `resource.url` is the URL the quote is paid at (see below), with `method: "POST"`.
- `accepts` holds the single requirement above.

The JSON body repeats that object. When the client may not have seen the quote yet
(an instant command, `POST /v1/x402/apps/:appId/commands/:command`), the body also
carries `extensions.payvoke.quote`: the full quote document (snapshots of input,
terms and policy, plus their hashes). Headers have size limits, so the document
never goes in the header. A chat quote's `402` (`POST /v1/invocations`) has no
extension, because the buyer already received the document from `POST /v1/quotes`.

A client reading the quote from the body must check that the body without
`extensions` equals the header, then recompute every hash and the quote digest
before signing (`readChallenge` and `validateQuoteDocument`).

### Resource binding

Terms snapshot version 3 stores the paid URL as `termsSnapshot.resource`
(`quoteResource(document)`). It is part of the terms hash, so it is covered by the
quote digest the buyer signs. A quote is paid only at that URL: a request for it at
another URL is answered `409 QUOTE_RESOURCE_MISMATCH`, and a payment envelope naming
another `resource.url` is refused. The URL must have the deployment's own origin.
Version 2 terms have no `resource`; those quotes are paid at the deployment's
`/v1/invocations`.

## PaymentPayload

The `PAYMENT-SIGNATURE` header is base64 of this JSON:

```json
{
  "x402Version": 2,
  "accepted": { "…": "the PaymentRequirements above, byte for byte" },
  "resource": { "url": "https://api.example/v1/…", "method": "POST" },
  "payload": { "kind": "authorization", "signature": "0x…" }
}
```

No other envelope keys are allowed. `accepted` must equal the server's requirement
for this quote (canonical JSON comparison).

### Kind `authorization`

The buyer's own wallet signs USDC `ReceiveWithAuthorization` (EIP-3009) under the USDC
domain (`USD Coin`, version `2`, chain 43113, the USDC contract):

| Field         | Value               |
| ------------- | ------------------- |
| `from`        | `quote.buyer`       |
| `to`          | the vault           |
| `value`       | `quote.grossAmount` |
| `validAfter`  | `0`                 |
| `validBefore` | `quote.validUntil`  |
| `nonce`       | `quoteDigest`       |

```json
{ "kind": "authorization", "signature": "0x…" }
```

The signature may be a 65-byte EOA signature (low-s, `v` 27/28) or an ERC-1271 /
ERC-6492 contract-wallet signature. Its validity is checked against the chain.
The buyer pays no gas.

`ReceiveWithAuthorization`, unlike `TransferWithAuthorization`, can only be redeemed
by the payee (`to`) itself. Only the vault can submit it, so a third party cannot
front-run it into a plain transfer.

### Kind `grant`

For AI assistants that pay without a wallet prompt. The buyer has set a spending
grant on the vault (`setGrantWithSig`, with an allowance). The grant's signer key
signs an EIP-712 `DebitAuthorization` under the vault domain:

```json
{
  "kind": "grant",
  "authorization": { "quoteDigest": "0x…", "grantId": "0x…", "grantEpoch": "1" },
  "signature": "0x…"
}
```

`authorization.quoteDigest` must equal `extra.quoteDigest`. The vault enforces the
grant's per-call, per-period and total limits, its expiry, revocation and epoch.

## Verification

A facilitator (`VaultFacilitatorScheme.verify`) must check, in order:

1. Envelope: `x402Version` is 2, keys are exactly `x402Version`, `accepted`,
   `resource`, `payload`; `scheme`, `network` and `extra` are present.
2. Quote: the persisted quote document still validates (`validateQuoteDocument`):
   every snapshot hash, the deadlines, the fee cap, and that the recomputed
   quote digest equals `extra.quoteDigest`.
3. Requirements: `accepted` equals `paymentRequirements(document)` exactly.
4. Resource: `resource.url` equals the quote's paid URL (`paymentResource`:
   `termsSnapshot.resource`, or `/v1/invocations` for version 2 terms) and `method`
   is `POST`.
5. Payload shape: `kind` is `authorization` or `grant` with exactly the keys above;
   a grant debit recovers to an address (the recovered signer is not trusted yet).
6. Account: the buyer is not suspended, the wallet belongs to the authenticated
   account, the buyer is not throttled, and no other open quote holds the thread.
7. Chain: simulate `fundWithAuthorization` or `fundWithGrant` against the vault at
   the latest block. This checks the signature, balance, allowance, grant limits,
   quote expiry and pause state where they are actually enforced.

A failure returns `isValid: false` with a snake_case `invalidReason` (see
[Error codes](#error-codes)). Verification never moves money.

## Settlement

Settlement is `upfront`: the hold must be final on chain before the server answers
with the resource.

1. The facilitator journals the payment intent (the signed payload) in the database.
   One intent per invocation; a different signature for the same invocation is
   `invocation_conflict`.
2. A settlement worker holding the vault's `RELAYER_ROLE` key calls:
   - `fundWithAuthorization(quote, signature)`: the vault calls USDC
     `receiveWithAuthorization(buyer, vault, gross, 0, validUntil, quoteDigest, sig)`.
   - `fundWithGrant(quote, debit, signature)`: the vault checks the grant and pulls
     `gross` with `transferFrom` from the buyer's allowance.
     The relayer pays the gas.
3. The vault opens the hold `holdId = quote.invocationKey` and emits
   `HoldFunded(holdId, buyer, quoteDigest, authorizationDigest, gross, source)`.
   A repeated call with the same authorization returns the existing hold.
4. The worker waits until the transaction's block is **finalized**, then checks the
   receipt, the single matching `HoldFunded` log and the stored hold (amounts, fee,
   deadlines, source, grant id). Only then is the operation `HELD`.

While the hold is not final, the resource answers
`202 { invocationId, paymentStatus: "PENDING", nextActions: ["poll"] }` with
`Retry-After: 5` and `Location` pointing at the job's status, plus a
`PAYMENT-RESPONSE` carrying the funding transaction hash once it is broadcast. It
never answers `HELD` before finality. A `402` is only used for the challenge and for
a payment refused at verification. A funding transaction the vault rejected is
`422` (`paymentStatus: "REJECTED"`); every other unsettled state is `503` with
`Retry-After`.

### PAYMENT-RESPONSE

Once the hold is final the server answers `202` with `paymentStatus: "HELD"` and a
base64 `PAYMENT-RESPONSE` header (x402 `SettleResponse`):

```json
{
  "success": true,
  "transaction": "0x…funding tx hash",
  "network": "eip155:43113",
  "payer": "0x…buyer",
  "amount": "500000",
  "extra": {
    "schemeVersion": "2",
    "fundingMode": "authorization",
    "invocationId": "inv_…",
    "quoteId": "qt_…",
    "holdId": "0x…invocationKey"
  }
}
```

`holdId` is the key for `PayvokeVault.getHold(holdId)`. The same receipt is returned
by every replay of the same submission and by the job status endpoint.

## Release, refund and reclaim

After `HELD`, the resource is served (the agent receives the job). The hold then
closes in one of three ways. None of them needs the buyer to sign again.

| Exit    | When                                                                                    | Vault call                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Release | Verified delivery before `deliveryDeadline`, after `releaseNotBefore` (review window)   | `applyDecision` with `releaseRemainder: true`: seller gets `remaining − fee`, fee recipient gets `fee = remaining × feeBps / 10000` |
| Refund  | Failed, missing or late delivery; a partial refund when the seller signed a late policy | `applyDecision` with `refundAmount > 0` (and `releaseRemainder` for the rest)                                                       |
| Reclaim | No decision by `resolveBy`                                                              | `reclaim(holdId)`, called by the buyer, returns the whole remainder                                                                 |

`applyDecision` takes a `ResolutionDecision` signed by an approver with the
refund or release role, submitted by a different executor key. A release can never
happen before `releaseNotBefore`, and no decision is valid at or after `resolveBy`.
If USDC refuses a transfer (for example a blacklisted address), that amount becomes
`claimable` and its owner withdraws it with `claim(to)`.

## Error codes

Refusals carry a snake_case code. Codes from vault reverts:

| Code                                                                                               | Meaning                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `invalid_signature`                                                                                | Signature does not match the quote, or USDC rejected it |
| `authorization_used`                                                                               | This quote's EIP-3009 nonce is already used             |
| `insufficient_balance`                                                                             | The buyer's USDC balance is below `amount`              |
| `insufficient_allowance`                                                                           | Grant funding without enough vault allowance            |
| `quote_expired`                                                                                    | `validUntil` has passed                                 |
| `grant_not_found`, `grant_revoked`, `grant_expired`, `grant_epoch_mismatch`                        | Grant state                                             |
| `per_call_limit_exceeded`, `period_limit_exceeded`, `total_limit_exceeded`                         | Grant limits                                            |
| `fee_cap_exceeded`, `deadline_invalid`, `invalid_amount`, `invalid_asset`, `invalid_configuration` | Quote outside vault rules                               |
| `invocation_conflict`                                                                              | A different authorization already funds this job        |
| `vault_paused`                                                                                     | The vault is paused for new holds                       |

Codes from the server and facilitator:

| Code                                        | Meaning                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `invalid_request`, `invalid_payment`        | Malformed envelope, requirement or payload                        |
| `quote_not_found`                           | No quote matches the payment                                      |
| `buyer_wallet_mismatch`                     | The quote's buyer is not a wallet of this account                 |
| `account_suspended`                         | The buyer cannot pay                                              |
| `payment_throttled`                         | Three funding reverts within a day pause new payments for an hour |
| `thread_busy`                               | Another quote holds this conversation                             |
| `admission_unavailable`                     | The agent or its thread can no longer take this job               |
| `settlement_pending`                        | Intent journaled, hold not final yet (answered as `202 PENDING`)  |
| `settlement_unavailable`, `rpc_unavailable` | Try again later (`503`)                                           |
| `recovery_required`                         | The operation needs operator reconciliation                       |

## Security considerations

- **Quote binding.** The signed nonce is the quote digest, and the quote commits to
  buyer, seller, agent, command version, input, terms, policy, price, fee and every
  deadline. Changing any of them changes the digest, and the old signature funds
  nothing.
- **Nonce = quote digest.** EIP-3009 nonces are single use per `from`. One quote can
  be funded at most once, and a retry with the same signature returns the same hold
  instead of paying twice.
- **Resource binding.** The quote's terms store the URL it is paid at, inside the
  terms hash and so inside the signed digest. A request or payment envelope for
  another URL is refused, so a signature captured from one endpoint cannot be
  replayed at another.
- **No front-running.** `ReceiveWithAuthorization` can only be redeemed by its payee,
  the vault, and only through `fundWithAuthorization`, which rebuilds every field
  from the quote.
- **No custody.** Buyers keep no balance in the vault and the operator has no
  withdrawal function. The vault holds only open holds and undeliverable payouts
  (`totalHeld + totalClaimable`). Money leaves a hold only to the buyer, the seller
  or the fee recipient fixed in the quote. The fee is capped by the immutable
  `feeCapBps`.
- **Separated keys.** The relayer can only fund holds from signed payloads. Release
  and refund need an approver signature and a different executor. The facilitator
  holds no key.
- **Finality before service.** The agent never starts on an unfinal hold, so a
  reorg cannot leave work done but unpaid.
- **Gates before payment.** Authentication, body validation and ownership checks run
  before the payment gateway. Stock x402 middleware that settles before validating
  the body is not used.
- **The `exact` scheme is never accepted.** A server that offered both would let a
  client skip the escrow.
- **Client checks.** A client must validate the quote document against its own
  trusted vault address, buyer address, resource URL and spend cap before signing.
  It must not infer any of them from the 402 response. `VaultClientScheme` (register
  it with an `@x402/core` `x402Client`) and `x402Pay` in
  `@payvoke/shared/x402/client` do these checks.

## Comparison with `exact`

|                          | `exact` (EVM)                                   | `payvoke-escrow`                                                                    |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| Where the money goes     | Straight to the seller's `payTo`                | Into a per-job hold in `PayvokeVault`                                               |
| What is signed           | `TransferWithAuthorization` with a random nonce | `ReceiveWithAuthorization` with nonce = quote digest, or a grant debit              |
| What the signature binds | Amount, payee, validity window                  | The full quote: agent, command version, input, terms, policy, price, fee, deadlines |
| When it settles          | Before or right after the response              | Before the job starts; the hold must be finalized                                   |
| When the seller is paid  | Immediately                                     | After verified on-time delivery and the review window                               |
| If the work fails        | No refund in the protocol                       | Automatic refund, or buyer reclaim after `resolveBy`                                |
| Who pays gas             | The facilitator                                 | The Payvoke relayer (funding) and executor (settlement)                             |
| Front-running            | Anyone holding the signature can submit it      | Only the vault can redeem it                                                        |
| Agent spending limits    | Not in the scheme                               | On-chain grants with per-call, per-period and total caps                            |
| Good for                 | Content and API calls answered in one response  | Jobs delivered later, which can fail                                                |
