#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Build Hetzner Snapshot                                                     ║
# ║                                                                             ║
# ║  Automates creation of a Hetzner Cloud snapshot with Docker + sandbox       ║
# ║  image pre-pulled for fast cold starts.                                     ║
# ║                                                                             ║
# ║  Usage:                                                                     ║
# ║    HETZNER_API_KEY=xxx ./sandbox/build-hetzner-snapshot.sh 0.7.15           ║
# ║    ./sandbox/build-hetzner-snapshot.sh --dry-run 0.7.15                     ║
# ║                                                                             ║
# ║  Requires: HETZNER_API_KEY env var                                          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; NC=$'\033[0m'

ok()   { echo "  ${GREEN}✓${NC} $*"; }
fail() { echo "  ${RED}✗${NC} $*" >&2; }
info() { echo "  ${CYAN}▸${NC} $*"; }
warn() { echo "  ${YELLOW}⚠${NC} $*"; }

# ─── Config ──────────────────────────────────────────────────────────────────
HETZNER_API="https://api.hetzner.cloud/v1"
DOCKER_IMAGE_PREFIX="kortix/sandbox"
# Use a cheap shared server just for building the snapshot
BUILD_SERVER_TYPE="${HETZNER_BUILD_SERVER_TYPE:-cpx11}"
BUILD_LOCATION="${HETZNER_BUILD_LOCATION:-fsn1}"
# Ubuntu 24.04 as base OS
BASE_IMAGE="ubuntu-24.04"
# Timeout waiting for cloud-init to finish (10 minutes)
CLOUD_INIT_TIMEOUT=600
# Timeout waiting for snapshot creation (10 minutes)
SNAPSHOT_TIMEOUT=600

# ─── Parse args ──────────────────────────────────────────────────────────────
DRY_RUN=false
VERSION=""
SKIP_EXISTING_CHECK=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)           DRY_RUN=true ;;
    --force)             SKIP_EXISTING_CHECK=true ;;
    -h|--help)
      echo "Usage: ./sandbox/build-hetzner-snapshot.sh [flags] <version>"
      echo ""
      echo "Flags:"
      echo "  --dry-run    Show what would happen without creating anything"
      echo "  --force      Create snapshot even if one with same description exists"
      echo ""
      echo "Environment:"
      echo "  HETZNER_API_KEY              (required) Hetzner Cloud API token"
      echo "  HETZNER_BUILD_SERVER_TYPE    Server type for build (default: cx22)"
      echo "  HETZNER_BUILD_LOCATION       Location for build (default: nbg1)"
      echo "  HETZNER_SSH_KEY_ID           SSH key ID to attach (optional, for debugging)"
      echo ""
      echo "Examples:"
      echo "  HETZNER_API_KEY=xxx ./sandbox/build-hetzner-snapshot.sh 0.7.15"
      echo "  ./sandbox/build-hetzner-snapshot.sh --dry-run 0.7.15"
      exit 0
      ;;
    *)                   VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Usage: ./sandbox/build-hetzner-snapshot.sh [flags] <version>"
  echo "Run with --help for details."
  exit 1
fi

if [ -z "${HETZNER_API_KEY:-}" ]; then
  fail "HETZNER_API_KEY environment variable is required"
  exit 1
fi

SNAPSHOT_DESCRIPTION="kortix-sandbox-v${VERSION}"
DOCKER_IMAGE="${DOCKER_IMAGE_PREFIX}:${VERSION}"
SERVER_NAME="snapshot-builder-${VERSION}-$(date +%s)"

echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${BOLD}  Hetzner Snapshot Builder — v${VERSION}${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
$DRY_RUN && echo "  ${YELLOW}DRY RUN — nothing will be created${NC}"
echo ""
info "Snapshot description: ${SNAPSHOT_DESCRIPTION}"
info "Docker image: ${DOCKER_IMAGE}"
info "Build server: ${BUILD_SERVER_TYPE} @ ${BUILD_LOCATION}"
echo ""

# ─── Hetzner API helper ─────────────────────────────────────────────────────

hetzner() {
  local method="$1" path="$2"
  shift 2
  local response
  response=$(curl -s -X "$method" \
    -H "Authorization: Bearer ${HETZNER_API_KEY}" \
    -H "Content-Type: application/json" \
    "$@" \
    "${HETZNER_API}${path}" 2>&1)
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    fail "Hetzner API ${method} ${path} failed (curl exit: ${exit_code})"
    echo "  ${DIM}${response}${NC}" >&2
    return 1
  fi
  # Check for API error response
  local api_error
  api_error=$(echo "$response" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      if (d.error) console.log(d.error.message || JSON.stringify(d.error));
    } catch {}
  " 2>/dev/null || true)
  if [ -n "$api_error" ]; then
    fail "Hetzner API ${method} ${path}: ${api_error}"
    return 1
  fi
  echo "$response"
}

# ─── Cleanup trap ────────────────────────────────────────────────────────────
CREATED_SERVER_ID=""

cleanup() {
  if [ -n "$CREATED_SERVER_ID" ]; then
    warn "Cleaning up: deleting temporary server ${CREATED_SERVER_ID}..."
    hetzner DELETE "/servers/${CREATED_SERVER_ID}" >/dev/null 2>&1 || true
    ok "Temporary server deleted"
  fi
}
trap cleanup EXIT

# ─── Step 1: Check for existing snapshot ─────────────────────────────────────
info "Checking for existing snapshot..."

EXISTING=$(hetzner GET "/images?type=snapshot&per_page=50")
EXISTING_ID=$(echo "$EXISTING" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const match = data.images.find(i => i.description === '${SNAPSHOT_DESCRIPTION}');
  if (match) console.log(match.id);
" 2>/dev/null || true)

if [ -n "$EXISTING_ID" ] && ! $SKIP_EXISTING_CHECK; then
  warn "Snapshot '${SNAPSHOT_DESCRIPTION}' already exists (ID: ${EXISTING_ID})"
  warn "Use --force to create a new one anyway"
  exit 0
elif [ -n "$EXISTING_ID" ]; then
  warn "Snapshot '${SNAPSHOT_DESCRIPTION}' exists (ID: ${EXISTING_ID}) — will create a new one (--force)"
fi

if $DRY_RUN; then
  ok "(dry-run) Would create server ${BUILD_SERVER_TYPE} @ ${BUILD_LOCATION}"
  ok "(dry-run) Would install Docker and pull ${DOCKER_IMAGE}"
  ok "(dry-run) Would create snapshot: ${SNAPSHOT_DESCRIPTION}"
  ok "(dry-run) Would delete temporary server"
  exit 0
fi

# ─── Step 2: Create temporary build server ───────────────────────────────────
info "Creating temporary build server..."

# Cloud-init script that installs Docker, pulls the image, and signals completion
CLOUD_INIT=$(cat <<CLOUDINIT
#!/bin/bash
set -e

echo "[snapshot-builder] Starting setup..."

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Wait for Docker to be ready
for i in \$(seq 1 30); do
  docker info &>/dev/null && break
  sleep 2
done

# Pull the sandbox image
echo "[snapshot-builder] Pulling ${DOCKER_IMAGE}..."
docker pull ${DOCKER_IMAGE}

# Create the systemd service for kortix-sandbox
cat > /etc/systemd/system/kortix-sandbox.service <<'SVCEOF'
[Unit]
Description=Kortix Sandbox Container
After=docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/kortix-start.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable kortix-sandbox.service

# Signal that setup is complete
echo "[snapshot-builder] Setup complete!"
touch /tmp/snapshot-builder-done
CLOUDINIT
)

CREATE_BODY=$(node -e "
  const body = {
    name: '${SERVER_NAME}',
    server_type: '${BUILD_SERVER_TYPE}',
    image: '${BASE_IMAGE}',
    location: '${BUILD_LOCATION}',
    start_after_create: true,
    user_data: $(echo "$CLOUD_INIT" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))"),
    labels: {
      'purpose': 'snapshot-builder',
      'kortix-version': '${VERSION}'
    }
  };
  if ('${HETZNER_SSH_KEY_ID:-}') {
    body.ssh_keys = [parseInt('${HETZNER_SSH_KEY_ID:-0}', 10)];
  }
  process.stdout.write(JSON.stringify(body));
")

RESULT=$(hetzner POST "/servers" -d "$CREATE_BODY")
CREATED_SERVER_ID=$(echo "$RESULT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.server.id);
")
SERVER_IP=$(echo "$RESULT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.server.public_net.ipv4.ip);
")

ok "Server created: ${SERVER_NAME} (ID: ${CREATED_SERVER_ID}, IP: ${SERVER_IP})"

# ─── Step 3: Wait for server to be running ───────────────────────────────────
info "Waiting for server to be running..."

ELAPSED=0
while [ $ELAPSED -lt 120 ]; do
  STATUS=$(hetzner GET "/servers/${CREATED_SERVER_ID}" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log(data.server.status);
  ")
  [ "$STATUS" = "running" ] && break
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done

if [ "$STATUS" != "running" ]; then
  fail "Server did not reach 'running' state within 120s (status: ${STATUS})"
  exit 1
fi
ok "Server is running"

# ─── Step 4: Wait for cloud-init to complete ─────────────────────────────────
info "Waiting for cloud-init to complete (Docker install + image pull)..."
info "This may take 3-5 minutes..."

ELAPSED=0
while [ $ELAPSED -lt $CLOUD_INIT_TIMEOUT ]; do
  # Check if cloud-init finished by looking for our marker file via SSH
  # Since we may not have SSH access, poll via Hetzner console API or just wait
  # Use a generous fixed wait + verify Docker image exists
  sleep 15
  ELAPSED=$((ELAPSED + 15))

  # Try to check via SSH if key is available
  if [ -n "${HETZNER_SSH_KEY_ID:-}" ]; then
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes \
        "root@${SERVER_IP}" "test -f /tmp/snapshot-builder-done" 2>/dev/null; then
      ok "Cloud-init completed (verified via SSH)"
      break
    fi
  else
    # Without SSH, we estimate based on typical timing:
    # Docker install ~60s, image pull ~120-180s
    if [ $ELAPSED -ge 300 ]; then
      warn "No SSH key — waited ${ELAPSED}s (estimated sufficient for Docker + image pull)"
      break
    fi
  fi

  # Show progress every 30s
  if [ $((ELAPSED % 30)) -eq 0 ]; then
    info "  ...${ELAPSED}s elapsed"
  fi
done

if [ $ELAPSED -ge $CLOUD_INIT_TIMEOUT ]; then
  fail "Cloud-init did not complete within ${CLOUD_INIT_TIMEOUT}s"
  exit 1
fi

# ─── Step 5: Power off the server ────────────────────────────────────────────
info "Powering off server before snapshot..."

hetzner POST "/servers/${CREATED_SERVER_ID}/actions/shutdown" -d '{}' >/dev/null

# Wait for server to be off
ELAPSED=0
while [ $ELAPSED -lt 120 ]; do
  STATUS=$(hetzner GET "/servers/${CREATED_SERVER_ID}" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log(data.server.status);
  ")
  [ "$STATUS" = "off" ] && break
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done

if [ "$STATUS" != "off" ]; then
  # Force power off if graceful shutdown didn't work
  warn "Graceful shutdown timed out, forcing power off..."
  hetzner POST "/servers/${CREATED_SERVER_ID}/actions/poweroff" -d '{}' >/dev/null
  sleep 10
fi

ok "Server powered off"

# ─── Step 6: Create snapshot ─────────────────────────────────────────────────
info "Creating snapshot: ${SNAPSHOT_DESCRIPTION}..."

SNAPSHOT_RESULT=$(hetzner POST "/servers/${CREATED_SERVER_ID}/actions/create_image" \
  -d "{\"description\": \"${SNAPSHOT_DESCRIPTION}\", \"type\": \"snapshot\"}")

SNAPSHOT_ID=$(echo "$SNAPSHOT_RESULT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.image.id);
")
ACTION_ID=$(echo "$SNAPSHOT_RESULT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.action.id);
")

info "Snapshot ID: ${SNAPSHOT_ID}, waiting for completion..."

# Wait for snapshot action to complete
ELAPSED=0
while [ $ELAPSED -lt $SNAPSHOT_TIMEOUT ]; do
  ACTION_STATUS=$(hetzner GET "/actions/${ACTION_ID}" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log(data.action.status);
  ")
  [ "$ACTION_STATUS" = "success" ] && break
  if [ "$ACTION_STATUS" = "error" ]; then
    fail "Snapshot creation failed!"
    exit 1
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))

  if [ $((ELAPSED % 30)) -eq 0 ]; then
    info "  ...${ELAPSED}s elapsed (status: ${ACTION_STATUS})"
  fi
done

if [ "$ACTION_STATUS" != "success" ]; then
  fail "Snapshot creation timed out after ${SNAPSHOT_TIMEOUT}s"
  exit 1
fi

ok "Snapshot created: ${SNAPSHOT_DESCRIPTION} (ID: ${SNAPSHOT_ID})"

# ─── Step 7: Delete temporary server ─────────────────────────────────────────
info "Deleting temporary build server..."
hetzner DELETE "/servers/${CREATED_SERVER_ID}" >/dev/null
CREATED_SERVER_ID=""  # Clear so trap doesn't double-delete
ok "Temporary server deleted"

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${GREEN}${BOLD}  ✓ Hetzner snapshot ready!${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Snapshot: ${CYAN}${SNAPSHOT_DESCRIPTION}${NC}"
echo "  ID:       ${CYAN}${SNAPSHOT_ID}${NC}"
echo ""
echo "  ${DIM}Set in your .env:${NC}"
echo "    HETZNER_SNAPSHOT_DESCRIPTION=${SNAPSHOT_DESCRIPTION}"
echo "    ${DIM}# or${NC}"
echo "    HETZNER_SNAPSHOT_ID=${SNAPSHOT_ID}"
echo ""
