# Payment acceptance — S01/S02

> Ghi chú 23/10/2026: dùng App/ChatThread/AppCommandRevision thay Product/UsageSession/ProductVersion. Quote document vẫn giữ field dây cũ để tương thích x402.
> Review date: 2026-10-22. Base implementation: `19a11b8`; this working-tree
> update adds crash/race regression proof and a finance receipt-identity fix.
> This is the current evidence matrix, not a claim of launch readiness.
> Update 2026-10-25 (commit `a7b97ec`): re-ran default suites, refreshed the S01
> boundary table for the provider gateway/AG-UI work, and recorded that the full
> backend typecheck now passes. Research cross-check: [S02 §11](specs/02-x402-and-vault.md#11-đối-chiếu-nghiên-cứu-bảo-mật-x402).

Sources: [S01](specs/01-api-and-provider-protocol.md),
[S02](specs/02-x402-and-vault.md), trace IDs from
[test-mapping.md](test-mapping.md). The latter remains the original test design;
its “not implemented” statements are historical. No replacement transactions,
production database, Fuji broadcast or provider dispatch is part of this review.

## Evidence vocabulary

- **Local**: the listed behavior has executable local proof, not every possible
  interleaving or a production security audit.
- **Partial**: a required layer or acceptance condition remains unimplemented or
  unproven. A passing contract test does not prove its HTTP/provider counterpart.
- **Blocked**: needs separately approved external resources or real deployment.

Test sources (relative to the repository root):

- **Q**: `tests/payments-e2e/test/quotes.test.ts` — HTTP/SDK, journal/SQL, settlement
  faults; opt-in real local EVM financial lifecycle/crash tests.
- **V**: `packages/payvoke-vault/contracts/PayvokeVault*.t.sol` and
  `packages/payvoke-vault/test/` — actual vault unit, adversarial, fuzz/invariants.
- **P**: `packages/payvoke-protocol/test/payment.test.ts` — vectors, mutation,
  canonicalization and compiled finance ABI/event parity.
- **A**: `apps/api/test/auth.test.ts` — Better Auth/SIWE/auth boundary.
- **O**: `apps/ops/test/fuji-operations.test.ts` — controlled CLI artifacts,
  exact-hash single-use sends and isolated EVM cleanup (not real Fuji).

Q runs against PGlite by default or isolated schemas on Docker PostgreSQL.
Its EVM cases deploy actual compiled vault + mock USDC into a fresh loopback
Hardhat node with chain ID 43113. RPC failures/inconsistent responses are injected
explicitly; successful transaction hashes/receipts come from that node. No mock
result in these tests is published as a Fuji receipt.

## S02 requirements → owner → proof

| Trace / spec         | Implementation owner                                                           | Executable evidence                                                                                                                                                                                                                                                                                             | Status / remaining gate                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAY-01; §1, §6.3     | `packages/payvoke-x402/src/chain.ts`, `apps/facilitator/src/`, gateway | Q `uses core to build requirements and rejects incompatible facilitator capabilities`, `refuses facilitator readiness…`; O preflight                                                                                                                                                                            | Local deployment validation; approved Fuji policy/code/roles still blocked                                                                                            |
| PAY-02; §3–4         | `packages/payvoke-protocol/src/index.ts`, quote service, SDK                   | P vectors/field mutation/JCS; V hash-vector tests; Q `freezes effective defaults…`, `client rejects altered economics…`                                                                                                                                                                                         | Local; nonempty file/message/brief selection is not implemented                                                                                                       |
| PAY-03; §2, §8.2     | `PayvokeVault.sol` grant/admission                                             | V update/epoch/cap/period/revoke/withdraw ordering tests + stateful invariant; Q actual revoke-after-preview EVM revert                                                                                                                                                                                         | Local chain/SDK; grant UI/global multi-grant explanation not verified                                                                                                 |
| PAY-04; §8, §8.4     | vault deposit/owner withdrawals                                                | V false-return/frozen/reentrant/fee-on-transfer/donation tests; Q/O EVM deposit and buyer/provider/platform withdrawals                                                                                                                                                                                         | Local; real Fuji USDC/issuer behavior blocked                                                                                                                         |
| PAY-05; §3.3, §8.2   | quote service, admission reader, vault                                         | Q expired/noncanonical/suspended cases; V exact quote/grant expiry and caps; policy price floor rejects underpriced commands and quotes (`provider-catalog.test.ts`)                                                                                                                                            | Local; approved economic values (including `minGrossAmount`) still required                                                                                           |
| PAY-06; §4, §8.2, §9 | vault consume-once, settlement journal                                         | Q concurrent paid admission/reservations/HTTP replay/backfill; V changed grant/quote and terminal replay                                                                                                                                                                                                        | Local at-most-once debit and unique ready; no claim of exactly-once provider effects                                                                                  |
| PAY-07; §5–6.2       | SDK codec/client, gateway `preHandler` + core                                  | Q auth/body/ownership-before-payment, envelopes, pending/finalized HTTP SDK run, altered inputs and durable client persistence failure                                                                                                                                                                          | Local payment submission; browser/MCP end-user integration outside this gate                                                                                          |
| PAY-08; §6.3         | facilitator, journal, settlement worker                                        | Q private service auth, read-only verify, revalidation, whitelist bytes, signer fencing, nonce/gas window tests                                                                                                                                                                                                 | Local; production key/role custody and operational rate/budget policy remain approval gates                                                                           |
| PAY-09; §7           | settlement proof + atomic journal/outbox                                       | Q `settles a durable intent once…`, `rolls back HELD…`, two-worker EVM and orphan backfill tests                                                                                                                                                                                                                | Local HELD/ready proof; ready is not provider dispatch                                                                                                                |
| PAY-10; §5.3, §9     | gateway receipts, workers, scanners                                            | Q timeout before/after send, signed/unsigned restart, pre-finality reorg, receipt replay after expiry/revoke, bounded same-byte sends                                                                                                                                                                           | Local listed faults; no exhaustive process-kill proof at every instruction                                                                                            |
| PAY-11; §8.1         | finance approval/journal/executor + vault                                      | V role/replay/expiry/combined/refund/resolver tests; Q lifecycle and `closes finance crash…`                                                                                                                                                                                                                    | Local EOA approval path. Contract ERC-1271 approver support has V proof, but backend finance intentionally uses EOA recovery; no end-to-end ERC-1271 claim            |
| PAY-12; §8.3–4       | vault decisions; finance/scanner                                               | V multiple partial refunds/net fee/full refund/terminal guards; Q full/partial/net release, withdrawals and immutable original receipt                                                                                                                                                                          | Local; late compensation after terminal payout is not implemented and cannot debit another buyer                                                                      |
| PAY-13; §3.3         | finance gate + trusted verifier seam                                           | Q lifecycle requires latest immutable observation and review; stale corrected evidence cannot authorize an unbroadcast release; SIGN/WIT evidence cannot release a REC-floor hold (`evidence_below_minimum`) and the buyer reclaims; Evidence Envelope hash is stable and is the default dispute `evidenceHash` | **Partial**: structured JSON verifier (SIGN) and manual attestation only. No file-access verifier (automatic REC), access-outage monitor or buyer acceptance workflow |
| PAY-14; §8.3         | vault dispute/reclaim, unsigned intents, finance/scanner                       | V both sides/exact resolve boundary; Q direct-wallet dispute, resolver refund, paused reclaim, dispute-between-sign/send and signed-decision-at-resolveBy                                                                                                                                                       | Local financial boundary; full S01 dispute case/ticket API is missing                                                                                                 |
| PAY-15; §8.4, §9     | vault accounting, finalized financial scanner, admission health gate           | V invariant/fuzz; Q insolvency block, unchanged incident on later success, SQL scanner rollback, idempotent projections                                                                                                                                                                                         | Local implemented checks; projections are not independent credit. Not a full external accounting/monitoring system                                                    |
| PAY-16; §10.8        | approved operator ceremony                                                     | O/Q isolated EVM ceremony and runbooks only                                                                                                                                                                                                                                                                     | **Blocked**: no Fuji deployment/funding/broadcast or real-provider E2E evidence                                                                                       |

Finance implementation: `packages/payvoke-payments/src/finance.ts`.
Finalized projection owner: `packages/payvoke-payments/src/finance-ledger.ts`.
Buyer status/intents: `apps/api/src/modules/payments/index.ts`.
See [financial runbook](../apps/ops/financial-lifecycle.md).

## Local gaps closed in this update

Q test `closes finance crash and deadline race gaps on real local USDC` exercises
independent FinanceService instances with real SQL leases/lane locks and real EVM
transactions. Scenario labels are printed as test diagnostics:

1. Two different approved decisions for the same hold/version plus duplicate
   ticks: one signed transaction, one finalized winner, stale loser rejected
   without reserving another nonce.
2. Signer failure after unsigned reservation: restart preserves nonce, gas and
   fees; subsequent decision accounts prior finalized gas in the rolling window.
3. RPC loss after signed-byte persistence but before send: restart uses stored
   bytes; three send authorizations maximum, no replacement signature. Even after
   exhaustion the original hash can finalize when its actual receipt appears.
4. Mined receipt beyond the observed finalized head, then receipt-RPC outage:
   neither frees lane nor records final cost; recovery finalizes the original.
5. Buyer dispute between signing and actual send: transaction reverts, hold stays
   disputed, finalized gas recorded, no automatic resolver/re-sign attempt.
6. Actual local snapshot/revert removes a pre-finality transaction: rebroadcast
   uses identical bytes/hash/nonce, one signature. PostgreSQL fault insertion also
   proves financial cursor/event/projection updates roll back together.
7. RPC transaction block number inconsistent with receipt: quarantine with lane
   and liability retained. **Regression found and fixed**: finance previously
   compared block hash but omitted transaction-vs-receipt block number equality.
8. External transaction consumes the dedicated executor nonce: quarantine the
   unresolved original; do not generate a replacement or release liability.
9. RPC success receipt missing its matching DecisionApplied event: quarantine,
   never create successful finance evidence from receipt status alone.
10. At exact resolveBy after signing: zero broadcasts; buyer reclaim works and
    projects RECLAIMED. The signed decision/reserved lane is not silently erased.

These are deterministic fault/interleaving tests, not OS-kill coverage of every
finance instruction. Existing lifecycle tests additionally prove stale signing
lease fencing, timeout after actual send, approver-role revocation, modified
signed bytes, and rollback of finalized decision/cost/lane in PostgreSQL.

## S01 acceptance boundary (all ten §9 entries)

| S01 §9                                     | Current evidence                                                                                                            | Missing / not claimed                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1 one app per thread, shared chat composer | thread bound to one app; quote checks command belongs to the thread's app                                                   | Browser E2E of composer/default-command mapping                                    |
| 2 command validation/defaults              | Q effective args/defaults and invalid args before payment; provider command/revision API (`provider-catalog.test.ts`)       | Generated OpenAPI; schema depth/size caps review                                   |
| 3 slash safety                             | paid endpoint accepts only quoteId, no raw slash execution                                                                  | Browser test of frontend slash parser                                              |
| 4 pinned revisions and inputs              | Q quote replay after catalog/policy changes, emergency suspension; quotes pin `commandRevisionId`                           | Out-of-process provider fixture verifying received input against snapshot          |
| 5 one hold/ready, free reads/continuations | Q duplicate submission/SQL/HTTP/EVM replay; answers/revisions create new runs without new hold (`provider-catalog.test.ts`) | delivered-result read; full continuation E2E on Fuji                               |
| 6 SSE/ACK/reconnect/restart                | provider SSE ready events, ACK, reports, NDJSON stream and buyer SSE replay/snapshot (`provider-catalog.test.ts`)           | expired-cursor resync, multi-writer lease/fencing                                  |
| 7 app/buyer isolation                      | A/Q buyer identity/ownership; cross-app/cross-owner stream and report rejection                                             | File download isolation; real file storage                                         |
| 8 in-scope continuation                    | question → WAITING_BUYER → answer; revision within `revisionPolicy.maxIncluded`                                             | Scope abuse review beyond quota/window                                             |
| 9 verified delivery                        | JSON result → VERIFYING → DELIVERED after host outputSchema check                                                           | File artifact verifier (automatic REC); buyer access/outage signals                |
| 10 UNKNOWN/cancel/dispute semantics        | `failed`/`unknown` reports; unsigned dispute intent is UNSUBMITTED until chain evidence                                     | Cancellation and dispute ticket APIs; no rerun safety claim without implementation |

Payment/execution are separate. Financial terminal state does not itself free a
session execution slot or make an old ready event safe to dispatch. The future
consumer must recheck current hold/deadlines and verified execution state.

## Remaining gates and conservative recovery limits

- Fuji: explicit RPC, wallet ownership, deployment policy, token funding and
  aggregate gas budget approval, then finalized receipts/event reads/balance deltas.
- Provider: implement and test S01 consumer, output verification and access/review
  signals. Do not replace that proof with manual delivery attestations.
- Operations: signed-but-never-broadcast expired decisions can retain sender lane
  indefinitely. This is a deliberate fail-closed limitation, not a completed
  automatic recovery path. No force-release/replacement/cancellation transaction
  is authorized by these tests. Incident handling/key separation need owner review.
- Finance tests use replacement service instances in one test process; actual
  multi-process kill/restart proof currently exists for settlement, not every
  finance boundary. No exhaustive crash/race or independent audit claim.
- Research conformance: `pnpm --dir tests/payments-e2e test:conformance` checks every
  rule in [S02 §11](specs/02-x402-and-vault.md#11-đối-chiếu-nghiên-cứu-bảo-mật-x402)
  against named negative tests (manifest `tests/payments-e2e/test/conformance/rules.ts`)
  and fails on a missing, renamed or skipped case. M6 (discovery steering) is
  reported as deferred to R06. The price floor mechanism (R02) exists; the
  approved Fuji value is still a T089 decision.

## Reproduce (local only)

Re-run on 2026-10-25 after the R01–R04 changes, including the Docker suites:

| Gate                                     | Result                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| Backend default/PGlite                   | 112 pass, 6 explicitly skipped (EVM/PostgreSQL-only cases)     |
| Docker PostgreSQL payment suite          | 63 pass, 3 EVM-only cases skipped                              |
| Docker PostgreSQL + isolated EVM         | 4 flow tests pass, no skips; 10 fault/race scenarios           |
| Protocol vectors/ABI                     | 8 pass                                                         |
| x402 conformance (`test:conformance`)    | 18 rules pass; M6 deferred to R06                              |
| Vault unit/adversarial/fuzz + viem       | 82 pass (71 Solidity, 11 Node.js)                              |
| Backend full typecheck (`tsc --noEmit`)  | Pass (the earlier `thread-stream` TS2694 no longer reproduces) |
| Frontend typecheck, build, renderer test | Pass; 4 renderer tests run via tsx (no `test` script yet)      |

The counts overlap in exercised behavior; do not add them as independent coverage
percentages. Scenarios are diagnostics inside one flow test, not ten separate
test-runner cases.

```sh
pnpm -r test
docker compose up -d --wait test-db
pnpm --dir tests/payments-e2e test:payments:postgres
PAYMENTS_TEST_POSTGRES=1 pnpm --dir tests/payments-e2e test:payments:evm
pnpm --dir packages/payvoke-protocol test
pnpm --dir packages/payvoke-vault test
pnpm -r typecheck
docker compose stop test-db
```

Keep payments/finance execution flags disabled. These gates do not contact Neon
or public RPC and do not enable buyer payments.
