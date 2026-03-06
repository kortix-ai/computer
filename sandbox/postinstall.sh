#!/usr/bin/env bash
# @kortix/sandbox postinstall — ACID staging-based deployment
#
# Instead of deploying directly to /opt/ (live system mutation), this script
# stages everything into /opt/kortix-staging-{version}/ in complete isolation.
# Nothing touches the live system. The update.ts "commit" step atomically
# swaps symlinks from old → new staging dir.
#
# On initial Docker build (no symlinks yet), falls back to direct deployment
# for backward compatibility.
#
# This script is idempotent — safe to run multiple times.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect if we're running inside a sandbox (vs. being installed as a dev dep locally)
if [ ! -d "/opt" ] || [ "$(id -u)" = "0" ] && [ ! -d "/opt/bun" ]; then
  echo "[sandbox-postinstall] Not in sandbox environment, skipping file deployment"
  exit 0
fi

PKG_VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').version)" 2>/dev/null || echo "0.0.0")
echo "[sandbox-postinstall] Deploying @kortix/sandbox@$PKG_VERSION..."

fail_update() {
  echo "[sandbox-postinstall] ERROR: $1" >&2
  if [ "${MODE:-}" = "staging" ] && [ -n "${STAGING:-}" ]; then
    rm -rf "$STAGING" 2>/dev/null || true
  fi
  exit 1
}

# Ensure rsync is available (Alpine base may not have it after cleanup)
if ! command -v rsync &>/dev/null; then
  echo "[sandbox-postinstall] Installing rsync..."
  apk add --no-cache rsync 2>/dev/null || true
fi

# ─── Detect mode: staging (live update) vs direct (Docker build) ─────────────
# If /opt/kortix-master is a symlink, we're in a live sandbox with the ACID
# update system. Stage into an isolated directory.
# If it's a real directory (or doesn't exist), we're in the initial Docker
# build — deploy directly (Dockerfile will create symlinks afterward).

if [ -L /opt/kortix-master ]; then
  MODE="staging"
  STAGING="/opt/kortix-staging-$PKG_VERSION"
  echo "[sandbox-postinstall] ACID mode: staging to $STAGING"
else
  MODE="direct"
  STAGING=""
  echo "[sandbox-postinstall] Direct mode (initial Docker build)"
fi

# ─── Set target directories based on mode ────────────────────────────────────
if [ "$MODE" = "staging" ]; then
  # Clean any previous failed staging attempt for this version
  rm -rf "$STAGING"
  mkdir -p "$STAGING"

  KM_DIR="$STAGING/kortix-master"
  OC_DIR="$STAGING/opencode"
  BV_DIR="$STAGING/agent-browser-viewer"
  KX_DIR="$STAGING/kortix"
else
  KM_DIR="/opt/kortix-master"
  OC_DIR="/opt/opencode"
  BV_DIR="/opt/agent-browser-viewer"
  KX_DIR="/opt/kortix"
fi

# ── Kortix Master ────────────────────────────────────────────────────────────
echo "[sandbox-postinstall] Building kortix-master..."
mkdir -p "$KM_DIR"
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='bun.lock' \
  "$PKG_DIR/kortix-master/" "$KM_DIR/"

if ! (cd "$KM_DIR" && bun install); then
  fail_update "bun install failed for kortix-master"
fi

# ── OpenCode config/agents/tools/skills ──────────────────────────────────────
echo "[sandbox-postinstall] Building opencode..."
mkdir -p "$OC_DIR"

if [ "$MODE" = "staging" ] && [ -L /opt/opencode ]; then
  # Copy node_modules from current live version to avoid full reinstall
  CURRENT_OC=$(readlink -f /opt/opencode)
  if [ -d "$CURRENT_OC/node_modules" ]; then
    cp -a "$CURRENT_OC/node_modules" "$OC_DIR/node_modules" 2>/dev/null || true
  fi
  # Also preserve .local runtime data
  if [ -d "$CURRENT_OC/.local" ]; then
    cp -a "$CURRENT_OC/.local" "$OC_DIR/.local" 2>/dev/null || true
  fi
fi

rsync -a --delete \
  --exclude='node_modules' \
  --exclude='bun.lock' \
  --exclude='.local' \
  "$PKG_DIR/opencode/" "$OC_DIR/"

if ! (cd "$OC_DIR" && bun install); then
  fail_update "bun install failed for opencode"
fi

# Re-apply binary patches explicitly (in case postinstall didn't trigger)
if [ -f "$PKG_DIR/opencode/patches/patch-opencode-streaming.js" ]; then
  echo "[sandbox-postinstall] Applying opencode binary patches..."
  node "$PKG_DIR/opencode/patches/patch-opencode-streaming.js" || fail_update "failed to apply opencode streaming patch"
fi

# ── s6 service scripts ──────────────────────────────────────────────────────
# These go directly to /etc/ — not symlinked, but services restart after update
if [ -d "$PKG_DIR/services" ] && [ -d "/etc/s6-overlay/s6-rc.d" ]; then
  echo "[sandbox-postinstall] Updating s6 service scripts..."
  rsync -a "$PKG_DIR/services/" /etc/s6-overlay/s6-rc.d/ || fail_update "failed to sync s6 service scripts"
  chmod +x /etc/s6-overlay/s6-rc.d/svc-*/run || fail_update "failed to chmod s6 run scripts"

  USER_CONTENTS_DIR="/etc/s6-overlay/s6-rc.d/user/contents.d"
  if [ -d "$USER_CONTENTS_DIR" ]; then
    for legacy in \
      svc-opencode-web \
      svc-opencode-serve \
      svc-lss-sync \
      svc-agent-browser-viewer \
      svc-presentation-viewer \
      svc-static-web \
      svc-opencode-channels; do
      rm -f "$USER_CONTENTS_DIR/$legacy" 2>/dev/null || true
    done

    touch "$USER_CONTENTS_DIR/svc-kortix-master"
    touch "$USER_CONTENTS_DIR/svc-sshd"
  fi
fi

# ── Init scripts ─────────────────────────────────────────────────────────────
# These only run on container boot, not on update — safe to deploy directly
if [ -d "$PKG_DIR/config" ] && [ -d "/custom-cont-init.d" ]; then
  echo "[sandbox-postinstall] Updating init scripts..."
  cp -f "$PKG_DIR/config/kortix-env-setup.sh" /custom-cont-init.d/98-kortix-env || fail_update "failed to update 98-kortix-env init script"
  cp -f "$PKG_DIR/config/customize.sh" /custom-cont-init.d/99-customize || fail_update "failed to update 99-customize init script"
  chmod +x /custom-cont-init.d/98-kortix-env /custom-cont-init.d/99-customize || fail_update "failed to chmod init scripts"
fi

# ── OpenCode CLI binary ──────────────────────────────────────────────────────
CLI_VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').dependencies['opencode-ai'] || '')" 2>/dev/null || echo "")
if [ -n "$CLI_VERSION" ]; then
  CURRENT_CLI=$(opencode --version 2>/dev/null || echo "none")
  if [ "$CURRENT_CLI" != "$CLI_VERSION" ]; then
    echo "[sandbox-postinstall] Updating OpenCode CLI: $CURRENT_CLI -> $CLI_VERSION..."
    npm install -g "opencode-ai@$CLI_VERSION" || fail_update "failed to install opencode-ai@$CLI_VERSION"
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
      npm install -g "opencode-linux-x64-musl@$CLI_VERSION" --force || fail_update "failed to install opencode-linux-x64-musl@$CLI_VERSION"
      MUSL_BIN=$(npm root -g)/opencode-linux-x64-musl/bin/opencode
      GLIBC_BIN=$(npm root -g)/opencode-ai/node_modules/opencode-linux-x64/bin/opencode
      [ -f "$MUSL_BIN" ] && [ -f "$GLIBC_BIN" ] && ln -sf "$MUSL_BIN" "$GLIBC_BIN"
    else
      npm install -g "opencode-linux-arm64-musl@$CLI_VERSION" --force || fail_update "failed to install opencode-linux-arm64-musl@$CLI_VERSION"
      MUSL_BIN=$(npm root -g)/opencode-linux-arm64-musl/bin/opencode
      GLIBC_BIN=$(npm root -g)/opencode-ai/node_modules/opencode-linux-arm64/bin/opencode
      [ -f "$MUSL_BIN" ] && [ -f "$GLIBC_BIN" ] && ln -sf "$MUSL_BIN" "$GLIBC_BIN"
    fi
    echo "[sandbox-postinstall] CLI updated to $(opencode --version 2>/dev/null || echo 'unknown')"
  else
    echo "[sandbox-postinstall] CLI already at $CLI_VERSION, skipping"
  fi
fi

# ── Agent Browser ────────────────────────────────────────────────────────────
AB_VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').dependencies['agent-browser'] || '')" 2>/dev/null || echo "")
if [ -n "$AB_VERSION" ]; then
  CURRENT_AB=$(npm list -g agent-browser --depth=0 --json 2>/dev/null | node -e "try{const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.dependencies['agent-browser']?.version||'none')}catch{console.log('none')}" 2>/dev/null || echo "none")
  CLEAN_AB_VERSION=$(echo "$AB_VERSION" | sed 's/^[\^~]//')
  if [ "$CURRENT_AB" != "$CLEAN_AB_VERSION" ]; then
    echo "[sandbox-postinstall] Updating agent-browser: $CURRENT_AB -> $AB_VERSION..."
    npm install -g "agent-browser@$AB_VERSION" || fail_update "failed to install agent-browser@$AB_VERSION"
  else
    echo "[sandbox-postinstall] agent-browser already at $CURRENT_AB, skipping"
  fi
fi

# ── Portless ─────────────────────────────────────────────────────────────────
PORTLESS_VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').kortix?.globalNpmTools?.portless || '')" 2>/dev/null || echo "")
if [ -n "$PORTLESS_VERSION" ]; then
  CURRENT_PORTLESS=$(npm list -g portless --depth=0 --json 2>/dev/null | node -e "try{const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.dependencies['portless']?.version||'none')}catch{console.log('none')}" 2>/dev/null || echo "none")
  CLEAN_PORTLESS_VERSION=$(echo "$PORTLESS_VERSION" | sed 's/^[\^~]//')
  if [ "$CURRENT_PORTLESS" != "$CLEAN_PORTLESS_VERSION" ]; then
    echo "[sandbox-postinstall] Updating portless: $CURRENT_PORTLESS -> $PORTLESS_VERSION..."
    npm install -g "portless@$PORTLESS_VERSION" || fail_update "failed to install portless@$PORTLESS_VERSION"
  else
    echo "[sandbox-postinstall] portless already at $CURRENT_PORTLESS, skipping"
  fi
fi

# Apply agent-browser patches (always re-apply — patches are idempotent)
if [ -f "$PKG_DIR/patch-agent-browser.js" ]; then
  echo "[sandbox-postinstall] Applying agent-browser patches..."
  node "$PKG_DIR/patch-agent-browser.js" || fail_update "failed to apply agent-browser patch"
fi

# ── Agent Browser Viewer ─────────────────────────────────────────────────────
if [ -d "$PKG_DIR/browser-viewer" ]; then
  echo "[sandbox-postinstall] Building agent-browser-viewer..."
  mkdir -p "$BV_DIR"
  rsync -a --delete "$PKG_DIR/browser-viewer/" "$BV_DIR/"
fi

# ── Core contract (manifest + service spec) ─────────────────────────────────
if [ -d "$PKG_DIR/core" ]; then
  mkdir -p "$KX_DIR/core"
  rsync -a --delete "$PKG_DIR/core/" "$KX_DIR/core/" || fail_update "failed to sync core manifest/spec"
fi

# ── Version file + Changelog ─────────────────────────────────────────────────
mkdir -p "$KX_DIR"
echo "{\"version\":\"$PKG_VERSION\",\"updatedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$KX_DIR/.version"
cp "$PKG_DIR/CHANGELOG.json" "$KX_DIR/CHANGELOG.json" 2>/dev/null || true

# ── Fix ownership ────────────────────────────────────────────────────────────
# Use abc user if it exists (sandbox), otherwise fall back to UID 1000
if id abc &>/dev/null; then
  SANDBOX_USER="abc"
else
  SANDBOX_USER="1000"
fi
chown -R "$SANDBOX_USER:$SANDBOX_USER" "$KM_DIR" "$OC_DIR" "$KX_DIR" 2>/dev/null || true
[ -d "$BV_DIR" ] && chown -R "$SANDBOX_USER:$SANDBOX_USER" "$BV_DIR" 2>/dev/null || true

# ── pip packages ─────────────────────────────────────────────────────────────
echo "[sandbox-postinstall] Checking pip packages..."
PY_DEPS_JSON=$(node -e "const p=require('$PKG_DIR/package.json');console.log(JSON.stringify(p.kortix?.pythonDependencies||{}))" 2>/dev/null || echo "{}")

PIP_ARGS=$(node -e "
  const deps=JSON.parse('$PY_DEPS_JSON');
  const args=[];
  for(const[pkg,ver] of Object.entries(deps)){
    if(pkg==='playwright') continue;
    args.push(ver==='latest'?pkg:pkg+'=='+ver);
  }
  console.log(args.join(' '));
" 2>/dev/null || echo "")

if [ -n "$PIP_ARGS" ]; then
  pip3 install --break-system-packages --timeout 120 --retries 3 $PIP_ARGS || fail_update "failed to install python dependencies"
fi

# playwright: no musl-native wheels — force-install manylinux wheel
PW_VERSION=$(node -e "const p=require('$PKG_DIR/package.json');console.log(p.kortix?.pythonDependencies?.playwright||'1.58.0')" 2>/dev/null || echo "1.58.0")
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then PW_PLAT=manylinux1_x86_64;
else PW_PLAT=manylinux_2_17_aarch64; fi
SITE=$(python3 -c "import site; print(site.getsitepackages()[0])")
pip3 install --platform "$PW_PLAT" --only-binary :all: \
  --no-deps --target /tmp/pw "playwright==$PW_VERSION" \
  && cp -r /tmp/pw/playwright* "$SITE/" \
  && rm -rf /tmp/pw \
  || fail_update "failed to install playwright==$PW_VERSION"

# ── Write staging manifest (ACID: marks staging as complete) ─────────────────
if [ "$MODE" = "staging" ]; then
  echo "{\"version\":\"$PKG_VERSION\",\"status\":\"staged\",\"stagedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$STAGING/.manifest"
  echo "[sandbox-postinstall] Staging complete: $STAGING"
  echo "[sandbox-postinstall] Waiting for update.ts to commit (symlink swap)..."
else
  echo "[sandbox-postinstall] Direct deployment complete."
fi
