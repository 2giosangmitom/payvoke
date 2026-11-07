# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f examples/job-finder/Dockerfile .
# The Job Finder agent bundled into one file. It opens no port: it reads the
# Payvoke event feed over SSE. Pass the variables from .env.example at run time
# and mount a volume on /app/.data so job state survives restarts.
FROM oven/bun:1.4-slim AS base
WORKDIR /app

FROM base AS build
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts --filter job-finder
WORKDIR /app/examples/job-finder
RUN bun build src/index.ts --target=bun --minify --sourcemap=linked \
    --outdir dist

FROM base
ENV NODE_ENV=production STATE_DIR=/app/.data
RUN mkdir .data && chown bun:bun .data
COPY --from=build /app/examples/job-finder/dist/ ./
USER bun
CMD ["bun", "index.js"]
