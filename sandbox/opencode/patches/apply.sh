#!/usr/bin/env bash
# Postinstall patch: applies local overrides to plugin files in node_modules.
# Run automatically via "postinstall" in package.json after every `bun install`.
# Each patch is a full replacement of the target file.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Patch opencode-pty spawn.txt tool description (adds anti-pattern guidance)
TARGET="$ROOT_DIR/node_modules/opencode-pty/src/plugin/pty/tools/spawn.txt"
PATCH="$SCRIPT_DIR/opencode-pty-spawn.txt"

if [ -f "$TARGET" ] && [ -f "$PATCH" ]; then
  cp "$PATCH" "$TARGET"
  echo "[patches] Applied opencode-pty spawn.txt patch"
else
  echo "[patches] Skipped opencode-pty spawn.txt patch (target or patch not found)"
fi
