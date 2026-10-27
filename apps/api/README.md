# API

Fastify API for the web app and provider integrations: SIWE auth, catalog,
provider apps/commands, threads, quotes, the x402 payment gateway and AG-UI
streams. It holds no signing keys; settlement runs in
[`apps/facilitator`](../facilitator) and [`apps/settlement-worker`](../settlement-worker).

## Structure

```text
src/
  server.ts               # process startup and graceful shutdown
  app.ts                  # composition: DI container, plugins, module routes
  container.ts            # Awilix registrations and the typed Cradle
  config.ts               # typed environment config
  errors.ts               # AppError classes with public codes
  http/errors.ts          # the one error handler and the 404 handler
  http/financial-json.ts  # duplicate-key-rejecting JSON parser for checkout scopes
  http/sse.ts             # text/event-stream helper
  plugins/http.ts         # sensible, helmet, CORS, cookies and rate limits
  modules/<feature>/
    <feature>.routes.ts      # paths, schemas, hooks, limits; no logic
    <feature>.controller.ts  # HTTP adapter: request in, status/headers out
    *.service.ts             # business rules and Prisma access
    *.validation.ts / *.schemas.ts / pure helpers
```

| Module     | Owns                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| `auth`     | Better Auth SIWE bridge, `requireAccount` guard, web-write Origin policy                |
| `catalog`  | public store, app detail, stars                                                         |
| `provider` | owner app lifecycle, command revisions, API keys and key authentication                 |
| `threads`  | buyer chat threads, AG-UI snapshot and SSE replay                                       |
| `quotes`   | immutable quote documents and the verified transcript                                   |
| `payments` | paid submission, x402 gateway, payment status and financial intents                     |
| `runs`     | provider feed/ACK/reports/NDJSON stream, buyer answers and revisions, delivery verifier |
| `openui`   | OpenUI validation and the provider component catalog                                    |
| `apps`     | shared app/command rules and serializers                                                |

### Dependency injection

`container.ts` builds one strict Awilix container per app (tests create several
apps in one process, so `@fastify/awilix`'s module-level container is never
used). Services and controllers are singletons in `PROXY` mode: a class takes
the cradle in its constructor and keeps only what it uses. Routes resolve their
controller from `app.diContainer.cradle` once, at registration. Startup work
uses Awilix lifecycle hooks: `paymentGateway.verifyCapabilities` runs on ready
(`asyncInit`). `doorbell` and `jobs` come from `src/signals.ts`: the server
connects them to Redis, while `createApp` defaults to in-process versions for tests.

### Redis signals

`REDIS_URL` is required and Redis must be reachable at startup; later outages are
logged and tolerated. Redis never holds state:

- SSE streams listen on a doorbell (`payvoke:thread:{id}`, `payvoke:app:{id}`) that
  services ring after their transaction commits, and re-read Postgres by cursor.
  A lost ring is caught by the backstop poll (5 s buyer, 15 s provider feed).
- Rate limits use Redis as a shared store (`skipOnError`), so they hold across replicas.
- A committed `result` report enqueues `delivery-verify` for `apps/job-worker`; a
  `failed` report wakes the finance worker. Workers keep database sweeps, so a lost
  job only delays work.

To add a feature: write the service and controller, register both in
`container.ts` (and the `Cradle` declaration), and register its routes in
`app.ts` after `authGuard`.

### Errors

Services throw `AppError` subclasses (`NotFoundError("THREAD_NOT_FOUND")`, …),
never Fastify helpers. The error handler sends `{ error: code }` with the class
status. Prisma unique and missing-record races become 409 `CONFLICT` and 404
`NOT_FOUND`; Fastify validation, body-limit and rate-limit errors keep their
status and code. Anything else is 500 `INTERNAL_ERROR`, logged with the error
type only, because driver messages can contain SQL or credentials.

Shared code lives in workspace packages: Prisma schema and client in
[`@payvoke/db`](../../packages/payvoke-db), the settlement/finance domain in
[`@payvoke/payments`](../../packages/payvoke-payments), and env/redaction helpers in
[`@payvoke/server`](../../packages/payvoke-server).

**Routes are documented by code only.** This README and `docs/` describe rules,
not method/path/body catalogs. Read the route registrations in `src/modules/*`
(or an OpenAPI document generated from them) for the current HTTP surface.

## Provider apps and catalog

Wallet-authenticated owners create apps and rotate one active API key per app;
only the key hash is stored. Command writes accept the owner session or a key
with `products:write`. A key is scoped to its app. `PUBLIC` apps that are not
archived appear in the store without operator review; availability requires
`ACTIVE`, a default command and a recent provider heartbeat. Signed-in buyers
can star apps.

Files (buyer inputs and provider artifacts) use presigned S3 uploads, a
server-side completion that copies and re-hashes the bytes, and per-request
download URLs; see [S01 §5.4](../../docs/specs/01-api-and-provider-protocol.md#54-file).

Protected routes use `preHandler: app.requireAccount`. Prisma is the data
layer; no generic repository layer sits between services and the client.

`auth.cli.ts` loads the same Better Auth factory as the server, without starting
Fastify or querying the database. It writes `packages/payvoke-db/prisma/auth.prisma`;
see the [`@payvoke/db` README](../../packages/payvoke-db/README.md) for schema rules.

## Setup

Copy `.env.example` to `.env`. Set `DATABASE_URL`, `WEB_ORIGIN`, `API_ORIGIN` and
`BETTER_AUTH_SECRET`. Generate the secret with `openssl rand -base64 32`; keep it
stable across instances and restarts. Web/API must be same-site for `SameSite=Lax`
cookies. HTTPS is required outside loopback development. No RPC or funded wallet
is needed.

```sh
docker compose --profile stack up -d redis   # local Redis on 127.0.0.1:6380
pnpm --filter @payvoke/db migrate   # apply migrations (reads packages/payvoke-db/.env)
pnpm --filter api dev
```

Start order for the full backend: Redis, facilitator, API, then settlement-worker,
finance-worker and job-worker.

Files are optional. Any S3-compatible store works and only the `S3_*` values
change between environments: RustFS from compose locally, Neon S3 storage in
production (bucket and CORS for `WEB_ORIGIN` provisioned there).

```sh
docker compose --profile stack up -d rustfs storage-init   # S3 on 127.0.0.1:9000, bucket payvoke-files
# .env: FILES_ENABLED=true S3_ENDPOINT=http://127.0.0.1:9000 S3_REGION=us-east-1
#       S3_BUCKET=payvoke-files S3_ACCESS_KEY_ID=payvoke S3_SECRET_ACCESS_KEY=payvoke-secret
#       S3_FORCE_PATH_STYLE=true
```

Set the same `S3_*` values on the job-worker; without them, file results are
never verified and are refunded at the delivery deadline.

Change auth fields/plugins in `src/modules/auth/auth.ts`, then run
`pnpm --filter api auth:schema`; do not copy model definitions or modify generated
auth table maps/indexes by hand.

## Better Auth SIWE

Use Better Auth's SIWE client against the native endpoints under the auth base
path (see `src/modules/auth`), with browser `credentials: "include"` and an exact
trusted `Origin` for writes. Request a nonce (it sets a signed browser cookie),
build/sign an EIP-4361 message with that nonce, the web domain/URI, chain 43113,
`issuedAt` and `expirationTime` at most 5 minutes apart, then verify it in the
same browser. A separate current-user route returns the Payvoke buyer identity.

Better Auth owns nonce consumption, signed session cookies, session storage and
logout. Invalid verification consumes the nonce: request a fresh one to retry.
Payvoke hooks enforce a 5-minute nonce lifetime, browser binding, Fuji/URI/time
policy and buyer suspension. EOA signatures are verified with viem. Sessions
last 7 days, with refresh and cookie caching disabled for immediate revocation.
Fastify provides process-local rate limits; proxy headers are not trusted.

**Storage change:** Better Auth stores its native session token (not our former
custom hash) in `session`. Its native SIWE response includes that token;
authentication requires its signed cookie, not a Payvoke bearer-token plugin.
Treat auth tables as sensitive. The current-user route never exposes session tokens. Login never
grants permission to debit the vault; no email/password/social login is enabled.

## Identity and initial migration

This intentionally replaces the former custom challenge/session/logout API. Clients must switch together; old cookies are not valid
under Better Auth, so users sign in again. Do not run mixed auth API versions.

`User.id` is the buyer identity. Better Auth's `Account` stores the SIWE provider
account, not a second Payvoke user. Wallets live in `WalletAddress`; suspension is
stored on `User` and cannot be set through client input. There are no custom
buyer-account, login-challenge or web-session tables. Unused feature models remain
commented out; their user relations target `User`.

## Tests

`pnpm --filter api test` uses ephemeral PGlite through Prisma/pg, without Docker.
Tests apply the CLI-generated migrations and exercise native auth plus the
provider/catalog endpoints. For real multi-connection PostgreSQL auth proof,
explicitly supply a `TEST_DATABASE_URL` pointing to local Docker PostgreSQL only.
Neon is production and must never be used for tests. Tests create/remove only
their own random schema; they never read `DATABASE_URL`.

Storage is in-memory in API tests. The presigned-URL behavior is tested against a
real S3 endpoint in `@payvoke/storage`: `docker compose up -d test-rustfs`, then
`TEST_S3_ENDPOINT=http://127.0.0.1:59000 pnpm --filter @payvoke/storage test`.

Quote, x402, settlement and finance flows span several services and are tested in
[`tests/payments-e2e`](../../tests/payments-e2e).

## Quote/x402 milestone (not live payments)

- Quote preparation authenticates the buyer, validates the active command revision
  arguments/defaults and freezes input/terms/policy snapshots plus EIP-712 quote.
  `Idempotency-Key` must equal `clientRequestId`. One active quote/operation
  occupies the thread; replays return the same stored document without
  extending deadlines. Pending/UNKNOWN/HELD operations retain that slot even
  after quote expiry. Rejected, never-attempted operations can release after
  expiry; finalized reverted attempts and DELIVERED/FAILED runs allow a fresh
  quote immediately. An in-scope revision must reclaim the same slot.
- Only empty context selections are supported. Nonempty selections fail
  explicitly; there is no silent context omission.
- Invocation submission takes only `{quoteId}` and requires the invocation ID as
  idempotency key.
  After ownership/availability/schema gates it returns an SDK-encoded v2
  `PAYMENT-REQUIRED` header for `payvoke-vault` on Fuji, with `payTo` set to vault.
- Core/client/server adapters live in `@payvoke/x402`, pinned to core 2.28.0.
  No stock `@x402/fastify` middleware is mounted: the studied version settles at
  `onRequest`, before body validation. Final orchestration must run only after
  auth/body/ownership gates, using core's upfront flow.

To exercise quotes locally, provision an app with a default command, a thread,
an active policy and a matching `VAULT_ADDRESS` in a development DB. Quotes do
not prove onchain admission.

**Spending remains disabled by default.** With `PAYMENTS_ENABLED=false`, signed
submissions still return `SETTLEMENT_NOT_AVAILABLE`. Opt-in requires the private
facilitator URL/token and matching capabilities at API startup, a separately
enabled facilitator submission service, and the signing worker below. The full
path is exercised on an isolated local EVM; no Fuji deployment/E2E or production
enablement has been performed.
