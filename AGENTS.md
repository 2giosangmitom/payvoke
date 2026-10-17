# Repository guidance

- Use Node 24 (`mise.toml`) and the root-pinned pnpm 12.11.2; install with `pnpm install` at the repository root.
- Commands below run from the root. There are no root build/test scripts: target `pnpm --filter backend …` or `pnpm --filter frontend …`. App-specific guidance lives in each app's `AGENTS.md`.
- The backend implements an M01 API slice; the frontend has starter routes. `docs/architecture.md` and module docs describe the target system, not completed capabilities. Backend setup and implementation limits are in `apps/backend/README.md`.
- Before implementing domain behavior, read `docs/architecture.md` and the relevant module linked from `README.md`. For payment changes, also read `docs/verification.md`; real funds and unsupported settlement remain disabled until those checks are proven.
- The frontend owns the API client in `apps/frontend/src/lib/api.ts` and generated types in `apps/frontend/src/lib/schema.d.ts`. Regenerate types through `pnpm --filter backend sdk` rather than hand-editing them.
- Formatting/linting tools are root dependencies, not scripts: use `pnpm exec oxfmt --check <paths>` and `pnpm exec oxlint <paths>` for focused checks; `pnpm exec oxfmt <paths>` writes formatting.
