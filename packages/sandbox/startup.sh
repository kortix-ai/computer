#!/bin/bash
# Container entrypoint — boots s6-overlay inside a PID namespace.
#
# Daytona runs its own agent as PID 1, but s6-overlay requires PID 1.
# Solution: use `unshare --pid --fork` to create a PID namespace where
# /init (s6-overlay) becomes PID 1. This gives 100% parity with local Docker.
#
# The sandbox runtime is baked into the Docker image at build time.
# Updates = pull new image + recreate container. User data in /workspace volume.

set -e

DEFAULT_KORTIX_SANDBOX_VERSION="0.8.0"

WORKSPACE_UID="${PUID:-1000}"
WORKSPACE_GID="${PGID:-1000}"

echo "[startup] Preparing Kortix sandbox..."

# ── Workspace dirs ──────────────────────────────────────────────────────────
mkdir -p \
  /workspace/.agent-browser \
  /workspace/.browser-profile \
  /workspace/.lss \
  /workspace/.cache/opencode \
  /workspace/.local/share/opencode \
  /workspace/.local/share/opencode/log \
  /workspace/.local/share/opencode/storage \
  /workspace/.local/share/opencode/snapshot \
  /workspace/.kortix \
  /workspace/.kortix-state \
  /workspace/.secrets \
  /workspace/.config \
  /workspace/.XDG

# ── Fix ownership (critical after Docker image updates) ─────────────────────
# When a container is recreated from a new image, the abc user UID may differ
# from the previous image. Fix ALL workspace files to match the current abc user.
echo "[startup] Fixing workspace ownership..."
chown -R "$WORKSPACE_UID:$WORKSPACE_GID" /workspace 2>/dev/null || true
chmod 700 /workspace/.secrets 2>/dev/null || true

# ── Clean stale sqlite WAL/SHM files ────────────────────────────────────────
# After container recreate, sqlite WAL/SHM files from the old container can
# cause "readonly database" errors. Remove them so sqlite recreates cleanly.
find /workspace/.local/share/opencode -name "*.db-wal" -o -name "*.db-shm" 2>/dev/null | while read f; do
  echo "[startup] Removing stale sqlite file: $f"
  rm -f "$f"
done

# ── Stale LSS database cleanup ───────────────────────────────────────────────
if [ -f /workspace/.lss/lss.db ]; then
  LSS_OWNER=$(stat -c '%u' /workspace/.lss/lss.db 2>/dev/null || echo "unknown")
  if [ "$LSS_OWNER" != "$WORKSPACE_UID" ] && [ "$LSS_OWNER" != "unknown" ]; then
    echo "[startup] Removing stale LSS database (owned by UID $LSS_OWNER, expected $WORKSPACE_UID)"
    rm -f /workspace/.lss/lss.db /workspace/.lss/lss.db-wal /workspace/.lss/lss.db-shm
  fi
fi

# ── /config symlink (linuxserver base image compat) ─────────────────────────
if [ ! -L /config ] && [ ! -d /config ]; then
  ln -s /workspace /config
fi

# ── .opencode symlink ────────────────────────────────────────────────────────
if [ -L /workspace/.opencode ]; then
  TARGET=$(readlink /workspace/.opencode 2>/dev/null || true)
  if [ "$TARGET" != "/workspace/.kortix/.opencode" ]; then
    rm -f /workspace/.opencode
    ln -s /workspace/.kortix/.opencode /workspace/.opencode
  fi
elif [ ! -e /workspace/.opencode ]; then
  ln -s /workspace/.kortix/.opencode /workspace/.opencode
fi

# ── Verify runtime exists ───────────────────────────────────────────────────
if [ ! -e /opt/kortix-master ]; then
  echo "[startup] WARNING: /opt/kortix-master not found! Rebuild the Docker image."
fi

echo "[startup] Starting s6-overlay via PID namespace..."

if unshare --pid --fork true >/dev/null 2>&1; then
  exec unshare --pid --fork /init
fi

echo "[startup] WARNING: unshare not permitted — falling back to direct /init"
exec /init
