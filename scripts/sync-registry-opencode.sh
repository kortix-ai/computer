#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_DIR="${KORTIX_REGISTRY_DIR:-$REPO_ROOT/registry/files}"
TARGET_DIR="$REPO_ROOT/sandbox/opencode"
SYNC_META_FILE="$TARGET_DIR/.registry-sync.json"
MODE="sync"

if [ "${1:-}" = "--check" ]; then
  MODE="check"
elif [ "${1:-}" = "--sync" ] || [ -z "${1:-}" ]; then
  MODE="sync"
else
  echo "Usage: $0 [--sync|--check]"
  exit 1
fi

if [ ! -d "$REGISTRY_DIR" ]; then
  echo "Registry files directory not found: $REGISTRY_DIR"
  echo "Expected at: $REPO_ROOT/registry/files (git submodule)"
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "OpenCode target directory not found: $TARGET_DIR"
  exit 1
fi

check_diff=false

run_rsync() {
  local source="$1"
  local target="$2"
  local delete_flag="$3"
  local output

  if [ "$MODE" = "check" ]; then
    if [ "$delete_flag" = "delete" ]; then
      output="$(rsync -rcni --omit-dir-times --delete "$source" "$target")"
    else
      output="$(rsync -rcni --omit-dir-times "$source" "$target")"
    fi
    if [ -n "$output" ]; then
      check_diff=true
      printf '%s\n' "$output"
    fi
  else
    if [ "$delete_flag" = "delete" ]; then
      rsync -a --delete "$source" "$target"
    else
      rsync -a "$source" "$target"
    fi
  fi
}

sync_component_dirs() {
  local source_root="$1"
  local target_root="$2"
  mkdir -p "$target_root"
  for source_dir in "$source_root"/*; do
    [ -d "$source_dir" ] || continue
    local name
    name="$(basename "$source_dir")"
    mkdir -p "$target_root/$name"
    run_rsync "$source_dir/" "$target_root/$name/" delete
  done
}

sync_component_files() {
  local source_root="$1"
  local target_root="$2"
  mkdir -p "$target_root"
  for source_file in "$source_root"/*; do
    [ -f "$source_file" ] || continue
    run_rsync "$source_file" "$target_root/" keep
  done
}

sync_component_dirs "$REGISTRY_DIR/skills" "$TARGET_DIR/skills"
sync_component_files "$REGISTRY_DIR/agent" "$TARGET_DIR/agents"
sync_component_files "$REGISTRY_DIR/command" "$TARGET_DIR/commands"
run_rsync "$REGISTRY_DIR/tool/" "$TARGET_DIR/tools/" delete

# Only sync managed plugin components. Keep local runtime-only plugins.
mkdir -p "$TARGET_DIR/plugin"
for plugin_name in kortix-sys kortix-tunnel; do
  if [ -d "$REGISTRY_DIR/plugin/$plugin_name" ]; then
    mkdir -p "$TARGET_DIR/plugin/$plugin_name"
    run_rsync "$REGISTRY_DIR/plugin/$plugin_name/" "$TARGET_DIR/plugin/$plugin_name/" keep
  fi
done

if [ "$MODE" = "check" ]; then
  if [ "$check_diff" = true ]; then
    echo "Registry and sandbox/opencode are out of sync."
    echo "Run: scripts/sync-registry-opencode.sh --sync"
    exit 1
  fi
  echo "Registry and sandbox/opencode are in sync."
else
  REGISTRY_REV="unknown"
  if [ -d "$REPO_ROOT/registry/.git" ]; then
    REGISTRY_REV="$(git -C "$REPO_ROOT/registry" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  fi
  TMP_META="$(mktemp)"
  cat > "$TMP_META" <<EOF
{
  "source": "registry/files",
  "registryRevision": "$REGISTRY_REV"
}
EOF
  if [ ! -f "$SYNC_META_FILE" ] || ! cmp -s "$TMP_META" "$SYNC_META_FILE"; then
    mv "$TMP_META" "$SYNC_META_FILE"
  else
    rm -f "$TMP_META"
  fi
  echo "Synced registry files into sandbox/opencode."
fi
