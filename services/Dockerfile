# syntax=docker.io/docker/dockerfile:1

# Shared Dockerfile for Bun services (kortix-api)
# Build from repo root: docker build --build-arg SERVICE=kortix-api -f services/Dockerfile .

ARG BUN_VERSION=1.2
FROM oven/bun:${BUN_VERSION}-slim AS base

# ---- Deps Stage ----
# Install with pnpm (matches lockfile), run with bun
FROM node:22-slim AS deps

WORKDIR /app

ARG SERVICE

# Copy workspace root files for pnpm install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy the target service and workspace packages it depends on
COPY services/${SERVICE} ./services/${SERVICE}
COPY packages/ ./packages/

# Install pnpm and deps for this service + workspace packages it depends on.
# --shamefully-hoist flattens node_modules (no symlinks) so COPY works on all Docker versions.
# Include devDeps so drizzle-kit is available for schema push at runtime.
RUN corepack enable pnpm && \
    pnpm install --filter ./services/${SERVICE}... --shamefully-hoist --prod=false

# ---- Runner Stage ----
FROM base AS runner

WORKDIR /app

ARG SERVICE

ENV NODE_ENV=production

# License
COPY LICENSE /LICENSE

# Changelog (read by version endpoint — avoids GitHub raw fetch for private repos)
COPY sandbox/CHANGELOG.json /app/CHANGELOG.json

# Copy installed node_modules and source from deps stage.
# Root node_modules contains all hoisted deps (--shamefully-hoist).
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages — source only, skip nested node_modules
# which may contain stale symlinks to the .pnpm store.
COPY --from=deps /app/packages/shared/src ./packages/shared/src
COPY --from=deps /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=deps /app/packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY --from=deps /app/packages/db/src ./packages/db/src
COPY --from=deps /app/packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts
COPY --from=deps /app/packages/db/package.json ./packages/db/package.json
COPY --from=deps /app/packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY --from=deps /app/packages/opencode-channels/src ./packages/opencode-channels/src
COPY --from=deps /app/packages/opencode-channels/package.json ./packages/opencode-channels/package.json
COPY --from=deps /app/packages/opencode-channels/tsconfig.json ./packages/opencode-channels/tsconfig.json
COPY --from=deps /app/packages/opencode-channels/tsconfig.build.json ./packages/opencode-channels/tsconfig.build.json

# Copy the service (source + its node_modules if any)
COPY --from=deps /app/services/${SERVICE} ./services/${SERVICE}

WORKDIR /app/services/${SERVICE}

# Non-root user (bun image ships with 'bun' user)
USER bun

CMD ["bun", "run", "src/index.ts"]
