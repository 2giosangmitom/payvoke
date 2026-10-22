# Backend

## Structure

```text
src/
  server.ts             # process startup and graceful shutdown
  facilitator-server.ts # separate private x402 process, no signing key
  settlement-worker.ts  # explicit opt-in signing/reconciliation process
  app.ts                # app composition and DB lifecycle
  config.ts             # typed environment config and log redaction
  database/client.ts    # Prisma/pg client creation
  http/errors.ts        # sanitized Fastify error responses
  plugins/http.ts       # sensible, helmet, CORS, cookies and rate limits
  modules/auth/
    auth.ts             # Better Auth + Prisma + SIWE, Payvoke policy hooks
    index.ts            # Fastify bridge, session guard and /v1/me
  modules/quotes/
    index.ts            # immutable tool quotes and SDK payment challenge
  modules/payments/
    journal.ts          # intent, fenced leases and signed transaction journal
    index.ts            # authenticated read-only invocation status
  facilitator/
    app.ts              # service-authenticated SDK facilitator HTTP boundary
    validation.ts       # persisted quote/ownership/journal admission rules
    config.ts           # separate env and production deployment policy
```

Add features under `modules/<feature>` and register them after auth in `app.ts`.
Protected routes use `preHandler: app.requireAccount`. Use existing Fastify
plugins and TypeBox type inference for application routes. No generic repository
or DI layers are needed. `generated/prisma` is CLI output.

`auth.cli.ts` loads the same Better Auth factory as the server, without starting
Fastify or querying the database. `prisma/auth.prisma` is owned by Better Auth
CLI; do not hand-edit its models. `prisma/schema.prisma` keeps the commented
domain drafts separately. Prisma reads the whole `prisma` directory.

`prisma/commerce.prisma` contains the minimal active product/version/command,
usage-session, deployment-policy and quote models. Buyer IDs are Better Auth
`User.id` scalars; admission checks the authenticated user/session owner. No
inverse relations were hand-added to CLI-owned auth models. Existing full-domain
definitions in the commented drafts are not additional active models.

## Setup

Set `DATABASE_URL`, `WEB_ORIGIN`, `API_ORIGIN` and `BETTER_AUTH_SECRET` locally.
Generate the secret with `openssl rand -base64 32`; keep it stable across instances
and restarts. Web/API must be same-site for `SameSite=Lax` cookies. HTTPS is
required outside loopback development. No RPC or funded wallet is needed.

```sh
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Create and apply migrations with Prisma CLI, not handwritten SQL:

```sh
pnpm auth:schema                         # generate auth Prisma models from config
pnpm db:migrate:create --name change_name # generate only
pnpm db:migrate:dev --name change_name    # generate and apply in development
pnpm db:migrate                          # apply existing migrations
pnpm db:generate                         # regenerate Prisma Client after schema changes
```

After a fresh checkout, run `db:generate` once before `auth:schema`: the CLI entry
point uses the generated Prisma Client. Configure the same local env as the app.
Change auth fields/plugins in `src/modules/auth/auth.ts`, then run `auth:schema`;
do not copy model definitions or modify generated auth table maps/indexes by hand.

`migrate dev` requires a development DB and a shadow DB Prisma can create/use;
never point it at production. Better Auth models are generated directly using
the pinned `auth@1.7.11` CLI with its native table names. The single initial migration
was generated with `prisma migrate diff --from-empty --to-schema
prisma --script --output
prisma/migrations/20261020000000_init_better_auth/migration.sql --config prisma7.config.ts`.
No Neon migration has been applied by the implementation process.

## Better Auth SIWE

Use Better Auth's SIWE client or these native endpoints, with browser
`credentials: "include"` and an exact trusted `Origin` for writes:

1. `POST /v1/auth/siwe/nonce` with `{}` returns `{nonce}` and a signed browser cookie.
2. Build/sign an EIP-4361 message with that nonce, the web domain/URI, chain 43113,
   `issuedAt` and `expirationTime` at most 5 minutes apart.
3. `POST /v1/auth/siwe/verify` with `{message, signature}` in the same browser.
4. `GET /v1/me` returns Payvoke buyer identity; `POST /v1/auth/sign-out` logs out.
   `GET /v1/auth/get-session` is the native Better Auth session endpoint.

Better Auth owns nonce consumption, signed session cookies, session storage and
logout. Invalid verification consumes the nonce: request a fresh one to retry.
Payvoke hooks enforce a 5-minute nonce lifetime, browser binding, Fuji/URI/time
policy and buyer suspension. EOA signatures are verified with viem. Sessions
last 7 days, with refresh and cookie caching disabled for immediate revocation.
Fastify provides process-local rate limits; proxy headers are not trusted.

**Storage change:** Better Auth stores its native session token (not our former
custom hash) in `session`. Its native SIWE response includes that token;
authentication requires its signed cookie, not a Payvoke bearer-token plugin.
Treat auth tables as sensitive. `/v1/me` never exposes session tokens. Login never
grants permission to debit the vault; no email/password/social login is enabled.

## Identity and initial migration

This intentionally replaces `/auth/challenges`, `/auth/sessions` and the old
DELETE logout endpoint. Clients must switch together; old cookies are not valid
under Better Auth, so users sign in again. Do not run mixed auth API versions.

`User.id` is the buyer identity. Better Auth's `Account` stores the SIWE provider
account, not a second Payvoke user. Wallets live in `WalletAddress`; suspension is
stored on `User` and cannot be set through client input. There are no custom
buyer-account, login-challenge or web-session tables. Unused feature models remain
commented out; their user relations target `User`.

Migration history has been regenerated for a fresh database, not as an upgrade
from the previous schema. If a database already applied older migrations, stop
and plan its transition separately; do not run reset/db push or drop real data.

## Tests

`pnpm test` uses ephemeral PGlite through Prisma/pg, without Docker. Tests apply
the CLI-generated migrations and exercise native auth plus quote/x402 endpoints.
For real multi-connection PostgreSQL auth proof, explicitly supply a
`TEST_DATABASE_URL` pointing to local Docker PostgreSQL only. Neon is production
and must never be used for tests. Tests create/remove
only their own random schema; they never read `DATABASE_URL`. PGlite serializes DB
work and does not prove cross-process PostgreSQL concurrency.

The quote/x402/journal suite defaults to isolated PGlite. For actual PostgreSQL
locking and a two-process claim race, use the existing Docker test DB:

```sh
docker compose up -d --wait test-db      # from repository root
pnpm --dir apps/backend test:payments:postgres
```

That script only connects to `127.0.0.1:55433/test` with the compose test user,
creates/drops its own random schema and ignores `DATABASE_URL`/`TEST_DATABASE_URL`.
It does not call an RPC or send blockchain transactions. PGlite serializes DB
work; only the Docker run exercises concurrent connections/processes.

## Quote/x402 milestone (not live payments)

- `POST /v1/quotes` authenticates the buyer, validates persisted TOOL command
  arguments/defaults and freezes input/terms/policy snapshots plus EIP-712 quote.
  `Idempotency-Key` must equal `clientRequestId`. One active quote/operation
  occupies the session; replays return the same stored document without
  extending deadlines. Pending/UNKNOWN/HELD operations retain that slot even
  after quote expiry. Rejected, never-attempted operations can release after
  expiry; finalized reverted attempts allow a fresh quote immediately.
- Only empty context selections are supported. Nonempty selections and AGENT
  products fail explicitly; there is no silent context omission.
- `POST /v1/invocations {quoteId}` requires the invocation ID as idempotency key.
  After ownership/availability/schema gates it returns an SDK-encoded v2
  `PAYMENT-REQUIRED` header for `payvoke-vault` on Fuji, with `payTo` set to vault.
- Core/client/server adapters live in `@payvoke/x402`, pinned to core 2.28.0.
  No stock `@x402/fastify` middleware is mounted: the studied version settles at
  `onRequest`, before body validation. Final orchestration must run only after
  auth/body/ownership gates, using core's upfront flow.

To exercise quotes locally, provision approved product/command, owned usage
session and active policy records in a development DB, and configure a matching
`VAULT_ADDRESS`. There are intentionally no catalog/session-management endpoints
or production fixtures in this milestone. Quotes do not prove onchain admission.

**Spending remains disabled by default.** With `PAYMENTS_ENABLED=false`, signed
submissions still return `SETTLEMENT_NOT_AVAILABLE`. Opt-in requires the private
facilitator URL/token and matching capabilities at API startup, a separately
enabled facilitator submission service, and the signing worker below. The full
path is exercised on an isolated local EVM; no Fuji deployment/E2E or production
enablement has been performed. Provider dispatch is not implemented.

## Settlement journal foundation

`prisma/payments.prisma` and its additive Prisma-generated migration introduce
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

`GET /v1/invocations/{id}` is authenticated, no-store and free. It exposes payment
and execution status plus known tx hash/finalized receipt, never authorization or
signed bytes. The finality reader supplies evidence to the journal's atomic
HELD/ready transition. Only one `InvocationReady` row can exist per invocation.

## Private facilitator

`pnpm dev:facilitator` runs a separate Fastify process. It does not register
Better Auth, browser CORS or paid gateway routes. All of `GET /supported`,
`POST /verify` and `POST /settle` require `Authorization: Bearer <service token>`
using `@fastify/bearer-auth`. Keep it on loopback/private networking; use TLS for
remote transport. Rate limits are process-local and bodies are limited to 8 KiB.

From `apps/backend`:

```sh
cp facilitator.env.example .env.facilitator
# Fill in a separate random service token, local runtime DB and approved deployment values.
DOTENV_CONFIG_PATH=.env.facilitator pnpm dev:facilitator
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

`/verify` is read-only. A valid result contains `extra.admission="preview"`, a
classification and observed block metadata; no nonce/intent/lane is reserved.
`/settle` defaults to validation-only: valid previews return HTTP 503
`settlement_unavailable`. With explicit `SETTLEMENT_ENABLED=true`, new submissions
are independently validated and durably journaled. Existing intents are bound to
the same quote/authorization before reading their prior state, without applying
new-admission expiry/grant checks again. Neither HTTP process signs or broadcasts.
When execution mode is enabled, startup tolerates missing relayer role for receipt
recovery; the role is still mandatory on every new-admission validation.

The pinned `HTTPFacilitatorClient` accepts the `/supported` and `/verify` results.
A 503 JSON error without `success` is a transport exception in core 2.28.0, not a
`SettleResponse` or payment receipt. This behavior is covered through SDK HTTP
calls routed into `Fastify.inject()`. Core's HTTP orchestration may synthesize an
empty-transaction failure receipt from a transport error; the gateway explicitly
discards it, never forwards exception text, and returns a retryable status with
`Location` instead. Known broadcast/UNKNOWN transactions use the SDK's pending
receipt and 402 response, not another charge. Core's automatic settle retry reads
the same operation. A finalized success returns 202 with `PAYMENT-RESPONSE`;
`beforeHandlerSettlement` is echoed without settling a second time.

## Settlement worker and recovery

Operator tooling for the next controlled Fuji run is documented in
[`operations/README.md`](operations/README.md). It separates read-only checks,
no-broadcast signing, explicitly approved single-use sends and finalized evidence;
building this tooling does not authorize a Fuji deployment or funding.

The separate signing process is off by default:

```sh
cp worker.env.example .env.worker
# Supply an explicitly approved deployment, dedicated relayer key and gas budget.
DOTENV_CONFIG_PATH=.env.worker pnpm worker:settlement
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
and gas cost without a ready event or new attempt. Late, closed, disputed or
partially consumed holds retain their paid receipt but get `hold_not_executable`
and **no ready event**; the separately approved finance workflow below can refund
before the hold expires, or the buyer can reclaim after `resolveBy`.
Contradictory receipts/holds/nonces are quarantined without releasing the lane.

Finalized log backfill starts at `DEPLOYMENT_START_BLOCK`, scans at most 500 blocks
per iteration and advances a CAS-protected durable cursor in the same transaction
as recovery wakeups/incidents. Logs alone never mark HELD. Orphan/mismatched holds
are recorded in `settlement_incidents`, not fabricated into invocations or jobs.
No cursor/lane/attempt TTL cleanup or operator force-release endpoint is provided.
Unsigned reservations that can no longer pass admission remain blocked for manual
recovery; their nonce is not silently reassigned.

`InvocationReady` is a durable handoff, not a provider-delivery implementation.
There is no provider HTTP call, ACK loop or automatic refund/release in this task.

### Local execution proof

```sh
pnpm --dir apps/backend test:payments:evm
# Optional: same E2E with real PostgreSQL and two independent worker processes.
PAYMENTS_TEST_POSTGRES=1 pnpm --dir apps/backend test:payments:evm
```

These commands build contracts and spawn/stop their own loopback Hardhat node
with chain ID 43113, mock USDC runtime at the fixed asset address, generated local
buyer/relayer keys, and test-only balances. They do not connect to Fuji. They prove
HTTP/SDK submission, real vault balance changes/event/receipt, finalized handoff,
replay after revoke, and an actual revoke-after-preview transaction revert.
Docker mode also proves workers in separate processes cannot double-send/debit.
Mock-RPC tests cover timeout, crash, reorg, fee budget, malformed evidence and
bounded retry paths; Docker additionally proves rollback of HELD/outbox/lane.

## Financial lifecycle after HELD

The additive financial-lifecycle migration adds finalized hold projections, an
immutable event ledger, verifier delivery observations and a separate approved
finance-decision journal/lane. Original settlement state/receipt remains HELD
after refund/payout; `GET /v1/invocations/:id` includes a separate `financial`
projection with finalized block evidence. The projection is not spendable credit.

`POST /v1/invocations/:id/financial-intents` accepts `{action:"dispute",evidenceHash}`
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

Release additionally needs a trusted delivery observation and the business review
window. Provider `result`/failure/cancellation is **not** payment authority. There
is no provider-facing endpoint for marking delivery verified, nor automatic payout
or refund policy engine. The internal verifier seam and explicitly enabled manual
attestation support controlled testing while provider execution/output validation
are built. Buyer acceptance never bypasses release timing.

See [`operations/financial-lifecycle.md`](operations/financial-lifecycle.md) for
approval/signing/execution commands, state semantics and remaining launch gates.
