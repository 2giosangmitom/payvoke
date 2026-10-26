# syntax=docker/dockerfile:1
# One image per service: docker build --target <api|facilitator|settlement-worker|finance-worker|job-worker|migrate> .

FROM node:24-slim AS base
# Matches devEngines.packageManager in the root package.json.
RUN npm install --global pnpm@12.14.0

FROM base AS build
WORKDIR /repo
COPY . .
# Installs dev dependencies too, so the root postinstall can generate the Prisma client.
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --frozen-lockfile
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm deploy --store-dir /var/cache/pnpm --filter=api --prod /prod/api && \
    pnpm deploy --store-dir /var/cache/pnpm --filter=facilitator --prod /prod/facilitator && \
    pnpm deploy --store-dir /var/cache/pnpm --filter=settlement-worker --prod /prod/settlement-worker && \
    pnpm deploy --store-dir /var/cache/pnpm --filter=finance-worker --prod /prod/finance-worker && \
    pnpm deploy --store-dir /var/cache/pnpm --filter=job-worker --prod /prod/job-worker && \
    pnpm deploy --store-dir /var/cache/pnpm --filter=@payvoke/db /prod/migrate

# Runtime runs binaries directly: `pnpm run` would re-verify the build-time lockfile paths.
FROM base AS runtime
ENV NODE_ENV=production
USER node

FROM runtime AS api
WORKDIR /app
COPY --from=build --chown=node /prod/api .
ENV HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "src/server.ts"]

FROM runtime AS facilitator
WORKDIR /app
COPY --from=build --chown=node /prod/facilitator .
# Bind to a private interface only; the API reaches it over loopback or TLS.
ENV PORT=3002
EXPOSE 3002
CMD ["node_modules/.bin/tsx", "src/server.ts"]

FROM runtime AS settlement-worker
WORKDIR /app
COPY --from=build --chown=node /prod/settlement-worker .
CMD ["node_modules/.bin/tsx", "src/main.ts"]

FROM runtime AS finance-worker
WORKDIR /app
COPY --from=build --chown=node /prod/finance-worker .
CMD ["node_modules/.bin/tsx", "src/main.ts"]

FROM runtime AS job-worker
WORKDIR /app
COPY --from=build --chown=node /prod/job-worker .
CMD ["node_modules/.bin/tsx", "src/main.ts"]

# One-shot job: applies Prisma migrations to DATABASE_URL, then exits.
FROM runtime AS migrate
WORKDIR /app
COPY --from=build --chown=node /prod/migrate .
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
