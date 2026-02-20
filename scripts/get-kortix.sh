#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix — One-Click Install                                               ║
# ║                                                                            ║
# ║  curl -fsSL https://get.kortix.ai/install | bash                           ║
# ║                                                                            ║
# ║  Supports two modes:                                                       ║
# ║    1. Local (laptop/desktop) — no auth, HTTP, ports on 0.0.0.0             ║
# ║    2. VPS (Hetzner/EC2/DO)   — Caddy TLS, basic auth, firewall, locked    ║
# ║                                                                            ║
# ║  Requirement: Docker + Docker Compose v2.                                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Colors (ANSI-C quoting so escape bytes are real) ────────────────────────
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
FRONTEND_IMAGE="kortix/kortix-frontend:latest"
API_IMAGE="kortix/kortix-api:latest"
SANDBOX_IMAGE="kortix/computer:latest"
POSTGRES_IMAGE="kortix/postgres:latest"
CADDY_IMAGE="caddy:2-alpine"
CLI_SOURCE_URL="https://raw.githubusercontent.com/kortix-ai/computer/main/scripts/get-kortix.sh"

# Installer state (set during interactive prompts)
DEPLOY_MODE=""          # "local" or "vps"
DOMAIN=""               # domain name (VPS mode) or empty
USE_IP_ONLY=""          # "yes" for IP-only VPS mode
ENABLE_AUTH=""          # "yes" or "no"
ENABLE_FIREWALL=""     # "yes" or "no"
ADMIN_USER="admin"
ADMIN_PASSWORD=""
KORTIX_TOKEN=""
INTERNAL_SERVICE_KEY=""
SANDBOX_AUTH_TOKEN=""

# ─── Helpers ─────────────────────────────────────────────────────────────────
open_browser() {
  local url="$1"
  if command -v open &>/dev/null; then
    open "$url" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url" 2>/dev/null || true
  elif command -v wslview &>/dev/null; then
    wslview "$url" 2>/dev/null || true
  fi
}

generate_password() {
  # Generate a readable password: kx-XXXX-XXXX-XXXX
  local seg1 seg2 seg3
  seg1=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 4)
  seg2=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 4)
  seg3=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 4)
  echo "kx-${seg1}-${seg2}-${seg3}"
}

generate_token() {
  # Generate a 64-char hex token
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

get_server_ip() {
  # Try to detect the server's public IPv4 address (prefer IPv4 over IPv6)
  curl -4 -sf --connect-timeout 5 https://ifconfig.me 2>/dev/null \
    || curl -4 -sf --connect-timeout 5 https://api.ipify.org 2>/dev/null \
    || curl -4 -sf --connect-timeout 5 https://icanhazip.com 2>/dev/null \
    || curl -sf --connect-timeout 5 https://ifconfig.me 2>/dev/null \
    || echo ""
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

  echo ""
}

# ─── Interactive Mode Selection ──────────────────────────────────────────────
prompt_mode() {
  echo "  ${BOLD}Where are you running Kortix?${NC}"
  echo ""
  echo "    ${CYAN}1${NC}) Local machine ${DIM}(laptop/desktop — no public access)${NC}"
  echo "    ${CYAN}2${NC}) VPS / Server  ${DIM}(Hetzner, EC2, DigitalOcean, etc.)${NC} ${YELLOW}[EXPERIMENTAL]${NC}"
  echo ""
  printf "  Choice [1]: "
  read -r mode_choice

  case "${mode_choice:-1}" in
    2) DEPLOY_MODE="vps" ;;
    *) DEPLOY_MODE="local" ;;
  esac

  echo ""
}

# ─── VPS: Domain Setup ──────────────────────────────────────────────────────
prompt_domain() {
  echo "  ${BOLD}Domain Setup${NC}"
  echo ""
  echo "    ${CYAN}1${NC}) I have a domain name ${DIM}(recommended — automatic HTTPS)${NC}"
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

      if [ -z "$DOMAIN" ]; then
        fatal "Domain name is required. Point your DNS A record to this server first."
      fi

      # Verify DNS
      info "Verifying DNS for ${BOLD}${DOMAIN}${NC}..."
      local resolved_ip
      resolved_ip=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
      local server_ip
      server_ip=$(get_server_ip)

      if [ -n "$resolved_ip" ] && [ -n "$server_ip" ]; then
        if [ "$resolved_ip" = "$server_ip" ]; then
          success "DNS verified: ${DOMAIN} -> ${resolved_ip} (matches this server)"
        else
          warn "DNS resolves to ${resolved_ip} but this server is ${server_ip}"
          printf "  Continue anyway? [y/N]: "
          read -r dns_continue
          if ! echo "${dns_continue:-n}" | grep -qi '^y'; then
            fatal "Fix DNS first: point ${DOMAIN} A record to ${server_ip}"
          fi
        fi
      elif [ -n "$resolved_ip" ]; then
        success "DNS resolves to ${resolved_ip}"
      else
        warn "Could not verify DNS. Make sure ${DOMAIN} points to this server."
        printf "  Continue anyway? [y/N]: "
        read -r dns_continue
        if ! echo "${dns_continue:-n}" | grep -qi '^y'; then
          fatal "Fix DNS first."
        fi
      fi
      ;;
  esac

  echo ""
}

# ─── VPS: Security Options ──────────────────────────────────────────────────
prompt_security() {
  echo "  ${BOLD}Security Options${NC}"
  echo "  ${DIM}These are strongly recommended for a public server.${NC}"
  echo "  ${DIM}Press Enter to accept defaults.${NC}"
  echo ""

  # Password protection
  printf "  Password protection ${DIM}[${NC}${GREEN}Y${NC}${DIM}/n]${NC}: "
  read -r auth_choice
  case "${auth_choice:-y}" in
    [nN]*) 
      ENABLE_AUTH="no"
      echo ""
      echo "  ${YELLOW}WARNING: Anyone who can reach this server will have full${NC}"
      echo "  ${YELLOW}access to Kortix, your API keys, and the AI agent.${NC}"
      echo "  ${YELLOW}Only skip this if you have another auth layer (VPN, etc.)${NC}"
      echo ""
      printf "  Are you sure? [y/N]: "
      read -r auth_confirm
      if ! echo "${auth_confirm:-n}" | grep -qi '^y'; then
        ENABLE_AUTH="yes"
      fi
      ;;
    *) ENABLE_AUTH="yes" ;;
  esac

  # Firewall
  if command -v ufw &>/dev/null; then
    printf "  Firewall (UFW: allow SSH, HTTP, HTTPS only) ${DIM}[${NC}${GREEN}Y${NC}${DIM}/n]${NC}: "
    read -r fw_choice
    case "${fw_choice:-y}" in
      [nN]*) ENABLE_FIREWALL="no" ;;
      *) ENABLE_FIREWALL="yes" ;;
    esac
  else
    ENABLE_FIREWALL="no"
    info "UFW not found — skipping firewall setup"
    info "Ensure your cloud firewall allows ports 22, 80, 443 only"
  fi

  echo ""
}

# ─── Generate Secrets ────────────────────────────────────────────────────────
generate_secrets() {
  info "Generating security credentials..."

  # Always generate KORTIX_TOKEN (used for secret encryption)
  KORTIX_TOKEN=$(generate_token)
  success "Encryption key generated"

  if [ "$DEPLOY_MODE" = "vps" ]; then
    # Generate internal service key (sandbox ↔ API service-to-service auth)
    INTERNAL_SERVICE_KEY=$(generate_token)
    success "Internal service token generated"

    # Generate sandbox auth token (user → API proxy auth)
    SANDBOX_AUTH_TOKEN=$(generate_token)
    success "Sandbox auth token generated"

    if [ "$ENABLE_AUTH" = "yes" ]; then
      ADMIN_PASSWORD=$(generate_password)
      success "Admin password generated"
    fi
  fi

  echo ""
}

# ─── Write Caddyfile (VPS mode only) ────────────────────────────────────────
write_caddyfile() {
  info "Writing Caddyfile..."

  local tls_config=""
  if [ "$USE_IP_ONLY" = "yes" ]; then
    tls_config="  tls internal"
  fi

  local auth_block_frontend=""
  if [ "$ENABLE_AUTH" = "yes" ]; then
    # Generate bcrypt hash for the password using caddy's built-in hasher
    # We'll use a Docker one-liner since caddy might not be installed yet
    local hashed_pw
    hashed_pw=$(docker run --rm "$CADDY_IMAGE" caddy hash-password --plaintext "$ADMIN_PASSWORD" 2>/dev/null)

    # Basic auth protects only the frontend (HTML pages).
    # API routes (/v1/*) use their own Bearer token auth — basic_auth would
    # strip the Authorization header before proxying, breaking sandbox proxy auth.
    auth_block_frontend="
    basic_auth {
      ${ADMIN_USER} ${hashed_pw}
    }"
  fi

  # When using an IP address, clients (browsers, curl) don't send SNI.
  # Caddy needs default_sni to know which certificate to serve.
  local global_block=""
  if [ "$USE_IP_ONLY" = "yes" ]; then
    global_block="{
  default_sni ${DOMAIN}
}

"
  fi

  cat > "$INSTALL_DIR/Caddyfile" << CADDYEOF
${global_block}${DOMAIN} {
${tls_config}

  # API routes — proxy to kortix-api (includes /v1/sandbox/* for sandbox proxy)
  # API has its own Bearer token auth; Caddy just proxies transparently.
  handle /v1/* {
    reverse_proxy kortix-api:8008
  }

  # Default — serve frontend (protected by basic auth if enabled)
  handle {${auth_block_frontend}
    reverse_proxy frontend:3000
  }
}
CADDYEOF

  success "Saved Caddyfile"
}

# ─── Write docker-compose.yml ────────────────────────────────────────────────
write_compose() {
  info "Writing docker-compose.yml..."

  if [ "$DEPLOY_MODE" = "vps" ]; then
    write_compose_vps
  else
    write_compose_local
  fi

  success "Saved docker-compose.yml"
}

write_compose_local() {
  cat > "$INSTALL_DIR/docker-compose.yml" << COMPOSE
# Kortix — auto-generated by get-kortix.sh (local mode)
services:
  postgres:
    image: ${POSTGRES_IMAGE}
    ports:
      - "54322:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    command: >
      postgres
      -c shared_preload_libraries=pg_cron,pg_net
      -c cron.database_name=postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
    restart: unless-stopped

  frontend:
    image: ${FRONTEND_IMAGE}
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_ENV_MODE=local
      - NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1
    depends_on:
      kortix-api:
        condition: service_started
    restart: unless-stopped

  kortix-api:
    image: ${API_IMAGE}
    ports:
      - "8008:8008"
    environment:
      - ENV_MODE=local
      - PORT=8008
      - SANDBOX_PROVIDER=local_docker
      - DOCKER_HOST=unix:///var/run/docker.sock
      - KORTIX_URL=http://kortix-api:8008/v1/router
      - SANDBOX_NETWORK=kortix_default
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres
      - CRON_API_URL=http://kortix-api:8008
      - CRON_TICK_SECRET=\${CRON_TICK_SECRET}
      - SCHEDULER_ENABLED=true
    env_file:
      - .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  sandbox:
    image: ${SANDBOX_IMAGE}
    container_name: kortix-sandbox
    cap_add:
      - SYS_ADMIN
    security_opt:
      - seccomp=unconfined
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
      - SUBFOLDER=/
      - TITLE=Kortix Sandbox
      - OPENCODE_CONFIG_DIR=/opt/opencode
      - OPENCODE_PERMISSION={"*":"allow"}
      - DISPLAY=:1
      - LSS_DIR=/workspace/.lss
      - KORTIX_WORKSPACE=/workspace
      - KORTIX_API_URL=http://kortix-api:8008/v1/router
      - SANDBOX_ID=kortix-sandbox
      - PROJECT_ID=local
      - ENV_MODE=local
      - SANDBOX_PORT_MAP={"8000":"14000","3111":"14001","6080":"14002","6081":"14003","3210":"14004","9223":"14005","9224":"14006"}
    env_file:
      - .env
    volumes:
      - sandbox-workspace:/workspace
      - sandbox-secrets:/app/secrets
    # All sandbox access goes through the backend proxy (kortix-api → sandbox:8000).
    # Only Kortix Master is exposed to the host for direct debugging.
    ports:
      - "14000:8000"
    expose:
      - "3111"
      - "6080"
      - "6081"
      - "3210"
      - "9223"
      - "9224"
    shm_size: "2gb"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/kortix/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  postgres-data:
  sandbox-workspace:
  sandbox-secrets:
COMPOSE
}

write_compose_vps() {
  local public_url
  if [ "$USE_IP_ONLY" = "yes" ]; then
    public_url="https://${DOMAIN}"
  else
    public_url="https://${DOMAIN}"
  fi

  cat > "$INSTALL_DIR/docker-compose.yml" << COMPOSE
# Kortix — auto-generated by get-kortix.sh (VPS mode)
# All services are internal-only. Caddy handles TLS + auth + routing.
services:
  postgres:
    image: ${POSTGRES_IMAGE}
    expose:
      - "5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    command: >
      postgres
      -c shared_preload_libraries=pg_cron,pg_net
      -c cron.database_name=postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
    restart: unless-stopped

  caddy:
    image: ${CADDY_IMAGE}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - frontend
      - kortix-api
    restart: unless-stopped

  frontend:
    image: ${FRONTEND_IMAGE}
    expose:
      - "3000"
    environment:
      - NEXT_PUBLIC_ENV_MODE=local
      - NEXT_PUBLIC_BACKEND_URL=${public_url}/v1
      - KORTIX_PUBLIC_URL=${public_url}
    depends_on:
      kortix-api:
        condition: service_started
    restart: unless-stopped

  kortix-api:
    image: ${API_IMAGE}
    expose:
      - "8008"
    environment:
      - ENV_MODE=local
      - PORT=8008
      - SANDBOX_PROVIDER=local_docker
      - DOCKER_HOST=unix:///var/run/docker.sock
      - KORTIX_URL=http://kortix-api:8008/v1/router
      - SANDBOX_NETWORK=kortix_default
      - INTERNAL_SERVICE_KEY=\${INTERNAL_SERVICE_KEY}
      - SANDBOX_AUTH_TOKEN=\${SANDBOX_AUTH_TOKEN}
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres
      - CRON_API_URL=http://kortix-api:8008
      - CRON_TICK_SECRET=\${CRON_TICK_SECRET}
      - SCHEDULER_ENABLED=true
    env_file:
      - .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  sandbox:
    image: ${SANDBOX_IMAGE}
    container_name: kortix-sandbox
    cap_add:
      - SYS_ADMIN
    security_opt:
      - seccomp=unconfined
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
      - SUBFOLDER=/
      - TITLE=Kortix Sandbox
      - OPENCODE_CONFIG_DIR=/opt/opencode
      - OPENCODE_PERMISSION={"*":"allow"}
      - DISPLAY=:1
      - LSS_DIR=/workspace/.lss
      - KORTIX_WORKSPACE=/workspace
      - KORTIX_API_URL=http://kortix-api:8008/v1/router
      - SANDBOX_ID=kortix-sandbox
      - PROJECT_ID=local
      - ENV_MODE=local
      - INTERNAL_SERVICE_KEY=\${INTERNAL_SERVICE_KEY}
      - CORS_ALLOWED_ORIGINS=${public_url}
      - SANDBOX_PORT_MAP={"8000":"14000","3111":"14001","6080":"14002","6081":"14003","3210":"14004","9223":"14005","9224":"14006"}
    env_file:
      - .env
    expose:
      - "8000"
      - "3111"
      - "6080"
      - "6081"
      - "3210"
      - "9223"
      - "9224"
    volumes:
      - sandbox-workspace:/workspace
      - sandbox-secrets:/app/secrets
    shm_size: "2gb"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/kortix/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  postgres-data:
  sandbox-workspace:
  sandbox-secrets:
  caddy-data:
  caddy-config:
COMPOSE
}

# ─── Write .env ──────────────────────────────────────────────────────────────
write_env() {
  local CRON_SECRET
  CRON_SECRET=$(generate_password)

  cat > "$INSTALL_DIR/.env" << ENVEOF
# Kortix — auto-generated credentials
# DO NOT share this file. Regenerate with: kortix reconfigure
KORTIX_TOKEN=${KORTIX_TOKEN}
INTERNAL_SERVICE_KEY=${INTERNAL_SERVICE_KEY}
SANDBOX_AUTH_TOKEN=${SANDBOX_AUTH_TOKEN}
CRON_TICK_SECRET=${CRON_SECRET}
ENVEOF

  chmod 600 "$INSTALL_DIR/.env"
}

# ─── Write credentials file (VPS mode) ──────────────────────────────────────
write_credentials() {
  if [ "$DEPLOY_MODE" != "vps" ] || [ "$ENABLE_AUTH" != "yes" ]; then
    return
  fi

  cat > "$INSTALL_DIR/.credentials" << CREDEOF
# Kortix — Admin Credentials
# Generated on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
URL: https://${DOMAIN}
Username: ${ADMIN_USER}
Password: ${ADMIN_PASSWORD}
CREDEOF

  chmod 600 "$INSTALL_DIR/.credentials"
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
VERSION="0.5.6"

_open() {
  if command -v open &>/dev/null; then open "$1" 2>/dev/null
  elif command -v xdg-open &>/dev/null; then xdg-open "$1" 2>/dev/null
  elif command -v wslview &>/dev/null; then wslview "$1" 2>/dev/null
  fi
}

# Detect mode from docker-compose.yml
_mode() {
  if grep -q 'caddy:' "$DIR/docker-compose.yml" 2>/dev/null; then
    echo "vps"
  else
    echo "local"
  fi
}

_url() {
  if [ "$(_mode)" = "vps" ]; then
    # Extract domain from Caddyfile
    if [ -f "$DIR/Caddyfile" ]; then
      echo "https://$(head -1 "$DIR/Caddyfile" | sed 's/ {$//' | xargs)"
    else
      echo "https://localhost"
    fi
  else
    echo "http://localhost:3000"
  fi
}

case "${1:-help}" in
  start)
    docker compose up -d
    echo ""
    if [ "$(_mode)" = "vps" ]; then
      echo "  ${G}Kortix is running!${N}"
      echo "  Dashboard: ${B}$(_url)${N}"
      if [ -f "$DIR/.credentials" ]; then
        echo ""
        echo "  ${D}Credentials in: ${DIR}/.credentials${N}"
      fi
    else
      echo "  ${G}Kortix is running!${N}"
      echo "  Dashboard:  ${B}http://localhost:3000${N}"
      echo "  API:        ${B}http://localhost:8008${N}"
    fi
    echo ""
    ;;
  stop)
    docker compose down
    echo "  ${G}Stopped.${N}"
    ;;
  restart)
    docker compose down
    docker compose up -d
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
    echo ""
    echo "  ${C}Opening setup in browser...${N}"
    _open "$(_url)/setup"
    echo ""
    echo "  ${D}If it didn't open, go to:${N}"
    echo "  ${B}$(_url)/setup${N}"
    echo ""
    ;;
  update)
    echo "  ${C}Pulling latest images...${N}"
    docker compose pull
    docker compose down
    docker compose up -d
    echo "  ${G}Updated to latest.${N}"
    ;;
  reconfigure)
    echo ""
    echo "  ${C}Re-running installer...${N}"
    echo "  ${D}Your data (volumes) will be preserved.${N}"
    echo ""
    # Re-download and run the installer
    if command -v curl &>/dev/null; then
      curl -fsSL "https://raw.githubusercontent.com/kortix-ai/computer/main/scripts/get-kortix.sh" | bash
    else
      echo "  ${R}curl not found. Download get-kortix.sh manually.${N}"
    fi
    ;;
  credentials)
    if [ -f "$DIR/.credentials" ]; then
      cat "$DIR/.credentials"
    else
      echo "  ${D}No credentials file (local mode or auth disabled)${N}"
    fi
    ;;
  uninstall)
    echo ""
    echo "  ${B}Uninstall Kortix${N}"
    echo ""

    # Stop containers
    echo "  ${C}Stopping services...${N}"
    docker compose down 2>/dev/null || true

    # Ask about Docker volumes (workspace data)
    echo ""
    printf "  Delete workspace data (Docker volumes)? [y/N]: "
    read -r del_volumes
    if echo "$del_volumes" | grep -qi '^y'; then
      docker compose down -v 2>/dev/null || true
      docker rm -f kortix-sandbox 2>/dev/null || true
      echo "  ${G}Volumes removed.${N}"
    else
      echo "  ${D}Keeping volumes (your workspace data is safe).${N}"
    fi

    # Ask about Docker images
    echo ""
    printf "  Delete Docker images? [y/N]: "
    read -r del_images
    if echo "$del_images" | grep -qi '^y'; then
      docker rmi kortix/kortix-frontend:latest 2>/dev/null || true
      docker rmi kortix/kortix-api:latest 2>/dev/null || true
      docker rmi kortix/computer:latest 2>/dev/null || true
      docker rmi caddy:2-alpine 2>/dev/null || true
      echo "  ${G}Images removed.${N}"
    else
      echo "  ${D}Keeping images.${N}"
    fi

    # Remove /usr/local/bin symlink
    if [ -L "/usr/local/bin/kortix" ]; then
      rm -f /usr/local/bin/kortix 2>/dev/null || true
      echo "  ${G}Removed /usr/local/bin/kortix symlink.${N}"
    fi

    # Remove PATH entry from shell rc files
    for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
      if [ -f "$rc" ] && grep -q "$DIR" "$rc" 2>/dev/null; then
        grep -v "$DIR" "$rc" | grep -v "# Kortix CLI" > "${rc}.tmp" && mv "${rc}.tmp" "$rc"
      fi
    done

    # Disable firewall rules if we set them
    if command -v ufw &>/dev/null; then
      echo ""
      printf "  Remove firewall rules? [y/N]: "
      read -r del_fw
      if echo "$del_fw" | grep -qi '^y'; then
        ufw delete allow 80/tcp 2>/dev/null || true
        ufw delete allow 443/tcp 2>/dev/null || true
        echo "  ${G}Firewall rules removed.${N}"
      fi
    fi

    # Remove install directory
    echo ""
    echo "  ${C}Removing ${DIR}...${N}"
    rm -rf "$DIR"

    echo ""
    echo "  ${G}Kortix has been uninstalled.${N}"
    echo ""
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
    echo "  ${C}setup${N}         Open API key configuration in browser"
    echo "  ${C}update${N}        Pull latest images & restart"
    echo "  ${C}open${N}          Open dashboard in browser"
    echo "  ${C}reconfigure${N}   Re-run installer (preserves data)"
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
  # 1. Try to symlink into /usr/local/bin (works immediately, no shell restart)
  if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
    ln -sf "$INSTALL_DIR/kortix" /usr/local/bin/kortix 2>/dev/null && {
      success "Linked 'kortix' -> /usr/local/bin/kortix"
      return
    }
  fi

  # 2. Fallback: add to shell rc
  local shell_rc=""
  case "${SHELL:-}" in
    */zsh)  shell_rc="$HOME/.zshrc" ;;
    */bash) shell_rc="$HOME/.bashrc" ;;
    *)      shell_rc="$HOME/.profile" ;;
  esac

  if [ -f "$shell_rc" ] && grep -q "$INSTALL_DIR" "$shell_rc" 2>/dev/null; then
    return  # already in PATH
  fi

  echo "" >> "$shell_rc"
  echo "# Kortix CLI" >> "$shell_rc"
  echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$shell_rc"
  success "Added 'kortix' to PATH (restart terminal or: source $shell_rc)"
}

# ─── Firewall Setup (VPS mode) ──────────────────────────────────────────────
setup_firewall() {
  if [ "$ENABLE_FIREWALL" != "yes" ]; then
    return
  fi

  info "Setting up firewall..."

  ufw default deny incoming 2>/dev/null || true
  ufw default allow outgoing 2>/dev/null || true
  ufw allow 22/tcp 2>/dev/null || true
  success "Allow SSH (22)"
  ufw allow 80/tcp 2>/dev/null || true
  success "Allow HTTP (80)"
  ufw allow 443/tcp 2>/dev/null || true
  success "Allow HTTPS (443)"

  # Enable without prompt
  echo "y" | ufw enable 2>/dev/null || true
  success "UFW enabled — all other inbound traffic blocked"

  echo ""
}

# ─── Pull & start ───────────────────────────────────────────────────────────
pull_and_start() {
  echo ""
  info "Pulling Docker images (this may take a few minutes)..."
  echo ""

  cd "$INSTALL_DIR"
  docker compose pull

  echo ""
  info "Starting Kortix..."
  echo ""

  docker compose up -d

  if [ "$DEPLOY_MODE" = "vps" ]; then
    # Wait for Caddy to get TLS cert and frontend to respond
    info "Waiting for services + TLS certificate..."
    local attempts=0
    local url="https://${DOMAIN}"
    while [ $attempts -lt 45 ]; do
      if curl -sf -k "${url}" >/dev/null 2>&1; then
        break
      fi
      sleep 2
      attempts=$((attempts + 1))
    done

    echo ""
    echo "  ${BOLD}${GREEN}=================================================${NC}"
    echo "  ${BOLD}${GREEN}  Kortix is running!${NC}"
    echo "  ${BOLD}${GREEN}=================================================${NC}"
    echo ""
    echo "  ${CYAN}URL:${NC}       ${BOLD}${url}${NC}"

    if [ "$ENABLE_AUTH" = "yes" ]; then
      echo "  ${CYAN}Username:${NC}  ${BOLD}${ADMIN_USER}${NC}"
      echo "  ${CYAN}Password:${NC}  ${BOLD}${ADMIN_PASSWORD}${NC}"
    fi

    if [ -n "$SANDBOX_AUTH_TOKEN" ]; then
      echo "  ${CYAN}Sandbox Token:${NC} ${BOLD}${SANDBOX_AUTH_TOKEN}${NC}"
      echo ""
      echo "  ${YELLOW}Save these credentials — they won't be shown again.${NC}"
      echo "  ${DIM}(Also saved to ${INSTALL_DIR}/.credentials and .env)${NC}"
    elif [ "$ENABLE_AUTH" = "yes" ]; then
      echo ""
      echo "  ${YELLOW}Save these credentials — they won't be shown again.${NC}"
      echo "  ${DIM}(Also saved to ${INSTALL_DIR}/.credentials)${NC}"
    fi

    echo ""
    echo "  ${DIM}Commands:${NC}"
    echo "    ${CYAN}kortix start${NC}         Start services"
    echo "    ${CYAN}kortix stop${NC}          Stop services"
    echo "    ${CYAN}kortix credentials${NC}   Show admin credentials"
    echo "    ${CYAN}kortix reconfigure${NC}   Change domain/auth settings"
    echo "    ${CYAN}kortix update${NC}        Update to latest"
    echo ""
  else
    # Local mode — same as before
    info "Waiting for services to start..."
    local attempts=0
    while [ $attempts -lt 30 ]; do
      if curl -sf http://localhost:3000 >/dev/null 2>&1; then
        break
      fi
      sleep 2
      attempts=$((attempts + 1))
    done

    echo ""
    echo "  ${BOLD}${GREEN}Kortix is running!${NC}"
    echo ""
    echo "  ${CYAN}Dashboard:${NC}   ${BOLD}http://localhost:3000${NC}"
    echo "  ${CYAN}API:${NC}         ${BOLD}http://localhost:8008${NC}"
    echo ""

    info "Opening setup in browser..."
    open_browser "http://localhost:3000/setup"
    echo ""
    echo "  ${BOLD}Next step:${NC} Add your API keys in the browser."
    echo ""
    echo "  ${DIM}Commands:${NC}"
    echo "    ${CYAN}kortix start${NC}     Start services"
    echo "    ${CYAN}kortix stop${NC}      Stop services"
    echo "    ${CYAN}kortix setup${NC}     Configure API keys"
    echo "    ${CYAN}kortix update${NC}    Update to latest"
    echo ""
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  banner
  preflight

  # Existing install? Offer to just start it.
  if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    warn "Existing installation found at $INSTALL_DIR"
    printf "  Reinstall? [y/N]: "
    read -r answer
    if [ -z "$answer" ] || ! echo "$answer" | grep -qi '^y'; then
      echo ""
      info "Starting existing installation..."
      cd "$INSTALL_DIR"
      docker compose up -d
      echo ""
      success "Kortix is running!"

      if grep -q 'caddy:' "$INSTALL_DIR/docker-compose.yml" 2>/dev/null; then
        local domain
        domain=$(head -1 "$INSTALL_DIR/Caddyfile" 2>/dev/null | sed 's/ {$//' || echo "localhost")
        echo "  Dashboard: ${BOLD}https://${domain}${NC}"
      else
        echo "  Dashboard: ${BOLD}http://localhost:3000${NC}"
      fi
      echo ""
      exit 0
    fi
    echo ""
    info "Stopping old services..."
    cd "$INSTALL_DIR"
    docker compose down -v 2>/dev/null || true
    docker rm -f kortix-sandbox 2>/dev/null || true
    echo ""
  fi

  # ─── Interactive setup ──────────────────────────────────────────────────
  prompt_mode

  if [ "$DEPLOY_MODE" = "vps" ]; then
    prompt_domain
    prompt_security
  fi

  generate_secrets

  mkdir -p "$INSTALL_DIR"

  write_compose
  write_env
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
