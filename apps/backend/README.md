# Backend development

Use Node 24 and run `pnpm install` from the repository root.

## Configuration

Copy `apps/backend/.env.example` to `apps/backend/.env` and set `DATABASE_URL` to an
existing PostgreSQL database, plus `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
(a publishable or legacy anon key, not a service-role key). `PORT` defaults to `8000`.
`AUTH_ORIGIN` defaults to `http://localhost:3000`; production requires an HTTPS origin.
Environment variables
override the `.env` file. Both application startup and migration commands use
`@nestjs/config` and reject invalid configuration.

The backend emits CommonJS while retaining NodeNext package resolution for modern
dependencies. Run the package commands below through `pnpm --filter backend` (or from
`apps/backend`): environment-file loading and ORM paths are relative to that working directory.

Run the backend from the repository root:

```sh
pnpm --filter backend start:dev
```

For a compiled build, run `pnpm --filter backend build`, then
`pnpm --filter backend start`.

## Database and migrations

Define entities as `*.entity.ts` under `src/`, using decorators from
`@mikro-orm/decorators/legacy`. Register repositories in feature modules with
`MikroOrmModule.forFeature([YourEntity])`. Source and compiled entity discovery
share the same configuration as the migration CLI.

```sh
pnpm --filter backend db debug
pnpm --filter backend db:migration:create
pnpm --filter backend db:migration:up
pnpm --filter backend db:migration:list
pnpm --filter backend db:migration:down
```

Create a migration only after adding entities. All migrations live in
`src/database/migrations` and compile into `dist/database/migrations`, using
MikroORM's standard migrator and one shared history. Commit generated schema
snapshots alongside migrations.

Review migrations before applying them; `db:migration:down` rolls back the last
migration and may destroy data. For a deployment with only compiled files and
production dependencies, apply migrations beforehand in a release job with the
CLI installed.

The application does not create databases, synchronize schemas, or apply migrations
on startup. Apply the committed M01 migration before serving API requests.

## Identity API (M01)

### Code organization

```text
src/config/environment.ts       Shared application/migration configuration
src/modules/identity/
  identity.module.ts            Dependency wiring and exported integration services
  identity.entity.ts            Shared persistence model (unchanged tables)
  identity.types.ts             Stable HTTP and principal contracts
  auth/                         Login/link workflows, challenges, sessions and Supabase adapter
  accounts/                     Profile and verified-identity reads
  access/                       Project authorization and membership commands
  shared/                       Typed failures, HTTP adapters, transactions and audit records
```

Controllers only adapt HTTP. `AuthenticationService` verifies proofs before
`AuthenticationStore` atomically claims identities and admits sessions. `SessionService`
owns session validation and revocation; `AccountService` owns profile access;
`ProjectAccessService` owns project permissions and membership mutations. The identity
module exports only session and project-access services for other modules. There is no
catch-all repository or generic CRUD layer.

### Supabase setup

1. Enable email authentication and the Ethereum Web3 provider. Leave social providers disabled.
2. Configure the email template to contain `{{ .Token }}` instead of only a magic link.
   The API accepts 6–10 digit codes; local challenges expire after five minutes.
3. Register `AUTH_ORIGIN` with a trailing `/` in Supabase's redirect URL allowlist
   (for example `http://localhost:3000/` or `https://app.example.com/`).
4. Configure SMTP delivery and Supabase's own Auth rate limits. The backend also enforces
   shared PostgreSQL-backed IP/identity limits; native Supabase endpoints remain publicly reachable.
   CAPTCHA-enabled Supabase projects need a separate CAPTCHA integration before using these endpoints.
5. Keep the `identity` schema out of the Data API's exposed schemas. Never grant browser
   roles access to other tables/storage merely because their token is `authenticated`.

Supabase owns user records, access tokens and refresh tokens. M01 owns the stable
`app_users` ID, display profile, identity bindings, session admissions, project membership,
challenges and audit. No passwords, OTP codes, bearer tokens or refresh tokens are stored
in the application tables.

Email and wallet can have different native Supabase user IDs. After proving the current
session and the new identity, M01 maps both subjects to one `app_users` account. This is
application-level linking, not Supabase `linkIdentity()` or a merge of existing accounts.
Consequently, `app_users.id` is independent of `auth.users.id`; future modules must use
the account ID returned by `/v1/me`, not the JWT's `sub` as the marketplace owner ID.

### Endpoints

| Method       | Path                                         | Behavior                                                   |
| ------------ | -------------------------------------------- | ---------------------------------------------------------- |
| POST         | `/v1/auth/email/otp`                         | Send OTP; body `{ email }`                                 |
| POST         | `/v1/auth/email/verify`                      | Login; body `{ challengeId, token }`                       |
| POST         | `/v1/auth/wallet/challenges`                 | SIWE message; body `{ address, chainId: 43113 }`           |
| POST         | `/v1/auth/wallet/verify`                     | Login; body `{ challengeId, signature }`                   |
| POST         | `/v1/auth/logout`                            | Revoke current marketplace session                         |
| POST         | `/v1/auth/logout-all`                        | Revoke all marketplace sessions across linked subjects     |
| GET/PATCH    | `/v1/me`                                     | Read/update display name and HTTPS avatar URL              |
| GET          | `/v1/me/identities`                          | List verified identity bindings                            |
| GET          | `/v1/me/sessions`                            | List active session admissions                             |
| POST         | `/v1/me/email/challenges`                    | Request email linking; body `{ email }`                    |
| POST         | `/v1/me/email/verify`                        | Complete linking; body `{ challengeId, token }`            |
| POST         | `/v1/me/wallet/challenges`                   | Request wallet linking; body `{ address, chainId: 43113 }` |
| POST         | `/v1/me/wallet/verify`                       | Complete linking; body `{ challengeId, signature }`        |
| GET/POST     | `/v1/projects/:projectId/members`            | List members / add `{ accountId, role }`                   |
| PATCH/DELETE | `/v1/projects/:projectId/members/:accountId` | Update `{ role }` / remove member                          |

Only the first four endpoints are public. All others require `Authorization: Bearer <accessToken>`.
Login returns `{ accessToken, refreshToken, expiresAt, tokenType, user }`.
The frontend can call Supabase `setSession()` using these tokens and let Supabase refresh them;
refresh keeps the admitted `session_id`. There is no generic JWT-to-admission exchange endpoint.
Sign the returned wallet `message` exactly with `personal_sign`/Wagmi `signMessage`.
Do not request a transaction, permit, token allowance, seed phrase or private key.

### Session and linking rules

- A native Supabase login token **alone cannot access this API**. Each request checks signature,
  issuer, audience, expiry and current Auth user, then requires a locally admitted `session_id`.
  This also blocks direct native Web3 replay from bypassing the backend's single-use challenge.
- Admissions last at most seven days, even if Supabase can still refresh the token. Sign in
  again to get a new admission. Linking requires authentication within the last ten minutes.
- Wallet challenges bind the exact message, configured domain, Fuji chain, purpose and, for
  linking, the current account/session. Atomic consumption permits only one successful attempt.
- Email verification consumes its local challenge even on an invalid OTP. Request a new code
  after a failed attempt. Provider/network failures after consumption also require a new challenge;
  uncertain outcomes are never accepted as proof or silently retried with the same signature.
- A newly verified identity already bound to another marketplace account returns `409`.
  No automatic account merging, identity removal/replacement or ownership transfer is provided.
- Logout revokes marketplace admission, not the underlying Supabase refresh token or any
  on-chain delegation. Call the API before clearing frontend state, and also call Supabase
  `signOut()` to clean up the native session. Unadmitted sessions from linking are never returned.
- Use `Cache-Control: no-store` responses as private data. Do not log login bodies or responses.
  The default Fastify adapter does not trust forwarded IP headers. Configure trusted proxy handling
  explicitly before deploying behind a proxy; do not trust arbitrary `X-Forwarded-For` values.

### Authorization and database boundary

Tables live in a private schema with RLS enabled and no browser policies. The migration
revokes public schema access and any existing `anon`/`authenticated` grants. A non-owner
role sees no rows even if SELECT is accidentally granted. The backend uses a trusted
schema-owner connection (or a deliberately provisioned backend role); **per-account RLS
is not applied to that connection**. Runtime authorization is enforced by M01 services,
not by pretending that an ORM query inherits the user's Supabase JWT.

M02 must call `ProjectAccessService.provisionOwner(em, projectId, accountId)` inside its
project-creation transaction. No public endpoint can create arbitrary ownership. Project
CRUD and the project foreign key are deferred to M02. `authorizeProject()` is the shared
read/draft/manage seam for future modules; callers must use a freshly validated principal.
Viewers read, editors read/draft, and owners manage memberships. Owner changes are blocked.
None of these roles grants spending permission. Financial and platform-operator privileges
are not modeled as project roles.

Periodically delete expired rows from `identity.auth_rate_limits` and old consumed/expired
`identity.auth_challenges` under an explicit retention policy. Retain financial references
and audit history; do not cascade-delete users when an Auth identity is deleted.

### Typed failures

M01 uses [`better-result`](https://github.com/dmmulroy/better-result) 3.x for expected
failures. Fallible policy and authentication methods return `IdentityResult<T>`
(`Result<T, IdentityError>`), with closed codes defined in `shared/identity.errors.ts`.
Workflows compose with `Result.gen` / `Result.await`; callers must inspect or propagate
`Err` before using a success value. Plain reads/helpers with no expected business failure
keep their normal return values. Unexpected database/SDK/programming failures remain thrown
(or become `Panic` inside generator composition), not disguised as invalid credentials.

Only controllers and guards call `httpValue()`, which preserves existing HTTP statuses
and the `{ code, message }` body. Neither Result envelopes, error tags nor stacks are
sent to clients. Do not throw HTTP exceptions from a Result callback: the library treats
callback exceptions as defects.

Use `identityTransaction()` for Result-returning mutations: raw MikroORM transactions
would commit a returned `Err`. The helper rolls back failures, isolates managed entities
and rethrows unexpected exceptions. M02 must handle the Result from `provisionOwner()`
inside this boundary; ignoring it or returning `Err` from raw `em.transactional()` does
not roll back a project creation. Challenge consumption stays outside provisioning
transactions, so a failed provider operation cannot reactivate a used signature or OTP.

The dependency is ESM-only and is loaded through Node 24's synchronous ESM interoperability;
the backend remains CommonJS, including the standard Nestia CLI workflow.

### Verification and remaining gates

```sh
pnpm --filter backend test
pnpm --filter backend test:typecheck
```

Unit tests mock the Supabase SDK. Integration tests use a real, **disposable** PostgreSQL
database and mocked Supabase transport; they migrate and truncate M01 tables. Set
`TEST_DATABASE_URL` explicitly to run them; without it they are reported as skipped.
Never point it at a development or customer database.

```sh
TEST_DATABASE_URL=postgresql://test:test@localhost:55433/m01_test pnpm --filter backend test
```

Only EOA signatures on Avalanche Fuji are supported. EIP-1271 smart-wallet authentication,
mobile/hardware-wallet compatibility, unlink/recovery, application-client grants, support
access, payments and frontend screens are not implemented here. Before release, test live
Supabase email delivery, native token refresh, Web3 identity shape and session revocation,
then exercise MetaMask and Rabby in-browser. No live Supabase or browser compatibility is
implied by the mocked integration tests. Paid use remains subject to `docs/verification.md`.

Official references: [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Web3](https://supabase.com/docs/guides/auth/auth-web3),
[sessions](https://supabase.com/docs/guides/auth/sessions).

## API generation

```sh
pnpm --filter backend swagger
pnpm --filter backend sdk
```

These commands build the CommonJS backend, then run the standard `nestia swagger` or
`nestia sdk` CLI using the real `AppModule` from `nestia.config.ts`. The build supplies
compiled entities for the CLI's application discovery. Both commands require a reachable
database and the Auth environment variables, but do not call Supabase. SDK files in
`packages/api/src` are generated; no custom generation runner is needed.

## Focused checks

```sh
pnpm --filter backend exec ttsc --noEmit -p tsconfig.build.json
```

`test` compiles TypeScript with `ttsc` before Vitest so Nestia transforms and Nest's
decorator metadata match the application build; `.test-build` is disposable generated output.
The `.mts` test harness stays ESM for Vitest and loads the actual compiled CommonJS backend.
