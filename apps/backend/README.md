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

## Test database

From the repository root:

```sh
docker compose up -d --wait test-db
TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55433/test pnpm --filter backend test
docker compose down
```

The test database is disposable; stopping the container clears its data. Integration tests migrate and truncate its tables. Never use a development or production database.

## Resources

- [NestJS](https://docs.nestjs.com/) · [OpenAPI / Swagger](https://docs.nestjs.com/openapi/introduction)
- [Nestia](https://nestia.io/docs/) · [Swagger generation](https://nestia.io/docs/swagger/) · [SDK generation](https://nestia.io/docs/sdk/)
- [Supabase Auth](https://supabase.com/docs/guides/auth) · [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [Web3](https://supabase.com/docs/guides/auth/auth-web3)
- [MikroORM](https://mikro-orm.io/docs) · [Migrations](https://mikro-orm.io/docs/migrations)
- [Fastify](https://fastify.dev/docs/latest/) · [Typia](https://typia.io/docs/)
