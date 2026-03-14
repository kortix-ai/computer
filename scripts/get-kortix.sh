#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix — One-Click Install                                               ║
# ║                                                                            ║
# ║  curl -fsSL https://get.kortix.ai/install | bash                           ║
# ║                                                                            ║
# ║  Supports two modes (identical stack, different networking):                ║
# ║    1. Local (laptop/desktop) — HTTP, ports on localhost                     ║
# ║    2. VPS (Hetzner/EC2/DO)   — Caddy reverse proxy, automatic HTTPS        ║
# ║                                                                            ║
# ║  Database: Docker Supabase or external (bring your own).                   ║
# ║                                                                            ║
# ║  Requirement: Docker + Docker Compose v2.                                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'
DIM=$'\033[2m'; NC=$'\033[0m'

info()    { echo "  ${BLUE}[INFO]${NC} $*"; }
success() { echo "  ${GREEN}[OK]${NC}   $*"; }
warn()    { echo "  ${YELLOW}[WARN]${NC} $*"; }
error()   { echo "  ${RED}[ERR]${NC}  $*" >&2; }
fatal()   { error "$*"; exit 1; }

# ─── Config ──────────────────────────────────────────────────────────────────
INSTALL_DIR="${KORTIX_HOME:-$HOME/.kortix}"
DEFAULT_KORTIX_VERSION="0.8.3"
KORTIX_VERSION="${KORTIX_VERSION:-$DEFAULT_KORTIX_VERSION}"
KORTIX_LOCAL_IMAGES="${KORTIX_LOCAL_IMAGES:-0}"
KORTIX_LOCAL_TAG="${KORTIX_LOCAL_TAG:-latest}"
KORTIX_BUILD_LOCAL_IMAGES="${KORTIX_BUILD_LOCAL_IMAGES:-0}"
KORTIX_PULL_PARALLELISM="${KORTIX_PULL_PARALLELISM:-4}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KORTIX_LOCAL_REPO_ROOT="${KORTIX_LOCAL_REPO_ROOT:-$REPO_ROOT}"

resolve_node_bin() {
  local nvm_latest
  nvm_latest=$(ls -1dt "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | head -1 || true)
  if [ -n "$nvm_latest" ] && [ -x "$nvm_latest" ]; then
    printf '%s' "$nvm_latest"
    return
  fi
  command -v node
}

NODE_BIN="$(resolve_node_bin || true)"
PNPM_BIN="$(command -v pnpm || true)"
BUN_BIN="$(command -v bun || true)"

compute_compose_project_name() {
  local raw
  raw="$(basename "$INSTALL_DIR")"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed 's/^[._-]*//; s/[^a-z0-9_-]//g')"
  [ -n "$raw" ] || raw="kortix"
  printf '%s' "$raw"
}

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(compute_compose_project_name)}"
SANDBOX_NETWORK="${SANDBOX_NETWORK:-${COMPOSE_PROJECT_NAME}_default}"

parse_query_param() {
  local raw="$1"
  local qs="${raw#*\?}"
  IFS='&' read -r -a pairs <<< "$qs"
  for pair in "${pairs[@]}"; do
    local key="${pair%%=*}"
    local value="${pair#*=}"
    case "$key" in
      v|version|tag)
        [ -n "$value" ] && KORTIX_VERSION="$value"
        ;;
    esac
  done
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --local)
        KORTIX_LOCAL_IMAGES=1
        shift
        ;;
      --build-local)
        KORTIX_LOCAL_IMAGES=1
        KORTIX_BUILD_LOCAL_IMAGES=1
        shift
        ;;
      --local-tag)
        [ "$#" -ge 2 ] || fatal "--local-tag requires a value"
        KORTIX_LOCAL_IMAGES=1
        KORTIX_LOCAL_TAG="$2"
        shift 2
        ;;
      --local-tag=*)
        KORTIX_LOCAL_IMAGES=1
        KORTIX_LOCAL_TAG="${1#*=}"
        shift
        ;;
      --version)
        [ "$#" -ge 2 ] || fatal "--version requires a value"
        KORTIX_VERSION="$2"
        shift 2
        ;;
      --version=*)
        KORTIX_VERSION="${1#*=}"
        shift
        ;;
      --query)
        [ "$#" -ge 2 ] || fatal "--query requires a value"
        parse_query_param "$2"
        shift 2
        ;;
      --query=*)
        parse_query_param "${1#*=}"
        shift
        ;;
      \?*|*'?'*)
        parse_query_param "$1"
        shift
        ;;
      -h|--help)
        cat <<'EOF'
Usage: get-kortix.sh [options]

Options:
  --local             Use local Docker images instead of pulling from registry
  --build-local       Rebuild local installer images before starting
  --local-tag <tag>   Local image tag to use (default: latest)
  --local-tag=<tag>   Same as above
  --version <tag>     Install a specific image tag (default: current stable release)
  --version=<tag>     Same as above
  --query "v=<tag>"   Query-style version override
  --query "version=<tag>"

Examples:
  bash get-kortix.sh
  bash get-kortix.sh --local
  bash get-kortix.sh --local --build-local
  bash get-kortix.sh --local --local-tag latest
  bash get-kortix.sh --version 0.7.14
  bash get-kortix.sh --query "v=0.7.14"
  KORTIX_VERSION=0.7.15 bash get-kortix.sh
EOF
        exit 0
        ;;
      *)
        fatal "Unknown option: $1"
        ;;
    esac
  done
}

parse_args "$@"

IMAGE_TAG="$KORTIX_VERSION"
SANDBOX_IMAGE_REPO="kortix/computer"
if [ "$KORTIX_LOCAL_IMAGES" = "1" ]; then
  IMAGE_TAG="$KORTIX_LOCAL_TAG"
  SANDBOX_IMAGE_REPO="kortix/computer"
fi

FRONTEND_IMAGE="${KORTIX_FRONTEND_IMAGE:-kortix/kortix-frontend:${IMAGE_TAG}}"
API_IMAGE="${KORTIX_API_IMAGE:-kortix/kortix-api:${IMAGE_TAG}}"
SANDBOX_IMAGE="${KORTIX_SANDBOX_IMAGE:-${SANDBOX_IMAGE_REPO}:${IMAGE_TAG}}"
FRONTEND_IMAGE_OVERRIDDEN="0"
API_IMAGE_OVERRIDDEN="0"
SANDBOX_IMAGE_OVERRIDDEN="0"
[ -n "${KORTIX_FRONTEND_IMAGE:-}" ] && FRONTEND_IMAGE_OVERRIDDEN="1"
[ -n "${KORTIX_API_IMAGE:-}" ] && API_IMAGE_OVERRIDDEN="1"
[ -n "${KORTIX_SANDBOX_IMAGE:-}" ] && SANDBOX_IMAGE_OVERRIDDEN="1"
SUPABASE_POSTGRES_IMAGE="supabase/postgres:15.8.1.085"
SUPABASE_GOTRUE_IMAGE="supabase/gotrue:v2.186.0"
SUPABASE_KONG_IMAGE="kong:2.8.1"
SUPABASE_REST_IMAGE="postgrest/postgrest:v14.5"
CADDY_IMAGE="caddy:2-alpine"

# Installer state
DEPLOY_MODE=""          # "local" or "vps"
DB_MODE=""              # "docker" or "external"
DOMAIN=""
USE_IP_ONLY=""
ENABLE_AUTH=""
ENABLE_FIREWALL=""
ADMIN_USER="admin"
ADMIN_PASSWORD=""
OWNER_EMAIL="${KORTIX_OWNER_EMAIL:-}"
OWNER_PASSWORD="${KORTIX_OWNER_PASSWORD:-}"

# Supabase — generated for docker mode, provided for external
SUPABASE_URL=""
SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_JWT_SECRET=""
DATABASE_URL=""
POSTGRES_PASSWORD=""

# Generated secrets
CRON_SECRET=""
CHANNELS_CREDENTIAL_KEY=""
INTERNAL_SERVICE_KEY=""

# Computed URLs
PUBLIC_URL=""
API_PUBLIC_URL=""

# Optional integrations
INTEGRATION_AUTH_PROVIDER="disabled"
PIPEDREAM_CLIENT_ID=""
PIPEDREAM_CLIENT_SECRET=""
PIPEDREAM_PROJECT_ID=""
PIPEDREAM_ENVIRONMENT=""
SLACK_CLIENT_ID=""
SLACK_CLIENT_SECRET=""
SLACK_SIGNING_SECRET=""

# ─── Helpers ─────────────────────────────────────────────────────────────────
open_browser() {
  local url="$1"
  if command -v open &>/dev/null; then open "$url" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then xdg-open "$url" 2>/dev/null || true
  elif command -v wslview &>/dev/null; then wslview "$url" 2>/dev/null || true
  fi
}

warm_local_sandbox() {
  [ "$DEPLOY_MODE" = "local" ] || return 0

  local warm_url="${API_PUBLIC_URL}/v1/setup/local-sandbox/warm"
  local status_url="${API_PUBLIC_URL}/v1/setup/local-sandbox/warm/status"

  info "Pre-warming local sandbox..."
  curl -sf -X POST "$warm_url" >/dev/null || {
    warn "Could not start sandbox warmup yet — onboarding will start it lazily."
    return 0
  }

  local attempts=0
  local max_attempts=180
  while [ $attempts -lt $max_attempts ]; do
    local payload status progress message
    payload=$(curl -sf "$status_url" 2>/dev/null || true)
    status=$(JSON_PAYLOAD="$payload" python3 -c 'import json, os; data=json.loads(os.environ.get("JSON_PAYLOAD") or "{}"); print(data.get("status", ""))')
    progress=$(JSON_PAYLOAD="$payload" python3 -c 'import json, os; data=json.loads(os.environ.get("JSON_PAYLOAD") or "{}"); print(data.get("progress", ""))')
    message=$(JSON_PAYLOAD="$payload" python3 -c 'import json, os; data=json.loads(os.environ.get("JSON_PAYLOAD") or "{}"); print(data.get("message", ""))')

    case "$status" in
      ready)
        success "Local sandbox is warm and healthy"
        return 0
        ;;
      error)
        warn "Local sandbox warmup reported an error: ${message:-unknown}"
        return 0
        ;;
      pulling|creating)
        info "Sandbox warmup: ${message:-starting} ${progress:+(${progress}%)}"
        ;;
      *)
        info "Sandbox warmup: waiting for sandbox bootstrap..."
        ;;
    esac

    sleep 2
    attempts=$((attempts + 1))
  done

  warn "Sandbox warmup timed out — the UI can still continue waiting for sandbox boot."
}

verify_local_image() {
  local image="$1"
  docker image inspect "$image" >/dev/null 2>&1 || fatal "Local image not found: ${image}. Build or tag it first, or run without --local."
}

ensure_local_build_requirements() {
  [ -d "$KORTIX_LOCAL_REPO_ROOT/apps/frontend" ] || fatal "Local repo root not found at ${KORTIX_LOCAL_REPO_ROOT}."
  [ -x "$PNPM_BIN" ] || fatal "pnpm is required for --build-local."
}

rebuild_local_images() {
  ensure_local_build_requirements
  local build_script="$KORTIX_LOCAL_REPO_ROOT/scripts/build-local-images.sh"
  [ -f "$build_script" ] || fatal "Local build script not found: ${build_script}"

  info "Rebuilding local installer images from ${KORTIX_LOCAL_REPO_ROOT}"
  echo ""
  bash "$build_script" --tag "$KORTIX_LOCAL_TAG"
  success "Local images rebuilt"
}

generate_password() {
  local seg1 seg2 seg3
  seg1=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 4)
  seg2=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 4)
  seg3=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 4)
  echo "kx-${seg1}-${seg2}-${seg3}"
}

generate_token() {
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

get_server_ip() {
  curl -4 -sf --connect-timeout 5 https://ifconfig.me 2>/dev/null \
    || curl -4 -sf --connect-timeout 5 https://api.ipify.org 2>/dev/null \
    || curl -4 -sf --connect-timeout 5 https://icanhazip.com 2>/dev/null \
    || echo ""
}

get_host_docker_socket() {
  docker context inspect --format '{{ (index .Endpoints "docker").Host }}' 2>/dev/null || echo "${DOCKER_HOST:-}"
}

docker_manifest_exists() {
  local image="$1"
  docker manifest inspect "$image" >/dev/null 2>&1
}

resolve_release_images() {
  [ "$KORTIX_LOCAL_IMAGES" = "1" ] && return 0

  info "Resolving release images for ${KORTIX_VERSION}..."

  if ! docker_manifest_exists "$FRONTEND_IMAGE"; then
    if [ "$FRONTEND_IMAGE_OVERRIDDEN" = "1" ]; then
      fatal "Configured frontend image not found: ${FRONTEND_IMAGE}"
    fi
    local fallback_frontend="kortix/kortix-frontend:latest"
    if docker_manifest_exists "$fallback_frontend"; then
      warn "Frontend image ${FRONTEND_IMAGE} not found; falling back to ${fallback_frontend}"
      FRONTEND_IMAGE="$fallback_frontend"
    else
      fatal "Frontend image not found for ${KORTIX_VERSION}, and latest fallback is unavailable."
    fi
  fi

  if ! docker_manifest_exists "$API_IMAGE"; then
    if [ "$API_IMAGE_OVERRIDDEN" = "1" ]; then
      fatal "Configured API image not found: ${API_IMAGE}"
    fi
    local fallback_api="kortix/kortix-api:latest"
    if docker_manifest_exists "$fallback_api"; then
      warn "API image ${API_IMAGE} not found; falling back to ${fallback_api}"
      API_IMAGE="$fallback_api"
    else
      fatal "API image not found for ${KORTIX_VERSION}, and latest fallback is unavailable."
    fi
  fi

  if ! docker_manifest_exists "$SANDBOX_IMAGE"; then
    if [ "$SANDBOX_IMAGE_OVERRIDDEN" = "1" ]; then
      fatal "Configured sandbox image not found: ${SANDBOX_IMAGE}"
    fi
    local fallback_sandbox="${SANDBOX_IMAGE_REPO}:latest"
    if docker_manifest_exists "$fallback_sandbox"; then
      warn "Sandbox image ${SANDBOX_IMAGE} not found; falling back to ${fallback_sandbox}"
      SANDBOX_IMAGE="$fallback_sandbox"
    else
      fatal "Sandbox image not found for ${KORTIX_VERSION}, and latest fallback is unavailable."
    fi
  fi

  success "Release images resolved"
}

pull_images_parallel() {
  local -a images=("$@")
  [ ${#images[@]} -gt 0 ] || return 0

  printf '%s\n' "${images[@]}" | python3 -c 'import sys; print("\n".join(sorted(set(line.strip() for line in sys.stdin if line.strip()))))' \
    | xargs -r -n1 -P "$KORTIX_PULL_PARALLELISM" docker pull
}

# Free ports used by Kortix (local mode)
# Usage: free_kortix_ports [project_name]
# If project_name is provided, only cleans containers from that project
free_kortix_ports() {
  local project_name="${1:-}"
  local is_local=0
  
  # Determine if we're in local mode
  if [ -n "$project_name" ]; then
    # Called from CLI with project name
    is_local=1
  elif [ "$DEPLOY_MODE" = "local" ]; then
    # Called during install
    is_local=1
  fi
  
  [ $is_local -eq 1 ] || return 0
  
  local ports=(13737 13738 13740 13741)
  local freed=0
  
  # First, clean up any lingering containers that might hold ports
  # Use project-specific pattern if project_name is provided
  if [ -n "$project_name" ]; then
    # Clean up containers from this specific project (including old Created state containers)
    docker ps -a --format '{{.Names}}' | grep -E "^${project_name}-" | xargs -r docker rm -f 2>/dev/null || true
  fi
  
  # Kill any processes using the ports
  for port in "${ports[@]}"; do
    local pid
    pid=$(lsof -t -i:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill -9 $pid 2>/dev/null || true
      freed=1
    fi
  done
  
  [ $freed -eq 1 ] && info "Freed Kortix ports" || true
}

# Generate a Supabase JWT (anon or service_role)
# Usage: generate_supabase_jwt <role> <jwt_secret>
generate_supabase_jwt() {
  local role="$1" secret="$2"
  local header payload header_b64 payload_b64 signature
  header='{"alg":"HS256","typ":"JWT"}'
  # iat: 2022-01-01, exp: 2037-01-01 (same as Supabase defaults)
  payload="{\"role\":\"${role}\",\"iss\":\"supabase\",\"iat\":1641024000,\"exp\":2114380800}"

  header_b64=$(echo -n "$header" | base64 | tr '+/' '-_' | tr -d '=\n')
  payload_b64=$(echo -n "$payload" | base64 | tr '+/' '-_' | tr -d '=\n')
  signature=$(echo -n "${header_b64}.${payload_b64}" | openssl dgst -sha256 -hmac "$secret" -binary | base64 | tr '+/' '-_' | tr -d '=\n')

  echo "${header_b64}.${payload_b64}.${signature}"
}

# ─── Banner ──────────────────────────────────────────────────────────────────
banner() {
  echo ""
  echo "${BOLD}${CYAN}"
  cat << 'EOF'
   _  __         _   _
  | |/ /___  _ _| |_(_)_ __
  | ' </ _ \| '_|  _| \ \ /
  |_|\_\___/|_|  \__|_/_\_\
EOF
  echo "${NC}"
  echo "  ${DIM}One-Click Installer${NC}"
  echo ""
}

# ─── Preflight ───────────────────────────────────────────────────────────────
preflight() {
  info "Checking prerequisites..."
  echo ""

  command -v docker &>/dev/null || fatal "Docker is required. Get it at: https://docs.docker.com/get-docker/"
  success "Docker installed"

  docker info &>/dev/null 2>&1 || fatal "Docker is not running. Start Docker Desktop and try again."
  success "Docker is running"

  docker compose version &>/dev/null 2>&1 || fatal "Docker Compose v2 is required. Included with Docker Desktop."
  success "Docker Compose available"

  command -v openssl &>/dev/null || fatal "openssl is required (for JWT generation)."
  success "openssl available"

  echo ""
}

# ─── Mode Selection ──────────────────────────────────────────────────────────
prompt_mode() {
  echo "  ${BOLD}Where are you running Kortix?${NC}"
  echo ""
  echo "    ${CYAN}1${NC}) Local machine ${DIM}(laptop/desktop — HTTP on localhost)${NC}"
  echo "    ${CYAN}2${NC}) VPS / Server  ${DIM}(Hetzner, EC2, DO — HTTPS via Caddy)${NC}"
  echo ""
  printf "  Choice [1]: "
  read -r mode_choice

  case "${mode_choice:-1}" in
    2) DEPLOY_MODE="vps" ;;
    *) DEPLOY_MODE="local" ;;
  esac

  echo ""
}

# ─── Database Setup ──────────────────────────────────────────────────────────
prompt_database() {
  echo "  ${BOLD}Database setup${NC}"
  echo ""
  echo "    ${CYAN}1${NC}) Docker ${DIM}(spin up Supabase locally via Docker)${NC}"
  echo "    ${CYAN}2${NC}) External ${DIM}(provide Supabase project URL or database URL)${NC}"
  echo ""
  printf "  Choice [1]: "
  read -r db_choice

  case "${db_choice:-1}" in
    2)
      DB_MODE="external"
      echo ""
      echo "  ${BOLD}Supabase credentials${NC}"
      echo "  ${DIM}From your Supabase project: Settings → API${NC}"
      echo ""
      printf "    Supabase URL ${DIM}(e.g. https://xxx.supabase.co)${NC}: "
      read -r SUPABASE_URL
      printf "    Anon Key: "
      read -r SUPABASE_ANON_KEY
      printf "    Service Role Key: "
      read -r SUPABASE_SERVICE_ROLE_KEY
      printf "    JWT Secret: "
      read -r SUPABASE_JWT_SECRET
      echo ""
      echo "  ${DIM}From: Settings → Database → Connection string (URI)${NC}"
      printf "    Database URL ${DIM}(postgresql://...)${NC}: "
      read -r DATABASE_URL
      echo ""

      if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$DATABASE_URL" ]; then
        fatal "All Supabase credentials are required for external mode."
      fi

      success "External Supabase configured"
      ;;
    *)
      DB_MODE="docker"
      info "Supabase will run in Docker (auto-configured)"
      ;;
  esac

  echo ""
}

# ─── VPS: Domain Setup ──────────────────────────────────────────────────────
prompt_domain() {
  echo "  ${BOLD}Domain Setup${NC}"
  echo ""
  echo "    ${CYAN}1${NC}) I have a domain name ${DIM}(automatic HTTPS)${NC}"
  echo "    ${CYAN}2${NC}) Just use IP address  ${DIM}(self-signed cert, browser warning)${NC}"
  echo ""
  printf "  Choice [1]: "
  read -r domain_choice

  case "${domain_choice:-1}" in
    2)
      USE_IP_ONLY="yes"
      local server_ip
      server_ip=$(get_server_ip)
      if [ -n "$server_ip" ]; then
        info "Detected server IP: ${BOLD}${server_ip}${NC}"
        DOMAIN="$server_ip"
      else
        printf "  Enter server IP: "
        read -r DOMAIN
      fi
      ;;
    *)
      printf "  Enter domain: "
      read -r DOMAIN
      [ -z "$DOMAIN" ] && fatal "Domain name is required."

      info "Verifying DNS for ${BOLD}${DOMAIN}${NC}..."
      local resolved_ip server_ip
      resolved_ip=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
      server_ip=$(get_server_ip)

      if [ -n "$resolved_ip" ] && [ -n "$server_ip" ]; then
        if [ "$resolved_ip" = "$server_ip" ]; then
          success "DNS verified: ${DOMAIN} -> ${resolved_ip}"
        else
          warn "DNS resolves to ${resolved_ip} but this server is ${server_ip}"
          printf "  Continue anyway? [y/N]: "
          read -r dns_continue
          echo "${dns_continue:-n}" | grep -qi '^y' || fatal "Fix DNS first."
        fi
      fi
      ;;
  esac

  echo ""
}

# ─── VPS: Security Options ──────────────────────────────────────────────────
prompt_security() {
  echo "  ${BOLD}Security Options${NC}"
  echo ""

  ENABLE_AUTH="no"
  info "Password protection disabled (app auth handles access control)"

  if command -v ufw &>/dev/null; then
    printf "  Firewall (UFW: allow SSH, HTTP, HTTPS only) ${DIM}[${NC}${GREEN}Y${NC}${DIM}/n]${NC}: "
    read -r fw_choice
    case "${fw_choice:-y}" in
      [nN]*) ENABLE_FIREWALL="no" ;;
      *) ENABLE_FIREWALL="yes" ;;
    esac
  else
    ENABLE_FIREWALL="no"
  fi

  echo ""
}

# ─── Integrations (Pipedream) ────────────────────────────────────────────────
prompt_integrations() {
  echo "  ${BOLD}Third-Party Integrations ${DIM}(optional)${NC}"
  echo "  ${DIM}Connect to 3,000+ apps via Pipedream Connect${NC}"
  echo ""
  printf "  Configure integrations? ${DIM}[y/${NC}${GREEN}N${NC}${DIM}]${NC}: "
  read -r integ_choice

  case "${integ_choice:-n}" in
    [yY]*)
      echo ""
      printf "    Pipedream Client ID: "
      read -r PIPEDREAM_CLIENT_ID
      printf "    Pipedream Client Secret: "
      read -r PIPEDREAM_CLIENT_SECRET
      printf "    Pipedream Project ID ${DIM}(e.g. proj_xxx)${NC}: "
      read -r PIPEDREAM_PROJECT_ID
      printf "    Pipedream Environment ${DIM}[production]${NC}: "
      read -r pd_env
      PIPEDREAM_ENVIRONMENT="${pd_env:-production}"

      if [ -n "$PIPEDREAM_CLIENT_ID" ] && [ -n "$PIPEDREAM_CLIENT_SECRET" ] && [ -n "$PIPEDREAM_PROJECT_ID" ]; then
        INTEGRATION_AUTH_PROVIDER="pipedream"
        success "Pipedream configured"
      else
        warn "Incomplete — integrations will not be available"
        INTEGRATION_AUTH_PROVIDER="disabled"
        PIPEDREAM_CLIENT_ID=""; PIPEDREAM_CLIENT_SECRET=""; PIPEDREAM_PROJECT_ID=""; PIPEDREAM_ENVIRONMENT=""
      fi
      ;;
    *)
      INTEGRATION_AUTH_PROVIDER="disabled"
      info "Skipping — add later in ${DIM}~/.kortix/.env${NC}"
      ;;
  esac

  echo ""
}

prompt_owner_account() {
  echo "  ${BOLD}Owner Account${NC}"
  echo "  ${DIM}The initial owner is created by the installer so the frontend can stay focused on sign-in and product onboarding.${NC}"
  echo ""

  if [ -z "$OWNER_EMAIL" ]; then
    printf "    Owner email: "
    read -r OWNER_EMAIL
  fi

  if [ -z "$OWNER_PASSWORD" ]; then
    while true; do
      printf "    Owner password: "
      if [ -t 0 ]; then stty -echo; fi
      read -r OWNER_PASSWORD
      if [ -t 0 ]; then stty echo; fi
      echo ""
      printf "    Confirm password: "
      if [ -t 0 ]; then stty -echo; fi
      read -r owner_password_confirm
      if [ -t 0 ]; then stty echo; fi
      echo ""
      if [ "$OWNER_PASSWORD" = "$owner_password_confirm" ]; then
        break
      fi
      warn "Passwords do not match. Please try again."
      OWNER_PASSWORD=""
    done
  fi

  [ -n "$OWNER_EMAIL" ] || fatal "Owner email is required."
  [ -n "$OWNER_PASSWORD" ] || fatal "Owner password is required."
  [ ${#OWNER_PASSWORD} -ge 6 ] || fatal "Owner password must be at least 6 characters."

  echo ""
}

# ─── Compute URLs ────────────────────────────────────────────────────────────
compute_urls() {
  if [ "$DEPLOY_MODE" = "vps" ]; then
    PUBLIC_URL="https://${DOMAIN}"
    API_PUBLIC_URL="https://${DOMAIN}"
  else
    PUBLIC_URL="http://localhost:13737"
    API_PUBLIC_URL="http://localhost:13738"
  fi
}

# ─── Generate Secrets ────────────────────────────────────────────────────────
generate_secrets() {
  info "Generating security credentials..."

  CRON_SECRET=$(generate_password)
  CHANNELS_CREDENTIAL_KEY=$(generate_token)
  INTERNAL_SERVICE_KEY=$(generate_token)
  API_KEY_SECRET=$(generate_token)

  if [ "$DEPLOY_MODE" = "vps" ] && [ "$ENABLE_AUTH" = "yes" ]; then
    ADMIN_PASSWORD=$(generate_password)
    success "Admin password generated"
  fi

  # Generate Supabase credentials for Docker mode
  if [ "$DB_MODE" = "docker" ]; then
    POSTGRES_PASSWORD=$(generate_token | head -c 32)
    SUPABASE_JWT_SECRET=$(generate_token)$(generate_token)  # 64 chars
    SUPABASE_ANON_KEY=$(generate_supabase_jwt "anon" "$SUPABASE_JWT_SECRET")
    SUPABASE_SERVICE_ROLE_KEY=$(generate_supabase_jwt "service_role" "$SUPABASE_JWT_SECRET")

    # Internal Supabase URL (kong gateway inside Docker network)
    SUPABASE_URL="http://supabase-kong:8000"
    DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres"

    success "Supabase credentials generated"
  fi

  success "All secrets generated"
  echo ""
}

# ─── Write Caddyfile (VPS mode) ─────────────────────────────────────────────
write_caddyfile() {
  local tls_config=""
  [ "$USE_IP_ONLY" = "yes" ] && tls_config="  tls internal"

  local auth_block=""
  if [ "$ENABLE_AUTH" = "yes" ]; then
    local hashed_pw
    hashed_pw=$(docker run --rm "$CADDY_IMAGE" caddy hash-password --plaintext "$ADMIN_PASSWORD" 2>/dev/null)
    auth_block="
    basic_auth {
      ${ADMIN_USER} ${hashed_pw}
    }"
  fi

  local global_block=""
  [ "$USE_IP_ONLY" = "yes" ] && global_block="{
  default_sni ${DOMAIN}
}

"

  cat > "$INSTALL_DIR/Caddyfile" << CADDYEOF
${global_block}${DOMAIN} {
${tls_config}

  handle /v1/* {
    reverse_proxy kortix-api:8008
  }
  handle /webhooks/* {
    reverse_proxy kortix-api:8008
  }
  handle /health {
    reverse_proxy kortix-api:8008
  }

  handle /auth/v1/* {
    reverse_proxy supabase-kong:8000
  }
  handle /rest/v1/* {
    reverse_proxy supabase-kong:8000
  }

  handle {${auth_block}
    reverse_proxy frontend:3000
  }
}
CADDYEOF

  success "Saved Caddyfile"
}

# ─── Write Kong Config ──────────────────────────────────────────────────────
write_kong_config() {
  [ "$DB_MODE" != "docker" ] && return

  mkdir -p "$INSTALL_DIR/volumes/api"
  cat > "$INSTALL_DIR/volumes/api/kong.yml" << 'KONGEOF'
_format_version: '2.1'
_transform: true

consumers:
  - username: anon
    keyauth_credentials:
      - key: $SUPABASE_ANON_KEY
  - username: service_role
    keyauth_credentials:
      - key: $SUPABASE_SERVICE_KEY

acls:
  - consumer: anon
    group: anon
  - consumer: service_role
    group: admin

services:
  ## Open Auth routes (no key required)
  - name: auth-v1-open
    url: http://supabase-auth:9999/verify
    routes:
      - name: auth-v1-open
        strip_path: true
        paths:
          - /auth/v1/verify
    plugins:
      - name: cors
  - name: auth-v1-open-callback
    url: http://supabase-auth:9999/callback
    routes:
      - name: auth-v1-open-callback
        strip_path: true
        paths:
          - /auth/v1/callback
    plugins:
      - name: cors
  - name: auth-v1-open-authorize
    url: http://supabase-auth:9999/authorize
    routes:
      - name: auth-v1-open-authorize
        strip_path: true
        paths:
          - /auth/v1/authorize
    plugins:
      - name: cors

  ## Secure Auth routes
  - name: auth-v1
    url: http://supabase-auth:9999/
    routes:
      - name: auth-v1-all
        strip_path: true
        paths:
          - /auth/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  ## Secure REST routes
  - name: rest-v1
    url: http://supabase-rest:3000/
    routes:
      - name: rest-v1-all
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon
KONGEOF

  success "Saved Kong config"
}

# ─── Write DB Init SQL ──────────────────────────────────────────────────────
write_db_init() {
  [ "$DB_MODE" != "docker" ] && return

  mkdir -p "$INSTALL_DIR/volumes/db"

  # Roles init (required for GoTrue + PostgREST)
  cat > "$INSTALL_DIR/volumes/db/roles.sql" << 'ROLESEOF'
-- Supabase roles required by GoTrue and PostgREST
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN NOINHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
  END IF;
END
$$;

-- Grant roles
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT supabase_auth_admin TO authenticator;
GRANT supabase_admin TO postgres;

-- Auth schema
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres;
ALTER ROLE supabase_auth_admin SET search_path = 'auth';

-- Set passwords (will be replaced by entrypoint)
ALTER ROLE supabase_auth_admin WITH PASSWORD 'POSTGRES_PASSWORD_PLACEHOLDER';
ALTER ROLE authenticator WITH PASSWORD 'POSTGRES_PASSWORD_PLACEHOLDER';
ALTER ROLE supabase_admin WITH PASSWORD 'POSTGRES_PASSWORD_PLACEHOLDER';
ROLESEOF

  # Kortix extensions and schemas
  cat > "$INSTALL_DIR/volumes/db/kortix.sql" << 'KORTIXEOF'
-- Kortix bootstrap: extensions and schemas
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS kortix;
CREATE SCHEMA IF NOT EXISTS basejump;

-- Scheduler helper (pg_cron → tick endpoint)
CREATE OR REPLACE FUNCTION kortix.configure_scheduler(api_url TEXT, tick_secret TEXT)
RETURNS void AS $$
BEGIN
  PERFORM cron.unschedule('kortix_global_tick')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kortix_global_tick');
  PERFORM cron.schedule(
    'kortix_global_tick',
    '* * * * *',
    format(
      'SELECT net.http_post(url := %L, headers := ''{"Content-Type": "application/json", "x-cron-secret": "%s"}''::jsonb, body := ''{"source": "pg_cron"}''::jsonb, timeout_milliseconds := 30000)',
      api_url || '/v1/cron/tick',
      tick_secret
    )
  );
END;
$$ LANGUAGE plpgsql;

-- PostgREST needs these grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
KORTIXEOF

  success "Saved DB init scripts"
}

# ─── Write docker-compose.yml ───────────────────────────────────────────────
write_compose() {
  info "Writing docker-compose.yml..."

  # Port bindings
  local frontend_ports api_ports supabase_ports db_ports
  if [ "$DEPLOY_MODE" = "vps" ]; then
    frontend_ports='    expose:
      - "3000"'
    api_ports='    expose:
      - "8008"'
    supabase_ports='    expose:
      - "8000"'
  else
    frontend_ports='    ports:
      - "13737:3000"'
    api_ports='    ports:
      - "13738:8008"'
    supabase_ports='    ports:
      - "13740:8000"'
    db_ports='    ports:
      - "13741:5432"'
  fi

  # Caddy service (VPS only)
  local caddy_service=""
  if [ "$DEPLOY_MODE" = "vps" ]; then
    caddy_service="
  caddy:
    image: ${CADDY_IMAGE}
    ports:
      - \"80:80\"
      - \"443:443\"
      - \"443:443/udp\"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - frontend
      - kortix-api
    restart: unless-stopped
"
  fi

  local caddy_volumes=""
  if [ "$DEPLOY_MODE" = "vps" ]; then
    caddy_volumes="  caddy-data:
  caddy-config:"
  fi

  # Supabase services (Docker mode only)
  local supabase_services="" supabase_volumes="" api_depends frontend_supabase_env
  local supabase_url_env supabase_db_env

  if [ "$DB_MODE" = "docker" ]; then
    supabase_services="
  supabase-db:
    image: ${SUPABASE_POSTGRES_IMAGE}
${db_ports}
    volumes:
      - supabase-db-data:/var/lib/postgresql/data
      - ./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:Z
      - ./volumes/db/kortix.sql:/docker-entrypoint-initdb.d/init-scripts/99-kortix.sql:Z
    environment:
      POSTGRES_HOST: /var/run/postgresql
      POSTGRES_PORT: \"5432\"
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: postgres
      JWT_SECRET: \${SUPABASE_JWT_SECRET}
      JWT_EXP: \"3600\"
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
      - -c
      - log_min_messages=fatal
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U postgres -h localhost\"]
      interval: 5s
      timeout: 3s
      retries: 15
      start_period: 10s
    restart: unless-stopped

  supabase-auth:
    image: ${SUPABASE_GOTRUE_IMAGE}
    depends_on:
      supabase-db:
        condition: service_healthy
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: \"9999\"
      API_EXTERNAL_URL: \${SUPABASE_PUBLIC_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:\${POSTGRES_PASSWORD}@supabase-db:5432/postgres
      GOTRUE_SITE_URL: \${PUBLIC_URL}
      GOTRUE_URI_ALLOW_LIST: \"\"
      GOTRUE_DISABLE_SIGNUP: \"false\"
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: \"3600\"
      GOTRUE_JWT_SECRET: \${SUPABASE_JWT_SECRET}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: \"true\"
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: \"false\"
      GOTRUE_MAILER_AUTOCONFIRM: \"true\"
      GOTRUE_SMTP_ADMIN_EMAIL: admin@localhost
      GOTRUE_SMTP_HOST: localhost
      GOTRUE_SMTP_PORT: \"587\"
      GOTRUE_SMTP_USER: unused
      GOTRUE_SMTP_PASS: unused
      GOTRUE_SMTP_SENDER_NAME: Kortix
      GOTRUE_MAILER_URLPATHS_INVITE: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_RECOVERY: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: /auth/v1/verify
    healthcheck:
      test: [\"CMD\", \"wget\", \"--no-verbose\", \"--tries=1\", \"--spider\", \"http://localhost:9999/health\"]
      timeout: 5s
      interval: 5s
      retries: 3
    restart: unless-stopped

  supabase-rest:
    image: ${SUPABASE_REST_IMAGE}
    depends_on:
      supabase-db:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgres://authenticator:\${POSTGRES_PASSWORD}@supabase-db:5432/postgres
      PGRST_DB_SCHEMAS: public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: \${SUPABASE_JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: \"false\"
      PGRST_APP_SETTINGS_JWT_SECRET: \${SUPABASE_JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: \"3600\"
    command: [\"postgrest\"]
    restart: unless-stopped

  supabase-kong:
    image: ${SUPABASE_KONG_IMAGE}
${supabase_ports}
    volumes:
      - ./volumes/api/kong.yml:/home/kong/temp.yml:ro
    depends_on:
      supabase-auth:
        condition: service_healthy
    environment:
      KONG_DATABASE: \"off\"
      KONG_DECLARATIVE_CONFIG: /home/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth
      KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: 160k
      KONG_NGINX_PROXY_PROXY_BUFFERS: 64 160k
      SUPABASE_ANON_KEY: \${SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_KEY: \${SUPABASE_SERVICE_ROLE_KEY}
    entrypoint: bash -c 'eval \"echo \\\"\$\$(cat ~/temp.yml)\\\"\" > ~/kong.yml && /docker-entrypoint.sh kong docker-start'
    restart: unless-stopped
"
    supabase_volumes="  supabase-db-data:"

    api_depends="    depends_on:
      supabase-db:
        condition: service_healthy
      supabase-auth:
        condition: service_healthy"

    # Frontend env vars for Supabase connection.
    #
    # CRITICAL: The server-side SUPABASE_URL MUST match the client-side
    # NEXT_PUBLIC_SUPABASE_URL. The @supabase/ssr library derives cookie
    # names from the URL hostname. If server uses "supabase-kong" but client
    # uses "152.53.134.91", the cookie names won't match and auth breaks
    # (redirect loop after sign-in).
    #
    # In VPS mode, both use the public HTTPS URL. NODE_TLS_REJECT_UNAUTHORIZED=0
    # is needed because the server-side calls go through Caddy's self-signed cert
    # (when using IP-only mode without a real domain).
    #
    # In local mode, both use http://localhost:13740 (Kong exposed on host).
    # The frontend container uses extra_hosts to resolve localhost to the host.
    if [ "$DEPLOY_MODE" = "local" ]; then
      frontend_supabase_env="      - NEXT_PUBLIC_SUPABASE_URL=http://localhost:13740
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - SUPABASE_URL=http://localhost:13740
      - SUPABASE_SERVER_URL=http://supabase-kong:8000
      - SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - BACKEND_URL=http://kortix-api:8008/v1"
    else
      frontend_supabase_env="      - NEXT_PUBLIC_SUPABASE_URL=\${SUPABASE_PUBLIC_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - SUPABASE_URL=\${SUPABASE_PUBLIC_URL}
      - SUPABASE_SERVER_URL=http://supabase-kong:8000
      - SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - BACKEND_URL=http://kortix-api:8008/v1
      - NODE_TLS_REJECT_UNAUTHORIZED=0"
    fi

    supabase_url_env="      - SUPABASE_URL=http://supabase-kong:8000"
    supabase_db_env="      - DATABASE_URL=postgresql://postgres:\${POSTGRES_PASSWORD}@supabase-db:5432/postgres"

  else
    # External mode — no Supabase containers
    api_depends="    # External Supabase — no local dependencies"
    frontend_supabase_env="      - NEXT_PUBLIC_SUPABASE_URL=\${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - SUPABASE_URL=\${SUPABASE_URL}
      - SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - BACKEND_URL=http://kortix-api:8008/v1"
    supabase_url_env="      - SUPABASE_URL=\${SUPABASE_URL}"
    supabase_db_env="      - DATABASE_URL=\${DATABASE_URL}"
  fi

  cat > "$INSTALL_DIR/docker-compose.yml" << COMPOSE
# Kortix — auto-generated by get-kortix.sh
# Mode: ${DEPLOY_MODE} | Database: ${DB_MODE}
services:
${supabase_services}
${caddy_service}
  frontend:
    image: ${FRONTEND_IMAGE}
${frontend_ports}
    extra_hosts:
      - "localhost:host-gateway"
    environment:
${frontend_supabase_env}
      - NEXT_PUBLIC_BACKEND_URL=\${API_PUBLIC_URL}/v1
      - NEXT_PUBLIC_BILLING_ENABLED=false
    depends_on:
      kortix-api:
        condition: service_started
    restart: unless-stopped

  kortix-api:
    image: ${API_IMAGE}
    user: "0:0"
${api_ports}
    environment:
      - PORT=8008
${supabase_url_env}
${supabase_db_env}
      - SUPABASE_SERVICE_ROLE_KEY=\${SUPABASE_SERVICE_ROLE_KEY}
      - ALLOWED_SANDBOX_PROVIDERS=local_docker
      - KORTIX_LOCAL_IMAGES=\${KORTIX_LOCAL_IMAGES}
      - DOCKER_HOST=unix:///var/run/docker.sock
      - KORTIX_URL=http://kortix-api:8008/v1/router
      - SANDBOX_NETWORK=${SANDBOX_NETWORK}
      - INTERNAL_SERVICE_KEY=\${INTERNAL_SERVICE_KEY}
      - FRONTEND_URL=\${PUBLIC_URL}
      - CHANNELS_PUBLIC_URL=\${API_PUBLIC_URL}
      - CHANNELS_CREDENTIAL_KEY=\${CHANNELS_CREDENTIAL_KEY}
      - API_KEY_SECRET=\${API_KEY_SECRET}
      - CORS_ALLOWED_ORIGINS=\${PUBLIC_URL}
      - SANDBOX_IMAGE=\${SANDBOX_IMAGE}
      - SANDBOX_VERSION=\${KORTIX_VERSION}
      - KORTIX_ROUTER_INTERNAL_ENABLED=false
      - KORTIX_BILLING_INTERNAL_ENABLED=false
    env_file:
      - .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
${api_depends}
    restart: unless-stopped

volumes:
${supabase_volumes}
${caddy_volumes}
COMPOSE

  success "Saved docker-compose.yml"
}

# ─── Write .env ──────────────────────────────────────────────────────────────
write_env() {
  cat > "$INSTALL_DIR/.env" << ENVEOF
# ──────────────────────────────────────────────────────────────────────────────
# Kortix — Environment Configuration
# Auto-generated by get-kortix.sh on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# ──────────────────────────────────────────────────────────────────────────────

# ─── Mode ────────────────────────────────────────────────────────────────────
DEPLOY_MODE=${DEPLOY_MODE}
DB_MODE=${DB_MODE}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
KORTIX_LOCAL_IMAGES=${KORTIX_LOCAL_IMAGES}
KORTIX_LOCAL_TAG=${KORTIX_LOCAL_TAG}
KORTIX_LOCAL_REPO_ROOT=${KORTIX_LOCAL_REPO_ROOT}

# ─── URLs ────────────────────────────────────────────────────────────────────
PUBLIC_URL=${PUBLIC_URL}
API_PUBLIC_URL=${API_PUBLIC_URL}
SUPABASE_PUBLIC_URL=${SUPABASE_PUBLIC_URL:-http://localhost:13740}

# ─── Supabase ────────────────────────────────────────────────────────────────
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# ─── Security ────────────────────────────────────────────────────────────────
INTERNAL_SERVICE_KEY=${INTERNAL_SERVICE_KEY}
CHANNELS_CREDENTIAL_KEY=${CHANNELS_CREDENTIAL_KEY}
API_KEY_SECRET=${API_KEY_SECRET}

# ─── Integrations (Pipedream) ────────────────────────────────────────────────
INTEGRATION_AUTH_PROVIDER=${INTEGRATION_AUTH_PROVIDER}
PIPEDREAM_CLIENT_ID=${PIPEDREAM_CLIENT_ID}
PIPEDREAM_CLIENT_SECRET=${PIPEDREAM_CLIENT_SECRET}
PIPEDREAM_PROJECT_ID=${PIPEDREAM_PROJECT_ID}
PIPEDREAM_ENVIRONMENT=${PIPEDREAM_ENVIRONMENT:-production}

# ─── Channels (Slack) ───────────────────────────────────────────────────────
SLACK_CLIENT_ID=${SLACK_CLIENT_ID}
SLACK_CLIENT_SECRET=${SLACK_CLIENT_SECRET}
SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET}

# ─── Sandbox ─────────────────────────────────────────────────────────────────
KORTIX_VERSION=${KORTIX_VERSION}
SANDBOX_IMAGE=${SANDBOX_IMAGE}
SANDBOX_NETWORK=${SANDBOX_NETWORK}
KORTIX_SANDBOX_VERSION=${KORTIX_VERSION}
ENVEOF

  chmod 600 "$INSTALL_DIR/.env"
  success "Saved .env"
}

write_dev_env_files() {
  local api_port="8008"
  local host_supabase_url="${SUPABASE_URL}"
  local host_database_url="${DATABASE_URL}"
  local host_docker_host="${DOCKER_HOST:-}"
  local host_sandbox_network="${SANDBOX_NETWORK}"
  if [ "$DEPLOY_MODE" = "local" ]; then
    api_port="13738"
    host_supabase_url="http://localhost:13740"
    host_database_url="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:13741/postgres"
    host_docker_host="$(get_host_docker_socket)"
  fi

  cat > "$INSTALL_DIR/.api-dev.env" << ENVEOF
PORT=${api_port}
SUPABASE_URL=${host_supabase_url}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
DATABASE_URL=${host_database_url}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DOCKER_HOST=${host_docker_host}
ALLOWED_SANDBOX_PROVIDERS=local_docker
KORTIX_LOCAL_IMAGES=${KORTIX_LOCAL_IMAGES}
KORTIX_URL=${API_PUBLIC_URL}/v1/router
SANDBOX_NETWORK=${host_sandbox_network}
INTERNAL_SERVICE_KEY=${INTERNAL_SERVICE_KEY}
ENVEOF

  cat > "$INSTALL_DIR/.frontend-dev.env" << ENVEOF
NEXT_PUBLIC_ENV_MODE=local
NEXT_PUBLIC_BACKEND_URL=${API_PUBLIC_URL}/v1
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_PUBLIC_URL:-http://localhost:13740}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
NEXT_PUBLIC_BILLING_ENABLED=false
ENVEOF

  chmod 600 "$INSTALL_DIR/.api-dev.env" "$INSTALL_DIR/.frontend-dev.env"
  success "Saved dev env files"
}

# ─── Write credentials file (VPS mode) ──────────────────────────────────────
write_credentials() {
  if [ -n "$OWNER_EMAIL" ] && [ -n "$OWNER_PASSWORD" ]; then
    cat > "$INSTALL_DIR/.credentials" << CREDEOF
# Kortix — Initial Credentials
# Generated on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
URL: ${PUBLIC_URL}
Email: ${OWNER_EMAIL}
Password: ${OWNER_PASSWORD}
CREDEOF
    chmod 600 "$INSTALL_DIR/.credentials"
  fi

  [ "$DEPLOY_MODE" != "vps" ] || [ "$ENABLE_AUTH" != "yes" ] && return 0

  cat >> "$INSTALL_DIR/.credentials" << CREDEOF
# Kortix — Admin Credentials
# Generated on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
URL: https://${DOMAIN}
Username: ${ADMIN_USER}
Password: ${ADMIN_PASSWORD}
CREDEOF

  chmod 600 "$INSTALL_DIR/.credentials"
}

# ─── Fixup DB init SQL (replace password placeholder) ───────────────────────
fixup_db_init() {
  [ "$DB_MODE" != "docker" ] && return
  # Replace placeholder with actual password in roles.sql
  if [ -f "$INSTALL_DIR/volumes/db/roles.sql" ]; then
    sed -i.bak "s/POSTGRES_PASSWORD_PLACEHOLDER/${POSTGRES_PASSWORD}/g" "$INSTALL_DIR/volumes/db/roles.sql"
    rm -f "$INSTALL_DIR/volumes/db/roles.sql.bak"
  fi
}

bootstrap_owner_account() {
  local bootstrap_url="${API_PUBLIC_URL}/v1/setup/bootstrap-owner"
  info "Creating initial owner account..."

  local payload response success_val message attempts=0
  payload=$(OWNER_EMAIL_VALUE="$OWNER_EMAIL" OWNER_PASSWORD_VALUE="$OWNER_PASSWORD" python3 - <<'PY'
import json, os
print(json.dumps({
  "email": os.environ.get("OWNER_EMAIL_VALUE", ""),
  "password": os.environ.get("OWNER_PASSWORD_VALUE", ""),
}))
PY
)

  while [ $attempts -lt 30 ]; do
    response=$(curl -sf -X POST "$bootstrap_url" -H 'Content-Type: application/json' -d "$payload" 2>/dev/null || true)
    if [ -n "$response" ]; then
      break
    fi
    sleep 2
    attempts=$((attempts + 1))
  done

  if [ -z "$response" ]; then
    warn "Could not reach API for owner bootstrap — frontend will handle signup"
    return 0
  fi
  
  success_val=$(JSON_RESPONSE="$response" python3 -c 'import json, os; data=json.loads(os.environ.get("JSON_RESPONSE") or "{}"); print("true" if data.get("success") else "false")')
  message=$(JSON_RESPONSE="$response" python3 -c 'import json, os; data=json.loads(os.environ.get("JSON_RESPONSE") or "{}"); print(data.get("error") or data.get("message") or "")')

  if [ "$success_val" != "true" ]; then
    warn "Owner bootstrap skipped: ${message:-unknown error}"
    return 0
  fi

  success "Initial owner account is ready"
}

wait_for_http() {
  local url="$1"
  local max_attempts="${2:-120}"
  local attempts=0
  while [ $attempts -lt $max_attempts ]; do
    curl -sf "$url" >/dev/null 2>&1 && return 0
    sleep 2
    attempts=$((attempts + 1))
  done
  return 1
}


# ─── Write CLI ───────────────────────────────────────────────────────────────
write_cli() {
  cat > "$INSTALL_DIR/kortix" << 'CLIPATH'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

G=$'\033[0;32m'; R=$'\033[0;31m'; C=$'\033[0;36m'; Y=$'\033[1;33m'
B=$'\033[1m'; D=$'\033[2m'; N=$'\033[0m'
# Installed release metadata is persisted in .env so updates stay pinned.
VERSION=$(grep -m1 '^KORTIX_VERSION=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "unknown")
SANDBOX_IMAGE=$(grep -m1 '^SANDBOX_IMAGE=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "kortix/computer:${VERSION}")
LOCAL_IMAGES=$(grep -m1 '^KORTIX_LOCAL_IMAGES=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "0")
LOCAL_TAG=$(grep -m1 '^KORTIX_LOCAL_TAG=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "latest")
LOCAL_REPO_ROOT=$(grep -m1 '^KORTIX_LOCAL_REPO_ROOT=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "")

_open() {
  if command -v open &>/dev/null; then open "$1" 2>/dev/null
  elif command -v xdg-open &>/dev/null; then xdg-open "$1" 2>/dev/null
  elif command -v wslview &>/dev/null; then wslview "$1" 2>/dev/null
  fi
}

_url() {
  if [ -f "$DIR/.env" ]; then
    grep -m1 '^PUBLIC_URL=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "http://localhost:13737"
  else
    echo "http://localhost:13737"
  fi
}

_mode() {
  if [ -f "$DIR/.env" ]; then
    grep -m1 '^DEPLOY_MODE=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "local"
  else
    echo "local"
  fi
}

_project_name() {
  if [ -f "$DIR/.env" ]; then
    grep -m1 '^COMPOSE_PROJECT_NAME=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "kortix"
  else
    echo "kortix"
  fi
}

# Free ports used by Kortix (local mode)
_free_kortix_ports() {
  local project_name
  project_name=$(_project_name)
  local ports=(13737 13738 13740 13741)
  local freed=0

  # Clean up any lingering containers from this project
  docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${project_name}-" | xargs -r docker rm -f 2>/dev/null || true

  # Kill any processes using the ports
  for port in "${ports[@]}"; do
    local pid
    pid=$(lsof -t -i:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill -9 $pid 2>/dev/null || true
      freed=1
    fi
  done

  [ $freed -eq 1 ] && echo "  ${Y}Freed Kortix ports${N}" || true
}

_sync_supabase_passwords() {
  [ -f "$DIR/.env" ] || return 0

  local db_mode db_password escaped_password attempts
  db_mode=$(grep -m1 '^DB_MODE=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "")
  [ "$db_mode" = "docker" ] || return 0

  db_password=$(grep -m1 '^POSTGRES_PASSWORD=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "")
  [ -n "$db_password" ] || return 0

  escaped_password=${db_password//\'/\'\'}

  docker compose up -d supabase-db >/dev/null 2>&1 || return 0

  attempts=0
  until docker compose exec -T supabase-db sh -lc 'pg_isready -U postgres -h localhost >/dev/null 2>&1'; do
    attempts=$((attempts + 1))
    [ $attempts -ge 30 ] && return 0
    sleep 1
  done

  printf "SET ROLE supabase_admin;\nALTER ROLE supabase_auth_admin WITH PASSWORD '%s';\nALTER ROLE authenticator WITH PASSWORD '%s';\nALTER ROLE supabase_admin WITH PASSWORD '%s';\n" \
    "$escaped_password" "$escaped_password" "$escaped_password" \
    | docker compose exec -T supabase-db sh -lc 'psql -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null' >/dev/null 2>&1 || true
}

_using_local_images() {
  [ "$LOCAL_IMAGES" = "1" ]
}

_rebuild_local_images() {
  [ -n "$LOCAL_REPO_ROOT" ] || { echo "  ${R}KORTIX_LOCAL_REPO_ROOT is not set${N}"; exit 1; }
  local build_script="$LOCAL_REPO_ROOT/scripts/build-local-images.sh"
  [ -f "$build_script" ] || { echo "  ${R}Build script not found: ${build_script}${N}"; exit 1; }
  bash "$build_script" --tag "$LOCAL_TAG"
}

case "${1:-help}" in
  start)
    # Free ports and clean up lingering containers before starting
    [ "$(_mode)" = "local" ] && _free_kortix_ports
    _sync_supabase_passwords
    if [ "$(_mode)" = "vps" ]; then
      docker compose --profile vps up -d || true
    else
      docker compose up -d || true
    fi
    echo ""
    echo "  ${G}Kortix is running!${N}"
    echo "  Dashboard: ${B}$(_url)${N}"
    [ -f "$DIR/.credentials" ] && echo "  ${D}Credentials in: ${DIR}/.credentials${N}"
    echo ""
    ;;
  stop)
    docker compose --profile vps down 2>/dev/null || docker compose down
    docker stop kortix-sandbox 2>/dev/null || true
    echo "  ${G}Stopped.${N}"
    ;;
  restart)
    docker compose --profile vps down 2>/dev/null || docker compose down 2>/dev/null || true
    # Free ports and clean up lingering containers before restarting
    [ "$(_mode)" = "local" ] && _free_kortix_ports
    _sync_supabase_passwords
    if [ "$(_mode)" = "vps" ]; then
      docker compose --profile vps up -d || true
    else
      docker compose up -d || true
    fi
    echo "  ${G}Restarted.${N}"
    ;;
  logs)
    shift
    docker compose logs -f "$@"
    ;;
  status)
    docker compose ps
    ;;
  setup)
    echo "  ${C}Opening sign-in in browser...${N}"
    _open "$(_url)/auth"
    echo "  ${D}If it didn't open: ${B}$(_url)/auth${N}"
    ;;
  update)
    shift
    if [ "${1:-}" = "--build-local" ]; then
      _rebuild_local_images
    fi
    if _using_local_images; then
      echo "  ${C}Using local Docker images from compose config...${N}"
    else
      echo "  ${C}Pulling configured release images in parallel...${N}"
      docker compose config --images | python3 -c 'import sys; print("\n".join(sorted(set(line.strip() for line in sys.stdin if line.strip()))))' | xargs -r -n1 -P 4 docker pull
    fi
    echo ""
    echo "  ${C}Restarting services...${N}"
    # Free ports and clean up lingering containers before updating
    [ "$(_mode)" = "local" ] && _free_kortix_ports
    _sync_supabase_passwords
    docker compose down 2>/dev/null || true
    docker compose up -d || true
    echo "  ${G}Updated.${N}"
    ;;
  credentials)
    [ -f "$DIR/.credentials" ] && cat "$DIR/.credentials" || echo "  ${D}No credentials (local mode or auth disabled)${N}"
    ;;
  uninstall)
    echo "  ${C}Stopping services...${N}"
    docker compose --profile vps down 2>/dev/null || docker compose down 2>/dev/null || true
    printf "  Delete all data (Docker volumes)? [y/N]: "
    read -r del_volumes
    echo "$del_volumes" | grep -qi '^y' && {
      docker compose --profile vps down -v 2>/dev/null || docker compose down -v 2>/dev/null || true
      docker rm -f kortix-sandbox 2>/dev/null || true
      echo "  ${G}Volumes removed.${N}"
    }
    [ -L "/usr/local/bin/kortix" ] && rm -f /usr/local/bin/kortix 2>/dev/null || true
    rm -rf "$DIR"
    echo "  ${G}Uninstalled.${N}"
    ;;
  open)
    _open "$(_url)"
    ;;
  version)
    echo "  kortix ${VERSION}"
    ;;
  *)
    echo ""
    echo "  ${B}${C}Kortix CLI${N} ${D}v${VERSION}${N}"
    echo ""
    echo "  ${C}start${N}         Start all services"
    echo "  ${C}stop${N}          Stop all services"
    echo "  ${C}restart${N}       Restart all services"
    echo "  ${C}logs${N}          Tail logs (kortix logs sandbox)"
    echo "  ${C}status${N}        Show service status"
    echo "  ${C}setup${N}         Open sign-in page"
    echo "  ${C}update${N}        Update to the configured release"
    echo "  ${C}credentials${N}   Show admin credentials (VPS mode)"
    echo "  ${C}uninstall${N}     Remove Kortix completely"
    echo "  ${C}version${N}       Show version"
    echo ""
    ;;
 esac
CLIPATH

  chmod +x "$INSTALL_DIR/kortix"
}

# ─── Add to PATH ─────────────────────────────────────────────────────────────
setup_path() {
  if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
    ln -sf "$INSTALL_DIR/kortix" /usr/local/bin/kortix 2>/dev/null && {
      success "Linked 'kortix' -> /usr/local/bin/kortix"
      return
    }
  fi

  local shell_rc=""
  case "${SHELL:-}" in
    */zsh)  shell_rc="$HOME/.zshrc" ;;
    */bash) shell_rc="$HOME/.bashrc" ;;
    *)      shell_rc="$HOME/.profile" ;;
  esac

  if [ -f "$shell_rc" ] && grep -q "$INSTALL_DIR" "$shell_rc" 2>/dev/null; then
    return
  fi

  echo "" >> "$shell_rc"
  echo "# Kortix CLI" >> "$shell_rc"
  echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$shell_rc"
  success "Added 'kortix' to PATH (restart terminal or: source $shell_rc)"
}

# ─── Firewall (VPS) ─────────────────────────────────────────────────────────
setup_firewall() {
  [ "$ENABLE_FIREWALL" != "yes" ] && return
  ufw default deny incoming 2>/dev/null || true
  ufw default allow outgoing 2>/dev/null || true
  ufw allow 22/tcp 2>/dev/null || true
  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  echo "y" | ufw enable 2>/dev/null || true
  success "Firewall configured (SSH + HTTP + HTTPS only)"
}

# ─── Pull & Start ───────────────────────────────────────────────────────────
pull_and_start() {
  echo ""
  cd "$INSTALL_DIR"

  if [ "$KORTIX_LOCAL_IMAGES" = "1" ]; then
    if [ "$KORTIX_BUILD_LOCAL_IMAGES" = "1" ]; then
      rebuild_local_images
      echo ""
    fi
    info "Using local Docker images (skip registry pulls)..."
    verify_local_image "$FRONTEND_IMAGE"
    verify_local_image "$API_IMAGE"
    verify_local_image "$SANDBOX_IMAGE"
    success "Local installer images found"
  else
    info "Pulling Docker images in parallel..."
    echo ""
    local -a images_to_pull=("$FRONTEND_IMAGE" "$API_IMAGE" "$SANDBOX_IMAGE")
    if [ "$DB_MODE" = "docker" ]; then
      images_to_pull+=("$SUPABASE_POSTGRES_IMAGE" "$SUPABASE_GOTRUE_IMAGE" "$SUPABASE_REST_IMAGE" "$SUPABASE_KONG_IMAGE")
    fi
    if [ "$DEPLOY_MODE" = "vps" ]; then
      images_to_pull+=("$CADDY_IMAGE")
    fi
    pull_images_parallel "${images_to_pull[@]}"
    success "Docker images ready"
  fi

  echo ""
  info "Starting Kortix..."
  echo ""

  # Free ports in local mode to avoid conflicts
  free_kortix_ports

  if [ "$DEPLOY_MODE" = "vps" ]; then
    docker compose --profile vps up -d || true
  else
    docker compose up -d || true
  fi

  # Wait for frontend
  local attempts=0 check_url max_wait
  if [ "$DEPLOY_MODE" = "vps" ]; then
    check_url="https://${DOMAIN}"
    max_wait=45
  else
    check_url="http://localhost:13737"
    max_wait=30
  fi

  info "Waiting for services..."
  while [ $attempts -lt $max_wait ]; do
    curl -sf -k "${check_url}" >/dev/null 2>&1 && break
    sleep 2
    attempts=$((attempts + 1))
  done

  echo ""
  echo "  ${BOLD}${GREEN}Kortix is running!${NC}"
  echo ""
  echo "  ${CYAN}Dashboard:${NC}  ${BOLD}${PUBLIC_URL}${NC}"
  echo "  ${CYAN}API:${NC}        ${BOLD}${API_PUBLIC_URL}${NC}"
  echo ""
  bootstrap_owner_account

  if [ "$DEPLOY_MODE" = "local" ]; then
    echo ""
    warm_local_sandbox
  fi

  if [ "$DEPLOY_MODE" = "vps" ] && [ "$ENABLE_AUTH" = "yes" ]; then
    echo ""
    echo "  ${CYAN}Username:${NC}   ${BOLD}${ADMIN_USER}${NC}"
    echo "  ${CYAN}Password:${NC}   ${BOLD}${ADMIN_PASSWORD}${NC}"
    echo ""
    echo "  ${YELLOW}Save these credentials.${NC}"
    echo "  ${DIM}(Also saved to ${INSTALL_DIR}/.credentials)${NC}"
  fi

  if [ "$DEPLOY_MODE" = "local" ]; then
    echo ""
    info "Opening sign-in page..."
    open_browser "${PUBLIC_URL}/auth"
  fi

  echo ""
  echo "  ${BOLD}Next:${NC} Sign in with the owner account below."
  echo "  ${CYAN}Owner Email:${NC}    ${BOLD}${OWNER_EMAIL}${NC}"
  echo "  ${CYAN}Owner Password:${NC} ${BOLD}${OWNER_PASSWORD}${NC}"

  echo ""
  echo "  ${DIM}Commands:${NC}"
  echo "    ${CYAN}kortix start${NC}    Start services"
  echo "    ${CYAN}kortix stop${NC}     Stop services"
  echo "    ${CYAN}kortix setup${NC}    Open sign-in page"
  echo "    ${CYAN}kortix update${NC}   Update to the configured release"
  echo "    ${CYAN}kortix logs${NC}     Tail logs"
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  banner
  preflight

  # Clean up any stale Docker volumes from a previous install that was
  # manually removed (rm -rf ~/.kortix) without running `docker compose down -v`.
  # Without this, fresh installs reuse old Postgres data with old passwords,
  # causing supabase-auth to fail with SASL auth errors.
  if [ ! -f "$INSTALL_DIR/docker-compose.yml" ]; then
    docker volume rm kortix_supabase-db-data 2>/dev/null || true
    docker rm -f kortix-sandbox 2>/dev/null || true
    docker volume rm kortix-sandbox-data 2>/dev/null || true
  fi

  # Existing install?
  if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    warn "Existing installation found at $INSTALL_DIR"
    printf "  Reinstall? [y/N]: "
    read -r answer
    if [ -z "$answer" ] || ! echo "$answer" | grep -qi '^y'; then
      info "Starting existing installation..."
      cd "$INSTALL_DIR"
      local existing_mode
      existing_mode=$(grep -m1 '^DEPLOY_MODE=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2- || echo "local")
      if [ "$existing_mode" = "vps" ]; then
        docker compose --profile vps up -d
      else
        docker compose up -d
      fi
      echo ""
      success "Kortix is running!"
      local existing_url
      existing_url=$(grep -m1 '^PUBLIC_URL=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2- || echo "http://localhost:13737")
      echo "  Dashboard: ${BOLD}${existing_url}${NC}"
      echo ""
      exit 0
    fi
    info "Stopping old services..."
    cd "$INSTALL_DIR"
    # Down with -v to remove volumes (especially supabase-db-data).
    # Without this, old Postgres data retains old passwords while the
    # installer generates new ones, causing supabase-auth to fail with
    # "password authentication failed for user supabase_auth_admin".
    docker compose --profile vps down -v 2>/dev/null || docker compose down -v 2>/dev/null || true
    docker rm -f kortix-sandbox 2>/dev/null || true
    # Also remove any leftover named volumes from previous installs
    docker volume rm kortix_supabase-db-data 2>/dev/null || true
    docker volume rm supabase_db_kortix-local 2>/dev/null || true
    docker volume rm kortix-sandbox-data 2>/dev/null || true
    echo ""
  fi

  # ─── Interactive setup ──────────────────────────────────────────────────
  prompt_mode
  prompt_database

  if [ "$DEPLOY_MODE" = "vps" ]; then
    prompt_domain
    prompt_security
  fi

  compute_urls

  # Set SUPABASE_PUBLIC_URL for Docker mode
  if [ "$DB_MODE" = "docker" ]; then
    if [ "$DEPLOY_MODE" = "local" ]; then
      SUPABASE_PUBLIC_URL="http://localhost:13740"
    else
      # VPS: Kong is internal, GoTrue uses the Caddy public URL
      SUPABASE_PUBLIC_URL="https://${DOMAIN}"
    fi
  fi

  prompt_owner_account

  echo "  ${BOLD}What gets installed:${NC}"
  echo ""
  if [ "$DEPLOY_MODE" = "vps" ]; then
    echo "    ${CYAN}Caddy${NC}        ${DIM}HTTPS reverse proxy${NC}"
    echo "      ${DIM}|${NC}"
  fi
  if [ "$DB_MODE" = "docker" ]; then
    echo "    ${CYAN}Frontend${NC}  -> ${CYAN}API${NC}  -> ${CYAN}Sandbox${NC}"
    echo "    ${DIM}Dashboard    Router   AI Agent${NC}"
    echo "                 ${DIM}|${NC}"
    echo "            ${CYAN}Supabase${NC} ${DIM}(DB + Auth + REST)${NC}"
  else
    echo "    ${CYAN}Frontend${NC}  -> ${CYAN}API${NC}  -> ${CYAN}Sandbox${NC}"
    echo "    ${DIM}Dashboard    Router   AI Agent${NC}"
    echo "                 ${DIM}|${NC}"
    echo "          ${CYAN}External DB${NC} ${DIM}(your Supabase)${NC}"
  fi
  echo ""

  prompt_integrations
  generate_secrets
  resolve_release_images

  mkdir -p "$INSTALL_DIR"

  write_kong_config
  write_db_init
  fixup_db_init
  write_compose
  write_env
  write_dev_env_files
  write_credentials

  if [ "$DEPLOY_MODE" = "vps" ]; then
    write_caddyfile
    setup_firewall
  fi

  write_cli
  setup_path
  pull_and_start
}

main "$@"
