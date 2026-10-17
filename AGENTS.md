# Repository guidance

- Use Node 24 (`mise.toml`) and the root-pinned pnpm 12.11.2; install with `pnpm install` at the repository root.
- Commands below run from the root. There are no root build/test scripts: target `pnpm --filter backend …` or `pnpm --filter frontend …`. App-specific guidance lives in each app's `AGENTS.md`.
- The backend implements an M01 API slice; the frontend has starter routes. `docs/architecture.md` and module docs describe the target system, not completed capabilities. Backend setup and implementation limits are in `apps/backend/README.md`.
- Before implementing domain behavior, read `docs/architecture.md` and the relevant module linked from `README.md`. For payment changes, also read `docs/verification.md`; real funds and unsupported settlement remain disabled until those checks are proven.
- `packages/api/src` is the backend's generated Nestia SDK output, not an independently configured workspace package (it has no `package.json`). Regenerate through the backend rather than hand-editing SDK files.
- Formatting/linting tools are root dependencies, not scripts: use `pnpm exec oxfmt --check <paths>` and `pnpm exec oxlint <paths>` for focused checks; `pnpm exec oxfmt <paths>` writes formatting.
