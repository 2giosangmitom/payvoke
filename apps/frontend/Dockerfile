# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/frontend/Dockerfile .
# Web app (TanStack Start, Nitro node-server). The API origin is public and
# baked into the client bundle at build time.
FROM node:24-slim AS base
# Matches devEngines.packageManager in the root package.json.
RUN npm install --global pnpm@12.14.0

FROM base AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --frozen-lockfile
ARG VITE_API_ORIGIN=http://localhost:3001
ARG VITE_FUJI_RPC_URL=
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN VITE_FUJI_RPC_URL=$VITE_FUJI_RPC_URL
RUN pnpm --filter frontend build

# Nitro bundles its server dependencies into .output, so no install is needed.
FROM node:24-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
WORKDIR /app
COPY --from=build --chown=node /repo/apps/frontend/.output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
