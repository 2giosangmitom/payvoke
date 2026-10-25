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
the pinned `auth@1.7.11` CLI with its native table names. The single initial migration
was generated with `prisma migrate diff --from-empty --to-schema
prisma --script --output
prisma/migrations/20261020000000_init_better_auth/migration.sql`.
No Neon migration has been applied by the implementation process.

Migration history has been regenerated for a fresh database, not as an upgrade
from the previous schema. If a database already applied older migrations, stop
and plan its transition separately; do not run reset/db push or drop real data.
