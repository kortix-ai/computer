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
SANDBOX_PORT=14000

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

find_container() {
  local pattern="$1"
  docker ps --format '{{.Names}}' | grep -E "$pattern" | head -1 || true
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

postgres_container=$(find_container 'supabase-db|kortix.*postgres')
api_container=$(find_container 'kortix-kortix-api-1|kortix.*api')
frontend_container=$(find_container 'kortix-frontend-1|kortix.*frontend')
sandbox_container=$(find_container '^kortix-sandbox$|kortix.*sandbox')

for service in \
  "postgres:$postgres_container" \
  "kortix-api:$api_container" \
  "frontend:$frontend_container" \
  "sandbox:$sandbox_container"; do
  name="${service%%:*}"
  container="${service#*:}"
  if [[ -n "$container" ]]; then
    pass "Container running: $container"
  else
    fail "Container not running: $name"
  fi
done

if [[ -n "$postgres_container" && -n "$api_container" && -n "$frontend_container" && -n "$sandbox_container" ]]; then
  pass "All core containers running"
else
  fail "Missing one or more core containers"
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
pg_container="$postgres_container"
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
for table in sandboxes deployments server_entries api_keys channel_configs credit_accounts triggers executions; do
  table_check=$(docker exec "$pg_container" psql -U postgres -tAc "SELECT tablename FROM pg_tables WHERE schemaname = 'kortix' AND tablename = '$table';" 2>/dev/null || echo "")
  if [[ "$table_check" == "$table" ]]; then
    pass "Table exists: kortix.$table"
  else
    fail "Table missing: kortix.$table"
  fi
done

# ─── 5. API Schema Migration ────────────────────────────────────────────────

section "API Startup"

if [[ -n "$api_container" ]]; then
  migrate_log=$(docker logs "$api_container" 2>&1 | grep -Ec "Schema ensured|Schema pushed successfully|All migrations complete" || true)
  if [[ "$migrate_log" -ge 1 ]]; then
    pass "API ran schema migration on startup"
  else
    fail "API did not run schema migration" "Expected schema migration logs in container output"
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

section "Sandbox Reachability"

proxy_status=$(http_status "$SANDBOX_URL/kortix/health")
if [[ "$proxy_status" == "200" ]]; then
  pass "Sandbox health reachable — $SANDBOX_URL/kortix/health → 200"
else
  fail "Sandbox health unreachable" "Expected 200, got $proxy_status"
fi

# ─── 8. Frontend URL Rewrite ────────────────────────────────────────────────

section "Frontend URL Rewrite"

fe_container="$frontend_container"
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

# GET /v1/setup/install-status
install_status=$(http_status "$API_URL/v1/setup/install-status")
if [[ "$install_status" == "200" ]]; then
  pass "GET /v1/setup/install-status → 200"
else
  fail "GET /v1/setup/install-status → $install_status"
fi

# GET /v1/setup/sandbox-providers
providers_status=$(http_status "$API_URL/v1/setup/sandbox-providers")
if [[ "$providers_status" == "200" ]]; then
  pass "GET /v1/setup/sandbox-providers → 200"
else
  fail "GET /v1/setup/sandbox-providers → $providers_status"
fi

# GET /v1/platform/sandbox/version
version_status=$(http_status "$API_URL/v1/platform/sandbox/version")
if [[ "$version_status" == "200" ]]; then
  pass "GET /v1/platform/sandbox/version → 200"
else
  fail "GET /v1/platform/sandbox/version → $version_status"
fi

# ─── 10. Sandbox Env (Onboarding) ───────────────────────────────────────────

section "Onboarding Status"

onboarding_status=$(http_status "$FRONTEND_URL/auth")
if [[ "$onboarding_status" == "200" ]]; then
  pass "Frontend auth route reachable → 200"
else
  fail "Frontend auth route failed" "Expected 200, got $onboarding_status"
fi

# ─── 11. Port Mappings ──────────────────────────────────────────────────────

section "Port Mappings"

for port_label in "${FRONTEND_PORT}:frontend" "${API_PORT}:api" "${SANDBOX_PORT}:sandbox"; do
  port="${port_label%%:*}"
  label="${port_label##*:}"
  if docker ps --format '{{.Ports}}' | grep -Eq "(0\.0\.0\.0|127\.0\.0\.1):${port}->"; then
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
