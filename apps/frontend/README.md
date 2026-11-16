# Payvoke frontend

TanStack Start app with Vite and Nitro for server-side rendering. Talks to the API through a typed Hono RPC client.

```sh
bun run --cwd apps/frontend dev        # http://localhost:3000
bun run --cwd apps/frontend build
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend test
```

## Deploy to Vercel

Import the repository with these settings:

- **Root Directory:** `apps/frontend`
- **Framework Preset:** `TanStack Start`
- **Build Command / Output Directory:** leave as framework defaults
- **Install Command:** leave at the detected Bun workspace default

Set `VITE_API_ORIGIN` in Vercel's environment variables to the deployed backend origin, then redeploy.
