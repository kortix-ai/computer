#!/bin/sh
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix Frontend — Docker Entrypoint                                       ║
# ║                                                                            ║
# ║  When KORTIX_PUBLIC_URL is set (VPS mode), replaces baked-in localhost      ║
# ║  URLs in the Next.js bundle with the actual public URL.                    ║
# ║  When not set (local mode), starts the server as-is.                       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

if [ -n "$KORTIX_PUBLIC_URL" ]; then
  # Strip trailing slash
  PUBLIC_URL="${KORTIX_PUBLIC_URL%/}"

  echo "[entrypoint] VPS mode: rewriting URLs → ${PUBLIC_URL}"

  # Replace baked-in localhost URLs in the JS/HTML bundle
  # All sandbox requests now route through the backend (/v1/sandbox/*),
  # so we only need to replace the backend URL.
  find /app/apps/frontend/.next -name '*.js' -o -name '*.html' | while read -r file; do
    sed -i \
      -e "s|http://localhost:8008/v1|${PUBLIC_URL}/v1|g" \
      -e "s|http://localhost:8008|${PUBLIC_URL}|g" \
      "$file"
  done

  echo "[entrypoint] URL rewrite complete"
fi

# Drop to nextjs user and start the server
exec node apps/frontend/server.js
