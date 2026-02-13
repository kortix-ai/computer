#!/usr/bin/env bash
#
# Build the sandbox Docker image and push it to Daytona as a snapshot.
#
# Usage:
#   cd <repo-root>
#   ./sandbox/push.sh
#
# What it does:
#   1. Reads version from sandbox/package.json (single source of truth)
#   2. Builds the Docker image for linux/amd64
#   3. Pushes it to Daytona as snapshot "kortix-sandbox-v{version}"
#
# Prerequisites:
#   - Docker running
#   - `daytona` CLI installed and authenticated
#   - Run from the repo root (parent of sandbox/)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Read version from package.json ──────────────────────────────────────────
VERSION=$(node -e "console.log(require('$SCRIPT_DIR/package.json').version)")
if [ -z "$VERSION" ]; then
  echo "ERROR: Could not read version from sandbox/package.json"
  exit 1
fi

IMAGE_NAME="kortix-sandbox"
IMAGE_TAG="${IMAGE_NAME}:${VERSION}"
SNAPSHOT_NAME="${IMAGE_NAME}-v${VERSION}"

echo "──────────────────────────────────────────────"
echo "  Version:  ${VERSION}"
echo "  Image:    ${IMAGE_TAG}"
echo "  Snapshot: ${SNAPSHOT_NAME}"
echo "──────────────────────────────────────────────"
echo ""

# ── Docker socket detection ─────────────────────────────────────────────────
# OrbStack uses a non-standard socket path. Daytona CLI needs DOCKER_HOST set.
if [ -z "${DOCKER_HOST:-}" ]; then
  if [ -S "$HOME/.orbstack/run/docker.sock" ]; then
    export DOCKER_HOST="unix://$HOME/.orbstack/run/docker.sock"
  fi
fi

# ── Build ───────────────────────────────────────────────────────────────────
echo "[1/2] Building Docker image (linux/amd64)..."
docker build \
  --platform=linux/amd64 \
  -t "${IMAGE_TAG}" \
  -f sandbox/Dockerfile \
  "$REPO_ROOT"

echo ""
echo "[2/2] Pushing snapshot to Daytona..."
daytona snapshot push "${IMAGE_TAG}" \
  --name "${SNAPSHOT_NAME}" \
  --cpu 4 \
  --memory 8 \
  --disk 20

echo ""
echo "──────────────────────────────────────────────"
echo "  Done! Snapshot pushed: ${SNAPSHOT_NAME}"
echo ""
echo "  Set in your platform .env:"
echo "    DAYTONA_SNAPSHOT=${SNAPSHOT_NAME}"
echo "──────────────────────────────────────────────"
