#!/usr/bin/env bash
# Postinstall patch: applies local overrides to plugin files in node_modules
# and binary patches to the opencode CLI.
# Run automatically via "postinstall" in package.json after every `bun install`.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Patch 1: opencode-pty spawn.txt (adds anti-pattern guidance) ────────────
TARGET="$ROOT_DIR/node_modules/opencode-pty/src/plugin/pty/tools/spawn.txt"
PATCH="$SCRIPT_DIR/opencode-pty-spawn.txt"

if [ -f "$TARGET" ] && [ -f "$PATCH" ]; then
  cp "$PATCH" "$TARGET"
  echo "[patches] Applied opencode-pty spawn.txt patch"
else
  echo "[patches] Skipped opencode-pty spawn.txt patch (target or patch not found)"
fi

# ── Patch 2: opencode binary — fine-grained tool-input streaming ────────────
# Patches the compiled Bun binary to enable tool-input-delta streaming.
# Idempotent: skips if already patched or binary not found.
STREAMING_PATCH="$SCRIPT_DIR/patch-opencode-streaming.js"
if [ -f "$STREAMING_PATCH" ]; then
  node "$STREAMING_PATCH" || echo "[patches] WARNING: streaming patch failed (non-fatal)"
else
  echo "[patches] Skipped streaming patch (script not found)"
fi
