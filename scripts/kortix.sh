#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix CLI                                                                ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    kortix install     — Full installation (preflight + setup)              ║
# ║    kortix setup       — Configure API keys and .env files                  ║
# ║    kortix start       — Start all services                                ║
# ║    kortix stop        — Stop all services                                 ║
# ║    kortix restart     — Restart all services                              ║
# ║    kortix logs        — Tail logs from all services                       ║
# ║    kortix status      — Show service status                               ║
# ║    kortix update      — Pull latest and rebuild                           ║
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

info()    { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
success() { printf "${GREEN}[OK]${NC}   %s\n" "$*"; }
warn()    { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
error()   { printf "${RED}[ERR]${NC}  %s\n" "$*" >&2; }
fatal()   { error "$*"; exit 1; }

# ─── Resolve project root ───────────────────────────────────────────────────

find_root() {
  # If KORTIX_HOME is set, use it
  if [ -n "${KORTIX_HOME:-}" ] && [ -f "$KORTIX_HOME/docker-compose.local.yml" ]; then
    echo "$KORTIX_HOME"
    return
  fi

  # Check current dir and parents
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/docker-compose.local.yml" ] && [ -d "$dir/scripts" ]; then
      echo "$dir"
      return
    fi
    dir="$(dirname "$dir")"
  done

  # Fallback to ~/kortix
  if [ -f "$HOME/kortix/docker-compose.local.yml" ]; then
    echo "$HOME/kortix"
    return
  fi

  fatal "Cannot find Kortix installation. Run 'kortix install' first or set KORTIX_HOME."
}

COMPOSE_FILE="docker-compose.local.yml"

# ─── Commands ────────────────────────────────────────────────────────────────

cmd_install() {
  local script_dir
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  bash "$script_dir/install.sh" "$@"
}

cmd_setup() {
  local script_dir
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  local root
  root="$(find_root)"
  cd "$root"

  # Run the installer in setup-only mode
  bash "$script_dir/install.sh" --setup-only "$@"
}

cmd_start() {
  local root
  root="$(find_root)"
  cd "$root"

  # Check if .env exists
  if [ ! -f ".env" ]; then
    warn "No .env file found. Running setup first..."
    cmd_setup
  fi

  info "Starting Kortix services..."
  docker compose -f "$COMPOSE_FILE" up --build -d

  echo ""
  success "Kortix is starting up!"
  echo ""
  echo "  ${CYAN}Frontend:${NC}    http://localhost:3000"
  echo "  ${CYAN}API:${NC}         http://localhost:8008"
  echo "  ${CYAN}Sandbox:${NC}     http://localhost:14000"
  echo ""
  echo "  ${DIM}Run 'kortix logs' to follow the logs${NC}"
  echo "  ${DIM}Run 'kortix stop' to shut down${NC}"
  echo ""
}

cmd_stop() {
  local root
  root="$(find_root)"
  cd "$root"

  info "Stopping Kortix services..."
  docker compose -f "$COMPOSE_FILE" down
  success "All services stopped"
}

cmd_restart() {
  local root
  root="$(find_root)"
  cd "$root"

  info "Restarting Kortix services..."
  docker compose -f "$COMPOSE_FILE" down
  docker compose -f "$COMPOSE_FILE" up --build -d

  echo ""
  success "Kortix restarted!"
  echo ""
  echo "  ${CYAN}Frontend:${NC}    http://localhost:3000"
  echo "  ${CYAN}API:${NC}         http://localhost:8008"
  echo "  ${CYAN}Sandbox:${NC}     http://localhost:14000"
  echo ""
}

cmd_logs() {
  local root
  root="$(find_root)"
  cd "$root"

  local service="${1:-}"
  if [ -n "$service" ]; then
    docker compose -f "$COMPOSE_FILE" logs -f "$service"
  else
    docker compose -f "$COMPOSE_FILE" logs -f
  fi
}

cmd_status() {
  local root
  root="$(find_root)"
  cd "$root"

  echo ""
  printf "${BOLD}${CYAN}"
  echo "  Kortix Service Status"
  printf "${NC}"
  echo "  ─────────────────────"
  echo ""

  # Check if compose is running
  if docker compose -f "$COMPOSE_FILE" ps --status running 2>/dev/null | grep -q .; then
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
  else
    warn "No Kortix services are running"
    echo ""
    echo "  ${DIM}Run 'kortix start' to start${NC}"
  fi

  echo ""

  # Check .env status
  if [ -f ".env" ]; then
    success ".env file exists"

    # Count configured LLM keys
    local llm_count=0
    for key in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GEMINI_API_KEY GROQ_API_KEY XAI_API_KEY; do
      local val
      val=$(grep "^$key=" .env 2>/dev/null | cut -d= -f2- || true)
      if [ -n "$val" ] && [ "$val" != '""' ] && [ "$val" != "''" ]; then
        llm_count=$((llm_count + 1))
      fi
    done
    info "$llm_count LLM provider(s) configured"
  else
    warn "No .env file — run 'kortix setup'"
  fi

  echo ""
}

cmd_update() {
  local root
  root="$(find_root)"
  cd "$root"

  info "Pulling latest changes..."
  git pull --ff-only || { warn "Fast-forward pull failed — you may have local changes"; return 1; }

  info "Rebuilding services..."
  docker compose -f "$COMPOSE_FILE" up --build -d

  echo ""
  success "Kortix updated and restarted!"
  echo ""
}

cmd_help() {
  echo ""
  printf "${BOLD}${CYAN}"
  cat << 'BANNER'
  _  __         _   _
 | |/ /___  _ _| |_(_)_ __
 | ' </ _ \| '_|  _| \ \ /
 |_|\_\___/|_|  \__|_/_\_\
BANNER
  printf "${NC}"
  echo ""
  echo "  ${BOLD}Usage:${NC} kortix <command>"
  echo ""
  echo "  ${BOLD}Commands:${NC}"
  echo "    ${CYAN}install${NC}     Full installation (preflight + interactive setup)"
  echo "    ${CYAN}setup${NC}       Configure API keys and .env files"
  echo "    ${CYAN}start${NC}       Start all services (frontend, API, sandbox)"
  echo "    ${CYAN}stop${NC}        Stop all services"
  echo "    ${CYAN}restart${NC}     Restart all services"
  echo "    ${CYAN}logs${NC}        Tail service logs (optionally: kortix logs <service>)"
  echo "    ${CYAN}status${NC}      Show service status and configuration"
  echo "    ${CYAN}update${NC}      Pull latest and rebuild"
  echo "    ${CYAN}help${NC}        Show this help message"
  echo ""
  echo "  ${BOLD}Options:${NC}"
  echo "    ${CYAN}--env-file PATH${NC}   Import config from an existing .env file (non-interactive)"
  echo ""
  echo "  ${BOLD}Examples:${NC}"
  echo "    ${DIM}kortix install                        # First-time setup${NC}"
  echo "    ${DIM}kortix install --env-file .env.prod   # Non-interactive install${NC}"
  echo "    ${DIM}kortix setup                          # Re-configure API keys${NC}"
  echo "    ${DIM}kortix start                          # Start everything${NC}"
  echo "    ${DIM}kortix logs sandbox                   # Tail sandbox logs only${NC}"
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  local cmd="${1:-help}"
  shift 2>/dev/null || true

  case "$cmd" in
    install)  cmd_install "$@" ;;
    setup)    cmd_setup "$@" ;;
    start)    cmd_start "$@" ;;
    stop)     cmd_stop "$@" ;;
    restart)  cmd_restart "$@" ;;
    logs)     cmd_logs "$@" ;;
    status)   cmd_status "$@" ;;
    update)   cmd_update "$@" ;;
    help|-h|--help) cmd_help ;;
    *)
      error "Unknown command: $cmd"
      cmd_help
      exit 1
      ;;
  esac
}

main "$@"
