# Settlement worker

The signing process is off by default:

```sh
cp .env.example .env
# Supply an explicitly approved deployment, dedicated relayer key and gas budget.
pnpm --filter settlement-worker start
```

`EXECUTION_ENABLED=true` is required to start it. This is not authorization to
enable a real deployment: obtain deployment/funding/budget approval separately.
The worker has no browser auth secret or service bearer token. Use the relayer
key exclusively here, not from another wallet/script; unaccounted pending nonce
activity fails closed. Never use a public Hardhat fixture key on Fuji.

The worker uses the existing PostgreSQL journal as its durable queue, fenced
leases and one relayer lane. It validates again before signing, discovers nonce,
estimates gas with a 20% ceiling-rounded margin, enforces per-transaction and
outstanding limits, and accounts actual finalized cost against a rolling window.
All prices/costs are integer wei. No economic defaults are inferred from tests.
Worker RPC is timeout-bounded; signing and RPC never happen in a SQL transaction.

Exact signed EIP-1559 bytes/hash are persisted before send. A restart first looks
up that hash; retries use only those bytes. Up to three durable send authorizations
are allowed per attempt (a crash before send can consume one). Exhaustion retains
the lane/budget and keeps polling, requiring operator investigation rather than
a replacement transaction. Lease expiry does not release any financial reservation.

`@payvoke/x402/settlement` checks chain/transaction/receipt identity, exact calldata,
the vault's `HoldReserved` event, immutable hold fields at the finalized checkpoint,
and canonical block hashes. `latest`, receipt presence and accepted-transaction
notifications are not substitutes for `finalized`. Unsupported finality fails
worker startup; no confirmation-count fallback exists.

On finalized success the journal atomically records proof/cost, marks HELD, queues
one `InvocationReady`, and releases the lane. A finalized revert records REJECTED
and gas cost without a ready event or new attempt. Late, closed or
partially consumed holds retain their paid receipt but get `hold_not_executable`
and **no ready event**; [`apps/finance-worker`](../finance-worker/README.md)
refunds them after `deliveryDeadline`, or the buyer can reclaim after `resolveBy`.
Contradictory receipts/holds/nonces are quarantined without releasing the lane.

The facilitator enqueues a `settle` job right after it journals an intent, and the
worker handles it at once if the operation is due; deferred checks and lost jobs are
picked up by the database sweep every 5 s. Jobs and the sweep share one in-process
lane, so the relayer nonce is never driven twice at the same time; the SQL lease
still fences other processes. When an operation commits HELD the worker rings the
app's provider feed, and every open hold seen by the financial scan schedules finance
wake-ups at its `deliveryDeadline` and `releaseNotBefore`.

Finalized log backfill starts at `DEPLOYMENT_START_BLOCK`, scans at most 100 blocks
(the public Fuji RPC limit for `eth_getLogs`) per iteration and advances a CAS-protected durable cursor in the same transaction
as recovery wakeups/incidents. Logs alone never mark HELD. Orphan/mismatched holds
are recorded in `settlement_incidents`, not fabricated into invocations or jobs.
No cursor/lane/attempt TTL cleanup or operator force-release endpoint is provided.
Unsigned reservations that can no longer pass admission remain blocked for manual
recovery; their nonce is not silently reassigned.

`InvocationReady` is the durable handoff that the provider event stream delivers.
Refund and release are handled by [`apps/finance-worker`](../finance-worker/README.md).

The worker also runs the bounded financial-lifecycle backfill described in
[`@payvoke/payments`](../../packages/payvoke-payments/README.md).

### Local execution proof

```sh
pnpm --dir tests/payments-e2e test:payments:evm
# Optional: same E2E with real PostgreSQL and two independent worker processes.
PAYMENTS_TEST_POSTGRES=1 pnpm --dir tests/payments-e2e test:payments:evm
```

These commands build contracts and spawn/stop their own loopback Hardhat node
with chain ID 43113, mock USDC runtime at the fixed asset address, generated local
buyer/relayer keys, and test-only balances. They do not connect to Fuji. They prove
HTTP/SDK submission, real vault balance changes/event/receipt, finalized handoff,
replay after revoke, and an actual revoke-after-preview transaction revert.
Docker mode also proves workers in separate processes cannot double-send/debit.
Mock-RPC tests cover timeout, crash, reorg, fee budget, malformed evidence and
bounded retry paths; Docker additionally proves rollback of HELD/outbox/lane.
