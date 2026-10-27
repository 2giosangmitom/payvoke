# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/facilitator/Dockerfile .
# Private x402 facilitator: verifies and settles holds for the API.
FROM node:24-slim AS base
# Prisma's engines link against OpenSSL, which the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
# Matches devEngines.packageManager in the root package.json.
RUN npm install --global pnpm@12.14.0

FROM base AS build
WORKDIR /repo
COPY . .
# Installs dev dependencies too, so the root postinstall can generate the Prisma client.
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --frozen-lockfile
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm deploy --store-dir /var/cache/pnpm --filter=facilitator --prod /prod/app

# Runs binaries directly: `pnpm run` would re-verify the build-time lockfile paths.
FROM base
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=build --chown=node /prod/app .
# Never publish this port: the API reaches it over a private network or TLS.
ENV PORT=3002
EXPOSE 3002
CMD ["node_modules/.bin/tsx", "src/server.ts"]
