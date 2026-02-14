#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix — One-Click Installer                                             ║
# ║                                                                            ║
# ║  Install Kortix with a single command:                                     ║
# ║    curl -fsSL https://get.kortix.ai/install | bash                         ║
# ║                                                                            ║
# ║  What this does:                                                           ║
# ║    1. Checks for Docker + Git                                              ║
# ║    2. Clones the Kortix repo to ~/kortix                                   ║
# ║    3. Runs the interactive setup (API keys, sandbox creds)                 ║
# ║    4. Starts all services via Docker Compose                               ║
# ║                                                                            ║
# ║  After install, manage with:                                               ║
# ║    kortix start | stop | logs | status | setup | update                    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()    { printf "${BLUE}  [INFO]${NC} %s\n" "$*"; }
success() { printf "${GREEN}  [OK]${NC}   %s\n" "$*"; }
warn()    { printf "${YELLOW}  [WARN]${NC} %s\n" "$*"; }
error()   { printf "${RED}  [ERR]${NC}  %s\n" "$*" >&2; }
fatal()   { error "$*"; exit 1; }

# ─── Banner ──────────────────────────────────────────────────────────────────

echo ""
printf "${BOLD}${CYAN}"
cat << 'BANNER'
   _  __         _   _
  | |/ /___  _ _| |_(_)_ __
  | ' </ _ \| '_|  _| \ \ /
  |_|\_\___/|_|  \__|_/_\_\

BANNER
printf "${NC}"
echo "  ${DIM}One-Click Installer${NC}"
echo ""

# ─── Config ──────────────────────────────────────────────────────────────────

REPO_URL="https://github.com/kortix-ai/kortix.git"
INSTALL_DIR="${KORTIX_HOME:-$HOME/kortix}"
BRANCH="${KORTIX_BRANCH:-main}"

# ─── Preflight ───────────────────────────────────────────────────────────────

info "Checking prerequisites..."
echo ""

# Docker
if ! command -v docker &>/dev/null; then
  fatal "Docker is required but not installed. Get it at: https://docs.docker.com/get-docker/"
fi
success "Docker installed"

# Docker running
if ! docker info &>/dev/null 2>&1; then
  fatal "Docker is not running. Start Docker Desktop and try again."
fi
success "Docker is running"

# Docker Compose v2
if ! docker compose version &>/dev/null 2>&1; then
  fatal "Docker Compose v2 is required. It's included with Docker Desktop."
fi
success "Docker Compose available"

# Git
if ! command -v git &>/dev/null; then
  fatal "Git is required but not installed. Get it at: https://git-scm.com/downloads"
fi
success "Git installed"

echo ""

# ─── Clone or update ────────────────────────────────────────────────────────

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Existing installation found at $INSTALL_DIR"
  info "Pulling latest changes..."
  (cd "$INSTALL_DIR" && git pull --ff-only 2>/dev/null) || warn "Could not pull latest — using current version"
  success "Repository up to date"
else
  if [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    fatal "$INSTALL_DIR already exists and is not a git repo. Remove it or set KORTIX_HOME to a different path."
  fi

  info "Cloning Kortix to $INSTALL_DIR..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR" 2>&1 | tail -1
  success "Repository cloned"
fi

echo ""

# ─── Hand off to the real installer ─────────────────────────────────────────

cd "$INSTALL_DIR"

# The repo has the full installer at scripts/install.sh
if [ ! -f "scripts/install.sh" ]; then
  fatal "scripts/install.sh not found. The repository may be incomplete."
fi

chmod +x scripts/install.sh
exec bash scripts/install.sh --skip-preflight --skip-clone

