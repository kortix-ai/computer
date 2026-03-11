#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Probe Hetzner Snapshot                                                      ║
# ║                                                                              ║
# ║  Boots a real server from a snapshot, injects the same cloud-init the API   ║
# ║  uses, and probes /kortix/health until the sandbox is actually up.           ║
# ║                                                                              ║
# ║  Usage:                                                                      ║
# ║    HETZNER_API_KEY=xxx ./probe-hetzner-snapshot.sh <snapshot-id-or-desc>    ║
# ║                                                                              ║
# ║  Examples:                                                                   ║
# ║    HETZNER_API_KEY=xxx ./probe-hetzner-snapshot.sh 365710278                ║
# ║    HETZNER_API_KEY=xxx ./probe-hetzner-snapshot.sh kortix-computer-v0.7.15  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; NC=$'\033[0m'

ok()   { echo "  ${GREEN}✓${NC} $*"; }
fail() { echo "  ${RED}✗${NC} $*" >&2; }
info() { echo "  ${CYAN}▸${NC} $*"; }
warn() { echo "  ${YELLOW}⚠${NC} $*"; }

HETZNER_API="https://api.hetzner.cloud/v1"
SERVER_TYPE="${HETZNER_PROBE_SERVER_TYPE:-cx23}"
LOCATION="${HETZNER_PROBE_LOCATION:-nbg1}"
# How long to wait for the sandbox health endpoint (20 min — npm install can be slow)
HEALTH_TIMEOUT="${HETZNER_PROBE_TIMEOUT:-1200}"
# Poll interval for health check
POLL_INTERVAL=10

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage: HETZNER_API_KEY=xxx ./probe-hetzner-snapshot.sh <snapshot-id-or-description>"
  exit 1
fi
if [ -z "${HETZNER_API_KEY:-}" ]; then
  fail "HETZNER_API_KEY is required"
  exit 1
fi

echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${BOLD}  Hetzner Snapshot Probe${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ─── API helper ──────────────────────────────────────────────────────────────
hetzner() {
  local method="$1" path="$2"; shift 2
  curl -s -X "$method" \
    -H "Authorization: Bearer ${HETZNER_API_KEY}" \
    -H "Content-Type: application/json" \
    "$@" "${HETZNER_API}${path}"
}

# ─── Resolve snapshot ID ─────────────────────────────────────────────────────
SNAPSHOT_ID=""
SNAPSHOT_DESC=""

# If target is numeric, use directly
if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  SNAPSHOT_ID="$TARGET"
  info "Using snapshot ID: ${SNAPSHOT_ID}"
else
  # Look up by description
  info "Resolving snapshot by description: ${TARGET}..."
  SNAP_DATA=$(hetzner GET "/images?type=snapshot&per_page=50")
  SNAPSHOT_ID=$(echo "$SNAP_DATA" | python3 -c "
import json, sys
d = json.load(sys.stdin)
match = next((i for i in d.get('images', []) if i.get('description') == '${TARGET}'), None)
if match:
    print(match['id'])
" 2>/dev/null || true)
  if [ -z "$SNAPSHOT_ID" ]; then
    fail "No snapshot found with description '${TARGET}'"
    exit 1
  fi
  SNAPSHOT_DESC="$TARGET"
  ok "Resolved to snapshot ID: ${SNAPSHOT_ID}"
fi

info "Server type: ${SERVER_TYPE} @ ${LOCATION}"
info "Health timeout: ${HEALTH_TIMEOUT}s"
echo ""

# ─── Cleanup trap ────────────────────────────────────────────────────────────
PROBE_SERVER_ID=""

cleanup() {
  if [ -n "$PROBE_SERVER_ID" ]; then
    warn "Cleaning up probe server ${PROBE_SERVER_ID}..."
    hetzner DELETE "/servers/${PROBE_SERVER_ID}" >/dev/null 2>&1 || true
    ok "Probe server deleted"
  fi
}
trap cleanup EXIT

# ─── Build cloud-init — identical to what the API sends ─────────────────────
# Use a dummy service key for probing — sandbox just needs to start, not auth
PROBE_TOKEN="probe-test-$(date +%s)"
ENV_LINES="KORTIX_API_URL=http://probe-not-set
ENV_MODE=cloud
INTERNAL_SERVICE_KEY=${PROBE_TOKEN}
KORTIX_TOKEN=${PROBE_TOKEN}
KORTIX_SANDBOX_VERSION=probe"

ENV_B64=$(echo "$ENV_LINES" | base64)

USER_DATA='#!/bin/bash
chage -d 99999 root 2>/dev/null || true
chage -M 99999 root 2>/dev/null || true

mkdir -p /etc/kortix
echo '"'"'"$ENV_B64"'"'"' | base64 -d > /etc/kortix/env

cat > /usr/local/bin/kortix-start.sh <<'"'"'STARTEOF'"'"'
#!/bin/bash
set -e
ENV_FILE="/etc/kortix/env"
for i in $(seq 1 60); do
  [ -s "$ENV_FILE" ] && break
  sleep 1
done
[ ! -s "$ENV_FILE" ] && touch "$ENV_FILE"
docker rm -f kortix-sandbox 2>/dev/null || true
exec docker run --rm --name kortix-sandbox \
  --env-file "$ENV_FILE" \
  --cap-add SYS_ADMIN \
  --security-opt seccomp=unconfined \
  --shm-size 2g \
  -p 8000:8000 \
  -p 6080:6080 \
  kortix/computer:probe-tag
STARTEOF
chmod +x /usr/local/bin/kortix-start.sh

cat > /etc/systemd/system/kortix-sandbox.service <<'"'"'SVCEOF'"'"'
[Unit]
Description=Kortix Sandbox Container
After=docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/kortix-start.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable kortix-sandbox.service
systemctl start kortix-sandbox.service'

# Replace the probe-tag placeholder with the actual version derived from snapshot description
# The snapshot already has the image pre-pulled — we need to use the right tag
# Extract version from description if available, else use 'latest'
SNAP_VERSION="latest"
if [[ "${SNAPSHOT_DESC:-}" =~ kortix-computer-v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
  SNAP_VERSION="${BASH_REMATCH[1]}"
elif [[ "${TARGET:-}" =~ ^([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  SNAP_VERSION="$TARGET"
fi
info "Docker image tag to use: kortix/computer:${SNAP_VERSION}"
USER_DATA="${USER_DATA//kortix\/computer:probe-tag/kortix\/computer:${SNAP_VERSION}}"

# ─── Create probe server ─────────────────────────────────────────────────────
info "Creating probe server from snapshot ${SNAPSHOT_ID}..."

CREATE_BODY=$(python3 -c "
import json
body = {
    'name': 'kortix-probe-$(date +%s)',
    'server_type': '${SERVER_TYPE}',
    'image': ${SNAPSHOT_ID},
    'location': '${LOCATION}',
    'start_after_create': True,
    'user_data': '''${USER_DATA}''',
    'labels': {'purpose': 'probe', 'kortix-probe': 'true'},
}
print(json.dumps(body))
")

RESULT=$(hetzner POST "/servers" -d "$CREATE_BODY")
PROBE_SERVER_ID=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['server']['id'])" 2>/dev/null || true)
SERVER_IP=$(echo "$RESULT"      | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['server']['public_net']['ipv4']['ip'])" 2>/dev/null || true)

if [ -z "$PROBE_SERVER_ID" ] || [ -z "$SERVER_IP" ]; then
  fail "Failed to create probe server. Response:"
  echo "$RESULT" >&2
  exit 1
fi
ok "Probe server created (ID: ${PROBE_SERVER_ID}, IP: ${SERVER_IP})"

# ─── Wait for server running ─────────────────────────────────────────────────
info "Waiting for server to reach 'running' state..."
ELAPSED=0
STATUS=""
while [ $ELAPSED -lt 120 ]; do
  STATUS=$(hetzner GET "/servers/${PROBE_SERVER_ID}" | python3 -c "import json,sys; print(json.load(sys.stdin)['server']['status'])" 2>/dev/null || true)
  [ "$STATUS" = "running" ] && break
  sleep 3; ELAPSED=$((ELAPSED + 3))
done
[ "$STATUS" != "running" ] && { fail "Server did not reach 'running' (status: ${STATUS})"; exit 1; }
ok "Server running — IP: ${SERVER_IP}"

# ─── Poll /kortix/health ─────────────────────────────────────────────────────
echo ""
info "Probing http://${SERVER_IP}:8000/kortix/health ..."
info "Timeout: ${HEALTH_TIMEOUT}s (npm install + boot can take ~15-20 min)"
echo ""

HEALTH_URL="http://${SERVER_IP}:8000/kortix/health"
ELAPSED=0
LAST_STATUS=""
START_TS=$(date +%s)

while [ $ELAPSED -lt $HEALTH_TIMEOUT ]; do
  HTTP_CODE=$(curl -s -o /tmp/kortix-probe-body.txt -w "%{http_code}" --connect-timeout 5 --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
  BODY=$(cat /tmp/kortix-probe-body.txt 2>/dev/null || true)

  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TS))
  ELAPSED_MIN=$((ELAPSED / 60))
  ELAPSED_SEC=$((ELAPSED % 60))
  TIMESTAMP=$(printf "%02dm%02ds" $ELAPSED_MIN $ELAPSED_SEC)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "503" ]; then
    # 200 = fully healthy, 503 = reachable but opencode still starting — both mean sandbox is up
    STATUS_VAL=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "?")
    OPENCODE=$(echo "$BODY"   | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('opencode','?'))" 2>/dev/null || echo "?")

    if [ "$BODY" != "$LAST_STATUS" ]; then
      info "[${TIMESTAMP}] HTTP ${HTTP_CODE} — status=${STATUS_VAL} opencode=${OPENCODE}"
      LAST_STATUS="$BODY"
    fi

    if [ "$HTTP_CODE" = "200" ] && [ "$STATUS_VAL" = "ok" ]; then
      echo ""
      echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
      echo "  ${GREEN}${BOLD}  ✓ Sandbox is healthy and fully ready!${NC}"
      echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
      echo ""
      ok "Snapshot ${SNAPSHOT_ID} (${SNAPSHOT_DESC:-${TARGET}}) PASSES probe"
      ok "Health endpoint: ${HEALTH_URL}"
      ok "Boot time: ${TIMESTAMP}"
      echo ""
      echo "  ${DIM}Safe to set on VPS:${NC}"
      echo "    HETZNER_SNAPSHOT_ID=${SNAPSHOT_ID}"
      echo "    HETZNER_SNAPSHOT_DESCRIPTION=${SNAPSHOT_DESC:-kortix-computer-v${SNAP_VERSION}}"
      echo ""
      exit 0
    fi
  else
    # Not yet reachable
    if [ $((ELAPSED % 30)) -eq 0 ] || [ $ELAPSED -lt 30 ]; then
      info "[${TIMESTAMP}] Not yet reachable (HTTP ${HTTP_CODE}) — waiting..."
    fi
  fi

  sleep $POLL_INTERVAL
done

echo ""
fail "Sandbox did NOT become healthy within ${HEALTH_TIMEOUT}s"
fail "Snapshot ${SNAPSHOT_ID} FAILS probe — do NOT use it on staging"
echo ""
exit 1
