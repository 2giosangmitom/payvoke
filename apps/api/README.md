# API

Hono API on Bun for the web app and provider integrations: SIWE auth, catalog,
provider apps/commands, threads, quotes, the x402 payment gateway and AG-UI
streams. The same process runs the x402 facilitator and the workers the
environment enables; see [Workers](#workers).

## Structure

```text
src/
  server.ts               # Bun.serve, workers, graceful shutdown
  app.ts                  # composition: DI container, middleware, routes; exports AppType
  rpc.ts                  # `import type { AppType } from "api/rpc"` for the web app
  container.ts            # Awilix registrations and the typed Cradle
  config.ts               # typed environment config
  errors.ts               # AppError classes with public codes
  http/                   # context, zod validation, errors, limits, SSE, financial JSON
  modules/<feature>/
    <feature>.routes.ts   # a chained Hono sub-app: middleware, validation, handlers
    <feature>.schemas.ts  # zod request schemas
    *.service.ts          # business rules and Prisma access
  core/                   # no HTTP: db, queue, storage, runtime, payments, facilitator
  workers/                # job, settlement and finance workers, started by server.ts
docs/                     # builder guide text, compiled into the OpenAPI spec
prisma/                   # schema and migrations
test/                     # API tests, e2e payments and conformance (e2e/), fixtures (kit/)
```

Code under `core/` never imports Hono or `modules/`. Imports use package subpath
aliases (`#core/db`, `#core/payments/finance`, `#test/kit/database`), declared in
`package.json`, so the web app's typecheck resolves them too.

| Module     | Owns                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| `auth`     | Better Auth SIWE bridge, `requireAccount` middleware, web-write Origin policy     |
| `catalog`  | public store, app detail, stars                                                   |
| `provider` | owner app lifecycle, command revisions, API keys and key authentication           |
| `threads`  | buyer chat threads, the projected timeline and its live SSE stream                |
| `quotes`   | immutable quote documents and the verified transcript                             |
| `payments` | paid submission, x402 gateway, payment status and financial intents               |
| `runs`     | provider feed/ACK/reports/NDJSON stream, run tool results and revisions, verifier |
| `tools`    | built-in tools providers open in the chat, and the buyer's tool-result endpoint   |
| `openui`   | OpenUI validation and the provider component catalog                              |
| `apps`     | shared app/command rules and serializers                                          |

### Routes, validation and RPC

Each module exports one Hono sub-app built by chaining, and `app.ts` chains them
into `routes`, whose type is `AppType`. Keep the chain unbroken: a route added
outside it is invisible to the web app's `hc<AppType>` client.

Request params, query and JSON bodies are validated with zod through
`validate(target, schema, code, fieldCodes?)` (`http/validate.ts`), a wrapper of
`@hono/zod-validator`. A failure answers 400 `{ error: CODE }` with the route's
public code, or the code of the first failing field listed in `fieldCodes`.
Business rules beyond shape stay in the services. Middleware order mirrors the
former Fastify lifecycle: rate limit, body limit, parsing and validation, then
`requireAccount`, then the handler. Handlers return `c.json(value, status)` so
response types reach the client; serialize JSON columns with their domain types
(see `modules/apps/serializers.ts`).

### Builder API reference

The routes builders call with an app key are documented in place and generated into an OpenAPI 3.1 spec. `validate()` (built on `hono-openapi`'s validator) documents every request schema. A builder route also chains `builderRoute({ operationId, tag, summary, description, scope, responses, errors })` from `http/openapi.ts` after its validators. It adds the app-key security, the scope, the error codes and the response schemas, and a `body` that documents a request the validator only checks loosely. Response schemas are zod objects with `.meta({ id })` next to each module's request schemas.

`src/builder-spec.ts` builds the spec from `routes` and the guide markdown in `docs/`, keeping only builder-tagged operations. `bun run docs` writes it, with `llms.txt` and `llms-full.txt`, into the web app (`bun run docs --check` fails when they are stale). `test/openapi.test.ts` checks that the committed copy is current and that real responses match the documented schemas.

### Dependency injection

`container.ts` builds one strict Awilix container per app (tests create several
apps in one process). Services are singletons in `PROXY` mode: a class takes the
cradle in its constructor and keeps only what it uses. Every request carries the
cradle as `c.var.cradle`. `app.ready()` runs startup checks, such as the payment
gateway's facilitator capabilities. `doorbell` and `jobs` come from
`src/signals.ts`: the server connects them to Redis, while `createApp` defaults
to in-process versions for tests.

### Redis signals

`REDIS_URL` is required and Redis must be reachable at startup; later outages are
logged and tolerated. Redis never holds state:

- SSE streams listen on a doorbell (`payvoke:thread:{id}`, `payvoke:app:{id}`) that
  services ring after their transaction commits, and re-read Postgres by cursor.
  A lost ring is caught by the backstop poll (5 s buyer, 15 s provider feed).
- Rate limits count in Redis when the server has it (errors let requests through).
- A committed `result` report enqueues `delivery-verify` for the job worker; a
  `failed` report wakes the finance worker. Workers keep database sweeps, so a lost
  job only delays work.

To add a feature: write the service and register it in `container.ts` (and the
`Cradle` interface), write its zod schemas and chained routes, and add the
routes to the chain in `app.ts`.

### Errors

Services throw `AppError` subclasses (`NotFoundError("THREAD_NOT_FOUND")`, …).
The error handler sends `{ error: code }` with the class status. Prisma unique
and missing-record races become 409 `CONFLICT` and 404 `NOT_FOUND`; malformed
JSON is 400 `INVALID_JSON`, an oversized body 413 `PAYLOAD_TOO_LARGE`, a rate
limit 429 `RATE_LIMITED`. Anything else is 500 `INTERNAL_ERROR`, logged with the
error type only, because driver messages can contain SQL or credentials.

### Logging

Logging uses [LogTape](https://logtape.org). Code takes a logger from
`logger(...category)` in `src/logging.ts` (categories under `payvoke`) and
logs a message template with properties:
`log.error("Settlement tick failed ({error})", { error: errorTag(error) })`.
Only `server.ts` calls `configureLogging(LOG_LEVEL)`; before that LogTape
discards records, so tests and tools are silent. Output is JSON lines on
stdout, through `redactByField` with `redactedLogFields` (secrets, tokens,
keys, signatures, cookies, payment headers, bodies, connection URLs): a
property with such a name is written as `[REDACTED]` at any depth. Log error
tags, never error messages, since those can carry SQL or signed payloads.

`@logtape/hono` writes one `payvoke.http` record per request (method, path
without the query string, status, time; level error only for 5xx) and gives
every record written during the request the same `requestId`, also returned as
`x-request-id`.

## Workers

| Worker     | Enabled by                          | Holds                                                          |
| ---------- | ----------------------------------- | -------------------------------------------------------------- |
| Job        | `JOB_WORKER_ENABLED` (default true) | No key: delivery verification and upload cleanup               |
| Settlement | `SETTLEMENT_WORKER_ENABLED`         | `RELAYER_PRIVATE_KEY`; sends `reserveHold`                     |
| Finance    | `FINANCE_WORKER_ENABLED`            | `FINANCE_APPROVER_PRIVATE_KEY`, `FINANCE_EXECUTOR_PRIVATE_KEY` |

A disabled worker is never constructed and its keys are never read; an enabled
but misconfigured one fails startup. Each signing worker has its own gas budget
(`SETTLEMENT_GAS_*`, `FINANCE_GAS_*`). Settlement and finance each keep one
in-process nonce lane, so **run exactly one API replica**. With either enabled,
this public process holds signing keys: fund those wallets with only what the gas
budget needs.

The facilitator (`core/facilitator`) runs in-process with no HTTP endpoint. It
holds no key: it verifies payments and, with `SETTLEMENT_ENABLED`, journals an
intent the settlement worker picks up. Its startup checks (vault code hash,
relayer role, approved deployment policy) gate `app.ready()`.

**Routes are documented by code only.** This README describes rules,
not method/path/body catalogs. Read the route registrations in `src/modules/*`
(or an OpenAPI document generated from them) for the current HTTP surface.

## Provider apps and catalog

Wallet-authenticated owners create apps and rotate one active API key per app;
only the key hash is stored. Command writes accept the owner session or a key
with `products:write`. A key is scoped to its app. `PUBLIC` apps that are not
archived appear in the store without operator review; availability requires
`ACTIVE`, a default command and a recent provider heartbeat. Signed-in buyers
can star apps.

Every app is a chat bot. Buyers message it for free (`PRESALE_MESSAGE_LIMIT`
messages per thread between paid invocations); the provider receives
`thread.message` events, replies with `messages:write` (text, a built-in tool,
or both) and proposes priced offers with `offers:write`. Commands may declare a
`maxAmount` ceiling; the price itself always comes from an offer. A quote is
prepared from an open `offerId`, which freezes the negotiated arguments into the
input hash.
`GET /v1/invocations` lists the buyer's paid invocations for the console.

### Built-in tools

A provider opens a Payvoke component in the buyer's chat and waits for one
result. Before payment it sends `tool` with a message; during a run it sends a
`tool_call` report, which parks the invocation in `WAITING_BUYER` until the
buyer answers and a new run starts.

| Tool         | `args`                                                                                                     | Result                  |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| `ask_form`   | `title`, `description?`, `schema` (flat JSON Schema, file fields allowed), `submitLabel?`                  | the form's values       |
| `ask_choice` | `prompt`, `options: [{ id, label, description? }]` (2-12), `multiple?`, `minSelections?`, `maxSelections?` | `{ selected: [id] }`    |
| `confirm`    | `title`, `description?`, `details?: [{ label, value }]`, `confirmLabel?`, `cancelLabel?`, `variant?`       | `{ approved: boolean }` |

```http
POST /v1/provider/apps/:appId/threads/:threadId/messages
{ "clientRequestId": "q1", "content": "Which tone?",
  "tool": { "name": "ask_choice", "args": { "prompt": "Pick a tone",
    "options": [{ "id": "formal", "label": "Formal" }, { "id": "casual", "label": "Casual" }] } } }

POST /v1/provider/apps/:appId/invocations/:id/reports
{ "reportId": "r4", "sequence": 4, "type": "tool_call",
  "data": { "toolCallId": "scope", "name": "confirm", "args": { "title": "Use the long format?" } } }
```

Pre-sale results arrive as `thread.message` events with `toolResult:
{ toolCallId, result }`; run results as `invocation.tool_result` events with
`toolCallId`, `name`, `result` and the `runId` to acknowledge. Runs also show
`progress` reports (`{ stepId, label, status: running | done | failed, detail? }`,
replaced by `stepId`) as steps, and OpenUI surfaces streamed as `payvoke.openui`.

The buyer side reads `GET /v1/threads/:id/timeline` (ordered messages whose parts
are text, files and tool calls) and `GET /v1/threads/:id/events` (SSE: a full
`timeline` on connect and after each change, `delta` events for streamed text),
and answers every tool call, or declines an offer with `{ accepted: false }`,
through `POST /v1/threads/:id/tool-results`.

Audio uploads may declare `audio: { durationMs, peaks }` for the chat player;
`GET /v1/files/:id/stream` returns an inline URL for audio and images.

Files (buyer inputs and provider artifacts) use presigned S3 uploads, a
server-side completion that copies and re-hashes the bytes, and per-request
download URLs.

Protected routes chain the `requireAccount` middleware and read `c.var.account`.
Prisma is the data layer; no generic repository layer sits between services and
the client.

`auth.cli.ts` loads the same Better Auth factory as the server, without starting
the server or querying the database. It writes `prisma/auth.prisma`.

## Setup

Copy `.env.example` to `.env`. Set `DATABASE_URL`, `WEB_ORIGIN`, `API_ORIGIN` and
`BETTER_AUTH_SECRET`. Generate the secret with `openssl rand -base64 32`; keep it
stable across instances and restarts. Web/API must be same-site for `SameSite=Lax`
cookies. HTTPS is required outside loopback development. No RPC or funded wallet
is needed.

```sh
docker compose up -d redis   # Redis on 127.0.0.1:6380 (needs the root .env)
bun run migrate              # apply migrations to DATABASE_URL
bun run dev                  # API and the enabled workers
```

Files are optional. Any S3-compatible store works and only the `S3_*` values
change between environments; compose runs RustFS with the bucket and CORS for
`WEB_ORIGIN`.

```sh
docker compose up -d rustfs storage-init   # S3 on 127.0.0.1:9000, bucket payvoke-files
# .env: FILES_ENABLED=true S3_ENDPOINT=http://127.0.0.1:9000 S3_REGION=us-east-1
#       S3_BUCKET=payvoke-files S3_FORCE_PATH_STYLE=true
#       S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY = the values in the root .env
```

Without files, the job worker cannot verify file results, and they are refunded
at the delivery deadline.

Change auth fields/plugins in `src/modules/auth/auth.ts`, then run
`bun run auth:schema`; do not copy model definitions or modify generated
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
The API rate-limits auth endpoints; proxy headers are not trusted.

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

`bun test` (`bun run test`) uses ephemeral PGlite through Prisma/pg, without Docker.
Tests apply the CLI-generated migrations and exercise native auth plus the
provider/catalog endpoints. For real multi-connection PostgreSQL auth proof,
explicitly supply a `TEST_DATABASE_URL` pointing to local Docker PostgreSQL only.
Neon is production and must never be used for tests. Tests create/remove only
their own random schema; they never read `DATABASE_URL`.

Storage is in-memory in API tests. The presigned-URL behavior is tested against a
real S3 endpoint in `test/core/storage.test.ts` when `TEST_S3_ENDPOINT` points at a
disposable store (the test creates its own bucket).

Quote, x402, facilitator, settlement and finance flows are tested in `test/e2e`.
`bun run test:payments:evm` adds the real local-EVM flows (Hardhat node), and
`bun run test:conformance` checks every x402 security rule against passing tests.

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
- Core/client/server adapters live in `@payvoke/shared/x402`, pinned to core 2.28.0.
  No stock x402 framework middleware is mounted: the studied Fastify one settles at
  `onRequest`, before body validation. Final orchestration must run only after
  auth/body/ownership gates, using core's upfront flow.

To exercise quotes locally, provision an app with a default command, a thread,
an active policy and a matching `VAULT_ADDRESS` in a development DB. Quotes do
not prove onchain admission.

**Spending remains disabled by default.** With `PAYMENTS_ENABLED=false`, signed
submissions still return `SETTLEMENT_NOT_AVAILABLE`. Opt-in requires the vault
deployment settings and matching facilitator capabilities at API startup,
`SETTLEMENT_ENABLED` for journaling, and the settlement worker. The full
path is exercised on an isolated local EVM; no Fuji deployment/E2E or production
enablement has been performed.
