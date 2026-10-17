# Backend

NestJS, Fastify, MikroORM/PostgreSQL, Supabase Auth and Nestia.

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

```sh
pnpm --filter backend build
pnpm --filter backend start
pnpm --filter backend swagger
pnpm --filter backend sdk
```

`swagger` writes `dist/swagger.json`; `sdk` generates `packages/api/src`. Both commands need the backend environment and a reachable database. Do not edit generated SDK files.

## Authentication

Sign in, refresh sessions and sign out through Supabase Auth. Enable email OTP and Ethereum Web3 in Supabase, configure redirect URLs, SMTP and rate limits there. Use a publishable key, never a service-role key in the browser.

The frontend browser client is `getSupabase()` from `~/lib/supabase`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using `apps/frontend/.env.example`. Login screens are not implemented yet.

Send the Supabase access token as `Authorization: Bearer <token>`. The backend verifies it with `auth.getUser(token)` and exposes only `GET /v1/me` and `PATCH /v1/me` for profiles. `public.app_users.id` matches `auth.users.id`; the first authenticated request creates the profile. RLS and revoked browser grants keep profile writes behind the backend.

Supabase owns identity linking; use its supported `updateUser`/`linkIdentity` flows. Separate Supabase user IDs remain separate accounts. There is no custom account merge, session registry, project membership or immediate application-level token revocation. Signed-out access tokens may remain valid until Supabase rejects them or they expire.

## Test database

From the repository root:

```sh
docker compose up -d --wait test-db
TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55433/test pnpm --filter backend test
docker compose down
```

The test database is disposable; stopping the container clears its data. Integration tests apply migrations and clear application profiles with mocked Supabase verification. Never use a development or production database.

## Resources

- [NestJS](https://docs.nestjs.com/) · [OpenAPI / Swagger](https://docs.nestjs.com/openapi/introduction)
- [Nestia](https://nestia.io/docs/) · [Swagger generation](https://nestia.io/docs/swagger/) · [SDK generation](https://nestia.io/docs/sdk/)
- [Supabase Auth](https://supabase.com/docs/guides/auth) · [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [Web3](https://supabase.com/docs/guides/auth/auth-web3)
- [MikroORM](https://mikro-orm.io/docs) · [Migrations](https://mikro-orm.io/docs/migrations)
- [Fastify](https://fastify.dev/docs/latest/) · [Typia](https://typia.io/docs/)
