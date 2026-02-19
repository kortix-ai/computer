#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Test Suite: get-kortix.sh (unified installer)                             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/get-kortix.sh"

PASS=0; FAIL=0; TOTAL=0

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); printf "\033[0;32m  ✓ %s\033[0m\n" "$1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); printf "\033[0;31m  ✗ %s\033[0m\n" "$1"; }

echo ""
echo "  Testing get-kortix.sh structure"
echo "  ════════════════════════════════"
echo ""

# ── Core structure ──

if [ -f "$SCRIPT" ]; then
  pass "get-kortix.sh exists"
else
  fail "get-kortix.sh exists"
fi

if grep -q 'banner()' "$SCRIPT"; then
  pass "has banner function"
else
  fail "has banner function"
fi

if grep -q 'preflight()' "$SCRIPT"; then
  pass "has preflight function"
else
  fail "has preflight function"
fi

if grep -q 'command -v docker' "$SCRIPT"; then
  pass "checks for Docker"
else
  fail "checks for Docker"
fi

if grep -q 'docker compose version' "$SCRIPT"; then
  pass "checks Docker Compose v2"
else
  fail "checks Docker Compose v2"
fi

if ! grep -q 'command -v git' "$SCRIPT"; then
  pass "does not require Git"
else
  fail "does not require Git"
fi

# ── Mode selection ──

if grep -q 'prompt_mode()' "$SCRIPT"; then
  pass "has mode selection (local/VPS)"
else
  fail "has mode selection (local/VPS)"
fi

if grep -q 'DEPLOY_MODE.*local\|DEPLOY_MODE.*vps' "$SCRIPT"; then
  pass "supports local and VPS deploy modes"
else
  fail "supports local and VPS deploy modes"
fi

# ── Compose generation ──

if grep -q 'write_compose_local()' "$SCRIPT" && grep -q 'write_compose_vps()' "$SCRIPT"; then
  pass "has separate compose templates (local + VPS)"
else
  fail "has separate compose templates (local + VPS)"
fi

if grep -q 'docker-compose.yml' "$SCRIPT"; then
  pass "writes docker-compose.yml"
else
  fail "writes docker-compose.yml"
fi

# ── PostgreSQL ──

if grep -q 'POSTGRES_IMAGE\|kortix/postgres' "$SCRIPT"; then
  pass "references postgres image"
else
  fail "references postgres image"
fi

if grep -q 'pg_cron\|pg_net' "$SCRIPT"; then
  pass "compose includes pg_cron and pg_net"
else
  fail "compose includes pg_cron and pg_net"
fi

if grep -q 'DATABASE_URL.*postgres' "$SCRIPT"; then
  pass "compose sets DATABASE_URL for kortix-api"
else
  fail "compose sets DATABASE_URL for kortix-api"
fi

if grep -q 'CRON_TICK_SECRET' "$SCRIPT"; then
  pass "generates CRON_TICK_SECRET"
else
  fail "generates CRON_TICK_SECRET"
fi

if grep -q 'postgres-data' "$SCRIPT"; then
  pass "compose has postgres-data volume"
else
  fail "compose has postgres-data volume"
fi

# ── VPS features ──

if grep -q 'write_caddyfile()' "$SCRIPT"; then
  pass "has Caddyfile generation (VPS)"
else
  fail "has Caddyfile generation (VPS)"
fi

if grep -q 'caddy.*alpine\|caddy:2' "$SCRIPT"; then
  pass "uses Caddy for reverse proxy (VPS)"
else
  fail "uses Caddy for reverse proxy (VPS)"
fi

if grep -q 'basic_auth' "$SCRIPT"; then
  pass "supports basic auth (VPS)"
else
  fail "supports basic auth (VPS)"
fi

if grep -q 'prompt_domain()' "$SCRIPT"; then
  pass "has domain setup prompt (VPS)"
else
  fail "has domain setup prompt (VPS)"
fi

if grep -q 'tls internal' "$SCRIPT"; then
  pass "supports IP-only mode with self-signed TLS"
else
  fail "supports IP-only mode with self-signed TLS"
fi

# ── Security features ──

if grep -q 'generate_secrets()' "$SCRIPT"; then
  pass "has secret generation function"
else
  fail "has secret generation function"
fi

if grep -q 'KORTIX_TOKEN' "$SCRIPT"; then
  pass "generates KORTIX_TOKEN for secret encryption"
else
  fail "generates KORTIX_TOKEN for secret encryption"
fi

if grep -q 'INTERNAL_SERVICE_KEY' "$SCRIPT"; then
  pass "generates INTERNAL_SERVICE_KEY for service auth"
else
  fail "generates INTERNAL_SERVICE_KEY for service auth"
fi

if grep -q 'generate_password()' "$SCRIPT"; then
  pass "has password generation function"
else
  fail "has password generation function"
fi

if grep -q 'chmod 600.*\.env\|chmod 600.*credentials' "$SCRIPT"; then
  pass "sets secure permissions on secrets (600)"
else
  fail "sets secure permissions on secrets (600)"
fi

if grep -q 'setup_firewall()' "$SCRIPT"; then
  pass "has firewall setup function"
else
  fail "has firewall setup function"
fi

if grep -q 'ufw.*allow.*22\|ufw.*allow.*80\|ufw.*allow.*443' "$SCRIPT"; then
  pass "firewall allows SSH, HTTP, HTTPS only"
else
  fail "firewall allows SSH, HTTP, HTTPS only"
fi

# ── VPS compose security ──

if grep -q 'expose:' "$SCRIPT"; then
  pass "VPS compose uses 'expose' (internal-only ports)"
else
  fail "VPS compose uses 'expose' (internal-only ports)"
fi

if grep -q 'CORS_ALLOWED_ORIGINS' "$SCRIPT"; then
  pass "VPS compose restricts CORS origins"
else
  fail "VPS compose restricts CORS origins"
fi

if grep -q 'KORTIX_PUBLIC_URL' "$SCRIPT"; then
  pass "VPS compose sets KORTIX_PUBLIC_URL for frontend"
else
  fail "VPS compose sets KORTIX_PUBLIC_URL for frontend"
fi

# ── CLI features ──

if grep -q 'write_cli()' "$SCRIPT"; then
  pass "writes CLI helper"
else
  fail "writes CLI helper"
fi

for cmd in start stop restart logs status update setup; do
  if grep -q "${cmd})" "$SCRIPT"; then
    pass "CLI has '${cmd}' command"
  else
    fail "CLI has '${cmd}' command"
  fi
done

if grep -q 'reconfigure)' "$SCRIPT"; then
  pass "CLI has 'reconfigure' command"
else
  fail "CLI has 'reconfigure' command"
fi

if grep -q 'credentials)' "$SCRIPT"; then
  pass "CLI has 'credentials' command"
else
  fail "CLI has 'credentials' command"
fi

# ── Compatibility ──

if ! grep -q 'declare -A' "$SCRIPT"; then
  pass "no declare -A (bash 3.x compatible)"
else
  fail "no declare -A (bash 3.x compatible)"
fi

if ! grep -q 'git clone\|git pull' "$SCRIPT"; then
  pass "no git clone/pull (Docker-only)"
else
  fail "no git clone/pull (Docker-only)"
fi

if grep -q 'kortix/kortix-frontend' "$SCRIPT" && grep -q 'kortix/kortix-api' "$SCRIPT"; then
  pass "uses pre-built Docker images"
else
  fail "uses pre-built Docker images"
fi

# ── Old scripts deleted ──

if [ ! -f "$ROOT_DIR/scripts/install.sh" ]; then
  pass "install.sh deleted (unified into get-kortix.sh)"
else
  fail "install.sh deleted (unified into get-kortix.sh)"
fi

if [ ! -f "$ROOT_DIR/scripts/kortix.sh" ]; then
  pass "kortix.sh deleted (unified into get-kortix.sh)"
else
  fail "kortix.sh deleted (unified into get-kortix.sh)"
fi

# ── Summary ──
echo ""
echo "  ────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  printf "\033[0;32m  All %d tests passed\033[0m\n" "$TOTAL"
else
  printf "\033[0;31m  %d/%d tests failed\033[0m\n" "$FAIL" "$TOTAL"
fi
echo ""

exit "$FAIL"
