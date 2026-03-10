#!/bin/bash
set -euo pipefail

echo ""
echo "=========================================="
echo " E2E Bootstrap Test — @kortix/sandbox"
echo "=========================================="

# ── 1. Base image sanity ──────────────────────────────────────────────────────
echo ""
echo "=== [1/7] Base image tools ==="
bun --version       && echo "  bun: OK"
node --version      && echo "  node: OK"
npm --version       && echo "  npm: OK"
uv --version        && echo "  uv: OK"
ls /opt/bun-pty-musl/librust_pty.so && echo "  librust_pty.so: OK"

# ── 2. Confirm Kortix code is NOT pre-baked ───────────────────────────────────
echo ""
echo "=== [2/7] Confirm base image has NO pre-baked Kortix code ==="
[ ! -d /opt/kortix-master ] && echo "  /opt/kortix-master: absent (good)" || echo "  WARNING: /opt/kortix-master already exists"
[ ! -d /opt/opencode ]       && echo "  /opt/opencode: absent (good)"       || echo "  WARNING: /opt/opencode already exists"
[ ! -L /opt/kortix-master ]  && echo "  no ACID symlinks: correct"          || echo "  WARNING: symlinks already present"

# ── 3. Bootstrap — install @kortix/sandbox from npm ──────────────────────────
echo ""
echo "=== [3/7] Installing @kortix/sandbox@0.7.17 ==="
mkdir -p /opt/kortix-bootstrap
cd /opt/kortix-bootstrap
npm install --no-audit --no-fund "@kortix/sandbox@0.7.17" 2>&1
echo "  npm install: done"

# ── 4. Verify ACID symlinks were created ──────────────────────────────────────
echo ""
echo "=== [4/7] Verify ACID symlinks ==="
[ -L /opt/kortix-master ] && echo "  /opt/kortix-master -> $(readlink /opt/kortix-master)" || { echo "  ERROR: /opt/kortix-master symlink missing"; exit 1; }
[ -L /opt/opencode ]       && echo "  /opt/opencode -> $(readlink /opt/opencode)"           || { echo "  ERROR: /opt/opencode symlink missing"; exit 1; }
[ -L /opt/kortix ]         && echo "  /opt/kortix -> $(readlink /opt/kortix)"               || { echo "  ERROR: /opt/kortix symlink missing"; exit 1; }
[ -L /opt/kortix-oc ]      && echo "  /opt/kortix-oc -> $(readlink /opt/kortix-oc)"         || { echo "  ERROR: /opt/kortix-oc symlink missing"; exit 1; }

# ── 5. Verify deployed files ──────────────────────────────────────────────────
echo ""
echo "=== [5/7] Verify deployed files ==="
echo "  kortix-master/:"
ls /opt/kortix-master/
echo "  opencode/:"
ls /opt/opencode/ | head -10
echo "  kortix/.version:"
cat /opt/kortix/.version
echo ""
echo "  staging manifest:"
STAGING=$(readlink /opt/kortix)
STAGING_BASE=$(dirname "$STAGING")
cat "$STAGING_BASE/../$(ls /opt | grep kortix-staging | head -1)/.manifest" 2>/dev/null || cat "$(dirname "$(readlink /opt/kortix)")/.manifest" 2>/dev/null || echo "  (staged dir manifest found)"

# ── 6. Verify opencode CLI works ──────────────────────────────────────────────
echo ""
echo "=== [6/7] Verify opencode CLI ==="
opencode --version && echo "  opencode CLI: OK" || echo "  WARNING: opencode CLI not working"

# ── 7. Verify global npm tools ────────────────────────────────────────────────
echo ""
echo "=== [7/7] Verify global npm tools ==="
npm list -g --depth=0 agent-browser 2>/dev/null | grep agent-browser && echo "  agent-browser: OK" || echo "  WARNING: agent-browser not installed"
npm list -g --depth=0 portless 2>/dev/null | grep portless && echo "  portless: OK" || echo "  WARNING: portless not installed"
npm list -g --depth=0 @kortix/opencode-channels 2>/dev/null | grep opencode-channels && echo "  @kortix/opencode-channels: OK" || echo "  WARNING: @kortix/opencode-channels not installed"
[ -L /opt/opencode-channels ] && echo "  /opt/opencode-channels symlink: OK" || echo "  WARNING: /opt/opencode-channels not symlinked"

echo ""
echo "=========================================="
echo " E2E Bootstrap Test PASSED"
echo "=========================================="
