# syntax=docker/dockerfile:1
# Build from the repository root. Run one replica with /app/.data on a volume.
FROM oven/bun:1.4-slim AS base
WORKDIR /app

FROM base AS build
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts --filter cv-reviewer
WORKDIR /app/examples/cv-reviewer
RUN bun build src/index.ts --target=bun --minify --outdir dist

FROM base
ENV NODE_ENV=production STATE_DIR=/app/.data
RUN mkdir -p .data dist && chown bun:bun .data
# Preserve the dist/../assets path used by the PDF renderer.
COPY --from=build /app/examples/cv-reviewer/dist/ ./dist/
COPY --from=build /app/examples/cv-reviewer/assets/ ./assets/
USER bun
CMD ["bun", "dist/index.js"]
