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

echo "[startup] Preparing Kortix sandbox..."

# ── Pre-s6 fixes ────────────────────────────────────────────────────────────
# These must run as root before s6 takes over, because Daytona creates
# /workspace dirs as root/dockremap and s6 services run as user abc.

mkdir -p /workspace/.kortix \
    /workspace/.agent-browser /workspace/.browser-profile /workspace/.lss \
    /workspace/.local/share/opencode /workspace/.local/share/opencode/log \
    /workspace/.local/share/opencode/storage /workspace/.local/share/opencode/snapshot \
    /workspace/.XDG /workspace/.config /workspace/ssl \
    /workspace/presentations

# Ensure /config symlink exists (backward compat for linuxserver base image)
if [ ! -L /config ] && [ ! -d /config ]; then
    ln -s /workspace /config
fi

chown -R abc:abc /workspace 2>/dev/null || true

echo "[startup] Starting s6-overlay via PID namespace..."

# Boot s6-overlay in a new PID namespace where it becomes PID 1.
# This runs the full webtop stack (Xvfb, XFCE, nginx, selkies/noVNC)
# plus all our custom services in /etc/services.d/.
exec unshare --pid --fork /init
