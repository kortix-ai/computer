#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix CLI — Master Test Runner                                           ║
# ║                                                                            ║
# ║  Runs all test suites for the Kortix installer/CLI system:                ║
# ║    1. Installer checks (test-install.sh)                                   ║
# ║    2. CLI commands (test-cli.sh)                                           ║
# ║    3. E2E CLI setup (test-e2e-setup.mjs)                                  ║
# ║    4. Backend setup routes (bun test e2e-setup.test.ts)                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

run_suite() {
  local name="$1"
  local cmd="$2"
  TOTAL_SUITES=$((TOTAL_SUITES + 1))

  echo ""
  printf "${BOLD}${CYAN}━━━ Suite %d: %s ━━━${NC}\n" "$TOTAL_SUITES" "$name"

  if eval "$cmd"; then
    PASSED_SUITES=$((PASSED_SUITES + 1))
    printf "${GREEN}━━━ PASSED${NC}\n"
  else
    FAILED_SUITES=$((FAILED_SUITES + 1))
    printf "${RED}━━━ FAILED${NC}\n"
  fi
}

echo ""
printf "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}\n"
printf "${BOLD}${CYAN}║     Kortix CLI — Full Test Suite         ║${NC}\n"
printf "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}\n"

# Suite 1: Installer structure checks
run_suite "Installer Checks" "bash $SCRIPT_DIR/test-install.sh"

# Suite 2: CLI command tests
run_suite "CLI Commands" "bash $SCRIPT_DIR/test-cli.sh"

# Suite 3: E2E CLI setup
run_suite "E2E CLI Setup" "node $SCRIPT_DIR/test-e2e-setup.mjs"

# Suite 4: Backend setup routes (bun test)
run_suite "Backend Setup Routes" "cd $ROOT_DIR/services/kortix-api && bun test src/__tests__/e2e-setup.test.ts"

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
printf "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}\n"
printf "${BOLD}${CYAN}║           Test Results Summary            ║${NC}\n"
printf "${BOLD}${CYAN}╠══════════════════════════════════════════╣${NC}\n"
printf "${BOLD}  ${GREEN}Passed:${NC} %d / %d suites\n" "$PASSED_SUITES" "$TOTAL_SUITES"
if [ "$FAILED_SUITES" -gt 0 ]; then
  printf "${BOLD}  ${RED}Failed:${NC} %d / %d suites\n" "$FAILED_SUITES" "$TOTAL_SUITES"
fi
printf "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}\n"
echo ""

if [ "$FAILED_SUITES" -gt 0 ]; then
  exit 1
fi
