#!/usr/bin/with-contenv bash
# Dev init: install opencode dependencies from the mounted source.
# Runs once during container init (before s6 services start).

set -e

if [ -d /opt/opencode-src/packages/opencode ]; then
  echo "[opencode-dev] Installing dependencies from local source..."
  cd /opt/opencode-src
  /opt/bun/bin/bun install --frozen-lockfile 2>/dev/null || /opt/bun/bin/bun install
  echo "[opencode-dev] Dependencies installed successfully."
else
  echo "[opencode-dev] WARNING: /opt/opencode-src not found, falling back to global opencode binary."
fi
