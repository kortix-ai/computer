# syntax=docker.io/docker/dockerfile:1

# Shared Dockerfile for all Bun services (kortix-router, kortix-auth, kortix-cloud)
# Build from repo root: docker build --build-arg SERVICE=kortix-router -f services/Dockerfile .

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

# Install pnpm and deps for this service only
RUN corepack enable pnpm && \
    pnpm install --filter ./services/${SERVICE}...

# ---- Runner Stage ----
FROM base AS runner

WORKDIR /app

ARG SERVICE

ENV NODE_ENV=production

# Copy installed node_modules and source from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services/${SERVICE}/node_modules ./services/${SERVICE}/node_modules
COPY --from=deps /app/services/${SERVICE} ./services/${SERVICE}

WORKDIR /app/services/${SERVICE}

# Non-root user (bun image ships with 'bun' user)
USER bun

CMD ["bun", "run", "src/index.ts"]
