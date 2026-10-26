# Finance worker

Closes every paid hold automatically. Payvoke does not arbitrate output quality,
so there is no dispute or manual approval path:

| Situation                                                                                                          | Decision    |
| ------------------------------------------------------------------------------------------------------------------ | ----------- |
| Verified delivery (evidence meets the signed `minEvidence`) before `deliveryDeadline`, signed review window passed | Release     |
| Provider reported `FAILED` without a verified delivery                                                             | Full refund |
| No verified delivery by `deliveryDeadline`                                                                         | Full refund |
| Delivered late, or the review window would end after `resolveBy`                                                   | Full refund |

If the worker is down or a decision keeps failing (three attempts per hold), the
buyer can still `reclaim` the remaining amount after `resolveBy`.

```sh
cp .env.example .env
# Supply the deployment, two dedicated finance keys and a gas budget.
pnpm --filter finance-worker start
```

`EXECUTION_ENABLED=true` is required to start it. The worker holds two keys:

- **Approver** with `REFUND_APPROVER_ROLE` and `RELEASE_APPROVER_ROLE`. It signs
  EIP-712 `ResolutionDecision`s and never sends transactions.
- **Executor** with `FINANCE_EXECUTOR_ROLE`. It sends `applyDecision` and pays gas
  in Fuji AVAX.

The vault requires the two addresses to differ, and the executor must not be the
settlement relayer. Neither key can move funds anywhere except to the hold's own
buyer (refund) or its signed provider and fee recipient (release), and release is
still rejected on chain before `releaseNotBefore`.

Finance runs when a BullMQ `finance` job wakes it: new delivery evidence, a failed
run, or a hold deadline scheduled by the settlement worker. A 30 s database sweep
covers lost wake-ups. Jobs and the sweep share one in-process lane.

Each cycle proposes at most one decision per open hold, then advances queued
decisions through `FinanceService` in `@payvoke/payments`: the same gate,
single-executor lane, gas budget, persisted signed bytes and finalized-receipt
checks as before. The settlement worker keeps the financial projection up to date.
