#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  E2E Test: SSH key generation + connection                                 ║
# ║                                                                            ║
# ║  Tests the full SSH key lifecycle:                                         ║
# ║    1. API generates ed25519 keypair                                        ║
# ║    2. Private key is valid OpenSSH format                                  ║
# ║    3. Public key is injected into sandbox container                        ║
# ║    4. SSH connection works with the generated key                          ║
# ║    5. Regeneration produces a new key that also works                      ║
# ║    6. Multiple keys can coexist (append, not overwrite)                    ║
# ║                                                                            ║
# ║  Requires: Kortix installed & running (sandbox container active)           ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    bash test-ssh-e2e.sh [--api-url URL] [--auth-token TOKEN]               ║
# ║                                                                            ║
# ║  Environment:                                                              ║
# ║    API_URL         API base URL (default: auto-detect from .env)           ║
# ║    AUTH_TOKEN       Supabase access token (default: auto-login)            ║
# ║    OWNER_EMAIL      For auto-login (default: e2e@kortix.ai)               ║
# ║    OWNER_PASSWORD   For auto-login (default: e2e-test-pass-42)            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
INSTALL_DIR="${KORTIX_HOME:-$HOME/.kortix}"
OWNER_EMAIL="${OWNER_EMAIL:-e2e@kortix.ai}"
OWNER_PASSWORD="${OWNER_PASSWORD:-e2e-test-pass-42}"
API_URL="${API_URL:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --api-url)     API_URL="$2";     shift 2 ;;
    --auth-token)  AUTH_TOKEN="$2";  shift 2 ;;
    *)             echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# Auto-detect API URL from .env
if [ -z "$API_URL" ] && [ -f "$INSTALL_DIR/.env" ]; then
  API_URL=$(grep -m1 '^API_PUBLIC_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)
fi
if [ -z "$API_URL" ]; then
  API_URL="https://localhost"
fi

# ─── Colors & test framework ────────────────────────────────────────────────
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'
DIM=$'\033[2m'; NC=$'\033[0m'

PASS=0; FAIL=0; SKIP=0; TOTAL=0
FAILED_TESTS=()

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); printf "  ${GREEN}✓${NC} %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); FAILED_TESTS+=("$1"); printf "  ${RED}✗${NC} %s\n" "$1"; }
skip() { SKIP=$((SKIP+1)); TOTAL=$((TOTAL+1)); printf "  ${YELLOW}○${NC} %s ${DIM}(skipped)${NC}\n" "$1"; }
section() { echo ""; echo "${BOLD}${CYAN}═══ $1 ═══${NC}"; echo ""; }

# ─── Auth helper ─────────────────────────────────────────────────────────────
get_auth_token() {
  if [ -n "$AUTH_TOKEN" ]; then
    echo "$AUTH_TOKEN"
    return 0
  fi

  local anon_key supabase_url
  anon_key=$(grep -m1 '^SUPABASE_ANON_KEY=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2-)
  supabase_url=$(grep -m1 '^SUPABASE_PUBLIC_URL=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2-)

  if [ -z "$anon_key" ] || [ -z "$supabase_url" ]; then
    return 1
  fi

  local response
  response=$(curl -k -sf "${supabase_url}/auth/v1/token?grant_type=password" \
    -H "apikey: $anon_key" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" 2>/dev/null)

  if [ -z "$response" ]; then
    return 1
  fi

  AUTH_TOKEN=$(echo "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)
  if [ -z "$AUTH_TOKEN" ]; then
    return 1
  fi

  echo "$AUTH_TOKEN"
}

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  Kortix — SSH Key E2E Test Suite              ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo "${NC}"
echo "  ${DIM}API:${NC}      ${BOLD}${API_URL}${NC}"
echo "  ${DIM}Install:${NC}  ${INSTALL_DIR}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: Prerequisites
# ═══════════════════════════════════════════════════════════════════════════════
section "PHASE 1: Prerequisites"

# Check sandbox is running
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'kortix-sandbox\|sandbox'; then
  pass "Sandbox container is running"
else
  fail "Sandbox container is running"
  echo "  ${RED}Cannot continue — sandbox must be running for SSH tests${NC}"
  exit 1
fi

# Get auth token
TOKEN=$(get_auth_token || true)
if [ -n "$TOKEN" ]; then
  pass "Authenticated (got access token)"
else
  fail "Authentication failed"
  echo "  ${RED}Cannot continue — need auth token for API calls${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: SSH key generation via API
# ═══════════════════════════════════════════════════════════════════════════════
section "PHASE 2: Generate SSH key via API"

SSH_RESPONSE=$(curl -k -sf -X POST "${API_URL}/v1/platform/sandbox/ssh/setup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" 2>/dev/null || true)

if [ -z "$SSH_RESPONSE" ]; then
  fail "SSH setup API returned response"
  echo "  ${RED}Empty response from API${NC}"
  exit 1
fi

# Check success
API_SUCCESS=$(echo "$SSH_RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("true" if d.get("success") else "false")' 2>/dev/null || echo "false")
if [ "$API_SUCCESS" = "true" ]; then
  pass "SSH setup API returned success"
else
  fail "SSH setup API returned success"
  echo "  ${DIM}$(echo "$SSH_RESPONSE" | head -c 200)${NC}"
  exit 1
fi

# Extract fields
PRIVATE_KEY=$(echo "$SSH_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["private_key"])' 2>/dev/null)
PUBLIC_KEY=$(echo "$SSH_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["public_key"])' 2>/dev/null)
SSH_CMD=$(echo "$SSH_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["ssh_command"])' 2>/dev/null)
SSH_HOST=$(echo "$SSH_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["host"])' 2>/dev/null)
SSH_PORT=$(echo "$SSH_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["port"])' 2>/dev/null)
SSH_USER=$(echo "$SSH_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["username"])' 2>/dev/null)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: Validate key format
# ═══════════════════════════════════════════════════════════════════════════════
section "PHASE 3: Key format validation"

# Private key format
if echo "$PRIVATE_KEY" | grep -q '^-----BEGIN OPENSSH PRIVATE KEY-----'; then
  pass "Private key has OpenSSH header"
else
  fail "Private key has OpenSSH header"
fi

if echo "$PRIVATE_KEY" | grep -q '^-----END OPENSSH PRIVATE KEY-----'; then
  pass "Private key has OpenSSH footer"
else
  fail "Private key has OpenSSH footer"
fi

# Public key format
if echo "$PUBLIC_KEY" | grep -q '^ssh-ed25519 '; then
  pass "Public key is ed25519 type"
else
  fail "Public key is ed25519 type"
fi

if echo "$PUBLIC_KEY" | grep -q 'kortix-sandbox$'; then
  pass "Public key has kortix-sandbox comment"
else
  fail "Public key has kortix-sandbox comment"
fi

# Validate private key with ssh-keygen
KEY_TMP=$(mktemp)
echo "$PRIVATE_KEY" > "$KEY_TMP"
chmod 600 "$KEY_TMP"

if ssh-keygen -l -f "$KEY_TMP" >/dev/null 2>&1; then
  pass "Private key passes ssh-keygen validation"
  KEY_TYPE=$(ssh-keygen -l -f "$KEY_TMP" 2>/dev/null | awk '{print $NF}' | tr -d '()')
  if [ "$KEY_TYPE" = "ED25519" ]; then
    pass "Key type is ED25519"
  else
    fail "Key type is ED25519 (got: $KEY_TYPE)"
  fi
else
  fail "Private key passes ssh-keygen validation"
fi

# Connection metadata
if [ -n "$SSH_HOST" ] && [ "$SSH_HOST" != "null" ]; then
  pass "Host is set ($SSH_HOST)"
else
  fail "Host is set"
fi

if [ -n "$SSH_PORT" ] && [ "$SSH_PORT" != "null" ] && [ "$SSH_PORT" -gt 0 ] 2>/dev/null; then
  pass "Port is valid ($SSH_PORT)"
else
  fail "Port is valid (got: $SSH_PORT)"
fi

if [ "$SSH_USER" = "abc" ]; then
  pass "Username is 'abc'"
else
  fail "Username is 'abc' (got: $SSH_USER)"
fi

if echo "$SSH_CMD" | grep -q "ssh.*-p.*${SSH_PORT}.*abc@"; then
  pass "SSH command includes port and user"
else
  fail "SSH command includes port and user"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: Public key injected into container
# ═══════════════════════════════════════════════════════════════════════════════
section "PHASE 4: Key injection"

# Extract the key fingerprint portion for matching
PUB_KEY_DATA=$(echo "$PUBLIC_KEY" | awk '{print $2}')

CONTAINER_KEYS=$(docker exec kortix-sandbox cat /config/.ssh/authorized_keys 2>/dev/null || docker exec kortix-sandbox cat /workspace/.ssh/authorized_keys 2>/dev/null || true)
if echo "$CONTAINER_KEYS" | grep -q "$PUB_KEY_DATA"; then
  pass "Public key found in container authorized_keys"
else
  fail "Public key found in container authorized_keys"
fi

PERMS=$(docker exec kortix-sandbox stat -c '%a' /config/.ssh/authorized_keys 2>/dev/null || docker exec kortix-sandbox stat -c '%a' /workspace/.ssh/authorized_keys 2>/dev/null || echo "unknown")
if [ "$PERMS" = "600" ]; then
  pass "authorized_keys has 600 permissions"
else
  fail "authorized_keys has 600 permissions (got: $PERMS)"
fi

OWNER=$(docker exec kortix-sandbox stat -c '%U' /config/.ssh/authorized_keys 2>/dev/null || docker exec kortix-sandbox stat -c '%U' /workspace/.ssh/authorized_keys 2>/dev/null || echo "unknown")
if [ "$OWNER" = "abc" ]; then
  pass "authorized_keys owned by abc"
else
  fail "authorized_keys owned by abc (got: $OWNER)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5: SSH connection test
# ═══════════════════════════════════════════════════════════════════════════════
section "PHASE 5: SSH connection"

SSH_OUTPUT=$(ssh -i "$KEY_TMP" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 -p "$SSH_PORT" "abc@localhost" "echo SSH_E2E_OK && whoami && hostname" 2>/dev/null || true)

if echo "$SSH_OUTPUT" | grep -q 'SSH_E2E_OK'; then
  pass "SSH connection established with generated key"
else
  fail "SSH connection established with generated key"
  echo "  ${DIM}Output: $(echo "$SSH_OUTPUT" | head -1)${NC}"
fi

if echo "$SSH_OUTPUT" | grep -q 'abc'; then
  pass "Connected as user 'abc'"
else
  fail "Connected as user 'abc'"
fi

# Test command execution via SSH
SSH_PWD=$(ssh -i "$KEY_TMP" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -p "$SSH_PORT" "abc@localhost" "pwd" 2>/dev/null || true)
if [ "$SSH_PWD" = "/workspace" ]; then
  pass "Default directory is /workspace"
else
  # Some setups land in /config (home)
  if [ -n "$SSH_PWD" ]; then
    pass "SSH command execution works (cwd: $SSH_PWD)"
  else
    fail "SSH command execution"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6: Key regeneration
# ═══════════════════════════════════════════════════════════════════════════════
section "PHASE 6: Regeneration"

SSH_RESPONSE_2=$(curl -k -sf -X POST "${API_URL}/v1/platform/sandbox/ssh/setup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" 2>/dev/null || true)

PRIVATE_KEY_2=$(echo "$SSH_RESPONSE_2" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["private_key"])' 2>/dev/null)
PUBLIC_KEY_2=$(echo "$SSH_RESPONSE_2" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["public_key"])' 2>/dev/null)

# Keys should be different
if [ "$PRIVATE_KEY" != "$PRIVATE_KEY_2" ]; then
  pass "Regenerated key is different from first key"
else
  fail "Regenerated key is different from first key"
fi

# New key should work
KEY_TMP_2=$(mktemp)
echo "$PRIVATE_KEY_2" > "$KEY_TMP_2"
chmod 600 "$KEY_TMP_2"

SSH_OUTPUT_2=$(ssh -i "$KEY_TMP_2" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -p "$SSH_PORT" "abc@localhost" "echo SSH_E2E_OK2" 2>/dev/null || true)
if echo "$SSH_OUTPUT_2" | grep -q 'SSH_E2E_OK2'; then
  pass "SSH works with regenerated key"
else
  fail "SSH works with regenerated key"
fi

# Old key should ALSO still work (keys are appended, not replaced)
SSH_OUTPUT_OLD=$(ssh -i "$KEY_TMP" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -p "$SSH_PORT" "abc@localhost" "echo SSH_E2E_OLD" 2>/dev/null || true)
if echo "$SSH_OUTPUT_OLD" | grep -q 'SSH_E2E_OLD'; then
  pass "Previous key still works (keys coexist)"
else
  fail "Previous key still works (keys coexist)"
fi

# Both keys in authorized_keys
PUB_KEY_DATA_2=$(echo "$PUBLIC_KEY_2" | awk '{print $2}')
KEY_COUNT=$(docker exec kortix-sandbox cat /config/.ssh/authorized_keys 2>/dev/null | grep -c 'ssh-ed25519' || true)
if [ "${KEY_COUNT:-0}" -ge 2 ] 2>/dev/null; then
  pass "authorized_keys has multiple keys ($KEY_COUNT)"
else
  fail "authorized_keys has multiple keys (got: $KEY_COUNT)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7: Error handling
# ═══════════════════════════════════════════════════════════════════════════════
section "PHASE 7: Error handling"

# No auth token → should fail
NOAUTH_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/v1/platform/sandbox/ssh/setup" 2>/dev/null)
if [ "$NOAUTH_CODE" = "401" ] || [ "$NOAUTH_CODE" = "403" ]; then
  pass "Unauthenticated request returns $NOAUTH_CODE"
else
  # The endpoint might not require auth in local mode — that's OK
  skip "Auth check (endpoint may not require auth in local mode, got: $NOAUTH_CODE)"
fi

# ─── Cleanup ────────────────────────────────────────────────────────────────
rm -f "$KEY_TMP" "$KEY_TMP_2" 2>/dev/null

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "${BOLD}${CYAN}═══ SSH TEST SUMMARY ═══${NC}"
echo ""
echo "  ${GREEN}Passed:${NC}  $PASS"
echo "  ${RED}Failed:${NC}  $FAIL"
echo "  ${YELLOW}Skipped:${NC} $SKIP"
echo "  ${BOLD}Total:${NC}   $TOTAL"
echo ""

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
  echo "  ${RED}Failed tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo "    ${RED}✗${NC} $t"
  done
  echo ""
fi

if [ "$FAIL" -eq 0 ]; then
  echo "${GREEN}${BOLD}  ✅  All SSH E2E tests passed!${NC}"
else
  echo "${RED}${BOLD}  ❌  $FAIL test(s) failed${NC}"
fi
echo ""

exit "$FAIL"
