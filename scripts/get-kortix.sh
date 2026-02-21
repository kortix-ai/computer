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
# ║  Same docker-compose.yml for both. VPS adds Caddy via --profile vps.       ║
# ║  All config lives in .env — zero variance between modes.                   ║
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

# Installer state (set during interactive prompts)
DEPLOY_MODE=""          # "local" or "vps"
DOMAIN=""               # domain name or IP (VPS mode)
USE_IP_ONLY=""          # "yes" for IP-only VPS mode
ENABLE_AUTH=""          # "yes" or "no"
ENABLE_FIREWALL=""     # "yes" or "no"
ADMIN_USER="admin"
ADMIN_PASSWORD=""

# Generated secrets
KORTIX_TOKEN=""
INTERNAL_SERVICE_KEY=""
SANDBOX_AUTH_TOKEN=""
CRON_SECRET=""
CHANNELS_CREDENTIAL_KEY=""

# Computed URLs (set in compute_urls)
PUBLIC_URL=""           # e.g. "https://domain.com" or "http://localhost:13737"
API_PUBLIC_URL=""       # e.g. "https://domain.com/v1" or "http://localhost:13738/v1"

# Integrations (Pipedream Connect — set during interactive prompts)
PIPEDREAM_CLIENT_ID=""
PIPEDREAM_CLIENT_SECRET=""
PIPEDREAM_PROJECT_ID=""
PIPEDREAM_ENVIRONMENT=""

# Channels (Slack — set during interactive prompts)
SLACK_CLIENT_ID=""
SLACK_CLIENT_SECRET=""
SLACK_SIGNING_SECRET=""

# Deployments (Freestyle — set during interactive prompts)
FREESTYLE_API_KEY=""

# Post-install instructions (saved during prompts, displayed after services start)
SLACK_SETUP_INSTRUCTIONS=""


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

# ─── Integrations Setup (Pipedream Connect) ─────────────────────────────────
prompt_integrations() {
  echo "  ${BOLD}Third-Party Integrations ${DIM}(optional)${NC}"
  echo "  ${DIM}Connect your agent to 3,000+ apps (Gmail, Slack, GitHub, Notion, etc.)${NC}"
  echo "  ${DIM}Powered by Pipedream Connect — get credentials at:${NC}"
  echo "  ${CYAN}https://pipedream.com/connect${NC}"
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
        echo ""
        success "Pipedream Connect configured"
      else
        echo ""
        warn "Incomplete credentials — integrations will not be available"
        PIPEDREAM_CLIENT_ID=""
        PIPEDREAM_CLIENT_SECRET=""
        PIPEDREAM_PROJECT_ID=""
        PIPEDREAM_ENVIRONMENT=""
      fi
      ;;
    *)
      info "Skipping — add Pipedream credentials later in ${DIM}~/.kortix/.env${NC}"
      ;;
  esac

  echo ""
}

# ─── Channels Setup (Slack) ──────────────────────────────────────────────────
prompt_channels() {
  echo "  ${BOLD}Channels — Slack Integration ${DIM}(optional)${NC}"
  echo "  ${DIM}Let your Kortix agent receive and respond to Slack messages.${NC}"
  echo ""

  printf "  Configure Slack? ${DIM}[y/${NC}${GREEN}N${NC}${DIM}]${NC}: "
  read -r slack_choice

  case "${slack_choice:-n}" in
    [yY]*)
      echo ""

      # Determine the webhook base URL
      local webhook_url="${API_PUBLIC_URL}"
      if [ "$DEPLOY_MODE" = "local" ]; then
        echo "  ${YELLOW}Slack requires a public HTTPS URL for webhooks.${NC}"
        echo "  ${DIM}Since you're running locally, you need a tunnel like ngrok.${NC}"
        echo ""
        echo "  ${BOLD}Quick setup:${NC}"
        echo "    1. Install ngrok: ${CYAN}https://ngrok.com/download${NC}"
        echo "    2. Run: ${CYAN}ngrok http 13738${NC}"
        echo "    3. Copy the ${BOLD}https://*.ngrok-free.app${NC} URL"
        echo ""
        printf "  Enter your public URL ${DIM}(ngrok URL or leave blank to set later)${NC}: "
        read -r custom_url
        if [ -n "$custom_url" ]; then
          # Strip trailing slash
          webhook_url="${custom_url%/}"
          # Also update API_PUBLIC_URL so the .env gets the right value
          API_PUBLIC_URL="$webhook_url"
        else
          echo ""
          info "You can set API_PUBLIC_URL in ~/.kortix/.env later"
          echo ""
        fi
      fi

      echo ""
      echo "  ${BOLD}Step 1: Create a Slack App${NC}"
      echo ""
      echo "  Go to: ${CYAN}https://api.slack.com/apps${NC}"
      echo "  → Click ${BOLD}\"Create New App\"${NC} → ${BOLD}\"From scratch\"${NC}"
      echo "  → Name it anything (e.g. \"Kortix\") → Select your workspace"
      echo ""

      echo "  ${BOLD}Step 2: Copy App Credentials${NC}"
      echo ""
      echo "  Go to: ${BOLD}Basic Information${NC} → ${BOLD}App Credentials${NC}"
      echo "  Copy the three values below:"
      echo ""
      printf "    Client ID: "
      read -r SLACK_CLIENT_ID
      printf "    Client Secret: "
      read -r SLACK_CLIENT_SECRET
      printf "    Signing Secret: "
      read -r SLACK_SIGNING_SECRET

      if [ -z "$SLACK_CLIENT_ID" ] || [ -z "$SLACK_CLIENT_SECRET" ] || [ -z "$SLACK_SIGNING_SECRET" ]; then
        echo ""
        warn "Incomplete credentials — Slack will not be available"
        SLACK_CLIENT_ID=""
        SLACK_CLIENT_SECRET=""
        SLACK_SIGNING_SECRET=""
      else
        echo ""
        success "Credentials saved"
        echo ""

        # Save setup instructions for display AFTER services start (so they're not buried by docker pull/up output)
        SLACK_SETUP_INSTRUCTIONS="
  ${BOLD}━━━ Slack App Configuration ━━━${NC}

  Copy these URLs into your Slack app settings at:
  ${CYAN}https://api.slack.com/apps${NC}

  ${BOLD}OAuth & Permissions → Redirect URLs:${NC}
    ${CYAN}${webhook_url}/webhooks/slack/oauth_callback${NC}

  ${BOLD}Event Subscriptions → Enable Events → Request URL:${NC}
    ${CYAN}${webhook_url}/webhooks/slack/events${NC}

  ${DIM}Subscribe to bot events:${NC}
    ${DIM}app_mention, message.im, message.channels,${NC}
    ${DIM}message.groups, message.mpim, reaction_added${NC}

  ${BOLD}Slash Commands → Create New Command:${NC}
    ${DIM}Command:${NC}     ${CYAN}/kortix${NC}
    ${DIM}Request URL:${NC} ${CYAN}${webhook_url}/webhooks/slack/commands${NC}
    ${DIM}Description:${NC} ${DIM}Ask Kortix anything${NC}

  ${BOLD}Interactivity & Shortcuts → Enable → Request URL:${NC}
    ${CYAN}${webhook_url}/webhooks/slack/interactivity${NC}

  ${BOLD}Install to Workspace:${NC}
    After Kortix is running, open this URL:
    ${CYAN}${webhook_url}/webhooks/slack/install?sandboxId=00000000-0000-0000-0000-000000000001${NC}
"

        info "Slack URLs will be shown after services start"
      fi
      ;;
    *)
      info "Skipping — add Slack credentials later in ${DIM}~/.kortix/.env${NC}"
      ;;
  esac

  echo ""
}

# ─── Deployments Setup (Freestyle) ───────────────────────────────────────────
prompt_deployments() {
  echo "  ${BOLD}Deployments — Freestyle Hosting ${DIM}(optional)${NC}"
  echo "  ${DIM}Deploy web apps, APIs, and static sites from the agent.${NC}"
  echo "  ${DIM}Powered by Freestyle — get an API key at:${NC}"
  echo "  ${CYAN}https://freestyle.sh${NC}"
  echo ""
  printf "  Configure deployments? ${DIM}[y/${NC}${GREEN}N${NC}${DIM}]${NC}: "
  read -r deploy_choice

  case "${deploy_choice:-n}" in
    [yY]*)
      echo ""
      printf "    Freestyle API Key: "
      read -r FREESTYLE_API_KEY

      if [ -n "$FREESTYLE_API_KEY" ]; then
        echo ""
        success "Freestyle configured"
      else
        echo ""
        warn "No API key — deployments will not be available"
        FREESTYLE_API_KEY=""
      fi
      ;;
    *)
      info "Skipping — add FREESTYLE_API_KEY later in ${DIM}~/.kortix/.env${NC}"
      ;;
  esac

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

  KORTIX_TOKEN=$(generate_token)
  CRON_SECRET=$(generate_password)
  CHANNELS_CREDENTIAL_KEY=$(generate_token)

  if [ "$DEPLOY_MODE" = "vps" ]; then
    # VPS: generate service-to-service auth tokens (sandbox proxy protection)
    INTERNAL_SERVICE_KEY=$(generate_token)
    SANDBOX_AUTH_TOKEN=$(generate_token)
    success "Service tokens generated"

    if [ "$ENABLE_AUTH" = "yes" ]; then
      ADMIN_PASSWORD=$(generate_password)
      success "Admin password generated"
    fi
  else
    # Local: no auth needed (everything is on localhost)
    INTERNAL_SERVICE_KEY=""
    SANDBOX_AUTH_TOKEN=""
  fi

  success "Encryption keys generated"
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
    local hashed_pw
    hashed_pw=$(docker run --rm "$CADDY_IMAGE" caddy hash-password --plaintext "$ADMIN_PASSWORD" 2>/dev/null)

    auth_block_frontend="
    basic_auth {
      ${ADMIN_USER} ${hashed_pw}
    }"
  fi

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

  # API + webhook routes — proxy to kortix-api
  handle /v1/* {
    reverse_proxy kortix-api:8008
  }
  handle /webhooks/* {
    reverse_proxy kortix-api:8008
  }
  handle /health {
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

# ─── Write docker-compose.yml (single template, both modes) ─────────────────
write_compose() {
  info "Writing docker-compose.yml..."

  # Port binding: local mode exposes ports on host, VPS keeps them internal (Caddy proxies)
  local postgres_ports frontend_ports api_ports sandbox_ports
  if [ "$DEPLOY_MODE" = "vps" ]; then
    postgres_ports='    expose:
      - "5432"'
    frontend_ports='    expose:
      - "3000"'
    api_ports='    expose:
      - "8008"'
    sandbox_ports='    expose:
      - "8000"'
  else
    postgres_ports='    ports:
      - "13739:5432"'
    frontend_ports='    ports:
      - "13737:3000"'
    api_ports='    ports:
      - "13738:8008"'
    sandbox_ports='    ports:
      - "13740:8000"'
  fi

  # Caddy volumes (only needed in VPS mode, but declared always for simplicity)
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

  cat > "$INSTALL_DIR/docker-compose.yml" << COMPOSE
# Kortix — auto-generated by get-kortix.sh
# Mode: ${DEPLOY_MODE}
# All runtime config lives in .env — edit that, not this file.
services:
  postgres:
    image: ${POSTGRES_IMAGE}
${postgres_ports}
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
    restart: unless-stopped
${caddy_service}
  frontend:
    image: ${FRONTEND_IMAGE}
${frontend_ports}
    environment:
      - NEXT_PUBLIC_ENV_MODE=local
      - NEXT_PUBLIC_BACKEND_URL=\${API_PUBLIC_URL}/v1
    depends_on:
      kortix-api:
        condition: service_started
    restart: unless-stopped

  kortix-api:
    image: ${API_IMAGE}
    user: "0:0"
${api_ports}
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
      - INTERNAL_SERVICE_KEY=\${INTERNAL_SERVICE_KEY}
      - SANDBOX_AUTH_TOKEN=\${SANDBOX_AUTH_TOKEN}
      - FRONTEND_URL=\${PUBLIC_URL}
      - CHANNELS_PUBLIC_URL=\${API_PUBLIC_URL}
      - CHANNELS_CREDENTIAL_KEY=\${CHANNELS_CREDENTIAL_KEY}
      - CORS_ALLOWED_ORIGINS=\${PUBLIC_URL}
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
      - CORS_ALLOWED_ORIGINS=\${PUBLIC_URL}
    env_file:
      - .env
    volumes:
      - sandbox-workspace:/workspace
      - sandbox-secrets:/app/secrets
${sandbox_ports}
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
# Edit this file to change settings. Run 'kortix restart' after changes.
# ──────────────────────────────────────────────────────────────────────────────

# ─── Mode ────────────────────────────────────────────────────────────────────
DEPLOY_MODE=${DEPLOY_MODE}

# ─── Public URLs ─────────────────────────────────────────────────────────────
# These are used for OAuth redirects, webhook callbacks, CORS, and frontend API calls.
# Local: http://localhost:PORT   VPS: https://your-domain.com
# For local webhook testing (Slack, etc.), use ngrok:
#   ngrok http 13738
#   Then set API_PUBLIC_URL to the ngrok HTTPS URL
PUBLIC_URL=${PUBLIC_URL}
API_PUBLIC_URL=${API_PUBLIC_URL}

# ─── Security ────────────────────────────────────────────────────────────────
KORTIX_TOKEN=${KORTIX_TOKEN}
INTERNAL_SERVICE_KEY=${INTERNAL_SERVICE_KEY}
SANDBOX_AUTH_TOKEN=${SANDBOX_AUTH_TOKEN}
CRON_TICK_SECRET=${CRON_SECRET}
CHANNELS_CREDENTIAL_KEY=${CHANNELS_CREDENTIAL_KEY}

# ─── Integrations (Pipedream Connect — 3,000+ third-party apps) ──────────────
INTEGRATION_AUTH_PROVIDER=pipedream
PIPEDREAM_CLIENT_ID=${PIPEDREAM_CLIENT_ID}
PIPEDREAM_CLIENT_SECRET=${PIPEDREAM_CLIENT_SECRET}
PIPEDREAM_PROJECT_ID=${PIPEDREAM_PROJECT_ID}
PIPEDREAM_ENVIRONMENT=${PIPEDREAM_ENVIRONMENT:-production}

# ─── Channels (Slack) ────────────────────────────────────────────────────────
# Get these from https://api.slack.com/apps → Your App → Basic Information
SLACK_CLIENT_ID=${SLACK_CLIENT_ID}
SLACK_CLIENT_SECRET=${SLACK_CLIENT_SECRET}
SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET}

# ─── Deployments (Freestyle) ────────────────────────────────────────────────
# Get an API key at https://freestyle.sh
FREESTYLE_API_KEY=${FREESTYLE_API_KEY}
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
VERSION="0.6.0"

_open() {
  if command -v open &>/dev/null; then open "$1" 2>/dev/null
  elif command -v xdg-open &>/dev/null; then xdg-open "$1" 2>/dev/null
  elif command -v wslview &>/dev/null; then wslview "$1" 2>/dev/null
  fi
}

_url() {
  # Read PUBLIC_URL from .env
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

case "${1:-help}" in
  start)
    if [ "$(_mode)" = "vps" ]; then
      docker compose --profile vps up -d
    else
      docker compose up -d
    fi
    echo ""
    echo "  ${G}Kortix is running!${N}"
    echo "  Dashboard: ${B}$(_url)${N}"
    if [ -f "$DIR/.credentials" ]; then
      echo "  ${D}Credentials in: ${DIR}/.credentials${N}"
    fi
    echo ""
    ;;
  stop)
    docker compose --profile vps down 2>/dev/null || docker compose down
    echo "  ${G}Stopped.${N}"
    ;;
  restart)
    docker compose --profile vps down 2>/dev/null || docker compose down
    if [ "$(_mode)" = "vps" ]; then
      docker compose --profile vps up -d
    else
      docker compose up -d
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
    docker compose --profile vps down 2>/dev/null || docker compose down
    if [ "$(_mode)" = "vps" ]; then
      docker compose --profile vps up -d
    else
      docker compose up -d
    fi
    echo "  ${G}Updated to latest.${N}"
    ;;
  reconfigure)
    echo ""
    echo "  ${C}Re-running installer...${N}"
    echo "  ${D}Your data (volumes) will be preserved.${N}"
    echo ""
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
    echo "  ${C}Stopping services...${N}"
    docker compose --profile vps down 2>/dev/null || docker compose down 2>/dev/null || true

    echo ""
    printf "  Delete workspace data (Docker volumes)? [y/N]: "
    read -r del_volumes
    if echo "$del_volumes" | grep -qi '^y'; then
      docker compose --profile vps down -v 2>/dev/null || docker compose down -v 2>/dev/null || true
      docker rm -f kortix-sandbox 2>/dev/null || true
      echo "  ${G}Volumes removed.${N}"
    else
      echo "  ${D}Keeping volumes (your workspace data is safe).${N}"
    fi

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

    if [ -L "/usr/local/bin/kortix" ]; then
      rm -f /usr/local/bin/kortix 2>/dev/null || true
      echo "  ${G}Removed /usr/local/bin/kortix symlink.${N}"
    fi

    for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
      if [ -f "$rc" ] && grep -q "$DIR" "$rc" 2>/dev/null; then
        grep -v "$DIR" "$rc" | grep -v "# Kortix CLI" > "${rc}.tmp" && mv "${rc}.tmp" "$rc"
      fi
    done

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
    echo "  ${C}setup${N}         Open setup wizard in browser"
    echo "  ${C}update${NC}        Pull latest images & restart"
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

  echo "y" | ufw enable 2>/dev/null || true
  success "UFW enabled — all other inbound traffic blocked"

  echo ""
}

# ─── Pull & Start ───────────────────────────────────────────────────────────
pull_and_start() {
  echo ""
  info "Pulling Docker images (this may take a few minutes)..."
  echo ""

  cd "$INSTALL_DIR"
  docker compose pull

  echo ""
  info "Starting Kortix..."
  echo ""

  if [ "$DEPLOY_MODE" = "vps" ]; then
    docker compose --profile vps up -d
  else
    docker compose up -d
  fi

  # Wait for frontend
  local attempts=0
  local check_url
  if [ "$DEPLOY_MODE" = "vps" ]; then
    check_url="https://${DOMAIN}"
    info "Waiting for services + TLS certificate..."
    local max_wait=45
  else
    check_url="http://localhost:13737"
    info "Waiting for services to start..."
    local max_wait=30
  fi

  while [ $attempts -lt $max_wait ]; do
    if curl -sf -k "${check_url}" >/dev/null 2>&1; then
      break
    fi
    sleep 2
    attempts=$((attempts + 1))
  done

  # ─── Success output ──────────────────────────────────────────────────────
  echo ""
  echo "  ${BOLD}${GREEN}Kortix is running!${NC}"
  echo ""
  echo "  ${CYAN}Dashboard:${NC}  ${BOLD}${PUBLIC_URL}${NC}"

  if [ "$DEPLOY_MODE" = "vps" ]; then
    echo "  ${CYAN}API:${NC}        ${BOLD}${API_PUBLIC_URL}${NC}"

    if [ "$ENABLE_AUTH" = "yes" ]; then
      echo ""
      echo "  ${CYAN}Username:${NC}   ${BOLD}${ADMIN_USER}${NC}"
      echo "  ${CYAN}Password:${NC}   ${BOLD}${ADMIN_PASSWORD}${NC}"
      echo ""
      echo "  ${YELLOW}Save these credentials — they won't be shown again.${NC}"
      echo "  ${DIM}(Also saved to ${INSTALL_DIR}/.credentials)${NC}"
    fi
  else
    echo "  ${CYAN}API:${NC}        ${BOLD}${API_PUBLIC_URL}${NC}"
    echo ""
    info "Opening setup wizard in browser..."
    open_browser "${PUBLIC_URL}/setup"
  fi

  echo ""
  echo "  ${BOLD}Next step:${NC} Configure LLM API keys in the setup wizard."

  if [ -n "$SLACK_SETUP_INSTRUCTIONS" ]; then
    echo ""
    echo "$SLACK_SETUP_INSTRUCTIONS"
  fi

  echo ""
  echo "  ${DIM}Commands:${NC}"
  echo "    ${CYAN}kortix start${NC}         Start services"
  echo "    ${CYAN}kortix stop${NC}          Stop services"
  echo "    ${CYAN}kortix setup${NC}         Open setup wizard"
  echo "    ${CYAN}kortix update${NC}        Update to latest"
  echo "    ${CYAN}kortix logs${NC}          Tail logs"
  echo ""
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
      # Detect mode from .env and start accordingly
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
    echo ""
    info "Stopping old services..."
    cd "$INSTALL_DIR"
    docker compose --profile vps down 2>/dev/null || docker compose down 2>/dev/null || true
    docker rm -f kortix-sandbox 2>/dev/null || true
    echo ""
  fi

  # ─── Interactive setup ──────────────────────────────────────────────────
  prompt_mode

  if [ "$DEPLOY_MODE" = "vps" ]; then
    prompt_domain
    prompt_security
  fi

  # ─── Architecture overview ───────────────────────────────────────────────
  echo "  ${BOLD}What gets installed:${NC}"
  echo ""
  if [ "$DEPLOY_MODE" = "vps" ]; then
    echo "    ${CYAN}Caddy${NC}        ${DIM}HTTPS reverse proxy${NC}"
    echo "      ${DIM}|${NC}"
  fi
  echo "    ${CYAN}Frontend${NC}  -> ${CYAN}API${NC}  -> ${CYAN}Sandbox${NC}"
  echo "    ${DIM}Dashboard    Router   AI Agent${NC}"
  echo "                 ${DIM}|${NC}"
  echo "            ${CYAN}PostgreSQL${NC}"
  echo ""
  echo "  ${DIM}Networking, auth, and integrations${NC}"
  echo "  ${DIM}are configured here. LLM keys are${NC}"
  echo "  ${DIM}set in the browser after install.${NC}"
  echo ""

  prompt_integrations

  compute_urls

  prompt_channels

  prompt_deployments

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
