# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/frontend/Dockerfile .
# Web app (TanStack Start, Nitro server). The API origin is public and baked
# into the client bundle at build time.
FROM oven/bun:1.4-slim AS build
WORKDIR /app
COPY . .
# The API package is installed for its RPC types only; none of it is bundled.
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --filter frontend --filter api --filter @payvoke/shared
ARG VITE_API_ORIGIN=http://localhost:3001
ARG VITE_FUJI_RPC_URL=
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN VITE_FUJI_RPC_URL=$VITE_FUJI_RPC_URL
WORKDIR /app/apps/frontend
RUN bun --bun run build

# Nitro bundles its server dependencies into .output, so no install is needed.
FROM oven/bun:1.4-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER bun
WORKDIR /app
COPY --from=build --chown=bun /app/apps/frontend/.output .output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
