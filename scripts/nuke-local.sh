#!/usr/bin/env bash
set -euo pipefail

# ─── Kortix Local Dev — Full Nuke & Reset ────────────────────────────────────
#
# Destroys ALL local state and starts fresh:
#   1. Kills kortix-api (port 8008) and frontend (port 3000)
#   2. Removes the sandbox container
#   3. Removes ALL sandbox Docker volumes (workspace data gone!)
#   4. Resets the Supabase database (re-runs all migrations)
#   5. Optionally restarts dev (API + frontend)
#
# Usage:
#   pnpm nuke              # nuke everything
#   pnpm nuke:start        # nuke everything, then start dev
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

START_DEV=false
if [[ "${1:-}" == "--start" ]]; then
  START_DEV=true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NUKING LOCAL DEV ENVIRONMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Kill API + frontend ────────────────────────────────────────────────────
echo "[1/5] Killing running processes..."
lsof -ti:8008 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
echo "  done (ports 8008, 3000 cleared)"

# ── 2. Remove sandbox container ──────────────────────────────────────────────
echo "[2/5] Removing sandbox container..."
docker rm -f kortix-sandbox 2>/dev/null && echo "  done" || echo "  (no container)"

# ── 3. Remove ALL sandbox volumes ────────────────────────────────────────────
echo "[3/5] Removing sandbox volumes..."
VOLS=$(docker volume ls --format "{{.Name}}" | grep -i sandbox || true)
if [[ -n "$VOLS" ]]; then
  echo "$VOLS" | xargs docker volume rm -f
  echo "  removed: $(echo "$VOLS" | tr '\n' ' ')"
else
  echo "  (no volumes)"
fi

# ── 4. Verify sandbox image exists ──────────────────────────────────────────
echo "[4/5] Checking sandbox image..."
cd "$ROOT_DIR"
SANDBOX_IMAGE=$(python3 -c "import json; print(json.load(open('packages/sandbox/release.json'))['images']['sandbox'])" 2>/dev/null || echo "")
# Fallback for old format
if [[ -z "$SANDBOX_IMAGE" ]]; then
  SANDBOX_IMAGE=$(python3 -c "import json; print(json.load(open('packages/sandbox/release.json'))['sandbox']['image'])" 2>/dev/null || echo "kortix/computer:latest")
fi

if docker image inspect "$SANDBOX_IMAGE" >/dev/null 2>&1; then
  echo "  $SANDBOX_IMAGE exists locally"
else
  echo "  WARNING: $SANDBOX_IMAGE not found locally!"
  echo "  Build it first:  docker build -f packages/sandbox/docker/Dockerfile --build-arg SANDBOX_VERSION=\$(python3 -c \"import json; print(json.load(open('packages/sandbox/release.json'))['version'])\") -t $SANDBOX_IMAGE ."
  echo "  Or the API will try to pull it from Docker Hub on first init."
fi

# ── 5. Reset Supabase database ──────────────────────────────────────────────
echo "[5/5] Resetting Supabase database..."
supabase db reset
echo "  done"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NUKED. Image: $SANDBOX_IMAGE"
echo "  Next: pnpm dev (starts API + frontend, sandbox auto-creates on first request)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Optional: restart dev ─────────────────────────────────────────────────────
if $START_DEV; then
  echo "Starting dev (API + frontend)..."
  cd "$ROOT_DIR"
  exec pnpm run dev
fi
