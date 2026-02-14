#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Test Suite: Kortix CLI (kortix.sh)                                        ║
# ║                                                                            ║
# ║  Tests all CLI subcommands work correctly.                                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="$ROOT_DIR/scripts/kortix.sh"
TEST_DIR="/tmp/kortix-test-cli-$$"

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

# ─── Setup ───────────────────────────────────────────────────────────────────

setup() {
  mkdir -p "$TEST_DIR/scripts"
  mkdir -p "$TEST_DIR/sandbox"
  cp "$CLI" "$TEST_DIR/scripts/kortix.sh"
  # Create minimal files so find_root works
  touch "$TEST_DIR/docker-compose.local.yml"
  # Create .env with some test keys
  cat > "$TEST_DIR/.env" << 'EOF'
ENV_MODE=local
ANTHROPIC_API_KEY=sk-ant-test-123
OPENAI_API_KEY=sk-proj-test-456
GEMINI_API_KEY=
GROQ_API_KEY=
XAI_API_KEY=
OPENROUTER_API_KEY=
EOF
}

cleanup() {
  rm -rf "$TEST_DIR"
}

# ─── Tests ───────────────────────────────────────────────────────────────────

echo ""
printf "${BOLD}${CYAN}  Kortix CLI Tests${NC}\n"
echo ""

setup

# --- help ---

test_help() {
  local output
  output=$(bash "$TEST_DIR/scripts/kortix.sh" help 2>&1)
  if echo "$output" | grep -q "Usage:"; then
    pass "help — shows usage"
  else
    fail "help — shows usage" "Missing 'Usage:' in output"
  fi

  if echo "$output" | grep -q "install"; then
    pass "help — lists install command"
  else
    fail "help — lists install command"
  fi

  if echo "$output" | grep -q "setup"; then
    pass "help — lists setup command"
  else
    fail "help — lists setup command"
  fi

  if echo "$output" | grep -q "start"; then
    pass "help — lists start command"
  else
    fail "help — lists start command"
  fi

  if echo "$output" | grep -q "stop"; then
    pass "help — lists stop command"
  else
    fail "help — lists stop command"
  fi

  if echo "$output" | grep -q "logs"; then
    pass "help — lists logs command"
  else
    fail "help — lists logs command"
  fi

  if echo "$output" | grep -q "status"; then
    pass "help — lists status command"
  else
    fail "help — lists status command"
  fi

  if echo "$output" | grep -q "update"; then
    pass "help — lists update command"
  else
    fail "help — lists update command"
  fi
}

# --- -h and --help aliases ---

test_help_aliases() {
  local out1 out2
  out1=$(bash "$TEST_DIR/scripts/kortix.sh" -h 2>&1)
  out2=$(bash "$TEST_DIR/scripts/kortix.sh" --help 2>&1)

  if echo "$out1" | grep -q "Usage:"; then
    pass "-h — shows help"
  else
    fail "-h — shows help"
  fi

  if echo "$out2" | grep -q "Usage:"; then
    pass "--help — shows help"
  else
    fail "--help — shows help"
  fi
}

# --- unknown command ---

test_unknown_cmd() {
  local output
  output=$(bash "$TEST_DIR/scripts/kortix.sh" foobar 2>&1 || true)
  if echo "$output" | grep -qi "unknown"; then
    pass "unknown command — shows error"
  else
    fail "unknown command — shows error" "Missing 'unknown' in: $output"
  fi
}

# --- status (from test dir with .env) ---

test_status() {
  local output
  output=$(cd "$TEST_DIR" && bash scripts/kortix.sh status 2>&1)

  if echo "$output" | grep -q "Service Status"; then
    pass "status — shows header"
  else
    fail "status — shows header" "$output"
  fi

  if echo "$output" | grep -q ".env file exists"; then
    pass "status — detects .env"
  else
    fail "status — detects .env" "$output"
  fi

  if echo "$output" | grep -q "2 LLM provider"; then
    pass "status — counts 2 configured LLM providers"
  else
    fail "status — counts configured LLM providers" "$output"
  fi
}

# --- status (no .env) ---

test_status_no_env() {
  local tmp_dir="/tmp/kortix-test-noenv-$$"
  mkdir -p "$tmp_dir/scripts"
  cp "$CLI" "$tmp_dir/scripts/kortix.sh"
  touch "$tmp_dir/docker-compose.local.yml"

  local output
  output=$(cd "$tmp_dir" && bash scripts/kortix.sh status 2>&1)

  if echo "$output" | grep -qi "no .env"; then
    pass "status (no .env) — warns about missing .env"
  else
    fail "status (no .env) — warns about missing .env" "$output"
  fi

  rm -rf "$tmp_dir"
}

# --- no args shows help ---

test_no_args() {
  local output
  output=$(bash "$TEST_DIR/scripts/kortix.sh" 2>&1)
  if echo "$output" | grep -q "Usage:"; then
    pass "no args — shows help"
  else
    fail "no args — shows help"
  fi
}

# --- find_root ---

test_find_root_cwd() {
  # Should find root from within a subdirectory
  local output
  output=$(cd "$TEST_DIR/scripts" && bash kortix.sh status 2>&1)
  if echo "$output" | grep -q "Service Status"; then
    pass "find_root — finds root from subdirectory"
  else
    fail "find_root — finds root from subdirectory" "$output"
  fi
}

test_find_root_env() {
  # KORTIX_HOME should override
  local output
  output=$(KORTIX_HOME="$TEST_DIR" bash "$CLI" status 2>&1)
  if echo "$output" | grep -q "Service Status"; then
    pass "find_root — KORTIX_HOME override works"
  else
    fail "find_root — KORTIX_HOME override works" "$output"
  fi
}

# Run all tests
test_help
test_help_aliases
test_unknown_cmd
test_status
test_status_no_env
test_no_args
test_find_root_cwd
test_find_root_env

summary
cleanup

[ "$FAILED" -eq 0 ] || exit 1
