# Backend

## Execution and checks

- From the repository root: `pnpm --filter backend start:dev` runs source in watch mode via `ttsc/register`; `pnpm --filter backend build` compiles with `ttsc`, then `pnpm --filter backend start` runs `dist/main.js`.
- Focused source typecheck: `pnpm --filter backend exec ttsc --noEmit -p tsconfig.build.json`.
- `test` runs source tests through `@ttsc/unplugin/vite` using `tsconfig.json`; run `test:typecheck` separately. Integration tests migrate/truncate M01 tables only when `TEST_DATABASE_URL` is explicitly supplied; use a disposable database. Without it, integration tests skip.

## Wiring and code generation

- `src/main.ts` boots Nest/Fastify; `AppModule` wires MikroORM and M01. Before auth changes, read `README.md#identity-api-m01` for session-admission and account-linking invariants.
- Backend TypeScript uses NodeNext resolution with CommonJS output (`type: commonjs`) and decorator metadata. Local `.js` imports resolve to TypeScript sources during development. In Vitest, use ESM imports and `vi.mock`; native `require` bypasses Vite transforms. Integration tests import migrations through `migrationsList`; add new migrations there as needed.
- `nestia.config.ts` creates its own Nest/Fastify app from `AppModule`, rather than invoking `main.ts`. Generation uses the standard Nestia CLI after a build for compiled entity discovery; keep discovery wired through that module.
- From the root, `pnpm --filter backend swagger` writes `dist/swagger.json`; `pnpm --filter backend sdk` writes `packages/api/src`. Change API sources first, then regenerate outputs.
