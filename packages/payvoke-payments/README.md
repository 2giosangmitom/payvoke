# @payvoke/payments

Settlement and finance domain shared by the API, facilitator, settlement worker
and ops CLI. No HTTP framework or env loading lives here.

| Export                             | Owns                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `@payvoke/payments/journal`        | intents, fenced leases, attempts and relayer lanes          |
| `@payvoke/payments/validation`     | persisted quote/ownership/journal admission rules           |
| `@payvoke/payments/settlement`     | facilitator settlement service over the journal             |
| `@payvoke/payments/worker`         | signing worker tick and gas policy validation               |
| `@payvoke/payments/scanner`        | finalized hold backfill                                     |
| `@payvoke/payments/finance`        | approved refund/release decisions and delivery observations |
| `@payvoke/payments/finance-ledger` | finalized financial projection and ledger                   |
| `@payvoke/payments/evidence`       | evidence levels and signed-terms evidence floors            |

## Settlement journal

`packages/payvoke-db/prisma/payments.prisma` and its additive Prisma-generated migration introduce
invocations, settlement operations, attempts and relayer lanes. `SettlementJournal`
owns their transactional mutations:

- Store one immutable payment intent per invocation, with quote/authorization
  digests and recovered EOA. This proves local envelope/signature integrity only;
  **it does not prove that the signer owns an active onchain grant**.
- Serialize intent admission with the same session lock used by quote creation.
  Matching replay reads the prior operation before expiry checks; a different
  authorization digest conflicts rather than replacing the operation.
- Claim/renew worker leases with database time and incrementing fencing epochs.
  Stale workers cannot reserve or persist new signed transaction bytes.
- Reserve at most one attempt per operation and one outstanding operation per
  relayer lane. Lane reservations do not expire with worker leases. Nonces are
  discovered by the worker; journal uniqueness alone is not RPC nonce discovery.
- Validate signed EIP-1559 bytes against chain, relayer, nonce, destination,
  zero value, exact `reserveHold` calldata and reserved gas/fees; persist bytes
  and hash before a sender can broadcast them. No replacement/fee bump.
- Preserve bytes/hash through BROADCAST/UNKNOWN. An attempt, even RESERVED, cannot
  be discarded through `rejectUnattempted`. Reconciliation is required instead.

Invocation status reads are authenticated, no-store and free. It exposes payment
and execution status plus known tx hash/finalized receipt, never authorization or
signed bytes. The finality reader supplies evidence to the journal's atomic
HELD/ready transition. Only one `InvocationReady` row can exist per invocation.

## Financial lifecycle after HELD

The additive financial-lifecycle migration adds finalized hold projections, an
immutable event ledger, verifier delivery observations and a separate approved
finance-decision journal/lane. Original settlement state/receipt remains HELD
after refund/payout; invocation status includes a separate `financial`
projection with finalized block evidence. The projection is not spendable credit.

The buyer financial-intents action accepts `{action:"dispute",evidenceHash}`
or `{action:"reclaim"}` after buyer authentication/ownership checks and returns
**UNSUBMITTED** wallet calldata. It does not submit, refund, open an onchain dispute
or claim that a pending ticket has locked payout. Buyer must simulate/sign/send;
the finalized indexer observes wallet transactions independently of this API.

The settlement worker backfills financial events in bounded finalized ranges,
atomically advancing a separate cursor with ledger/projection updates. It checks
per-hold conservation, immutable quote bindings and vault solvency. Financial
contradictions durably block new admission until investigated; successful scans
never silently clear that block. Existing receipts/reconciliation remain readable.

Refund/release requires an immutable EIP-712 approval, independent executor role,
current hold version, proper approver roles and exact simulation. Finance uses
its own dedicated sender lane and gas window; it never takes the relayer key or
automatically signs a new decision. Persisted signed bytes precede broadcast;
only canonical finalized receipt/event evidence releases the lane. A finalized
revert records actual gas without treating the decision as successful.

Release additionally needs a trusted delivery observation whose evidence level
satisfies the quote's signed `terms.verification.minEvidence` (SIGN by default;
REC and WIT are incomparable) and the business review window. Each observation
stores a JCS Evidence Envelope whose hash is the default dispute `evidenceHash`.
Commands and quotes below the active policy's `minGrossAmount` price floor are
rejected. Provider `result`/failure/cancellation is **not** payment authority. There
is no provider-facing endpoint for marking delivery verified, nor automatic payout
or refund policy engine. The internal verifier seam and explicitly enabled manual
attestation support controlled testing while provider execution/output validation
are built. Buyer acceptance never bypasses release timing.

See [`apps/ops/financial-lifecycle.md`](../../apps/ops/financial-lifecycle.md) for
approval/signing/execution commands, state semantics and remaining launch gates.
