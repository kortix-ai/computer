# syntax=docker.io/docker/dockerfile:1
#
# Lightweight runner-only image.
# Build the frontend on the HOST first:
#   cd apps/frontend && NEXT_OUTPUT=standalone pnpm run build
# Then from repo root:
#   docker build -f apps/frontend/Dockerfile -t kortixmarko/kortix-frontend:latest .
#
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy pre-built standalone output from the host.
COPY --chown=nextjs:nodejs apps/frontend/.next/standalone ./
COPY --chown=nextjs:nodejs apps/frontend/.next/static ./apps/frontend/.next/static
COPY --chown=nextjs:nodejs apps/frontend/public ./apps/frontend/public

# Copy entrypoint script (needs to run as root for VPS URL rewriting)
COPY apps/frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# In local mode (no KORTIX_PUBLIC_URL), runs as nextjs user via CMD.
# In VPS mode, entrypoint does sed as root, then exec's node as nextjs.
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use entrypoint for VPS URL rewriting support
ENTRYPOINT ["/docker-entrypoint.sh"]
