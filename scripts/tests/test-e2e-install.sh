#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  E2E Install Test — validates a fresh get-kortix.sh install works          ║
# ║                                                                            ║
# ║  Expects: containers already running from a get-kortix.sh install.         ║
# ║  Does NOT run the installer itself (that's manual / CI-specific).          ║
# ║                                                                            ║
# ║  Usage:  bash scripts/tests/test-e2e-install.sh                            ║
# ║                                                                            ║
# ║  Exit codes:                                                               ║
# ║    0 = all tests passed                                                    ║
# ║    1 = one or more tests failed                                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

FRONTEND_PORT=13737
API_PORT=13738
POSTGRES_PORT=13739
SANDBOX_PORT=13740

FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
API_URL="http://localhost:${API_PORT}"
SANDBOX_URL="http://localhost:${SANDBOX_PORT}"

INSTALL_DIR="$HOME/.kortix"

# Timeouts
HEALTH_TIMEOUT=120      # seconds to wait for services to be healthy
HEALTH_INTERVAL=3       # seconds between health checks
CURL_TIMEOUT=10         # per-request timeout

# ─── Test Framework ──────────────────────────────────────────────────────────

PASSED=0
FAILED=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

pass() {
  PASSED=$((PASSED + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
  FAILED=$((FAILED + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}✗${NC} $1"
  if [[ -n "${2:-}" ]]; then
    echo -e "    ${DIM}$2${NC}"
  fi
}

section() {
  echo ""
  echo -e "  ${BOLD}${CYAN}── $1 ──${NC}"
  echo ""
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

# curl with timeout, silent, returns HTTP status code
http_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" "$1" 2>/dev/null || echo "000"
}

# curl with timeout, returns body
http_body() {
  curl -s --max-time "$CURL_TIMEOUT" "$1" 2>/dev/null || echo ""
}

# Wait for a URL to return 200
wait_for_200() {
  local url="$1"
  local label="$2"
  local elapsed=0
  while [[ $elapsed -lt $HEALTH_TIMEOUT ]]; do
    local status
    status=$(http_status "$url")
    if [[ "$status" == "200" ]]; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
  done
  return 1
}

# ═════════════════════════════════════════════════════════════════════════════
# TESTS
# ═════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "  ${BOLD}Kortix E2E Install Test${NC}"
echo -e "  ${DIM}Testing a fresh get-kortix.sh install${NC}"

# ─── 1. Install Files ────────────────────────────────────────────────────────

section "Install Files"

if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
  pass "docker-compose.yml exists"
else
  fail "docker-compose.yml missing" "$INSTALL_DIR/docker-compose.yml not found"
fi

if [[ -f "$INSTALL_DIR/.env" ]]; then
  pass ".env exists"
else
  fail ".env missing" "$INSTALL_DIR/.env not found"
fi

if [[ -x "$INSTALL_DIR/kortix" ]]; then
  pass "CLI is executable"
else
  fail "CLI not executable" "$INSTALL_DIR/kortix not found or not executable"
fi

# ─── 2. Containers Running ──────────────────────────────────────────────────

section "Containers"

for svc in postgres kortix-api frontend sandbox; do
  # Find the container (name pattern varies: kortix-{svc}-1 or kortix-{svc})
  container=$(docker ps --format '{{.Names}}' | grep -E "kortix.*(${svc})" | head -1)
  if [[ -n "$container" ]]; then
    pass "Container running: $container"
  else
    fail "Container not running: $svc"
  fi
done

# Check container count
container_count=$(docker ps --format '{{.Names}}' | grep -c "kortix" || true)
if [[ "$container_count" -ge 4 ]]; then
  pass "All 4 containers running ($container_count found)"
else
  fail "Expected 4 containers, found $container_count"
fi

# ─── 3. Wait for Services Healthy ───────────────────────────────────────────

section "Service Health (waiting up to ${HEALTH_TIMEOUT}s)"

if wait_for_200 "$API_URL/v1/health" "API"; then
  pass "API healthy — $API_URL/v1/health → 200"
else
  fail "API not healthy after ${HEALTH_TIMEOUT}s" "$API_URL/v1/health"
fi

if wait_for_200 "$FRONTEND_URL" "Frontend"; then
  pass "Frontend healthy — $FRONTEND_URL → 200"
else
  fail "Frontend not healthy after ${HEALTH_TIMEOUT}s" "$FRONTEND_URL"
fi

if wait_for_200 "$SANDBOX_URL/kortix/health" "Sandbox"; then
  pass "Sandbox healthy — $SANDBOX_URL/kortix/health → 200"
else
  fail "Sandbox not healthy after ${HEALTH_TIMEOUT}s" "$SANDBOX_URL/kortix/health"
fi

# Postgres health via docker healthcheck
pg_container=$(docker ps --format '{{.Names}}' | grep -E "kortix.*postgres" | head -1)
if [[ -n "$pg_container" ]]; then
  pg_health=$(docker inspect --format='{{.State.Health.Status}}' "$pg_container" 2>/dev/null || echo "unknown")
  if [[ "$pg_health" == "healthy" ]]; then
    pass "Postgres healthy (Docker healthcheck)"
  else
    fail "Postgres unhealthy" "Status: $pg_health"
  fi
fi

# ─── 4. Database Schema ─────────────────────────────────────────────────────

section "Database Schema"

# Check kortix schema exists
schema_check=$(docker exec "$pg_container" psql -U postgres -tAc "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'kortix';" 2>/dev/null || echo "")
if [[ "$schema_check" == "kortix" ]]; then
  pass "kortix schema exists"
else
  fail "kortix schema missing"
fi

# Check key tables exist
for table in sandboxes triggers executions server_entries api_keys channel_configs scheduler_config; do
  table_check=$(docker exec "$pg_container" psql -U postgres -tAc "SELECT tablename FROM pg_tables WHERE schemaname = 'kortix' AND tablename = '$table';" 2>/dev/null || echo "")
  if [[ "$table_check" == "$table" ]]; then
    pass "Table exists: kortix.$table"
  else
    fail "Table missing: kortix.$table"
  fi
done

# Check credit_accounts has the local mock user
mock_user=$(docker exec "$pg_container" psql -U postgres -tAc "SELECT tier FROM public.credit_accounts WHERE account_id = '00000000-0000-0000-0000-000000000000';" 2>/dev/null || echo "")
if [[ "$mock_user" == "pro" ]]; then
  pass "Local mock user exists (tier=pro)"
else
  fail "Local mock user missing" "Expected tier=pro, got: '$mock_user'"
fi

# ─── 5. API Schema Migration ────────────────────────────────────────────────

section "API Startup"

api_container=$(docker ps --format '{{.Names}}' | grep -E "kortix.*api" | head -1)
if [[ -n "$api_container" ]]; then
  migrate_log=$(docker logs "$api_container" 2>&1 | grep -c "Schema ensured" || true)
  if [[ "$migrate_log" -ge 1 ]]; then
    pass "API ran schema migration on startup"
  else
    fail "API did not run schema migration" "Expected '[migrate] Schema ensured' in logs"
  fi
fi

# ─── 6. CORS ────────────────────────────────────────────────────────────────

section "CORS"

cors_header=$(curl -s -D - -o /dev/null --max-time "$CURL_TIMEOUT" \
  -X OPTIONS \
  -H "Origin: http://localhost:${FRONTEND_PORT}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  "$API_URL/v1/health" 2>/dev/null | grep -i "access-control-allow-origin" || echo "")

if echo "$cors_header" | grep -q "localhost:${FRONTEND_PORT}"; then
  pass "CORS allows frontend origin (localhost:${FRONTEND_PORT})"
else
  fail "CORS missing or wrong" "Expected Access-Control-Allow-Origin: http://localhost:${FRONTEND_PORT}, got: '$cors_header'"
fi

# Verify cloud origins NOT including localhost when extra origins are working
cors_cloud=$(curl -s -D - -o /dev/null --max-time "$CURL_TIMEOUT" \
  -X OPTIONS \
  -H "Origin: https://kortix.com" \
  -H "Access-Control-Request-Method: GET" \
  "$API_URL/v1/health" 2>/dev/null | grep -i "access-control-allow-origin" || echo "")

if echo "$cors_cloud" | grep -q "kortix.com"; then
  pass "CORS allows production origin (kortix.com)"
else
  fail "CORS missing production origin" "Got: '$cors_cloud'"
fi

# ─── 7. API → Sandbox Proxy ─────────────────────────────────────────────────

section "API → Sandbox Proxy"

proxy_status=$(http_status "$API_URL/v1/p/kortix-sandbox/8000/health")
if [[ "$proxy_status" == "200" ]]; then
  pass "API proxies to sandbox — /v1/p/kortix-sandbox/8000/health → 200"
else
  fail "API → Sandbox proxy failed" "Expected 200, got $proxy_status"
fi

# ─── 8. Frontend URL Rewrite ────────────────────────────────────────────────

section "Frontend URL Rewrite"

fe_container=$(docker ps --format '{{.Names}}' | grep -E "kortix.*frontend" | head -1)
if [[ -n "$fe_container" ]]; then
  rewrite_log=$(docker logs "$fe_container" 2>&1 | grep -c "Port remap\|URL rewrite" || true)
  if [[ "$rewrite_log" -ge 1 ]]; then
    pass "Frontend entrypoint rewrote URLs"
  else
    # Not necessarily a failure — if baked-in URL matches, no rewrite needed
    baked_url=$(docker logs "$fe_container" 2>&1 | grep -c "no rewrite needed\|Next.js" || true)
    if [[ "$baked_url" -ge 1 ]]; then
      pass "Frontend running (no URL rewrite needed — baked-in matches)"
    else
      fail "Frontend entrypoint did not run URL rewrite" "Expected 'Port remap' or 'URL rewrite' in logs"
    fi
  fi
fi

# ─── 9. Functional API Endpoints ────────────────────────────────────────────

section "API Endpoints"

# GET /v1/health
health_body=$(http_body "$API_URL/v1/health")
if echo "$health_body" | grep -q '"status":"ok"'; then
  pass "GET /v1/health → status: ok"
else
  fail "GET /v1/health unexpected response" "$health_body"
fi

# GET /v1/providers
providers_status=$(http_status "$API_URL/v1/providers")
if [[ "$providers_status" == "200" ]]; then
  pass "GET /v1/providers → 200"
else
  fail "GET /v1/providers → $providers_status"
fi

# GET /v1/setup/env
setup_status=$(http_status "$API_URL/v1/setup/env")
if [[ "$setup_status" == "200" ]]; then
  pass "GET /v1/setup/env → 200"
else
  fail "GET /v1/setup/env → $setup_status"
fi

# GET /v1/servers
servers_status=$(http_status "$API_URL/v1/servers")
if [[ "$servers_status" == "200" ]]; then
  pass "GET /v1/servers → 200"
else
  fail "GET /v1/servers → $servers_status"
fi

# PUT /v1/servers/sync (with proper body)
sync_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" \
  -X PUT \
  -H "Content-Type: application/json" \
  -d '{"servers":[{"id":"test-e2e","label":"E2E Test","url":"http://localhost:13738/v1/p/test/8000","isDefault":false}]}' \
  "$API_URL/v1/servers/sync" 2>/dev/null || echo "000")
if [[ "$sync_status" == "200" ]]; then
  pass "PUT /v1/servers/sync → 200 (DB write works)"
  # Cleanup: delete the test entry
  curl -s -o /dev/null -X DELETE "$API_URL/v1/servers/test-e2e" --max-time "$CURL_TIMEOUT" 2>/dev/null || true
else
  fail "PUT /v1/servers/sync → $sync_status" "Database write failed"
fi

# GET /v1/system/status
system_status=$(http_status "$API_URL/v1/system/status")
if [[ "$system_status" == "200" ]]; then
  pass "GET /v1/system/status → 200"
else
  fail "GET /v1/system/status → $system_status"
fi

# GET /v1/accounts
accounts_status=$(http_status "$API_URL/v1/accounts")
if [[ "$accounts_status" == "200" ]]; then
  pass "GET /v1/accounts → 200"
else
  fail "GET /v1/accounts → $accounts_status"
fi

# ─── 10. Sandbox Env (Onboarding) ───────────────────────────────────────────

section "Onboarding Status"

# Should always return 200 — null value when not yet onboarded, "true" when done
onboarding_status=$(http_status "$API_URL/v1/p/kortix-sandbox/8000/env/ONBOARDING_COMPLETE")
if [[ "$onboarding_status" == "200" ]]; then
  onboarding_body=$(http_body "$API_URL/v1/p/kortix-sandbox/8000/env/ONBOARDING_COMPLETE")
  pass "Onboarding check → 200 ($onboarding_body)"
else
  fail "Onboarding check failed" "Expected 200, got $onboarding_status"
fi

# ─── 11. Port Mappings ──────────────────────────────────────────────────────

section "Port Mappings"

for port_label in "${FRONTEND_PORT}:frontend" "${API_PORT}:api" "${POSTGRES_PORT}:postgres" "${SANDBOX_PORT}:sandbox"; do
  port="${port_label%%:*}"
  label="${port_label##*:}"
  if docker ps --format '{{.Ports}}' | grep -q "0.0.0.0:${port}->"; then
    pass "Port $port mapped ($label)"
  else
    fail "Port $port not mapped ($label)"
  fi
done

# ═════════════════════════════════════════════════════════════════════════════
# RESULTS
# ═════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "  ${BOLD}─────────────────────────────────${NC}"
if [[ $FAILED -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}ALL $TOTAL TESTS PASSED${NC}"
else
  echo -e "  ${RED}${BOLD}$FAILED/$TOTAL TESTS FAILED${NC}  ${DIM}($PASSED passed)${NC}"
fi
echo -e "  ${BOLD}─────────────────────────────────${NC}"
echo ""

exit "$FAILED"
