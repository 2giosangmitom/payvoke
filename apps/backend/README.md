# Backend

Fastify, MikroORM/PostgreSQL, Supabase Auth and TypeBox.

## Run

Use Node 24 and pnpm 12.11.2. From the repository root:

```sh
pnpm install
cp apps/backend/.env.example apps/backend/.env
```

Set the database URL, Supabase URL and publishable key in `.env`. Use an existing PostgreSQL database.

```sh
pnpm --filter backend db:migration:up
pnpm --filter backend start:dev
```

The default port is `8000`. Swagger UI is at `/docs`; its OpenAPI document is at `/docs-json`.

The backend is ESM. `start:dev` runs TypeScript sources directly with `tsx watch src/main.ts`; run `typecheck` separately to check types. `build` compiles to `dist` with `tsc`, and `start` runs `dist/main.js`. Every `db:*` command builds first and runs the MikroORM CLI against `dist`.

Migration execution uses the explicit `applicationMigrations` registry in `src/database/mikro-orm.options.ts`, shared with integration tests. TypeScript does not remove obsolete files from `dist`; the registry prevents an old compiled migration from being discovered and executed. After generating a migration, add its class to that registry before running it. The migration-discovery test checks that every source migration is registered and stale output is ignored.

```sh
pnpm --filter backend build
pnpm --filter backend start
pnpm --filter backend swagger
pnpm --filter backend sdk
```

`swagger` uses Fastify CLI's `generate-swagger` command with the application plugin in `dist/app.js` to write `dist/swagger.json` without touching the database; `sdk` regenerates `apps/frontend/src/lib/schema.d.ts` with `openapi-typescript`. Change API sources first, then regenerate outputs; do not edit generated files by hand.

## Structure

The backend is a modular monolith. Identity owns its profiles and has four small layers:

- `src/modules/identity/domain`: plain `AppUser` objects, profile rules and typed failures; no ORM or HTTP dependencies.
- `src/modules/identity/application`: account use cases and the profile repository interface.
- `src/modules/identity/infrastructure`: explicit MikroORM `EntitySchema`, PostgreSQL repository and Supabase adapter.
- `src/modules/identity/http`: Fastify routes, authentication preHandler, TypeBox schemas and HTTP error mapping.

`src/plugins/awilix.ts` composes these layers. Each request gets a forked entity manager and scoped repository/use cases; Supabase authentication is shared. Profile creation handles concurrent first requests with `ON CONFLICT DO NOTHING`. Schema metadata is registered explicitly in `src/database/mikro-orm.options.ts`, without decorators or `reflect-metadata`; migrations still own database changes.

Add future business modules alongside identity, keeping persistence and transport out of their domain rules. There are no generic base repositories, event buses or separate deployments to maintain.

`src/modules/workspace` follows the same four-layer shape for the initial M02 slice: private workspaces, briefs, conversations, and idempotent text turns. See the [M02 implementation status and replay contract](../../docs/modules/02-workspace-and-conversation.md#implementation-status). Normal text uses an explicitly labelled deterministic development responder, not a real model or provider. Owner-only slash commands use separate Gateway invocation records; no spending or buyer execution is enabled.

`src/modules/publishing` implements the [M07 publishing core](../../docs/modules/07-provider-publishing.md#implemented-core): owner-only provider profiles/listings, immutable manifest candidates, operator catalog review, publication/pause and public discovery. Apply the publishing migration before use. `publishing:review` is a trusted local operator command; it is not available through provider HTTP tokens. Catalog review never enables execution or makes endpoint probes. A single-purpose [Logo Designer](../../packages/logo-designer/README.md), implemented with Mastra, lives under `packages/`.

## Authentication

The [development Provider Gateway](../../docs/modules/04-jobs-and-provider-execution.md#implemented-development-gateway) adds application management, scoped/revocable API keys, REST slash-command registration and outbound WebSocket invocation/result delivery. Apply all registered migrations (including `Migration20261018020000` and the additive conversation references in `Migration20261018030000`) before use. Application/key management and owner-only development invocation use Supabase sessions; command registration and Gateway upgrade use provider API keys, never browser sessions. The application profile must be active. Provider console UI now includes applications/keys/commands and a Playground. Gateway v2 manifests bind reviewed listings to immutable command revisions; workspace slash commands can invoke only the owner's published bindings. Registration/publication never grants buyer admission, purchases or spending authority. Build/run the provider SDK and synthetic example using its [README](../../packages/provider-sdk/README.md); real model use requires provider opt-in.

Sign in, refresh sessions and sign out through Supabase Auth. Enable email magic links and Ethereum Web3 in Supabase, configure redirect URLs, SMTP and rate limits there. Use a publishable key, never a service-role key in the browser.

The frontend browser client is `getSupabase()` from `~/lib/supabase`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `apps/frontend/.env`. The frontend sign-in dialog uses email magic links; see [frontend setup](../frontend/README.md) for email templates. There are no backend login or OTP endpoints to display in Swagger; the documented profile routes are `GET /v1/me` and `PATCH /v1/me`.

Send the Supabase access token as `Authorization: Bearer <token>`. The `requireAuth` preHandler verifies it with `auth.getUser(token)` and exposes only `GET /v1/me` and `PATCH /v1/me` for profiles. `public.app_users.id` matches `auth.users.id`; the first authenticated request creates the profile. RLS and revoked browser grants keep profile writes behind the backend.

Supabase owns identity linking; use its supported `updateUser`/`linkIdentity` flows. Separate Supabase user IDs remain separate accounts. There is no custom account merge, session registry, project membership or immediate application-level token revocation. Signed-out access tokens may remain valid until Supabase rejects them or they expire.

## Test database

From the repository root:

```sh
docker compose up -d --wait test-db
TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55433/test pnpm --filter backend test
docker compose down
```

The test database is disposable; stopping the container clears its data. Integration tests apply migrations and clear application profiles (cascading to their workspaces, conversations and provider listings) with a stubbed Supabase verifier. They also roll back/reapply post-identity migrations in the disposable database. Never use a development or production database.

## Resources

- [Fastify](https://fastify.dev/docs/latest/) · [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/)
- [@fastify/swagger](https://github.com/fastify/fastify-swagger) · [@fastify/swagger-ui](https://github.com/fastify/fastify-swagger-ui)
- [TypeBox](https://github.com/sinclairzx81/typebox) · [Type provider](https://github.com/fastify/fastify-type-provider-typebox)
- [Awilix](https://github.com/jeffijoe/awilix) · [@fastify/awilix](https://github.com/fastify/fastify-awilix)
- [openapi-typescript](https://openapi-ts.dev/) · [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
- [Supabase Auth](https://supabase.com/docs/guides/auth) · [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [Web3](https://supabase.com/docs/guides/auth/auth-web3)
- [MikroORM](https://mikro-orm.io/docs) · [Migrations](https://mikro-orm.io/docs/migrations)
