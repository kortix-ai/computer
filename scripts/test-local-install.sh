#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Local Install Test                                                        ║
# ║                                                                            ║
# ║  Simulates a fresh "curl | bash" install in /tmp/kortix-test.             ║
# ║  Copies the project, wipes .env files, runs the installer.                ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    bash scripts/test-local-install.sh                                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Resolve source directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="/tmp/kortix-test"

echo ""
echo "  ${BOLD}${CYAN}Kortix Local Install Test${NC}"
echo "  ════════════════════════════════════"
echo ""
echo "  ${DIM}Source:${NC}  $SRC_DIR"
echo "  ${DIM}Target:${NC} $TEST_DIR"
echo ""

# ─── Clean up previous test ─────────────────────────────────────────────────

if [ -d "$TEST_DIR" ]; then
  printf "  ${YELLOW}Previous test dir exists.${NC} Remove it? [Y/n]: "
  read -r answer
  if [[ "$answer" =~ ^[Nn] ]]; then
    echo "  Aborted."
    exit 0
  fi
  rm -rf "$TEST_DIR"
  echo "  ${GREEN}Cleaned.${NC}"
fi

# ─── Copy project (simulating a git clone) ──────────────────────────────────

echo ""
echo "  ${DIM}Copying project files (simulating git clone)...${NC}"

mkdir -p "$TEST_DIR"

# Copy essential dirs/files — skip node_modules, .git, and heavy stuff
rsync -a --quiet \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.nx' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.turbo' \
  "$SRC_DIR/" "$TEST_DIR/"

# ─── Wipe .env files (simulate fresh install) ───────────────────────────────

rm -f "$TEST_DIR/.env"
rm -f "$TEST_DIR/sandbox/.env"
rm -f "$TEST_DIR/services/kortix-api/.env"
rm -f "$TEST_DIR/apps/frontend/.env"

echo "  ${GREEN}Project copied. All .env files wiped.${NC}"
echo ""

# ─── Run the installer ──────────────────────────────────────────────────────

echo "  ${BOLD}Starting installer...${NC}"
echo "  ────────────────────────────────────"
echo ""

cd "$TEST_DIR"
bash scripts/install.sh
