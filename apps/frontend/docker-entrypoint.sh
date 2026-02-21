#!/bin/sh
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix Frontend — Docker Entrypoint                                       ║
# ║                                                                            ║
# ║  Rewrites baked-in URLs in the Next.js bundle at container startup.        ║
# ║                                                                            ║
# ║  NEXT_PUBLIC_ env vars are inlined at BUILD TIME by Next.js — both into    ║
# ║  server chunks and client (static) JS. The baked values depend on whoever  ║
# ║  built the image (could be localhost:8008, 127.0.0.1:54321, anything).     ║
# ║                                                                            ║
# ║  This entrypoint DETECTS the baked values by inspecting the bundle, then   ║
# ║  replaces them with runtime env vars. No hardcoded keys or URLs.           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

BUNDLE_DIR="/app/apps/frontend/.next"

# ── Runtime target values ──────────────────────────────────────────────────────
RUNTIME_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
RUNTIME_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
RUNTIME_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-}"

# ── Detect baked values from the bundle ────────────────────────────────────────
# The Supabase client is created via createBrowserClient("URL","KEY").
# We extract the baked URL and key from the compiled JS.
REFERENCE_FILE=$(find "$BUNDLE_DIR/static/chunks" -name '*.js' -exec grep -l 'createBrowserClient' {} \; | head -1)

BAKED_SUPABASE_URL=""
BAKED_ANON_KEY=""
if [ -n "$REFERENCE_FILE" ]; then
  # Extract: createBrowserClient)("URL","KEY"
  BAKED_SUPABASE_URL=$(grep -oP 'createBrowserClient\)\("\K[^"]+' "$REFERENCE_FILE" | head -1)
  BAKED_ANON_KEY=$(grep -oP 'createBrowserClient\)\("[^"]+","\K[^"]+' "$REFERENCE_FILE" | head -1)
fi

# Backend URL: detect from bundle (look for /v1 API pattern)
BAKED_BACKEND=""
BAKED_HOST=""
if [ -n "$RUNTIME_BACKEND_URL" ]; then
  # Look for the common pattern: fetch("http://something/v1/...")
  BAKED_BACKEND=$(grep -ohP 'https?://[^/"\s]+/v1(?=["/])' "$BUNDLE_DIR/static/chunks/"*.js 2>/dev/null | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
  if [ -n "$BAKED_BACKEND" ]; then
    BAKED_HOST=$(echo "$BAKED_BACKEND" | sed 's|/v1$||')
  fi
fi

# ── Decide what needs rewriting ────────────────────────────────────────────────
needs_rewrite=false

if [ -n "$RUNTIME_BACKEND_URL" ] && [ -n "$BAKED_BACKEND" ] && [ "$RUNTIME_BACKEND_URL" != "$BAKED_BACKEND" ]; then
  needs_rewrite=true
  echo "[entrypoint] Backend: ${BAKED_BACKEND} -> ${RUNTIME_BACKEND_URL}"
fi

if [ -n "$RUNTIME_SUPABASE_URL" ] && [ -n "$BAKED_SUPABASE_URL" ] && [ "$RUNTIME_SUPABASE_URL" != "$BAKED_SUPABASE_URL" ]; then
  needs_rewrite=true
  echo "[entrypoint] Supabase URL: ${BAKED_SUPABASE_URL} -> ${RUNTIME_SUPABASE_URL}"
fi

if [ -n "$RUNTIME_ANON_KEY" ] && [ -n "$BAKED_ANON_KEY" ] && [ "$RUNTIME_ANON_KEY" != "$BAKED_ANON_KEY" ]; then
  needs_rewrite=true
  echo "[entrypoint] Supabase anon key: replacing"
fi

if [ "$needs_rewrite" = "true" ]; then
  echo "[entrypoint] Rewriting baked values in Next.js bundle..."

  RUNTIME_HOST=""
  if [ -n "$RUNTIME_BACKEND_URL" ]; then
    RUNTIME_HOST=$(echo "${RUNTIME_BACKEND_URL%/}" | sed 's|/v1$||')
  fi

  find "$BUNDLE_DIR" -name '*.js' -o -name '*.html' | while read -r file; do
    SED_ARGS=""

    # Backend URL
    if [ -n "$BAKED_BACKEND" ] && [ -n "$RUNTIME_BACKEND_URL" ] && [ "$RUNTIME_BACKEND_URL" != "$BAKED_BACKEND" ]; then
      SED_ARGS="$SED_ARGS -e s|${BAKED_BACKEND}|${RUNTIME_BACKEND_URL%/}|g"
      SED_ARGS="$SED_ARGS -e s|${BAKED_HOST}|${RUNTIME_HOST}|g"
    fi

    # Supabase URL
    if [ -n "$BAKED_SUPABASE_URL" ] && [ -n "$RUNTIME_SUPABASE_URL" ] && [ "$RUNTIME_SUPABASE_URL" != "$BAKED_SUPABASE_URL" ]; then
      SED_ARGS="$SED_ARGS -e s|${BAKED_SUPABASE_URL}|${RUNTIME_SUPABASE_URL}|g"
    fi

    # Supabase anon key
    if [ -n "$BAKED_ANON_KEY" ] && [ -n "$RUNTIME_ANON_KEY" ] && [ "$RUNTIME_ANON_KEY" != "$BAKED_ANON_KEY" ]; then
      SED_ARGS="$SED_ARGS -e s|${BAKED_ANON_KEY}|${RUNTIME_ANON_KEY}|g"
    fi

    if [ -n "$SED_ARGS" ]; then
      eval sed -i $SED_ARGS "\"$file\""
    fi
  done

  echo "[entrypoint] Rewrite complete"
else
  echo "[entrypoint] No URL rewrites needed"
fi

# Start the server
exec node apps/frontend/server.js
