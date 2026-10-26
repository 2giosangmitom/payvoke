# Job worker

Runs BullMQ jobs that hold **no signing key** and are safe to repeat. Postgres stays
the source of truth; Redis only carries the work items.

| Queue             | Job      | Does                                                                                                               |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `delivery-verify` | `verify` | Validates a stored inline JSON result against the command's output schema and records evidence; then wakes finance |
| `delivery-verify` | `sweep`  | Every 60 s, re-enqueues runs still awaiting verification (covers a producer that crashed before enqueueing)        |

The API enqueues `verify` after a provider's `result` report commits, with job id
`verify-{invocationId}-{artifactVersion}` so duplicates collapse. Verification writes
evidence with a deterministic id, so a retried job never records it twice.

```sh
cp .env.example .env   # DATABASE_URL and REDIS_URL only
pnpm --filter job-worker start
```

Later keyless work (artifact checks, provider webhooks, notifications) belongs here,
not in the API or in a worker that holds keys.
