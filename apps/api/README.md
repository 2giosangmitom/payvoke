# API

Fastify API for the web app and provider integrations: SIWE auth, catalog,
provider apps/commands, threads, quotes, the x402 payment gateway and AG-UI
streams. It holds no signing keys; settlement runs in
[`apps/facilitator`](../facilitator) and [`apps/settlement-worker`](../settlement-worker).

## Structure

```text
src/
  server.ts             # process startup and graceful shutdown
  app.ts                # app composition and DB lifecycle
  config.ts             # typed environment config
  http/errors.ts        # sanitized Fastify error responses
  plugins/http.ts       # sensible, helmet, CORS, cookies and rate limits
  modules/auth/
    auth.ts             # Better Auth + Prisma + SIWE, Payvoke policy hooks
    index.ts            # Fastify bridge, session guard and current-user route
  modules/quotes/
    index.ts            # immutable quotes and SDK payment challenge
  modules/payments/
    gateway.ts          # x402 resource server and facilitator client
    index.ts            # authenticated read-only invocation status
  modules/{apps,catalog,provider,agui,openui}/
```

Shared code lives in workspace packages: Prisma schema and client in
[`@payvoke/db`](../../packages/payvoke-db), the settlement/finance domain in
[`@payvoke/payments`](../../packages/payvoke-payments), and env/redaction helpers in
[`@payvoke/server`](../../packages/payvoke-server).

Add features under `modules/<feature>` and register them after auth in `app.ts`.

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

Protected routes use `preHandler: app.requireAccount`. Use existing Fastify
plugins and TypeBox type inference for application routes. No generic repository
or DI layers are needed. 

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
pnpm --filter @payvoke/db migrate   # apply migrations (reads packages/payvoke-db/.env)
pnpm --filter api dev
```

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
