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
KORTIX_VERSION="${KORTIX_VERSION:-latest}"

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
  --version <tag>     Install a specific image tag (default: latest)
  --version=<tag>     Same as above
  --query "v=<tag>"   Query-style version override
  --query "version=<tag>"

Examples:
  bash get-kortix.sh
  bash get-kortix.sh --version 0.7.14
  bash get-kortix.sh --query "v=0.7.14"
  KORTIX_VERSION=0.7.14 bash get-kortix.sh
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

FRONTEND_IMAGE="${KORTIX_FRONTEND_IMAGE:-kortix/kortix-frontend:${KORTIX_VERSION}}"
API_IMAGE="${KORTIX_API_IMAGE:-kortix/kortix-api:${KORTIX_VERSION}}"
SANDBOX_IMAGE="${KORTIX_SANDBOX_IMAGE:-kortix/sandbox:${KORTIX_VERSION}}"
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
FREESTYLE_API_KEY=""

# ─── Helpers ─────────────────────────────────────────────────────────────────
open_browser() {
  local url="$1"
  if command -v open &>/dev/null; then open "$url" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then xdg-open "$url" 2>/dev/null || true
  elif command -v wslview &>/dev/null; then wslview "$url" 2>/dev/null || true
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
    || echo ""
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

# ─── Deployments (Freestyle) ────────────────────────────────────────────────
prompt_deployments() {
  echo "  ${BOLD}Deployments — Freestyle ${DIM}(optional)${NC}"
  echo ""
  printf "  Configure deployments? ${DIM}[y/${NC}${GREEN}N${NC}${DIM}]${NC}: "
  read -r deploy_choice

  case "${deploy_choice:-n}" in
    [yY]*)
      printf "    Freestyle API Key: "
      read -r FREESTYLE_API_KEY
      [ -n "$FREESTYLE_API_KEY" ] && success "Freestyle configured" || warn "No key — deployments unavailable"
      ;;
    *) info "Skipping" ;;
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
  local frontend_ports api_ports supabase_ports
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
    container_name: supabase-db
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
    container_name: supabase-auth
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
    container_name: supabase-rest
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
    container_name: supabase-kong
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
      - SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - BACKEND_URL=http://kortix-api:8008/v1"
    else
      frontend_supabase_env="      - NEXT_PUBLIC_SUPABASE_URL=\${SUPABASE_PUBLIC_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
      - SUPABASE_URL=\${SUPABASE_PUBLIC_URL}
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
      - SANDBOX_IMAGE=${SANDBOX_IMAGE}
      - DOCKER_HOST=unix:///var/run/docker.sock
      - KORTIX_URL=http://kortix-api:8008/v1/router
      - SANDBOX_NETWORK=kortix_default
      - CRON_API_URL=http://kortix-api:8008
      - CRON_TICK_SECRET=\${CRON_TICK_SECRET}
      - SCHEDULER_ENABLED=true
      - INTERNAL_SERVICE_KEY=\${INTERNAL_SERVICE_KEY}
      - FRONTEND_URL=\${PUBLIC_URL}
      - CHANNELS_PUBLIC_URL=\${API_PUBLIC_URL}
      - CHANNELS_CREDENTIAL_KEY=\${CHANNELS_CREDENTIAL_KEY}
      - API_KEY_SECRET=\${API_KEY_SECRET}
      - CORS_ALLOWED_ORIGINS=\${PUBLIC_URL}
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
KORTIX_VERSION=${KORTIX_VERSION}

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
CRON_TICK_SECRET=${CRON_SECRET}
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

# ─── Deployments (Freestyle) ────────────────────────────────────────────────
FREESTYLE_API_KEY=${FREESTYLE_API_KEY}

# ─── Sandbox ─────────────────────────────────────────────────────────────────
SANDBOX_IMAGE=${SANDBOX_IMAGE}
ENVEOF

  chmod 600 "$INSTALL_DIR/.env"
  success "Saved .env"
}

# ─── Write credentials file (VPS mode) ──────────────────────────────────────
write_credentials() {
  [ "$DEPLOY_MODE" != "vps" ] || [ "$ENABLE_AUTH" != "yes" ] && return 0

  cat > "$INSTALL_DIR/.credentials" << CREDEOF
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

# ─── Write CLI ───────────────────────────────────────────────────────────────
write_cli() {
  cat > "$INSTALL_DIR/kortix" << 'CLIPATH'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

G=$'\033[0;32m'; R=$'\033[0;31m'; C=$'\033[0;36m'; Y=$'\033[1;33m'
B=$'\033[1m'; D=$'\033[2m'; N=$'\033[0m'
VERSION=$(grep -m1 '^KORTIX_VERSION=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || echo "latest")

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
    [ -f "$DIR/.credentials" ] && echo "  ${D}Credentials in: ${DIR}/.credentials${N}"
    echo ""
    ;;
  stop)
    docker compose --profile vps down 2>/dev/null || docker compose down
    docker stop kortix-sandbox 2>/dev/null || true
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
    echo "  ${C}Opening setup in browser...${N}"
    _open "$(_url)/setup"
    echo "  ${D}If it didn't open: ${B}$(_url)/setup${N}"
    ;;
  update)
    echo "  ${C}Pulling latest images...${N}"
    docker compose pull
    # Pull sandbox image (managed by API, not in compose)
    local sb_img
    sb_img=$(grep -m1 '^SANDBOX_IMAGE=' "$DIR/.env" 2>/dev/null | cut -d= -f2-)
    [ -n "$sb_img" ] && docker pull "$sb_img" 2>/dev/null || true
    docker compose --profile vps down 2>/dev/null || docker compose down
    if [ "$(_mode)" = "vps" ]; then
      docker compose --profile vps up -d
    else
      docker compose up -d
    fi
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
    echo "  ${C}setup${N}         Open setup wizard in browser"
    echo "  ${C}update${N}        Pull latest images & restart"
    echo "  ${C}open${N}          Open dashboard in browser"
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
  info "Pulling Docker images..."
  echo ""

  cd "$INSTALL_DIR"
  docker compose pull

  echo ""
  info "Pre-pulling sandbox image (${SANDBOX_IMAGE})..."
  docker pull "${SANDBOX_IMAGE}"
  success "Sandbox image ready"

  echo ""
  info "Starting Kortix..."
  echo ""

  if [ "$DEPLOY_MODE" = "vps" ]; then
    docker compose --profile vps up -d
  else
    docker compose up -d
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
    info "Opening setup wizard..."
    open_browser "${PUBLIC_URL}/setup"
  fi

  echo ""
  echo "  ${BOLD}Next:${NC} Create your account in the setup wizard."

  echo ""
  echo "  ${DIM}Commands:${NC}"
  echo "    ${CYAN}kortix start${NC}    Start services"
  echo "    ${CYAN}kortix stop${NC}     Stop services"
  echo "    ${CYAN}kortix setup${NC}    Open setup wizard"
  echo "    ${CYAN}kortix update${NC}   Update to latest"
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
  prompt_deployments
  generate_secrets

  mkdir -p "$INSTALL_DIR"

  write_kong_config
  write_db_init
  fixup_db_init
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
