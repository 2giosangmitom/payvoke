# @payvoke/db

Prisma schema, migrations and generated client shared by every service. Each
service passes its own `DATABASE_URL` to `createDatabase()`; this package's
`.env` is read only by the Prisma CLI.

`prisma/auth.prisma` is owned by Better Auth CLI (generated from
`apps/api/auth.cli.ts`); do not hand-edit its models. `prisma/schema.prisma` keeps the commented
domain drafts separately. Prisma reads the whole `prisma` directory.

`prisma/commerce.prisma` contains the minimal active product/version/command,
usage-session, deployment-policy and quote models. Buyer IDs are Better Auth
`User.id` scalars; admission checks the authenticated user/session owner. No
inverse relations were hand-added to CLI-owned auth models. Existing full-domain
definitions in the commented drafts are not additional active models.

Create and apply migrations with Prisma CLI, not handwritten SQL. From this directory:

```sh
cp .env.example .env
pnpm migrate:create --name change_name # generate only
pnpm migrate:dev --name change_name    # generate and apply in development
pnpm migrate                           # apply existing migrations
pnpm generate                          # regenerate Prisma Client after schema changes
```

`pnpm install` runs `generate` automatically. Auth models come from
`pnpm --filter api auth:schema`, which needs the generated client.

`migrate dev` requires a development DB and a shadow DB Prisma can create/use;
never point it at production. Better Auth models are generated directly using
the pinned `auth@1.7.11` CLI with its native table names; `pnpm auth:schema`
rewrites `auth.prisma`, so re-add `previewFeatures = ["partialIndexes"]` to its
generator if the CLI drops it (the one-active-key index on `app_api_keys` needs it).

History was squashed before the first production deployment into a single
`20261026000000_init` migration, generated with `prisma migrate diff --from-empty
--to-schema prisma --script`. Databases that applied the earlier migrations must be
recreated, not upgraded; never run reset/db push against real data.
