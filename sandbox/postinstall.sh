#!/usr/bin/env bash
# @kortix/sandbox postinstall
#
# Copies source files to their runtime locations under /opt/ and installs
# local dependencies. Runs automatically after `npm install -g @kortix/sandbox`.
#
# This script is idempotent — safe to run multiple times.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect if we're running inside a sandbox (vs. being installed as a dev dep locally)
if [ ! -d "/opt" ] || [ "$(id -u)" = "0" ] && [ ! -d "/opt/bun" ]; then
  echo "[sandbox-postinstall] Not in sandbox environment, skipping file deployment"
  exit 0
fi

echo "[sandbox-postinstall] Deploying @kortix/sandbox files..."

# Ensure rsync is available (Alpine base may not have it after cleanup)
if ! command -v rsync &>/dev/null; then
  echo "[sandbox-postinstall] Installing rsync..."
  apk add --no-cache rsync 2>/dev/null || true
fi

# ── Kortix Master ────────────────────────────────────────────────────────────
echo "[sandbox-postinstall] Updating kortix-master..."
mkdir -p /opt/kortix-master
# Copy source files (preserving structure), skip node_modules
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='bun.lock' \
  "$PKG_DIR/kortix-master/" /opt/kortix-master/

# Install deps
cd /opt/kortix-master && bun install 2>/dev/null || true

# ── OpenCode config/agents/tools/skills ──────────────────────────────────────
echo "[sandbox-postinstall] Updating opencode config..."
mkdir -p /opt/opencode

# Sync source files — delete stale files but preserve node_modules and runtime data
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='bun.lock' \
  --exclude='.local' \
  "$PKG_DIR/opencode/" /opt/opencode/

# Install deps (runs opencode patches via its own postinstall)
cd /opt/opencode && bun install 2>/dev/null || true

# ── s6 service scripts ──────────────────────────────────────────────────────
if [ -d "$PKG_DIR/services" ] && [ -d "/etc/services.d" ]; then
  echo "[sandbox-postinstall] Updating s6 service scripts..."
  rsync -a "$PKG_DIR/services/" /etc/services.d/
  chmod +x /etc/services.d/*/run 2>/dev/null || true
fi

# ── Init scripts ─────────────────────────────────────────────────────────────
if [ -d "$PKG_DIR/config" ] && [ -d "/custom-cont-init.d" ]; then
  echo "[sandbox-postinstall] Updating init scripts..."
  cp -f "$PKG_DIR/config/kortix-env-setup.sh" /custom-cont-init.d/98-kortix-env 2>/dev/null || true
  cp -f "$PKG_DIR/config/customize.sh" /custom-cont-init.d/99-customize 2>/dev/null || true
  chmod +x /custom-cont-init.d/98-kortix-env /custom-cont-init.d/99-customize 2>/dev/null || true
fi

# ── OpenCode CLI binary ──────────────────────────────────────────────────────
# Update the globally-installed CLI to the version declared in this package.
# This mirrors the Dockerfile's install logic: install the meta-package, then
# force-install the musl variant and symlink it over the glibc binary.
CLI_VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').dependencies['@kortix/opencode-ai'] || '')" 2>/dev/null || echo "")
if [ -n "$CLI_VERSION" ]; then
  CURRENT_CLI=$(opencode --version 2>/dev/null || echo "none")
  if [ "$CURRENT_CLI" != "$CLI_VERSION" ]; then
    echo "[sandbox-postinstall] Updating OpenCode CLI: $CURRENT_CLI -> $CLI_VERSION..."
    npm install -g "@kortix/opencode-ai@$CLI_VERSION" 2>/dev/null || true
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
      npm install -g "@kortix/opencode-ai-linux-x64-musl@$CLI_VERSION" --force 2>/dev/null || true
      MUSL_BIN=$(npm root -g)/@kortix/opencode-ai-linux-x64-musl/bin/opencode
      GLIBC_BIN=$(npm root -g)/@kortix/opencode-ai/node_modules/@kortix/opencode-ai-linux-x64/bin/opencode
      [ -f "$MUSL_BIN" ] && [ -f "$GLIBC_BIN" ] && ln -sf "$MUSL_BIN" "$GLIBC_BIN"
    else
      npm install -g "@kortix/opencode-ai-linux-arm64-musl@$CLI_VERSION" --force 2>/dev/null || true
      MUSL_BIN=$(npm root -g)/@kortix/opencode-ai-linux-arm64-musl/bin/opencode
      GLIBC_BIN=$(npm root -g)/@kortix/opencode-ai/node_modules/@kortix/opencode-ai-linux-arm64/bin/opencode
      [ -f "$MUSL_BIN" ] && [ -f "$GLIBC_BIN" ] && ln -sf "$MUSL_BIN" "$GLIBC_BIN"
    fi
    echo "[sandbox-postinstall] CLI updated to $(opencode --version 2>/dev/null || echo 'unknown')"
  else
    echo "[sandbox-postinstall] CLI already at $CLI_VERSION, skipping"
  fi
fi

# ── Agent browser patches ────────────────────────────────────────────────────
if [ -f "$PKG_DIR/patch-agent-browser.js" ]; then
  echo "[sandbox-postinstall] Applying agent-browser patches..."
  node "$PKG_DIR/patch-agent-browser.js" 2>/dev/null || true
fi

# ── Version file ─────────────────────────────────────────────────────────────
# Read version from package.json (the single source of truth) and write to .version
mkdir -p /opt/kortix
PKG_VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').version)" 2>/dev/null || echo "0.0.0")
echo "{\"version\":\"$PKG_VERSION\",\"updatedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /opt/kortix/.version

# ── Fix ownership ────────────────────────────────────────────────────────────
chown -R 1000:1000 /opt/kortix-master /opt/opencode /opt/kortix 2>/dev/null || true

# ── pip packages ─────────────────────────────────────────────────────────────
# These are pinned to versions tested with this sandbox release.
echo "[sandbox-postinstall] Checking pip packages..."
pip3 install --break-system-packages -q \
  'local-semantic-search' \
  'pypdf2==3.0.1' \
  'python-pptx==1.0.2' \
  'pillow==12.1.0' \
  'greenlet' 'pyee' 'typing-extensions' \
  2>/dev/null || true

# playwright: no musl-native wheels — force-install manylinux wheel (Python API is pure Python)
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then PW_PLAT=manylinux1_x86_64;
else PW_PLAT=manylinux_2_17_aarch64; fi
SITE=$(python3 -c "import site; print(site.getsitepackages()[0])")
pip3 install --platform "$PW_PLAT" --only-binary :all: \
  --no-deps --target /tmp/pw 'playwright==1.58.0' 2>/dev/null \
  && cp -r /tmp/pw/playwright* "$SITE/" 2>/dev/null \
  && rm -rf /tmp/pw \
  || true

echo "[sandbox-postinstall] Done."
