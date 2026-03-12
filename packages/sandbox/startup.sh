#!/bin/bash
# Container entrypoint — boots s6-overlay inside a PID namespace.
#
# Daytona runs its own agent as PID 1, but s6-overlay requires PID 1.
# Solution: use `unshare --pid --fork` to create a PID namespace where
# /init (s6-overlay) becomes PID 1. This gives 100% parity with local Docker.
#
# The sandbox runtime (kortix-master, opencode, etc.) is PREBAKED into the
# Docker image at build time. On boot we just set up workspace dirs and go.
#
# OTA updates happen via POST /kortix/update which downloads a tarball from
# GitHub Releases and does an ACID symlink swap — no npm involved.

set -e

DEFAULT_KORTIX_SANDBOX_VERSION="0.7.28"

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

chown -R "$WORKSPACE_UID:$WORKSPACE_GID" \
  /workspace/.agent-browser /workspace/.browser-profile /workspace/.lss \
  /workspace/.cache /workspace/.local /workspace/.kortix /workspace/.kortix-state \
  /workspace/.secrets /workspace/.config /workspace/.XDG
chmod 700 /workspace/.secrets || true

# ── Stale LSS database cleanup ───────────────────────────────────────────────
if [ -f /workspace/.lss/lss.db ]; then
  LSS_OWNER=$(stat -c '%u' /workspace/.lss/lss.db 2>/dev/null || echo "unknown")
  if [ "$LSS_OWNER" != "1000" ] && [ "$LSS_OWNER" != "unknown" ]; then
    echo "[startup] Removing stale LSS database (owned by UID $LSS_OWNER, expected 1000)"
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

chown -R abc:abc /workspace 2>/dev/null || true

# ── Verify prebaked runtime exists ──────────────────────────────────────────
# The runtime is prebaked into the image. If somehow /opt/kortix-master is
# missing (shouldn't happen), warn loudly but continue — services will fail
# to start and logs will explain why.
if [ ! -e /opt/kortix-master ]; then
  echo "[startup] WARNING: /opt/kortix-master not found!"
  echo "[startup] The prebaked runtime may be missing. Rebuild the Docker image."
fi

echo "[startup] Starting s6-overlay via PID namespace..."

if unshare --pid --fork true >/dev/null 2>&1; then
  exec unshare --pid --fork /init
fi

echo "[startup] WARNING: unshare not permitted here — falling back to direct /init"
exec /init
