#!/usr/bin/env bash
#
# Build & push all Docker images to Docker Hub + create Daytona snapshot.
#
# Usage:
#   cd <repo-root>
#   ./scripts/release/sandbox/push.sh                    # All 3 images + Daytona snapshot
#   ./scripts/release/sandbox/push.sh --sandbox-only     # Only sandbox image + Daytona
#   ./scripts/release/sandbox/push.sh --skip-daytona     # Docker Hub only, no Daytona snapshot
#   ./scripts/release/sandbox/push.sh --skip-frontend    # Skip frontend build+push
#
# What it does:
#   1. Reads version from packages/sandbox/package.json (single source of truth)
#   2. Builds all 3 images multi-platform (amd64 + arm64)
#   3. Pushes to Docker Hub with both :latest and :{version} tags
#   4. Builds + pushes PostgreSQL image with pg_cron + pg_net
#   5. Creates Daytona snapshot from the Docker Hub image (no local upload)
#
# Prerequisites:
#   - Docker running with buildx (multi-platform)
#   - `docker login` to Docker Hub
#   - `daytona` CLI installed and authenticated (unless --skip-daytona)
#   - Frontend must be pre-built for Docker Hub push (pnpm build in apps/frontend)
#   - Run from the repo root
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SANDBOX_PACKAGE_DIR="$REPO_ROOT/packages/sandbox"
RELEASE_MANIFEST="$SANDBOX_PACKAGE_DIR/release.json"

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; NC=$'\033[0m'

ok()   { echo "  ${GREEN}✓${NC} $*"; }
fail() { echo "  ${RED}✗${NC} $*" >&2; }
info() { echo "  ${CYAN}▸${NC} $*"; }
warn() { echo "  ${YELLOW}⚠${NC} $*"; }

# ── Parse args ──────────────────────────────────────────────────────────────
SANDBOX_ONLY=false
SKIP_DAYTONA=false
SKIP_FRONTEND=false
CLOUD_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --sandbox-only)   SANDBOX_ONLY=true ;;
    --skip-daytona)   SKIP_DAYTONA=true ;;
    --skip-frontend)  SKIP_FRONTEND=true ;;
    --cloud)          CLOUD_BUILD=true ;;
    -h|--help)
      echo "Usage: ./scripts/release/sandbox/push.sh [flags]"
      echo ""
      echo "Flags:"
      echo "  --sandbox-only    Only build+push sandbox (skip API + frontend)"
      echo "  --skip-daytona    Push to Docker Hub only, skip Daytona snapshot"
      echo "  --skip-frontend   Skip frontend build+push"
      echo "  --cloud           Build frontend with billing enabled (cloud mode)"
      echo ""
      echo "Images pushed to Docker Hub (kortix/):"
      echo "  kortix/computer:{version} + :latest"
      echo "  kortix/kortix-api:{version} + :latest"
      echo "  kortix/postgres:{version} + :latest"
      echo "  kortix/kortix-frontend:{version} + :latest"
      exit 0
      ;;
    *)
      fail "Unknown flag: $arg"
      exit 1
      ;;
  esac
done

# ── Read version from release manifest ──────────────────────────────────────
VERSION=$(node -e "console.log(require('$RELEASE_MANIFEST').releaseVersion)")
if [ -z "$VERSION" ]; then
  fail "Could not read version from packages/sandbox/release.json"
  exit 1
fi

DOCKER_ORG="kortix"
PLATFORMS="linux/amd64,linux/arm64"
DAYTONA_SNAPSHOT_NAME="kortix-sandbox-v${VERSION}"

echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${BOLD}  Docker Push — v${VERSION}${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Docker Hub org:  ${DOCKER_ORG}"
echo "  Platforms:       ${PLATFORMS}"
$SKIP_DAYTONA || echo "  Daytona snapshot: ${DAYTONA_SNAPSHOT_NAME}"
echo ""

# ── Docker socket detection ─────────────────────────────────────────────────
if [ -z "${DOCKER_HOST:-}" ]; then
  if [ -S "$HOME/.orbstack/run/docker.sock" ]; then
    export DOCKER_HOST="unix://$HOME/.orbstack/run/docker.sock"
  fi
fi

# ── Ensure buildx builder exists ────────────────────────────────────────────
if ! docker buildx inspect multiarch &>/dev/null; then
  info "Creating buildx builder 'multiarch'..."
  docker buildx create --name multiarch --use --bootstrap
else
  docker buildx use multiarch 2>/dev/null || true
fi

# Track what was pushed for summary
PUSHED=()

# ── Sandbox ─────────────────────────────────────────────────────────────────
info "Building + pushing sandbox..."
docker buildx build --platform "${PLATFORMS}" \
  -f packages/sandbox/docker/Dockerfile \
  -t "${DOCKER_ORG}/computer:${VERSION}" \
  -t "${DOCKER_ORG}/computer:latest" \
  --push "$REPO_ROOT"
ok "computer → Docker Hub (${VERSION} + latest)"
PUSHED+=("${DOCKER_ORG}/computer:${VERSION}")

# ── API ─────────────────────────────────────────────────────────────────────
if ! $SANDBOX_ONLY; then
  info "Building + pushing API..."
  docker buildx build --platform "${PLATFORMS}" \
    --build-arg SERVICE=kortix-api \
    -f kortix-api/Dockerfile \
    -t "${DOCKER_ORG}/kortix-api:${VERSION}" \
    -t "${DOCKER_ORG}/kortix-api:latest" \
    --push "$REPO_ROOT"
  ok "kortix-api → Docker Hub (${VERSION} + latest)"
  PUSHED+=("${DOCKER_ORG}/kortix-api:${VERSION}")
fi

# ── PostgreSQL (pg_cron + pg_net) ────────────────────────────────────────────
if ! $SANDBOX_ONLY; then
  info "Building + pushing PostgreSQL..."
  docker buildx build --platform "${PLATFORMS}" \
    -f services/postgres/Dockerfile \
    -t "${DOCKER_ORG}/postgres:${VERSION}" \
    -t "${DOCKER_ORG}/postgres:latest" \
    --push "$REPO_ROOT/services/postgres"
  ok "postgres → Docker Hub (${VERSION} + latest)"
  PUSHED+=("${DOCKER_ORG}/postgres:${VERSION}")
fi

# ── Frontend ────────────────────────────────────────────────────────────────
if ! $SANDBOX_ONLY && ! $SKIP_FRONTEND; then
  # For cloud builds, rebuild frontend with billing enabled
  if $CLOUD_BUILD; then
    info "Rebuilding frontend with billing enabled (cloud mode)..."
    (
      cd "$REPO_ROOT/apps/frontend"
      NEXT_PUBLIC_BILLING_ENABLED=true NEXT_OUTPUT=standalone pnpm build
    )
  else
    # Check that frontend was pre-built (self-hosted mode uses host's .env)
    if [ ! -d "$REPO_ROOT/apps/frontend/.next/standalone" ]; then
      fail "Frontend not built. Run first:"
      echo "    cd apps/frontend && NEXT_OUTPUT=standalone pnpm build"
      exit 1
    fi
  fi

  info "Building + pushing frontend..."
  docker buildx build --platform "${PLATFORMS}" --no-cache \
    -f apps/frontend/Dockerfile \
    -t "${DOCKER_ORG}/kortix-frontend:${VERSION}" \
    -t "${DOCKER_ORG}/kortix-frontend:latest" \
    --push "$REPO_ROOT"
  ok "kortix-frontend → Docker Hub (${VERSION} + latest)"
  PUSHED+=("${DOCKER_ORG}/kortix-frontend:${VERSION}")
fi

# ── Daytona snapshot from Docker Hub ────────────────────────────────────────
if ! $SKIP_DAYTONA; then
  info "Creating Daytona snapshot from Docker Hub image..."
  daytona snapshot create "${DAYTONA_SNAPSHOT_NAME}" \
    --image "${DOCKER_ORG}/computer:${VERSION}" \
    --cpu 4 \
    --memory 8 \
    --disk 20
  ok "Daytona snapshot: ${DAYTONA_SNAPSHOT_NAME}"
  PUSHED+=("daytona:${DAYTONA_SNAPSHOT_NAME}")

  echo ""
  info "Set in your platform .env:"
  echo "    DAYTONA_SNAPSHOT=${DAYTONA_SNAPSHOT_NAME}"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${GREEN}${BOLD}  ✓ Docker push complete!${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Published:"
for img in "${PUSHED[@]}"; do
  echo "    ${CYAN}•${NC} ${img}"
done
echo ""
