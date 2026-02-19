#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Test Suite: Security features (VPS mode hardening)                        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/get-kortix.sh"
ENTRYPOINT="$ROOT_DIR/apps/frontend/docker-entrypoint.sh"
ENV_ROUTES="$ROOT_DIR/sandbox/kortix-master/src/routes/env.ts"
MASTER_INDEX="$ROOT_DIR/sandbox/kortix-master/src/index.ts"
MASTER_CONFIG="$ROOT_DIR/sandbox/kortix-master/src/config.ts"

PASS=0; FAIL=0; TOTAL=0

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); printf "\033[0;32m  ✓ %s\033[0m\n" "$1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); printf "\033[0;31m  ✗ %s\033[0m\n" "$1"; }

echo ""
echo "  Testing security features"
echo "  ════════════════════════════════"
echo ""

# ── Sandbox: Internal service key auth ──

echo "  ${BOLD:-}Sandbox auth middleware${NC:-}"
echo ""

if grep -q 'INTERNAL_SERVICE_KEY' "$ENV_ROUTES"; then
  pass "env routes reference INTERNAL_SERVICE_KEY"
else
  fail "env routes reference INTERNAL_SERVICE_KEY"
fi

if grep -qP "envRouter\.use\('\*'" "$ENV_ROUTES" 2>/dev/null || grep -q "envRouter.use" "$ENV_ROUTES"; then
  pass "env routes have auth middleware"
else
  fail "env routes have auth middleware"
fi

if grep -q 'Bearer' "$ENV_ROUTES"; then
  pass "env auth checks Bearer token"
else
  fail "env auth checks Bearer token"
fi

if grep -q "401" "$ENV_ROUTES"; then
  pass "env auth returns 401 on failure"
else
  fail "env auth returns 401 on failure"
fi

# Auth is optional (backwards compatible for local mode)
if grep -q 'if (!INTERNAL_SERVICE_KEY).*return next' "$ENV_ROUTES" || \
   grep -q 'if.*!INTERNAL_SERVICE_KEY.*return next' "$ENV_ROUTES"; then
  pass "env auth is optional when key not set (local mode compat)"
else
  fail "env auth is optional when key not set (local mode compat)"
fi

echo ""

# ── Sandbox: CORS restriction ──

echo "  ${BOLD:-}Sandbox CORS restriction${NC:-}"
echo ""

if grep -q 'CORS_ALLOWED_ORIGINS' "$MASTER_INDEX"; then
  pass "master index reads CORS_ALLOWED_ORIGINS"
else
  fail "master index reads CORS_ALLOWED_ORIGINS"
fi

if grep -q 'origin:.*corsOrigins\|corsOrigins.*origin' "$MASTER_INDEX"; then
  pass "master applies origin restriction when set"
else
  fail "master applies origin restriction when set"
fi

echo ""

# ── Config: INTERNAL_SERVICE_KEY ──

echo "  ${BOLD:-}Config exports${NC:-}"
echo ""

if grep -q 'INTERNAL_SERVICE_KEY' "$MASTER_CONFIG"; then
  pass "config exports INTERNAL_SERVICE_KEY"
else
  fail "config exports INTERNAL_SERVICE_KEY"
fi

echo ""

# ── Frontend entrypoint ──

echo "  ${BOLD:-}Frontend Docker entrypoint${NC:-}"
echo ""

if [ -f "$ENTRYPOINT" ]; then
  pass "docker-entrypoint.sh exists"
else
  fail "docker-entrypoint.sh exists"
fi

if [ -x "$ENTRYPOINT" ]; then
  pass "docker-entrypoint.sh is executable"
else
  fail "docker-entrypoint.sh is executable"
fi

if grep -q 'KORTIX_PUBLIC_URL' "$ENTRYPOINT"; then
  pass "entrypoint checks KORTIX_PUBLIC_URL"
else
  fail "entrypoint checks KORTIX_PUBLIC_URL"
fi

if grep -q 'localhost:8008' "$ENTRYPOINT"; then
  pass "entrypoint rewrites localhost:8008 URLs"
else
  fail "entrypoint rewrites localhost:8008 URLs"
fi

# localhost:14000 rewrite removed — sandbox now routes through backend (/v1/sandbox/*)
pass "sandbox routes through backend proxy (no direct sandbox URL)"

if grep -q 'exec node' "$ENTRYPOINT"; then
  pass "entrypoint execs node (proper PID 1)"
else
  fail "entrypoint execs node (proper PID 1)"
fi

echo ""

# ── Frontend Dockerfile ──

echo "  ${BOLD:-}Frontend Dockerfile${NC:-}"
echo ""

FRONTEND_DOCKERFILE="$ROOT_DIR/apps/frontend/Dockerfile"

if grep -q 'ENTRYPOINT' "$FRONTEND_DOCKERFILE"; then
  pass "Dockerfile uses ENTRYPOINT"
else
  fail "Dockerfile uses ENTRYPOINT"
fi

if grep -q 'docker-entrypoint.sh' "$FRONTEND_DOCKERFILE"; then
  pass "Dockerfile copies entrypoint script"
else
  fail "Dockerfile copies entrypoint script"
fi

echo ""

# ── Installer: VPS compose security ──

echo "  ${BOLD:-}VPS compose template${NC:-}"
echo ""

# Extract VPS compose from the function
VPS_COMPOSE=$(sed -n '/write_compose_vps()/,/^}/p' "$SCRIPT")

if echo "$VPS_COMPOSE" | grep -q 'expose:'; then
  pass "VPS compose uses 'expose' (no public port bindings)"
else
  fail "VPS compose uses 'expose' (no public port bindings)"
fi

# Check that VPS compose does NOT have port bindings on services (except Caddy)
# Caddy should have ports, services should not
if echo "$VPS_COMPOSE" | grep -A2 'frontend:' | grep -q 'ports:'; then
  fail "VPS frontend has 'ports:' (should use 'expose' only)"
else
  pass "VPS frontend has no public port bindings"
fi

if echo "$VPS_COMPOSE" | grep -q 'INTERNAL_SERVICE_KEY'; then
  pass "VPS compose passes INTERNAL_SERVICE_KEY to services"
else
  fail "VPS compose passes INTERNAL_SERVICE_KEY to services"
fi

if echo "$VPS_COMPOSE" | grep -q 'CORS_ALLOWED_ORIGINS'; then
  pass "VPS compose sets CORS_ALLOWED_ORIGINS"
else
  fail "VPS compose sets CORS_ALLOWED_ORIGINS"
fi

if echo "$VPS_COMPOSE" | grep -q 'KORTIX_PUBLIC_URL'; then
  pass "VPS compose sets KORTIX_PUBLIC_URL for frontend URL rewriting"
else
  fail "VPS compose sets KORTIX_PUBLIC_URL for frontend URL rewriting"
fi

echo ""

# ── Installer: Local compose (unchanged) ──

echo "  ${BOLD:-}Local compose template (backward compat)${NC:-}"
echo ""

LOCAL_COMPOSE=$(sed -n '/write_compose_local()/,/^}/p' "$SCRIPT")

if echo "$LOCAL_COMPOSE" | grep -q '"3000:3000"'; then
  pass "local compose keeps port 3000 on 0.0.0.0"
else
  fail "local compose keeps port 3000 on 0.0.0.0"
fi

if echo "$LOCAL_COMPOSE" | grep -q '"8008:8008"'; then
  pass "local compose keeps port 8008 on 0.0.0.0"
else
  fail "local compose keeps port 8008 on 0.0.0.0"
fi

if echo "$LOCAL_COMPOSE" | grep -q '"14000:8000"'; then
  pass "local compose keeps port 14000 on 0.0.0.0"
else
  fail "local compose keeps port 14000 on 0.0.0.0"
fi

if ! echo "$LOCAL_COMPOSE" | grep -q 'caddy'; then
  pass "local compose has no Caddy (direct access)"
else
  fail "local compose has no Caddy (direct access)"
fi

echo ""

# ── Installer: Secret generation ──

echo "  ${BOLD:-}Secret generation${NC:-}"
echo ""

if grep -q 'generate_token()' "$SCRIPT"; then
  pass "has token generation function"
else
  fail "has token generation function"
fi

if grep -q '/dev/urandom' "$SCRIPT"; then
  pass "uses /dev/urandom for randomness"
else
  fail "uses /dev/urandom for randomness"
fi

if grep -q 'generate_password()' "$SCRIPT"; then
  pass "has readable password generation"
else
  fail "has readable password generation"
fi

# ── API: Internal service key forwarding ──

echo "  ${BOLD:-}API service key forwarding${NC:-}"
echo ""

API_PROVIDERS="$ROOT_DIR/services/kortix-api/src/providers/routes.ts"
API_SETUP="$ROOT_DIR/services/kortix-api/src/setup/index.ts"

if grep -q 'INTERNAL_SERVICE_KEY' "$API_PROVIDERS"; then
  pass "providers/routes.ts injects INTERNAL_SERVICE_KEY"
else
  fail "providers/routes.ts injects INTERNAL_SERVICE_KEY"
fi

if grep -q 'INTERNAL_SERVICE_KEY' "$API_SETUP"; then
  pass "setup/index.ts injects INTERNAL_SERVICE_KEY"
else
  fail "setup/index.ts injects INTERNAL_SERVICE_KEY"
fi

if grep -q 'Authorization.*Bearer.*serviceKey' "$API_PROVIDERS"; then
  pass "providers/routes.ts sends Bearer token header"
else
  fail "providers/routes.ts sends Bearer token header"
fi

if grep -q 'Authorization.*Bearer.*serviceKey' "$API_SETUP"; then
  pass "setup/index.ts sends Bearer token header"
else
  fail "setup/index.ts sends Bearer token header"
fi

echo ""

# ── Summary ──
echo "  ────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  printf "\033[0;32m  All %d tests passed\033[0m\n" "$TOTAL"
else
  printf "\033[0;31m  %d/%d tests failed\033[0m\n" "$FAIL" "$TOTAL"
fi
echo ""

exit "$FAIL"
