# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/api/Dockerfile .
# HTTP API, x402 gateway with its in-process facilitator, and the workers the
# environment enables, bundled into one file. Apply migrations before each
# release with `bun run migrate` (the Railway pre-deploy command).
FROM oven/bun:1.4-slim AS base
# Prisma's migration engine links against OpenSSL, which the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY . .
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --filter api --filter @payvoke/shared
WORKDIR /app/apps/api
# Filtered installs skip the root postinstall; the bundle embeds this client.
# The externals are schema converters for libraries the API does not use
# (only reachable through dynamic imports), left out to keep the bundle small.
RUN bunx prisma generate && bun build src/server.ts --target=bun --minify \
    --external effect --external zod-to-json-schema --outfile dist/server.js

# The Prisma CLI is the only runtime dependency left outside the bundle.
FROM base AS migrate
COPY <<EOF package.json
{
  "private": true,
  "type": "module",
  "scripts": { "migrate": "prisma migrate deploy" }
}
EOF
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun add --exact prisma@7.10.1 dotenv@18.0.9

FROM base
ENV NODE_ENV=production
COPY --from=migrate /app/package.json package.json
COPY --from=migrate /app/node_modules node_modules
COPY --from=build /app/apps/api/prisma prisma
COPY --from=build /app/apps/api/prisma.config.ts prisma.config.ts
COPY --from=build /app/apps/api/dist/server.js server.js
USER bun
ENV HOST=0.0.0.0 PORT=3001
EXPOSE 3001
# --smol trades a little throughput for a smaller heap (512 MB instances).
CMD ["bun", "--smol", "server.js"]
