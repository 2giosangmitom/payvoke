# Payvoke frontend

TanStack Start app, built with Vite and Nitro for server-side rendering. It
talks to the API through a typed Hono RPC client (`src/lib/api/client.ts`,
types from `api/rpc`) and manages document head tags with unhead.

```sh
bun run --cwd apps/frontend dev        # http://localhost:3000
bun run --cwd apps/frontend build      # .output/, run with `bun .output/server/index.mjs`
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend test
```

The API package is a dev dependency for its RPC types only: `import type`
erases it, so no server code reaches the browser bundle.

## Deploy to Vercel

Import this repository as a Vercel project with these settings:

- **Root Directory:** `apps/frontend`
- **Framework Preset:** `TanStack Start`
- **Build Command / Output Directory:** leave as framework defaults (no overrides)
- **Install Command:** leave at the detected Bun workspace default (`bun.lock` at the repo root)

The `nitro/vite` plugin in `vite.config.ts` generates the server function and
static assets that Vercel serves. `vercel.json` explicitly selects the TanStack
Start framework for this package in the monorepo. Avoid configuring this as a
static Vite site or pointing the output directory at `dist/client`.

Set `VITE_API_ORIGIN` in Vercel's environment variables to the deployed backend
origin, then redeploy. This value is public because it is bundled into the
browser; never use `VITE_` for secrets. See `.env.example` for local defaults.

After deployment, open `/`, `/agents`, and `/app` directly (including on refresh)
to confirm SSR routing. If Vercel still returns `404_NOT_FOUND`, check that the
project's Root Directory and framework preset above match the deployed Git
revision, and inspect that deployment's build logs.
