#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix — Test Runner                                                      ║
# ║                                                                            ║
# ║  Runs all test suites:                                                     ║
# ║    1. Installer structure (test-install.sh)                                ║
# ║    2. Embedded CLI (test-cli.sh)                                           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

TOTAL=0; PASSED=0; FAILED=0

run_suite() {
  local name="$1" cmd="$2"
  TOTAL=$((TOTAL + 1))
  echo ""
  printf "${BOLD}${CYAN}━━━ Suite %d: %s ━━━${NC}\n" "$TOTAL" "$name"
  if eval "$cmd"; then
    PASSED=$((PASSED + 1))
    printf "${GREEN}━━━ PASSED${NC}\n"
  else
    FAILED=$((FAILED + 1))
    printf "${RED}━━━ FAILED${NC}\n"
  fi
}

echo ""
printf "${BOLD}${CYAN}  Kortix — Full Test Suite${NC}\n"

run_suite "Installer Structure" "bash $SCRIPT_DIR/test-install.sh"
run_suite "Embedded CLI"        "bash $SCRIPT_DIR/test-cli.sh"

echo ""
printf "${BOLD}  Results: ${GREEN}%d passed${NC}" "$PASSED"
if [ "$FAILED" -gt 0 ]; then
  printf ", ${RED}%d failed${NC}" "$FAILED"
fi
printf " (of %d)\n" "$TOTAL"
echo ""

exit "$FAILED"
