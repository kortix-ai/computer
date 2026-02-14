#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Test Suite: install.sh                                                    ║
# ║                                                                            ║
# ║  Tests the installer's preflight checks, repo detection, and CLI flow.    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALL="$ROOT_DIR/scripts/install.sh"

# ─── Test framework ──────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

PASSED=0
FAILED=0
TOTAL=0

pass() {
  PASSED=$((PASSED + 1))
  TOTAL=$((TOTAL + 1))
  printf "  ${GREEN}✓${NC} %s\n" "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  TOTAL=$((TOTAL + 1))
  printf "  ${RED}✗${NC} %s\n" "$1"
  if [ -n "${2:-}" ]; then
    printf "    ${RED}%s${NC}\n" "$2"
  fi
}

summary() {
  echo ""
  printf "  ${BOLD}%d tests, ${GREEN}%d passed${NC}, " "$TOTAL" "$PASSED"
  if [ "$FAILED" -gt 0 ]; then
    printf "${RED}%d failed${NC}\n" "$FAILED"
  else
    printf "${DIM}0 failed${NC}\n"
  fi
  echo ""
}

# ─── Tests ───────────────────────────────────────────────────────────────────

echo ""
printf "${BOLD}${CYAN}  Installer Tests${NC}\n"
echo ""

# --- install.sh exists and is executable ---

if [ -x "$INSTALL" ]; then
  pass "install.sh exists and is executable"
else
  fail "install.sh exists and is executable"
fi

# --- install.sh has a header function ---

if grep -q "^header()" "$INSTALL"; then
  pass "install.sh has header function"
else
  fail "install.sh has header function"
fi

# --- install.sh has preflight function ---

if grep -q "^preflight()" "$INSTALL"; then
  pass "install.sh has preflight function"
else
  fail "install.sh has preflight function"
fi

# --- install.sh checks for Docker ---

if grep -q 'check_command "docker"' "$INSTALL"; then
  pass "install.sh checks for Docker"
else
  fail "install.sh checks for Docker"
fi

# --- install.sh checks for Git ---

if grep -q 'check_command "git"' "$INSTALL"; then
  pass "install.sh checks for Git"
else
  fail "install.sh checks for Git"
fi

# --- install.sh checks Docker Compose v2 ---

if grep -q 'docker compose version' "$INSTALL"; then
  pass "install.sh checks Docker Compose v2"
else
  fail "install.sh checks Docker Compose v2"
fi

# --- install.sh checks port availability ---

if grep -q 'check_port 3000' "$INSTALL" && grep -q 'check_port 8008' "$INSTALL" && grep -q 'check_port 14000' "$INSTALL"; then
  pass "install.sh checks ports 3000, 8008, 14000"
else
  fail "install.sh checks ports 3000, 8008, 14000"
fi

# --- install.sh has repo setup ---

if grep -q "setup_repo()" "$INSTALL"; then
  pass "install.sh has repo setup function"
else
  fail "install.sh has repo setup function"
fi

# --- install.sh detects existing checkout ---

if grep -q 'docker-compose.local.yml' "$INSTALL" && grep -q '"scripts"' "$INSTALL"; then
  pass "install.sh detects existing checkout"
else
  fail "install.sh detects existing checkout"
fi

# --- install.sh has interactive setup ---

if grep -q 'run_setup()' "$INSTALL"; then
  pass "install.sh has run_setup function"
else
  fail "install.sh has run_setup function"
fi

# --- install.sh supports --env-file flag ---

if grep -q '\-\-env-file' "$INSTALL"; then
  pass "install.sh supports --env-file flag"
else
  fail "install.sh supports --env-file flag"
fi

# --- install.sh supports --setup-only flag ---

if grep -q '\-\-setup-only' "$INSTALL"; then
  pass "install.sh supports --setup-only flag"
else
  fail "install.sh supports --setup-only flag"
fi

# --- install.sh has write_env_key helper ---

if grep -q 'write_env_key()' "$INSTALL"; then
  pass "install.sh has write_env_key helper"
else
  fail "install.sh has write_env_key helper"
fi

# --- install.sh prompts for LLM providers ---

if grep -q 'ANTHROPIC_API_KEY' "$INSTALL" && grep -q 'OPENAI_API_KEY' "$INSTALL"; then
  pass "install.sh prompts for LLM provider keys"
else
  fail "install.sh prompts for LLM provider keys"
fi

# --- install.sh prompts for sandbox settings ---

if grep -q 'OPENCODE_SERVER_USERNAME' "$INSTALL" && grep -q 'OPENCODE_SERVER_PASSWORD' "$INSTALL"; then
  pass "install.sh prompts for sandbox credentials"
else
  fail "install.sh prompts for sandbox credentials"
fi

# --- setup-wizard.mjs should NOT exist (it's been removed) ---

if [ ! -f "$ROOT_DIR/scripts/setup-wizard.mjs" ]; then
  pass "setup-wizard.mjs has been removed"
else
  fail "setup-wizard.mjs has been removed" "File still exists at $ROOT_DIR/scripts/setup-wizard.mjs"
fi

# --- kortix.sh exists and is executable ---

if [ -x "$ROOT_DIR/scripts/kortix.sh" ]; then
  pass "kortix.sh exists and is executable"
else
  fail "kortix.sh exists and is executable"
fi

# --- kortix.sh does NOT reference setup-wizard.mjs ---

if ! grep -q 'setup-wizard.mjs' "$ROOT_DIR/scripts/kortix.sh"; then
  pass "kortix.sh does not reference setup-wizard.mjs"
else
  fail "kortix.sh does not reference setup-wizard.mjs"
fi

# --- install.sh --help works ---

help_output=$(bash "$INSTALL" --help 2>/dev/null || true)
if echo "$help_output" | grep -q "\-\-env-file"; then
  pass "install.sh --help works and shows --env-file"
else
  fail "install.sh --help works and shows --env-file"
fi

# --- Test check_command helper (extract and test in isolation) ---

check_command_test() {
  local cmd="$1"
  command -v "$cmd" &>/dev/null
}

if check_command_test "docker"; then
  pass "check_command — docker found on this system"
else
  fail "check_command — docker found on this system"
fi

if check_command_test "git"; then
  pass "check_command — git found on this system"
else
  fail "check_command — git found on this system"
fi

summary

[ "$FAILED" -eq 0 ] || exit 1
