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

# --- script exists ---
if [ -f "$SCRIPT" ]; then
  pass "get-kortix.sh exists"
else
  fail "get-kortix.sh exists"
fi

# --- has banner function ---
if grep -q 'banner()' "$SCRIPT"; then
  pass "has banner function"
else
  fail "has banner function"
fi

# --- has preflight function ---
if grep -q 'preflight()' "$SCRIPT"; then
  pass "has preflight function"
else
  fail "has preflight function"
fi

# --- checks for Docker ---
if grep -q 'command -v docker' "$SCRIPT"; then
  pass "checks for Docker"
else
  fail "checks for Docker"
fi

# --- checks Docker Compose ---
if grep -q 'docker compose version' "$SCRIPT"; then
  pass "checks Docker Compose v2"
else
  fail "checks Docker Compose v2"
fi

# --- does NOT require Git ---
if ! grep -q 'command -v git' "$SCRIPT"; then
  pass "does not require Git"
else
  fail "does not require Git"
fi

# --- no CLI prompts (keys managed via dashboard) ---
if ! grep -q 'prompt_key\|prompt_secret\|run_setup' "$SCRIPT"; then
  pass "no CLI key prompts (dashboard manages keys)"
else
  fail "no CLI key prompts (dashboard manages keys)"
fi

# --- writes docker-compose.yml ---
if grep -q 'write_compose()' "$SCRIPT" && grep -q 'docker-compose.yml' "$SCRIPT"; then
  pass "writes docker-compose.yml"
else
  fail "writes docker-compose.yml"
fi

# --- writes .env ---
if grep -q 'write_env()' "$SCRIPT"; then
  pass "writes .env file"
else
  fail "writes .env file"
fi

# --- writes CLI helper ---
if grep -q 'write_cli()' "$SCRIPT"; then
  pass "writes CLI helper"
else
  fail "writes CLI helper"
fi

# --- CLI has start/stop/restart/logs/status/update ---
for cmd in start stop restart logs status update; do
  if grep -q "$cmd)" "$SCRIPT"; then
    pass "CLI has '$cmd' command"
  else
    fail "CLI has '$cmd' command"
  fi
done

# --- no declare -A (bash 3.x compat) ---
if ! grep -q 'declare -A' "$SCRIPT"; then
  pass "no declare -A (bash 3.x compatible)"
else
  fail "no declare -A (bash 3.x compatible)"
fi

# --- no git references ---
if ! grep -q 'git clone\|git pull' "$SCRIPT"; then
  pass "no git clone/pull (Docker-only)"
else
  fail "no git clone/pull (Docker-only)"
fi

# --- uses pre-built images ---
if grep -q 'kortixmarko/kortix-frontend' "$SCRIPT" && grep -q 'kortixmarko/kortix-api' "$SCRIPT"; then
  pass "uses pre-built Docker images"
else
  fail "uses pre-built Docker images"
fi

# --- old scripts deleted ---
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
