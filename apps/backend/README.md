# Backend development

Use Node 24 and run `pnpm install` from the repository root.

## Configuration

Copy `apps/backend/.env.example` to `apps/backend/.env` and set `DATABASE_URL` to an
existing PostgreSQL database. `PORT` defaults to `8000`. Environment variables
override the `.env` file. Both application startup and migration commands use
`@nestjs/config` and reject invalid configuration.

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
on startup. No domain entities or initial migration are included yet.

## Focused checks

```sh
pnpm --filter backend exec ttsc --noEmit -p tsconfig.build.json
```

The scaffold's other test scripts are not wired up yet.
