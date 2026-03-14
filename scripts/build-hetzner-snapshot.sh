#!/usr/bin/env bash
set -euo pipefail

# ─── Build Hetzner Snapshot for kortix-computer ──────────────────────────────
#
# Creates a Hetzner snapshot named kortix-computer-v{version} by:
#   1. Spinning up a cx23 (cheapest 40GB x86) server with Ubuntu 24.04
#   2. Cloud-init: installs Docker, pulls kortix/computer:{version} image
#   3. Cloud-init powers the server off after the image is fully pulled
#   4. Waits for the server to reach status=off
#   5. Creates a snapshot with description kortix-computer-v{version}
#   6. Deletes the temporary server
#
# Usage:
#   ./scripts/build-hetzner-snapshot.sh                  # uses version from release.json
#   ./scripts/build-hetzner-snapshot.sh 0.8.2            # explicit version
#   ./scripts/build-hetzner-snapshot.sh --yes 0.8.2      # non-interactive recreate
#
# Requires:
#   HETZNER_API_KEY env var (or reads from kortix-api/.env)
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Args ──────────────────────────────────────────────────────────────────────
FORCE_RECREATE="false"
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --yes|--force|-y)
      FORCE_RECREATE="true"
      ;;
    *)
      if [[ -z "$VERSION" ]]; then
        VERSION="$arg"
      else
        echo "Error: unexpected argument '$arg'"
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  VERSION=$(python3 -c "import json; print(json.load(open('$ROOT_DIR/sandbox/release.json'))['version'])")
fi
SNAPSHOT_DESC="kortix-computer-v${VERSION}"
DOCKER_IMAGE="kortix/computer:${VERSION}"

# ── Auth ─────────────────────────────────────────────────────────────────────
if [[ -z "${HETZNER_API_KEY:-}" ]]; then
  if [[ -f "$ROOT_DIR/kortix-api/.env" ]]; then
    HETZNER_API_KEY=$(grep '^HETZNER_API_KEY=' "$ROOT_DIR/kortix-api/.env" | cut -d= -f2-)
  fi
fi
if [[ -z "${HETZNER_API_KEY:-}" ]]; then
  echo "Error: HETZNER_API_KEY not set"
  exit 1
fi

API="https://api.hetzner.cloud/v1"
AUTH="Authorization: Bearer $HETZNER_API_KEY"

hcloud() { curl -sf -H "$AUTH" -H "Content-Type: application/json" "$@"; }

# ── Colors ───────────────────────────────────────────────────────────────────
G='\033[32m' R='\033[31m' Y='\033[33m' C='\033[36m' X='\033[0m'
ok()   { echo -e "  ${G}✓${X} $*"; }
fail() { echo -e "  ${R}✗${X} $*"; exit 1; }
info() { echo -e "  ${C}▸${X} $*"; }
warn() { echo -e "  ${Y}!${X} $*"; }

echo ""
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build Hetzner Snapshot v${VERSION}"
echo "  Image:    ${DOCKER_IMAGE}"
echo "  Snapshot: ${SNAPSHOT_DESC}"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Check image exists on Docker Hub ─────────────────────────────────────────
info "Checking Docker Hub for ${DOCKER_IMAGE}..."
if ! curl -sf "https://hub.docker.com/v2/repositories/kortix/computer/tags/${VERSION}" > /dev/null; then
  fail "Image ${DOCKER_IMAGE} not found on Docker Hub — run pnpm ship first"
fi
ok "Image found on Docker Hub"

# ── Check snapshot doesn't already exist ─────────────────────────────────────
info "Checking for existing snapshot..."
EXISTING=$(hcloud "$API/images?type=snapshot&per_page=50" | \
  python3 -c "import json,sys; imgs=json.load(sys.stdin)['images']; \
  matches=[i for i in imgs if i['description']=='$SNAPSHOT_DESC']; \
  print(matches[0]['id'] if matches else '')" 2>/dev/null || true)

if [[ -n "$EXISTING" ]]; then
  warn "Snapshot $SNAPSHOT_DESC already exists (id: $EXISTING)"
  if [[ "$FORCE_RECREATE" != "true" ]]; then
    read -r -p "  Delete and recreate? [y/N] " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "  Aborted."
      exit 0
    fi
  else
    info "--yes enabled, recreating snapshot automatically..."
  fi
  info "Deleting existing snapshot $EXISTING..."
  hcloud -X DELETE "$API/images/$EXISTING" > /dev/null
  ok "Deleted"
fi

# ── Cloud-init script ─────────────────────────────────────────────────────────
USER_DATA=$(cat <<CLOUDINIT
#!/bin/bash
set -e

# Install Docker
apt-get update -qq
apt-get install -y -qq ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \$VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io

# Pull sandbox image (this is the slow part — ~5-10 mins)
docker pull ${DOCKER_IMAGE}

# Tag as latest for convenience
docker tag ${DOCKER_IMAGE} kortix/computer:latest

# Pre-pull done — power off so the outer script can snapshot safely without SSH
touch /tmp/kortix-snapshot-ready
echo "SNAPSHOT_READY" > /tmp/kortix-snapshot-ready
shutdown -h now
CLOUDINIT
)

# ── Create build server ───────────────────────────────────────────────────────
info "Creating cx23 build server (Ubuntu 24.04, nbg1)..."
SERVER_RESP=$(hcloud -X POST "$API/servers" -d "{
  \"name\": \"kortix-snapshot-builder-${VERSION//\./-}\",
  \"server_type\": \"cx23\",
  \"image\": \"ubuntu-24.04\",
  \"location\": \"nbg1\",
  \"user_data\": $(echo "$USER_DATA" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  \"public_net\": {\"enable_ipv4\": true, \"enable_ipv6\": false}
}")

SERVER_ID=$(echo "$SERVER_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['server']['id'])")
ok "Server created: id=$SERVER_ID"

# ── Wait for cloud-init to complete ──────────────────────────────────────────
info "Waiting for Docker pull to complete and server to power off (this takes ~10-15 mins)..."
ELAPSED=0
TIMEOUT=1200  # 20 min max
while true; do
  sleep 30
  ELAPSED=$((ELAPSED + 30))

  STATUS=$(hcloud "$API/servers/$SERVER_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['server']['status'])" 2>/dev/null || echo "unknown")

  if [[ "$STATUS" == "off" ]]; then
    ok "Build complete, server powered off (${ELAPSED}s)"
    break
  fi

  if [[ $ELAPSED -ge $TIMEOUT ]]; then
    fail "Timeout after ${TIMEOUT}s — server may still be pulling. Check server $SERVER_ID manually."
  fi

  echo -n "  ... ${ELAPSED}s (status: $STATUS)"$'\r'
done

# ── Create snapshot ───────────────────────────────────────────────────────────
info "Creating snapshot '$SNAPSHOT_DESC'..."
SNAP_RESP=$(hcloud -X POST "$API/servers/$SERVER_ID/actions/create_image" -d "{
  \"type\": \"snapshot\",
  \"description\": \"$SNAPSHOT_DESC\"
}")
SNAP_ID=$(echo "$SNAP_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['image']['id'])")

# Wait for snapshot to be created
for i in $(seq 1 60); do
  SNAP_STATUS=$(hcloud "$API/images/$SNAP_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['image']['status'])")
  [[ "$SNAP_STATUS" == "available" ]] && break
  sleep 10
done
ok "Snapshot created: id=$SNAP_ID description=$SNAPSHOT_DESC"

# ── Delete build server ───────────────────────────────────────────────────────
info "Deleting build server..."
hcloud -X DELETE "$API/servers/$SERVER_ID" > /dev/null
ok "Build server deleted"

echo ""
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done! Snapshot ready:"
echo "    ID:   $SNAP_ID"
echo "    Desc: $SNAPSHOT_DESC"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  release.json already has snapshots.hetzner = $SNAPSHOT_DESC"
echo "  Deploy with: pnpm ship (or update infra secrets if needed)"
echo ""
