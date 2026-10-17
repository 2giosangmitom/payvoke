# Backend

## Execution and checks

- From the repository root: `pnpm --filter backend start:dev` runs `tsx watch src/main.ts` without typechecking; `pnpm --filter backend build` compiles with `tsc`, then `pnpm --filter backend start` runs `dist/main.js`.
- Focused source typecheck: `pnpm --filter backend exec tsc --noEmit -p tsconfig.build.json`.
- `test` runs source tests through Vitest with the default transform; run `test:typecheck` separately. Integration tests migrate and clear profiles only when `TEST_DATABASE_URL` is explicitly supplied; use a disposable database. Without it, integration tests skip.

## Wiring and code generation

- `src/main.ts` boots Fastify through `src/app.ts` (`createApp`); `src/plugins/awilix.ts` wires MikroORM, config and the identity services into the Awilix container. Before auth changes, read `README.md#authentication`. Supabase owns authentication and sessions; application profile IDs match Supabase user IDs. MikroORM must not manage Supabase's `auth` schema.
- Backend TypeScript is ESM (`type: module`) with NodeNext resolution. Local `.js` imports resolve to TypeScript sources during development. In Vitest, use ESM imports and `vi.mock`. Register new migrations in `applicationMigrations` in `src/database/mikro-orm.options.ts`; the CLI and integration tests share this allowlist so stale `dist` files cannot execute.
- Identity uses `domain` (plain objects and rules), `application` (use cases and repository interface), `infrastructure` (MikroORM schemas/repository and Supabase), and `http` (Fastify and TypeBox). Domain and application code are independent of Fastify and MikroORM.
- The ORM uses explicit `EntitySchema` registration in `src/database/mikro-orm.options.ts`, without decorators or reflection. The CLI loads `dist/mikro-orm.config.js` and `dist/database/migrations`; run `pnpm --filter backend build` before `db:*` commands.
- From the root, `pnpm --filter backend swagger` uses Fastify CLI's `generate-swagger` with the default plugin export in `src/app.ts` to write `dist/swagger.json`; `pnpm --filter backend sdk` regenerates `apps/frontend/src/lib/schema.d.ts` with `openapi-typescript`. Change API sources first, then regenerate outputs. Do not edit generated files by hand.
