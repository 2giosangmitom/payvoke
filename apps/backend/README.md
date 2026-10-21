# Backend

## Structure

```text
src/
  server.ts             # process startup and graceful shutdown
  app.ts                # app composition and DB lifecycle
  config.ts             # typed environment config and log redaction
  database/client.ts    # Prisma/pg client creation
  http/errors.ts        # sanitized Fastify error responses
  plugins/http.ts       # sensible, helmet, CORS, cookies and rate limits
  modules/auth/
    auth.ts             # Better Auth + Prisma + SIWE, Payvoke policy hooks
    index.ts            # Fastify bridge, session guard and /v1/me
```

Add features under `modules/<feature>` and register them after auth in `app.ts`.
Protected routes use `preHandler: app.requireAccount`. Use existing Fastify
plugins and TypeBox type inference for application routes. No generic repository
or DI layers are needed. `generated/prisma` is CLI output.

`auth.cli.ts` loads the same Better Auth factory as the server, without starting
Fastify or querying the database. `prisma/auth.prisma` is owned by Better Auth
CLI; do not hand-edit its models. `prisma/schema.prisma` keeps the commented
domain drafts separately. Prisma reads the whole `prisma` directory.

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
the single CLI-generated initial migration and exercise native auth
endpoints. For real multi-connection PostgreSQL proof, explicitly supply a
`TEST_DATABASE_URL` pointing to local Docker PostgreSQL only. Neon is production
and must never be used for tests. Tests create/remove
only their own random schema; they never read `DATABASE_URL`. PGlite serializes DB
work and does not prove cross-process PostgreSQL concurrency.
