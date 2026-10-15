# Verification

These are proof obligations for the design, not a record of passing tests. The demo remains on Fuji/test assets. Papers cited in module documents motivate controls; their experiments have not been reproduced here and do not validate this implementation.

## Before paid use

| Area                 | Required evidence                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity             | Email/wallet login, secure linking, role isolation, session/client revocation and no wallet ownership confusion                                |
| Smart account        | Separate owners/balances, deposit/withdrawal, constrained delegation, aggregate reservations, replay rejection, expiry and revocation races    |
| Actual payment route | MetaMask plus another named wallet; deployed token/account/facilitator; canonical effect matching; no alternate-path policy bypass             |
| Commerce             | Pinned variant/rates/ceiling, stale quote rejection and same-operation recovery across web/MCP; no duplicated purchase under concurrency       |
| Metered billing      | Billable dimensions, trusted evidence level, rounding/fees, retry/failure rules, missing usage handling and a proven collection/refund profile |
| Provider admission   | Endpoint control/authentication, SSRF defenses, duplicate/lost starts, status lookup, declared capabilities and useful diagnostics             |
| Streaming            | Ordered text/data, malicious partial input, bounded buffering, checkpoint restore, expired cursors and no duplicate job/message/charge         |
| Artifacts            | Complete retained files, schema/digest checks, isolated builds/previews, quarantine, export and dispute-safe retention                         |
| Financial operations | Balanced journal, funded refunds, held liabilities, payout races and independent reconciliation                                                |
| External clients     | One named reference client, scoped access, unsupported-capability rejection and separate app/financial revocation                              |
| Operations           | Provider pause/rollback, scoped support, backup restoration and safe reopening after chain/database divergence                                 |
| Product and rules    | Selected launch profiles; clear terms; real buyer/provider trials; organizer confirmation of custody/treasury and chain requirements           |

## Failure drills

- Crash before/after authorization submission, chain settlement, journal/outbox commit and workflow start. Recover the same commercial operation.
- Lose a provider start response, receive duplicate callbacks, then receive an old attempt's result. Recover without blind restart or stale publication.
- Race two jobs for the remaining budget and race cancellation against worker claim. Only the permitted transition/capacity wins.
- Disconnect a stream, expire its cursor and restart the process. Restore an exact snapshot/tail or explicit reset; never concatenate a fresh generation.
- Inject a new payee, component, unsafe preview link or cross-project artifact ID into provider output. Observe actual denied effects, not just reassuring model text.
- Restore an older backup after settlement/refund/payout. Replay canonical effects without duplicate transfers and verify paid artifacts before reopening.

## Evaluation discipline

Use real transactional and chain tests for concurrency and money invariants; mocks alone are insufficient. Use deterministic fixtures for transport/state tests and repeated independent trials for model behavior. Record versions, task fixtures, costs, latency, sample counts and check limits. Keep provider assertions, platform observations and human judgments separate.

Unknown payment or usage outcomes remain pending. Do not substitute an unguarded payment route, promise untested metered capture or accept real customer funds to bypass a failing check.
