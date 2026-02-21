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
REFERENCE_FILE=$(grep -rl 'createBrowserClient' "$BUNDLE_DIR/static/chunks/" 2>/dev/null | head -1)

BAKED_SUPABASE_URL=""
BAKED_ANON_KEY=""
if [ -n "$REFERENCE_FILE" ]; then
  # Extract: createBrowserClient)("URL","KEY")
  # Use grep -oP to extract the URL and key from the JS source
  BAKED_SUPABASE_URL=$(grep -oP 'createBrowserClient\)\("\K[^"]+' "$REFERENCE_FILE" 2>/dev/null | head -1)
  BAKED_ANON_KEY=$(grep -oP 'createBrowserClient\)\("[^"]+","\K[^"]+' "$REFERENCE_FILE" 2>/dev/null | head -1)
fi

# Backend URL: detect the most common http(s)://host/v1 pattern in the bundle
BAKED_BACKEND=""
BAKED_HOST=""
if [ -n "$RUNTIME_BACKEND_URL" ]; then
  BAKED_BACKEND=$(grep -rohP 'https?://[^/"\x27\s]+/v1(?=["/])' "$BUNDLE_DIR/static/chunks/" 2>/dev/null | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
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

  # Build a sed script file to avoid shell escaping issues with URLs
  SED_SCRIPT=$(mktemp)

  if [ -n "$BAKED_BACKEND" ] && [ -n "$RUNTIME_BACKEND_URL" ] && [ "$RUNTIME_BACKEND_URL" != "$BAKED_BACKEND" ]; then
    printf 's|%s|%s|g\n' "$BAKED_BACKEND" "${RUNTIME_BACKEND_URL%/}" >> "$SED_SCRIPT"
    printf 's|%s|%s|g\n' "$BAKED_HOST" "$RUNTIME_HOST" >> "$SED_SCRIPT"
  fi

  if [ -n "$BAKED_SUPABASE_URL" ] && [ -n "$RUNTIME_SUPABASE_URL" ] && [ "$RUNTIME_SUPABASE_URL" != "$BAKED_SUPABASE_URL" ]; then
    printf 's|%s|%s|g\n' "$BAKED_SUPABASE_URL" "$RUNTIME_SUPABASE_URL" >> "$SED_SCRIPT"
  fi

  if [ -n "$BAKED_ANON_KEY" ] && [ -n "$RUNTIME_ANON_KEY" ] && [ "$RUNTIME_ANON_KEY" != "$BAKED_ANON_KEY" ]; then
    printf 's|%s|%s|g\n' "$BAKED_ANON_KEY" "$RUNTIME_ANON_KEY" >> "$SED_SCRIPT"
  fi

  if [ -s "$SED_SCRIPT" ]; then
    find "$BUNDLE_DIR" -name '*.js' -o -name '*.html' | while read -r file; do
      sed -i -f "$SED_SCRIPT" "$file"
    done
  fi

  rm -f "$SED_SCRIPT"

  echo "[entrypoint] Rewrite complete"
else
  echo "[entrypoint] No URL rewrites needed"
fi

# Start the server
exec node apps/frontend/server.js
