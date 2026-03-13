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

WORKSPACE_UID="${PUID:-1000}"
WORKSPACE_GID="${PGID:-1000}"

echo "[startup] Preparing Kortix sandbox..."

# ── Workspace dirs ──────────────────────────────────────────────────────────
# /workspace is the ONLY persistent volume. Everything outside /workspace
# is ephemeral and gets reset on container recreate/update.
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
  /workspace/.XDG \
  /workspace/.opencode \
  /workspace/.opencode/skills

# ── Migrate legacy symlinks to real dirs ────────────────────────────────────
# Old images created /workspace/.opencode as a symlink to /workspace/.kortix/.opencode.
# New model: /workspace/.opencode IS the real dir. Migrate data if needed.
if [ -L /workspace/.opencode ]; then
  LINK_TARGET=$(readlink /workspace/.opencode 2>/dev/null || true)
  echo "[startup] Migrating .opencode from symlink ($LINK_TARGET) to real dir..."
  rm -f /workspace/.opencode
  mkdir -p /workspace/.opencode/skills
  # Copy data from old location if it exists
  if [ -d "$LINK_TARGET" ]; then
    cp -a "$LINK_TARGET"/. /workspace/.opencode/ 2>/dev/null || true
  fi
fi

# Old images created /workspace/.secrets as a symlink to /workspace/.kortix/secrets.
# New model: /workspace/.secrets IS the real dir. Migrate data if needed.
if [ -L /workspace/.secrets ]; then
  LINK_TARGET=$(readlink /workspace/.secrets 2>/dev/null || true)
  echo "[startup] Migrating .secrets from symlink ($LINK_TARGET) to real dir..."
  rm -f /workspace/.secrets
  mkdir -p /workspace/.secrets
  if [ -d "$LINK_TARGET" ]; then
    cp -a "$LINK_TARGET"/. /workspace/.secrets/ 2>/dev/null || true
  fi
  chmod 700 /workspace/.secrets
fi

# ── Convenience symlink: OpenCodeConfig → .opencode ─────────────────────────
# Visible, discoverable alias for users who don't know to look for dotfiles.
if [ ! -e /workspace/OpenCodeConfig ] && [ ! -L /workspace/OpenCodeConfig ]; then
  ln -s /workspace/.opencode /workspace/OpenCodeConfig
fi

# ── Initialize ocx (marketplace CLI) ────────────────────────────────────────
# Ensures ocx.jsonc exists in /workspace/.opencode/ so marketplace installs
# (ocx add) work immediately without requiring 'ocx init' first.
if command -v ocx >/dev/null 2>&1 && [ ! -f /workspace/.opencode/ocx.jsonc ]; then
  echo "[startup] Running ocx init..."
  ocx init --cwd /workspace 2>/dev/null || echo "[startup] WARNING: ocx init failed (non-fatal)"
fi

# ── Clean stale browser locks ───────────────────────────────────────────────
# After unclean shutdown, Chromium singletons prevent agent-browser from starting.
rm -f /workspace/.browser-profile/SingletonLock \
     /workspace/.browser-profile/SingletonCookie \
     /workspace/.browser-profile/SingletonSocket 2>/dev/null

# ── Clean stale legacy dirs ─────────────────────────────────────────────────
# ssl/ was created by old images but never used by anything. Remove if empty.
[ -d /workspace/ssl ] && [ -z "$(ls -A /workspace/ssl 2>/dev/null)" ] && rmdir /workspace/ssl 2>/dev/null || true

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
