#!/bin/sh
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix Frontend — Docker Entrypoint                                       ║
# ║                                                                            ║
# ║  Rewrites baked-in localhost:8008 URLs in the Next.js bundle when either:  ║
# ║    1. KORTIX_PUBLIC_URL is set (VPS mode → full domain rewrite)            ║
# ║    2. NEXT_PUBLIC_BACKEND_URL differs from default (port remap)            ║
# ║  When neither is set, starts the server as-is.                             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

BAKED_BACKEND="http://localhost:8008/v1"
BAKED_HOST="http://localhost:8008"

if [ -n "$KORTIX_PUBLIC_URL" ]; then
  # VPS mode: rewrite to public domain
  PUBLIC_URL="${KORTIX_PUBLIC_URL%/}"
  echo "[entrypoint] VPS mode: rewriting URLs → ${PUBLIC_URL}"

  find /app/apps/frontend/.next -name '*.js' -o -name '*.html' | while read -r file; do
    sed -i \
      -e "s|${BAKED_BACKEND}|${PUBLIC_URL}/v1|g" \
      -e "s|${BAKED_HOST}|${PUBLIC_URL}|g" \
      "$file"
  done

  echo "[entrypoint] URL rewrite complete"

elif [ -n "$NEXT_PUBLIC_BACKEND_URL" ] && [ "$NEXT_PUBLIC_BACKEND_URL" != "$BAKED_BACKEND" ]; then
  # Local mode with non-default port: rewrite to match compose port mapping
  RUNTIME_BACKEND="${NEXT_PUBLIC_BACKEND_URL%/}"
  # Derive the host URL (strip /v1 suffix)
  RUNTIME_HOST=$(echo "$RUNTIME_BACKEND" | sed 's|/v1$||')

  echo "[entrypoint] Port remap: rewriting ${BAKED_BACKEND} → ${RUNTIME_BACKEND}"

  find /app/apps/frontend/.next -name '*.js' -o -name '*.html' | while read -r file; do
    sed -i \
      -e "s|${BAKED_BACKEND}|${RUNTIME_BACKEND}|g" \
      -e "s|${BAKED_HOST}|${RUNTIME_HOST}|g" \
      "$file"
  done

  echo "[entrypoint] URL rewrite complete"
fi

# Start the server
exec node apps/frontend/server.js
