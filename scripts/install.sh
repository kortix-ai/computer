#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix Installer                                                          ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    curl -fsSL https://get.kortix.ai/install | bash                         ║
# ║    — or —                                                                  ║
# ║    bash scripts/install.sh          (from existing clone)                  ║
# ║    bash scripts/install.sh --env-file /path/to/.env   (non-interactive)   ║
# ║    bash scripts/install.sh --setup-only               (just configure)    ║
# ║                                                                            ║
# ║  What it does:                                                             ║
# ║    1. Checks prerequisites (Docker, Git)                                   ║
# ║    2. Clones the repo (or uses existing checkout)                          ║
# ║    3. Prompts for API keys and sandbox settings in the terminal            ║
# ║    4. Generates .env files and starts all services                         ║
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
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────────────────────────

info()    { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
success() { printf "${GREEN}[OK]${NC}   %s\n" "$*"; }
warn()    { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
error()   { printf "${RED}[ERR]${NC}  %s\n" "$*" >&2; }
fatal()   { error "$*"; exit 1; }

header() {
  echo ""
  printf "${BOLD}${CYAN}"
  cat << 'BANNER'
  _  __         _   _
 | |/ /___  _ _| |_(_)_ __
 | ' </ _ \| '_|  _| \ \ /
 |_|\_\___/|_|  \__|_/_\_\

BANNER
  printf "${NC}"
  echo "  ${DIM}Local Installer v2.0${NC}"
  echo ""
}

# ─── .env helpers ────────────────────────────────────────────────────────────

# Update or append a key=value pair in an env file.
# Usage: write_env_key FILE KEY VALUE
write_env_key() {
  local file="$1" key="$2" val="$3"

  # Create file if it doesn't exist
  if [ ! -f "$file" ]; then
    mkdir -p "$(dirname "$file")"
    touch "$file"
  fi

  # If key exists, update in place; otherwise append
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # Use a temp file for portability (macOS sed -i differs from GNU)
    local tmp="${file}.tmp.$$"
    sed "s|^${key}=.*|${key}=${val}|" "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

# Mask a key value for display: first 4 + ... + last 4
mask_key() {
  local val="$1"
  local len=${#val}
  if [ "$len" -le 8 ]; then
    echo "****"
  else
    echo "${val:0:4}...${val:$((len-4)):4}"
  fi
}

# ─── Preflight Checks ───────────────────────────────────────────────────────

check_command() {
  local cmd="$1"
  local name="${2:-$1}"
  local install_hint="${3:-}"

  if command -v "$cmd" &>/dev/null; then
    local version
    version=$("$cmd" --version 2>/dev/null | head -1 || echo "installed")
    success "$name found: ${DIM}$version${NC}"
    return 0
  else
    error "$name not found"
    if [ -n "$install_hint" ]; then
      echo "       ${DIM}$install_hint${NC}"
    fi
    return 1
  fi
}

check_docker_running() {
  if docker info &>/dev/null; then
    success "Docker daemon is running"
    return 0
  else
    error "Docker is installed but not running"
    echo "       ${DIM}Start Docker Desktop or run: sudo systemctl start docker${NC}"
    return 1
  fi
}

check_port() {
  local port="$1"
  local service="$2"
  if lsof -i ":$port" &>/dev/null 2>&1 || ss -tln 2>/dev/null | grep -q ":$port "; then
    warn "Port $port ($service) is already in use"
    return 1
  fi
  return 0
}

preflight() {
  info "Running preflight checks..."
  echo ""

  local failed=0

  # Required: Docker + Git
  check_command "docker" "Docker" "Install: https://docs.docker.com/get-docker/" || failed=1
  check_command "git" "Git" "Install: https://git-scm.com/downloads" || failed=1

  # Docker must be running
  if [ $failed -eq 0 ]; then
    check_docker_running || failed=1
  fi

  # Docker Compose (v2 plugin)
  if docker compose version &>/dev/null; then
    local compose_ver
    compose_ver=$(docker compose version --short 2>/dev/null || echo "v2+")
    success "Docker Compose found: ${DIM}$compose_ver${NC}"
  else
    error "Docker Compose v2 not found"
    echo "       ${DIM}Included with Docker Desktop, or: https://docs.docker.com/compose/install/${NC}"
    failed=1
  fi

  # Port availability (non-fatal)
  echo ""
  info "Checking port availability..."
  check_port 3000  "Frontend"   || warn "Port 3000 conflict — frontend may fail to start"
  check_port 8008  "Kortix API" || warn "Port 8008 conflict — API may fail to start"
  check_port 14000 "Sandbox"    || warn "Port 14000 conflict — sandbox may fail to start"

  echo ""

  if [ $failed -ne 0 ]; then
    fatal "Preflight checks failed. Please install missing dependencies and try again."
  fi

  success "All preflight checks passed"
}

# ─── Repository Setup ───────────────────────────────────────────────────────

REPO_URL="https://github.com/kortix-ai/kortix.git"
DEFAULT_INSTALL_DIR="$HOME/kortix"

setup_repo() {
  # If we're already inside the repo, use it
  if [ -f "docker-compose.local.yml" ] && [ -d "scripts" ]; then
    INSTALL_DIR="$(pwd)"
    success "Using existing checkout: $INSTALL_DIR"
    return 0
  fi

  # Check if default dir already exists
  if [ -d "$DEFAULT_INSTALL_DIR" ] && [ -f "$DEFAULT_INSTALL_DIR/docker-compose.local.yml" ]; then
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
    success "Found existing installation: $INSTALL_DIR"

    info "Pulling latest changes..."
    (cd "$INSTALL_DIR" && git pull --ff-only 2>/dev/null) || warn "Could not pull latest — continuing with current version"
    return 0
  fi

  # Clone
  info "Cloning Kortix to $DEFAULT_INSTALL_DIR..."
  if git clone --depth 1 "$REPO_URL" "$DEFAULT_INSTALL_DIR" 2>/dev/null; then
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
    success "Repository cloned to $INSTALL_DIR"
  else
    fatal "Failed to clone repository. Check your internet connection and try again."
  fi
}

# ─── Interactive Setup ──────────────────────────────────────────────────────

# Collected keys (associative array workaround for bash 3.x compat)
KEYS=""

add_key() {
  local key="$1" val="$2"
  KEYS="${KEYS}${key}=${val}"$'\n'
}

get_key() {
  local key="$1"
  echo "$KEYS" | grep "^${key}=" 2>/dev/null | head -1 | cut -d= -f2-
}

prompt_key() {
  local key="$1" label="$2" default="${3:-}" recommended="${4:-}"
  local prompt_str="  ${label}"
  local hint=""

  if [ -n "$recommended" ]; then
    prompt_str="${prompt_str} ${CYAN}(recommended)${NC}"
  fi
  if [ -n "$default" ]; then
    hint=" [${default}]"
  fi

  printf "${prompt_str}${hint}: "

  local val
  read -r val

  # Use default if empty
  if [ -z "$val" ] && [ -n "$default" ]; then
    val="$default"
  fi

  if [ -n "$val" ]; then
    add_key "$key" "$val"
  fi
}

prompt_secret() {
  local key="$1" label="$2" default="${3:-}"
  local hint=""

  if [ -n "$default" ]; then
    hint=" [${default}]"
  fi

  printf "  ${label}${hint}: "
  read -rs val
  echo ""

  if [ -z "$val" ] && [ -n "$default" ]; then
    val="$default"
  fi

  if [ -n "$val" ]; then
    add_key "$key" "$val"
  fi
}

run_setup() {
  cd "$INSTALL_DIR"

  # Check if .env already exists
  if [ -f ".env" ]; then
    echo ""
    warn "An existing .env file was found."
    printf "  Reconfigure? [y/N]: "
    read -r reconfigure
    if [[ ! "$reconfigure" =~ ^[Yy] ]]; then
      success "Keeping existing configuration"
      return 0
    fi
    echo ""
  fi

  echo ""
  echo "  ${BOLD}Configure your Kortix instance${NC}"
  echo "  ${DIM}Press Enter to skip optional keys${NC}"
  echo ""

  # ── LLM Providers ──
  echo "  ${BOLD}${CYAN}LLM Providers${NC} ${DIM}(at least one required)${NC}"
  echo "  ────────────────────────────────────"
  prompt_key "ANTHROPIC_API_KEY"  "Anthropic API Key"  "" "recommended"
  prompt_key "OPENAI_API_KEY"     "OpenAI API Key"
  prompt_key "OPENROUTER_API_KEY" "OpenRouter API Key"
  prompt_key "GEMINI_API_KEY"     "Google Gemini API Key"
  prompt_key "GROQ_API_KEY"       "Groq API Key"
  prompt_key "XAI_API_KEY"        "xAI (Grok) API Key"
  echo ""

  # Validate at least one LLM key
  local has_llm=0
  for k in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GEMINI_API_KEY GROQ_API_KEY XAI_API_KEY; do
    local v
    v=$(get_key "$k")
    if [ -n "$v" ]; then
      has_llm=1
      break
    fi
  done

  if [ "$has_llm" -eq 0 ]; then
    warn "No LLM provider key was configured."
    printf "  Continue anyway? [y/N]: "
    read -r cont
    if [[ ! "$cont" =~ ^[Yy] ]]; then
      fatal "At least one LLM provider key is required. Run 'kortix setup' to try again."
    fi
    echo ""
  fi

  # ── Tool Providers ──
  echo "  ${BOLD}${CYAN}Tool Providers${NC} ${DIM}(optional, press Enter to skip)${NC}"
  echo "  ────────────────────────────────────"
  prompt_key "TAVILY_API_KEY"     "Tavily (Web Search)"
  prompt_key "SERPER_API_KEY"     "Serper (Google Search)"
  prompt_key "FIRECRAWL_API_KEY"  "Firecrawl (Web Scraping)"
  prompt_key "REPLICATE_API_TOKEN" "Replicate (Image/Video Gen)"
  prompt_key "ELEVENLABS_API_KEY" "ElevenLabs (Text-to-Speech)"
  prompt_key "CONTEXT7_API_KEY"   "Context7 (Doc Search)"
  echo ""

  # ── Sandbox Settings ──
  echo "  ${BOLD}${CYAN}Sandbox Settings${NC}"
  echo "  ────────────────────────────────────"
  prompt_key    "OPENCODE_SERVER_USERNAME" "Username" "admin"
  prompt_secret "OPENCODE_SERVER_PASSWORD" "Password" "changeme"
  echo ""

  # ── Review ──
  echo ""
  echo "  ${BOLD}Configuration Summary${NC}"
  echo "  ════════════════════════════════════"

  local summary_count=0
  echo ""
  echo "  ${CYAN}LLM Providers:${NC}"
  for k in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GEMINI_API_KEY GROQ_API_KEY XAI_API_KEY; do
    local v
    v=$(get_key "$k")
    if [ -n "$v" ]; then
      local masked
      masked=$(mask_key "$v")
      printf "    %-25s ${GREEN}%s${NC}\n" "$k" "$masked"
      summary_count=$((summary_count + 1))
    fi
  done
  if [ "$summary_count" -eq 0 ]; then
    echo "    ${DIM}(none configured)${NC}"
  fi

  local tool_count=0
  echo ""
  echo "  ${CYAN}Tool Providers:${NC}"
  for k in TAVILY_API_KEY SERPER_API_KEY FIRECRAWL_API_KEY REPLICATE_API_TOKEN ELEVENLABS_API_KEY CONTEXT7_API_KEY; do
    local v
    v=$(get_key "$k")
    if [ -n "$v" ]; then
      local masked
      masked=$(mask_key "$v")
      printf "    %-25s ${GREEN}%s${NC}\n" "$k" "$masked"
      tool_count=$((tool_count + 1))
    fi
  done
  if [ "$tool_count" -eq 0 ]; then
    echo "    ${DIM}(none configured)${NC}"
  fi

  echo ""
  echo "  ${CYAN}Sandbox:${NC}"
  local sb_user
  sb_user=$(get_key "OPENCODE_SERVER_USERNAME")
  local sb_pass
  sb_pass=$(get_key "OPENCODE_SERVER_PASSWORD")
  printf "    %-25s %s\n" "Username" "${sb_user:-admin}"
  printf "    %-25s %s\n" "Password" "$(mask_key "${sb_pass:-changeme}")"

  echo ""
  echo "  ════════════════════════════════════"
  printf "  Save and start Kortix? [Y/n]: "
  read -r confirm
  if [[ "$confirm" =~ ^[Nn] ]]; then
    info "Setup cancelled. Run 'kortix setup' to configure later."
    return 1
  fi

  # ── Write .env files ──
  write_env_files
}

# ─── Non-interactive Setup (--env-file) ─────────────────────────────────────

setup_from_file() {
  local env_file="$1"

  if [ ! -f "$env_file" ]; then
    fatal "Env file not found: $env_file"
  fi

  cd "$INSTALL_DIR"

  info "Importing configuration from $env_file..."

  # Copy to root .env
  cp "$env_file" ".env"

  # Force local-mode values
  write_env_key ".env" "ENV_MODE" "local"
  write_env_key ".env" "SANDBOX_PROVIDER" "local_docker"
  write_env_key ".env" "NEXT_PUBLIC_ENV_MODE" "local"
  write_env_key ".env" "NEXT_PUBLIC_BACKEND_URL" "http://localhost:8008/v1"
  write_env_key ".env" "NEXT_PUBLIC_OPENCODE_URL" "http://localhost:14000"

  # Extract sandbox keys into sandbox/.env
  local sandbox_keys="OPENCODE_SERVER_USERNAME OPENCODE_SERVER_PASSWORD ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GEMINI_API_KEY GROQ_API_KEY XAI_API_KEY TAVILY_API_KEY SERPER_API_KEY FIRECRAWL_API_KEY REPLICATE_API_TOKEN ELEVENLABS_API_KEY CONTEXT7_API_KEY"

  # Create sandbox .env from example or fresh
  local sandbox_env="sandbox/.env"
  if [ ! -f "$sandbox_env" ]; then
    if [ -f "sandbox/.env.example" ]; then
      cp "sandbox/.env.example" "$sandbox_env"
    else
      echo "# Kortix Sandbox Environment" > "$sandbox_env"
      echo "ENV_MODE=local" >> "$sandbox_env"
    fi
  fi

  write_env_key "$sandbox_env" "ENV_MODE" "local"
  write_env_key "$sandbox_env" "SANDBOX_ID" "kortix-sandbox"
  write_env_key "$sandbox_env" "PROJECT_ID" "local"
  write_env_key "$sandbox_env" "KORTIX_API_URL" "http://kortix-api:8008/v1/router"

  for k in $sandbox_keys; do
    local v
    v=$(grep "^${k}=" "$env_file" 2>/dev/null | head -1 | cut -d= -f2- || true)
    # Strip surrounding quotes
    v="${v%\"}"
    v="${v#\"}"
    v="${v%\'}"
    v="${v#\'}"
    if [ -n "$v" ]; then
      write_env_key "$sandbox_env" "$k" "$v"
    fi
  done

  # Generate per-service .env files
  if [ -f "scripts/setup-env.sh" ]; then
    bash scripts/setup-env.sh 2>/dev/null || warn "setup-env.sh failed — continuing"
  fi

  success "Configuration imported"
}

# ─── Write Env Files ────────────────────────────────────────────────────────

write_env_files() {
  info "Writing configuration files..."

  # Create root .env from .env.example if it doesn't exist
  if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
      cp ".env.example" ".env"
    else
      echo "# Kortix Environment Configuration" > ".env"
    fi
  fi

  # Fixed local-mode values
  write_env_key ".env" "ENV_MODE" "local"
  write_env_key ".env" "SANDBOX_PROVIDER" "local_docker"
  write_env_key ".env" "NEXT_PUBLIC_ENV_MODE" "local"
  write_env_key ".env" "NEXT_PUBLIC_BACKEND_URL" "http://localhost:8008/v1"
  write_env_key ".env" "NEXT_PUBLIC_OPENCODE_URL" "http://localhost:14000"

  # Write all collected keys to root .env
  local sandbox_keys="OPENCODE_SERVER_USERNAME OPENCODE_SERVER_PASSWORD ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GEMINI_API_KEY GROQ_API_KEY XAI_API_KEY TAVILY_API_KEY SERPER_API_KEY FIRECRAWL_API_KEY REPLICATE_API_TOKEN ELEVENLABS_API_KEY CONTEXT7_API_KEY"

  # Write keys from the interactive prompts
  echo "$KEYS" | while IFS='=' read -r key val; do
    if [ -n "$key" ] && [ -n "$val" ]; then
      write_env_key ".env" "$key" "$val"
    fi
  done

  # Create sandbox .env
  local sandbox_env="sandbox/.env"
  if [ ! -f "$sandbox_env" ]; then
    if [ -f "sandbox/.env.example" ]; then
      cp "sandbox/.env.example" "$sandbox_env"
    else
      mkdir -p sandbox
      echo "# Kortix Sandbox Environment" > "$sandbox_env"
      echo "ENV_MODE=local" >> "$sandbox_env"
    fi
  fi

  write_env_key "$sandbox_env" "ENV_MODE" "local"
  write_env_key "$sandbox_env" "SANDBOX_ID" "kortix-sandbox"
  write_env_key "$sandbox_env" "PROJECT_ID" "local"
  write_env_key "$sandbox_env" "KORTIX_API_URL" "http://kortix-api:8008/v1/router"

  # Mirror sandbox keys
  for k in $sandbox_keys; do
    local v
    v=$(get_key "$k")
    if [ -n "$v" ]; then
      write_env_key "$sandbox_env" "$k" "$v"
    fi
  done

  # Generate per-service .env files
  if [ -f "scripts/setup-env.sh" ]; then
    bash scripts/setup-env.sh 2>/dev/null || warn "setup-env.sh failed — continuing"
  fi

  success "Configuration saved"
}

# ─── Start Services ─────────────────────────────────────────────────────────

start_services() {
  cd "$INSTALL_DIR"

  echo ""
  info "Starting Kortix services..."
  echo "  ${DIM}This may take several minutes on first run (building images)${NC}"
  echo ""

  docker compose -f docker-compose.local.yml up --build -d

  echo ""
  success "Kortix is starting up!"
  echo ""
  echo "  ${CYAN}Frontend:${NC}    ${BOLD}http://localhost:3000${NC}"
  echo "  ${CYAN}API:${NC}         ${BOLD}http://localhost:8008${NC}"
  echo "  ${CYAN}Sandbox:${NC}     ${BOLD}http://localhost:14000${NC}"
  echo ""
  echo "  ${DIM}Run 'kortix logs' to follow the logs${NC}"
  echo "  ${DIM}Run 'kortix stop' to shut down${NC}"
  echo "  ${DIM}Run 'kortix setup' to reconfigure API keys${NC}"
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  local env_file=""
  local setup_only=0
  local skip_preflight=0
  local skip_clone=0

  # Parse flags
  while [ $# -gt 0 ]; do
    case "$1" in
      --env-file)
        shift
        env_file="${1:-}"
        if [ -z "$env_file" ]; then
          fatal "Missing argument for --env-file"
        fi
        ;;
      --setup-only)
        setup_only=1
        ;;
      --skip-preflight)
        skip_preflight=1
        ;;
      --skip-clone)
        skip_clone=1
        ;;
      -h|--help)
        echo "Usage: install.sh [--env-file PATH] [--setup-only] [--skip-preflight] [--skip-clone]"
        echo ""
        echo "Options:"
        echo "  --env-file PATH    Import configuration from an existing .env file (non-interactive)"
        echo "  --setup-only       Only configure .env files, don't start services"
        echo "  --skip-preflight   Skip Docker/Git checks (used by get-kortix.sh bootstrap)"
        echo "  --skip-clone       Skip repo clone/pull (used by get-kortix.sh bootstrap)"
        echo ""
        exit 0
        ;;
      *)
        warn "Unknown argument: $1"
        ;;
    esac
    shift
  done

  header

  # Determine install directory and run preflight/clone as needed
  if [ "$setup_only" -eq 1 ]; then
    # For setup-only, just find the root and configure
    if [ -f "docker-compose.local.yml" ] && [ -d "scripts" ]; then
      INSTALL_DIR="$(pwd)"
    elif [ -d "$DEFAULT_INSTALL_DIR" ]; then
      INSTALL_DIR="$DEFAULT_INSTALL_DIR"
    else
      fatal "Cannot find Kortix installation. Run full install first."
    fi
  elif [ "$skip_preflight" -eq 1 ] && [ "$skip_clone" -eq 1 ]; then
    # Called from get-kortix.sh bootstrap — already in the right dir
    INSTALL_DIR="$(pwd)"
  else
    if [ "$skip_preflight" -eq 0 ]; then
      preflight
    fi
    if [ "$skip_clone" -eq 0 ]; then
      setup_repo
    else
      INSTALL_DIR="$(pwd)"
    fi
  fi

  # Non-interactive mode
  if [ -n "$env_file" ]; then
    setup_from_file "$env_file"
    if [ "$setup_only" -eq 0 ]; then
      start_services
    fi
    return 0
  fi

  # Interactive mode
  if run_setup; then
    if [ "$setup_only" -eq 0 ]; then
      start_services
    else
      success "Setup complete. Run 'kortix start' to launch."
    fi
  fi
}

main "$@"
