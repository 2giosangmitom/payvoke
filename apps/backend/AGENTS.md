# Backend

## Execution and checks

- From the repository root: `pnpm --filter backend start:dev` runs source in watch mode via `ttsc/register`; `pnpm --filter backend build` compiles with `ttsc`, then `pnpm --filter backend start` runs `dist/main.js`.
- Focused source typecheck: `pnpm --filter backend exec ttsc --noEmit -p tsconfig.build.json`.
- Test wiring is incomplete: `test` and `test:watch` call an undefined `test:clean`; `test:compile` and `test:typecheck` reference a missing `tsconfig.test.json`. `test/` is empty. Do not report these scripts as passing verification.

## Wiring and code generation

- `src/main.ts` boots Nest with Fastify on port 8000. Register features in `src/modules/app.module.ts`, currently an empty module; there are no implemented endpoints or configured persistence yet.
- Backend TypeScript uses NodeNext ESM with decorator metadata; local source imports use `.js` extensions even when the target is a `.ts` file.
- `nestia.config.ts` creates its own Nest/Fastify app from `AppModule`, rather than invoking `main.ts`. Keep API discovery wired through that module.
- From the root, `pnpm --filter backend swagger` writes `dist/swagger.json`; `pnpm --filter backend sdk` writes `packages/api/src`. Change API sources first, then regenerate outputs.
