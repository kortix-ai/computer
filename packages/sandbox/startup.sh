#!/bin/bash
# Daytona entrypoint — boots s6-overlay inside a PID namespace.
#
# Daytona runs its own agent as PID 1, but s6-overlay requires PID 1.
# Solution: use `unshare --pid --fork` to create a PID namespace where
# /init (s6-overlay) becomes PID 1. This gives 100% parity with local Docker.
#
# Everything below this point runs BEFORE s6 takes over.
# s6 cont-init.d scripts and s6-rc.d services run as normal after /init starts.

set -e

DEFAULT_KORTIX_SANDBOX_VERSION="0.7.18"

echo "[startup] Preparing Kortix sandbox..."

# ── Pre-s6 fixes ────────────────────────────────────────────────────────────
# These must run as root before s6 takes over, because Daytona creates
# /workspace dirs as root/dockremap and s6 services run as user abc.

mkdir -p /workspace/.agent-browser /workspace/.browser-profile /workspace/.lss \
    /workspace/.local/share/opencode /workspace/.local/share/opencode/log \
    /workspace/.local/share/opencode/storage /workspace/.local/share/opencode/snapshot \
    /workspace/.XDG /workspace/.config \
    /workspace/.kortix

# Remove stale LSS database if it has wrong ownership (e.g. created by UID 911).
# lss-sync will rebuild a clean index on first run.
if [ -f /workspace/.lss/lss.db ]; then
    LSS_OWNER=$(stat -c '%u' /workspace/.lss/lss.db 2>/dev/null || echo "unknown")
    if [ "$LSS_OWNER" != "1000" ] && [ "$LSS_OWNER" != "unknown" ]; then
        echo "[startup] Removing stale LSS database (owned by UID $LSS_OWNER, expected 1000)"
        rm -f /workspace/.lss/lss.db /workspace/.lss/lss.db-wal /workspace/.lss/lss.db-shm
    fi
fi

# Ensure /config symlink exists (backward compat for linuxserver base image)
if [ ! -L /config ] && [ ! -d /config ]; then
    ln -s /workspace /config
fi

# Ensure the workspace has a default project-local OpenCode config entrypoint.
# Point .opencode to the global kortix data directory (/workspace/.kortix/.opencode)
# This gives users a stable `.opencode/...` path that persists across sessions.
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

# ── First-boot bootstrap ──────────────────────────────────────────────────────
# The Docker base image no longer includes Kortix-specific code (kortix-master,
# opencode, agent-browser, etc.). On first boot, install @kortix/sandbox from
# npm which triggers postinstall.sh to deploy everything into /opt/.
#
# Subsequent boots skip this if a valid staging dir already exists.
#
# We detect "first boot" by checking whether the ACID symlink exists yet.
# If /opt/kortix-master is not a symlink, nothing has been bootstrapped.

if [ ! -L /opt/kortix-master ]; then
    echo "[startup] First boot detected — bootstrapping @kortix/sandbox from npm..."

    # Determine which version to install
    # KORTIX_SANDBOX_VERSION can be set via env (e.g. docker-compose) to override the
    # release baked into this image. Falling back to the shipped release keeps fresh
    # installs reproducible instead of following npm latest.
    SANDBOX_VERSION="${KORTIX_SANDBOX_VERSION:-$DEFAULT_KORTIX_SANDBOX_VERSION}"
    INSTALL_DIR="/opt/kortix-bootstrap"

    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    echo "[startup] Installing @kortix/sandbox@$SANDBOX_VERSION..."
    if ! npm install --no-audit --no-fund "@kortix/sandbox@$SANDBOX_VERSION" 2>&1; then
        echo "[startup] ERROR: Failed to install @kortix/sandbox@$SANDBOX_VERSION" >&2
        echo "[startup] Container will start but Kortix services may not be available." >&2
    else
        echo "[startup] Bootstrap complete."
    fi

    cd /workspace
fi

echo "[startup] Starting s6-overlay via PID namespace..."

# Boot s6-overlay in a new PID namespace where it becomes PID 1.
# This runs the full webtop stack (Xvfb, XFCE, nginx, selkies/noVNC)
# plus all our custom services in /etc/services.d/.
exec unshare --pid --fork /init
