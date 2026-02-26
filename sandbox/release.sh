#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix Computer — Unified Release Script                                  ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    ./sandbox/release.sh 0.6.0                                              ║
# ║    ./sandbox/release.sh --dry-run 0.6.0                                    ║
# ║    ./sandbox/release.sh --docker 0.6.0                 (include Docker)    ║
# ║    ./sandbox/release.sh --docker --sandbox-only 0.6.0  (Docker sandbox)    ║
# ║                                                                            ║
# ║  Publishes: Sandbox (npm), GitHub Release, Docker (optional)               ║
# ║  Stamps:    sandbox/package.json, scripts/get-kortix.sh                    ║
# ║  Tracks:    artifacts[] in CHANGELOG.json (auto-populated)                 ║
# ║  Commits:   auto-commits version bump at the end (unless --no-commit)      ║
# ║  Resumes:   state tracked in .release-state.json — re-run to resume        ║
# ║                                                                            ║
# ║  Note: CLI (opencode-ai) and SDK (@opencode-ai/sdk) are upstream packages  ║
# ║  published by anomalyco — we no longer publish our own fork.               ║
# ║                                                                            ║
# ║  See docs/releasing.md for full documentation.                             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX_DIR="$REPO_ROOT/sandbox"
CHANGELOG="$SANDBOX_DIR/CHANGELOG.json"
PACKAGE_JSON="$SANDBOX_DIR/package.json"
GET_KORTIX="$REPO_ROOT/scripts/get-kortix.sh"
FRONTEND_DIR="$REPO_ROOT/apps/frontend"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; NC=$'\033[0m'

ok()   { echo "  ${GREEN}✓${NC} $*"; }
fail() { echo "  ${RED}✗${NC} $*" >&2; }
info() { echo "  ${CYAN}▸${NC} $*"; }
warn() { echo "  ${YELLOW}⚠${NC} $*"; }

# ─── Parse args ──────────────────────────────────────────────────────────────
DRY_RUN=false
BUILD_DOCKER=false
DOCKER_SANDBOX_ONLY=false
SKIP_DAYTONA=false
NO_COMMIT=false
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)        DRY_RUN=true ;;
    --docker)         BUILD_DOCKER=true ;;
    --sandbox-only)   DOCKER_SANDBOX_ONLY=true ;;
    --skip-daytona)   SKIP_DAYTONA=true ;;
    --no-commit)      NO_COMMIT=true ;;
    -h|--help)
      echo "Usage: ./sandbox/release.sh [flags] <version>"
      echo ""
      echo "Flags:"
      echo "  --dry-run        Validate only, publish nothing"
      echo "  --docker         Also build+push Docker images + Daytona snapshot"
      echo "  --sandbox-only   With --docker: only push sandbox image (skip API + frontend)"
      echo "  --skip-daytona   With --docker: push to Docker Hub only, skip Daytona snapshot"
      echo "  --no-commit      Don't auto-commit the version bump at the end"
      echo ""
      echo "Note: CLI (opencode-ai) and SDK (@opencode-ai/sdk) are upstream packages."
      echo "      We pin the CLI version in sandbox/package.json but do not publish it."
      echo ""
      echo "Examples:"
      echo "  ./sandbox/release.sh 0.6.0                                  # Full release"
      echo "  ./sandbox/release.sh --dry-run 0.6.0                        # Validate only"
      echo "  ./sandbox/release.sh --docker 0.6.0                         # All + Docker"
      echo "  ./sandbox/release.sh --docker --sandbox-only 0.6.0          # All + Docker sandbox"
      echo "  ./sandbox/release.sh --docker --skip-daytona 0.6.0          # Docker Hub only"
      exit 0
      ;;
    *)                VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Usage: ./sandbox/release.sh [flags] <version>"
  echo "Run with --help for details."
  exit 1
fi

echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${BOLD}  Kortix Computer Release — v${VERSION}${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
$DRY_RUN && echo "  ${YELLOW}DRY RUN — nothing will be published${NC}"
echo ""

# ─── Release state (resumability) ────────────────────────────────────────────
STATE_FILE="$REPO_ROOT/.release-state.json"

# Read state: returns "done" if step completed, "" otherwise
step_done() {
  local step="$1"
  if [ -f "$STATE_FILE" ]; then
    node -e "
      const s = require('$STATE_FILE');
      if (s.version === '$VERSION' && s.steps && s.steps['$step']) process.exit(0);
      process.exit(1);
    " 2>/dev/null && return 0
  fi
  return 1
}

# Mark step as complete
step_complete() {
  local step="$1"
  node -e "
    const fs = require('fs');
    let s = {};
    try { s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8')); } catch {}
    if (s.version !== '$VERSION') s = { version: '$VERSION', steps: {} };
    if (!s.steps) s.steps = {};
    s.steps['$step'] = new Date().toISOString();
    fs.writeFileSync('$STATE_FILE', JSON.stringify(s, null, 2) + '\n');
  "
}

# Check if resuming
if [ -f "$STATE_FILE" ] && ! $DRY_RUN; then
  STATE_VER=$(node -e "try{console.log(require('$STATE_FILE').version)}catch{}" 2>/dev/null || true)
  if [ "$STATE_VER" = "$VERSION" ]; then
    info "Resuming release v$VERSION (state file found)"
  elif [ -n "$STATE_VER" ]; then
    warn "State file is for v$STATE_VER, starting fresh for v$VERSION"
    rm -f "$STATE_FILE"
  fi
fi

# ─── Artifact tracker ────────────────────────────────────────────────────────
ARTIFACTS=()
add_artifact() { ARTIFACTS+=("$1|$2"); }

# ─── Step 0: Prerequisites ──────────────────────────────────────────────────
info "Checking prerequisites..."

MISSING=false
for cmd in node npm gh bun; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "Missing: $cmd"
    MISSING=true
  fi
done

# Docker prerequisites (checked upfront, not at step 8)
if $BUILD_DOCKER; then
  if ! command -v docker &>/dev/null; then
    fail "Missing: docker (required for --docker)"
    MISSING=true
  elif ! docker info &>/dev/null 2>&1; then
    fail "Docker daemon not running"
    MISSING=true
  fi
  if ! $SKIP_DAYTONA; then
    if ! command -v daytona &>/dev/null; then
      fail "Missing: daytona CLI (required for Daytona snapshot — or pass --skip-daytona)"
      MISSING=true
    fi
  fi
fi

$MISSING && exit 1

# npm auth
if ! npm whoami &>/dev/null; then
  fail "Not logged in to npm. Run: npm login"
  exit 1
fi
ok "npm auth: $(npm whoami)"

# gh auth
if ! gh auth status &>/dev/null 2>&1; then
  fail "Not logged in to gh. Run: gh auth login"
  exit 1
fi
ok "gh auth: ok"

# Docker auth (check early)
if $BUILD_DOCKER; then
  if ! docker buildx inspect multiarch &>/dev/null 2>&1; then
    info "Creating buildx builder 'multiarch'..."
    docker buildx create --name multiarch --use --bootstrap
  fi
  ok "docker buildx: ready"
fi

# Clean working tree (warn only)
if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  warn "Working tree has uncommitted changes"
fi

# ─── Step 1: Validate changelog ─────────────────────────────────────────────
info "Validating CHANGELOG.json..."

if [ ! -f "$CHANGELOG" ]; then
  fail "CHANGELOG.json not found at $CHANGELOG"
  exit 1
fi

ENTRY_JSON=$(node -e "
  const cl = require('$CHANGELOG');
  const entry = cl.find(e => e.version === '$VERSION');
  if (!entry) { process.stderr.write('No changelog entry for $VERSION\n'); process.exit(1); }
  if (!entry.title) { process.stderr.write('Changelog missing title\n'); process.exit(1); }
  if (!entry.changes || entry.changes.length === 0) { process.stderr.write('Changelog has no changes\n'); process.exit(1); }
  process.stdout.write(JSON.stringify(entry));
" 2>&1) || { fail "$ENTRY_JSON"; exit 1; }

TITLE=$(node -e "console.log(JSON.parse(process.argv[1]).title)" "$ENTRY_JSON")
ok "Changelog: \"$TITLE\""

# ─── Step 2: Check availability ─────────────────────────────────────────────
# Instead of failing on conflicts, detect already-published artifacts and skip them.
info "Checking existing artifacts..."

SANDBOX_EXISTS=false
GH_EXISTS=false

if npm view "@kortix/sandbox@$VERSION" version &>/dev/null 2>&1; then
  SANDBOX_EXISTS=true
  warn "@kortix/sandbox@$VERSION already on npm — will skip"
fi
if gh release view "v$VERSION" --repo kortix-ai/computer &>/dev/null 2>&1; then
  GH_EXISTS=true
  warn "GitHub release v$VERSION already exists — will skip"
fi

# Daytona snapshot
if $BUILD_DOCKER && ! $SKIP_DAYTONA; then
  DAYTONA_SNAPSHOT_NAME="kortix-sandbox-v${VERSION}"
  if daytona snapshot list 2>/dev/null | grep -q "$DAYTONA_SNAPSHOT_NAME"; then
    warn "Daytona snapshot $DAYTONA_SNAPSHOT_NAME already exists — will skip"
    SKIP_DAYTONA=true
  else
    ok "Daytona: $DAYTONA_SNAPSHOT_NAME available"
  fi
fi

ok "Conflict check done"

# ─── Step 3: Bump versions ──────────────────────────────────────────────────
if ! step_done "bump"; then
  info "Bumping versions to $VERSION..."

  if $DRY_RUN; then
    ok "(dry-run) Would bump sandbox/package.json → $VERSION"
    ok "(dry-run) Would bump get-kortix.sh VERSION → $VERSION"
  else
    # sandbox/package.json — version (CLI dep is upstream opencode-ai, pinned separately)
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
      pkg.version = '$VERSION';
      fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
    "
    ok "sandbox/package.json → $VERSION"

    # get-kortix.sh — installer image version + embedded CLI version
    if [ -f "$GET_KORTIX" ]; then
      sed -i.bak "s/^KORTIX_VERSION=\"[^\"]*\"/KORTIX_VERSION=\"$VERSION\"/" "$GET_KORTIX"
      rm -f "${GET_KORTIX}.bak"
      sed -i.bak "s/^VERSION=\"[^\"]*\"/VERSION=\"$VERSION\"/" "$GET_KORTIX"
      rm -f "${GET_KORTIX}.bak"
      ok "get-kortix.sh KORTIX_VERSION + VERSION → $VERSION"
    else
      warn "get-kortix.sh not found, skipping stamp"
    fi

    # kortix-api config.ts — SANDBOX_VERSION constant
    API_CONFIG="$REPO_ROOT/services/kortix-api/src/config.ts"
    if [ -f "$API_CONFIG" ]; then
      sed -i.bak "s/^export const SANDBOX_VERSION = '[^']*'/export const SANDBOX_VERSION = '$VERSION'/" "$API_CONFIG"
      rm -f "${API_CONFIG}.bak"
      ok "config.ts SANDBOX_VERSION → $VERSION"
    fi

    step_complete "bump"
  fi
else
  ok "Versions already bumped (resuming)"
fi

# ─── Step 4: Publish @kortix/sandbox ─────────────────────────────────────────
# Note: Steps 4 and 5 used to be CLI and SDK fork publishing. Those are removed
# since we now use upstream opencode-ai from npm directly. The sandbox package
# is the only Kortix-published npm artifact.
if $SANDBOX_EXISTS; then
  info "Sandbox already on npm — skipping"
  add_artifact "@kortix/sandbox@$VERSION" "npm"
elif ! step_done "sandbox"; then
  info "Publishing @kortix/sandbox@$VERSION..."

  if $DRY_RUN; then
    ok "(dry-run) Would publish @kortix/sandbox@$VERSION"
    echo ""
    info "Files that would be included:"
    (cd "$SANDBOX_DIR" && npm pack --dry-run 2>&1 | head -30)
    echo ""
  else
    (cd "$SANDBOX_DIR" && npm publish --access public)
    ok "@kortix/sandbox@$VERSION published"
    add_artifact "@kortix/sandbox@$VERSION" "npm"

    # Verify
    sleep 5
    if npm view "@kortix/sandbox@$VERSION" version &>/dev/null 2>&1; then
      ok "Verified on npm registry"
    else
      warn "npm registry may be slow to propagate — check manually"
    fi
    step_complete "sandbox"
  fi
else
  ok "Sandbox already published (resuming)"
  add_artifact "@kortix/sandbox@$VERSION" "npm"
fi

# ─── Step 5: GitHub Release ─────────────────────────────────────────────────
if $GH_EXISTS; then
  info "GitHub release already exists — skipping"
  add_artifact "v$VERSION" "github-release"
elif ! step_done "github"; then
  info "Creating GitHub Release v$VERSION..."

  RELEASE_NOTES=$(node -e "
    const e = JSON.parse(process.argv[1]);
    const icons = { feature:'✨', fix:'🐛', improvement:'⚡', breaking:'💥', upstream:'🔄', security:'🔒', deprecation:'⚠️' };
    let md = '## ' + e.title + '\n\n' + e.description + '\n\n### Changes\n\n';
    for (const c of e.changes) md += (icons[c.type]||'•') + ' **' + c.type + ':** ' + c.text + '\n';
    md += '\n### Install / Update\n\nRunning sandboxes auto-detect this version. Click **Update** in the sidebar.\n\n';
    md += '\`\`\`bash\nnpm install -g @kortix/sandbox@$VERSION\n\`\`\`\n';
    process.stdout.write(md);
  " "$ENTRY_JSON")

  if $DRY_RUN; then
    ok "(dry-run) Would create GitHub release v$VERSION"
    echo ""
    echo "${DIM}--- Release notes preview ---${NC}"
    echo "$RELEASE_NOTES" | head -20
    echo "${DIM}...${NC}"
    echo ""
  else
    echo "$RELEASE_NOTES" | gh release create "v$VERSION" \
      --repo kortix-ai/computer \
      --title "v$VERSION — $TITLE" \
      --notes-file - \
      --latest
    ok "GitHub release v$VERSION created"
    add_artifact "v$VERSION" "github-release"
    step_complete "github"
  fi
else
  ok "GitHub release already created (resuming)"
  add_artifact "v$VERSION" "github-release"
fi

# ─── Step 6: Docker (optional) ──────────────────────────────────────────────
if $BUILD_DOCKER && ! $DRY_RUN; then
  DOCKER_ORG="kortix"
  PLATFORMS="linux/amd64,linux/arm64"

  # Docker socket detection (OrbStack)
  if [ -z "${DOCKER_HOST:-}" ]; then
    if [ -S "$HOME/.orbstack/run/docker.sock" ]; then
      export DOCKER_HOST="unix://$HOME/.orbstack/run/docker.sock"
    fi
  fi

  # Ensure buildx is ready
  docker buildx use multiarch 2>/dev/null || true

  # ── 6a: Sandbox image ──────────────────────────────────────────────────
  if ! step_done "docker-sandbox"; then
    info "Building + pushing sandbox Docker image..."
    docker buildx build --platform "${PLATFORMS}" \
      -f sandbox/Dockerfile \
      -t "${DOCKER_ORG}/sandbox:${VERSION}" \
      -t "${DOCKER_ORG}/sandbox:latest" \
      --push "$REPO_ROOT"
    ok "sandbox → Docker Hub (${VERSION} + latest)"
    add_artifact "${DOCKER_ORG}/sandbox:${VERSION}" "docker-hub"
    step_complete "docker-sandbox"
  else
    ok "Sandbox Docker already pushed (resuming)"
    add_artifact "${DOCKER_ORG}/sandbox:${VERSION}" "docker-hub"
  fi

  # ── 6b: Daytona snapshot (right after sandbox — only depends on sandbox)
  if ! $SKIP_DAYTONA; then
    if ! step_done "daytona"; then
      DAYTONA_SNAPSHOT_NAME="kortix-sandbox-v${VERSION}"
      info "Creating Daytona snapshot from Docker Hub image..."
      daytona snapshot create "${DAYTONA_SNAPSHOT_NAME}" \
        --image "${DOCKER_ORG}/sandbox:${VERSION}" \
        --cpu 4 \
        --memory 8 \
        --disk 20
      ok "Daytona snapshot: ${DAYTONA_SNAPSHOT_NAME}"
      add_artifact "${DAYTONA_SNAPSHOT_NAME}" "daytona"
      step_complete "daytona"

      echo ""
      info "Update your platform .env:"
      echo "    DAYTONA_SNAPSHOT=${DAYTONA_SNAPSHOT_NAME}"
    else
      ok "Daytona snapshot already created (resuming)"
      DAYTONA_SNAPSHOT_NAME="kortix-sandbox-v${VERSION}"
      add_artifact "${DAYTONA_SNAPSHOT_NAME}" "daytona"
    fi
  fi

  # ── 6c: API image ─────────────────────────────────────────────────────
  if ! $DOCKER_SANDBOX_ONLY; then
    if ! step_done "docker-api"; then
      info "Building + pushing API Docker image..."
      docker buildx build --platform "${PLATFORMS}" \
        --build-arg SERVICE=kortix-api \
        -f services/Dockerfile \
        -t "${DOCKER_ORG}/kortix-api:${VERSION}" \
        -t "${DOCKER_ORG}/kortix-api:latest" \
        --push "$REPO_ROOT"
      ok "kortix-api → Docker Hub (${VERSION} + latest)"
      add_artifact "${DOCKER_ORG}/kortix-api:${VERSION}" "docker-hub"
      step_complete "docker-api"
    else
      ok "API Docker already pushed (resuming)"
      add_artifact "${DOCKER_ORG}/kortix-api:${VERSION}" "docker-hub"
    fi
  fi

  # ── 6d: Frontend image ────────────────────────────────────────────────
  if ! $DOCKER_SANDBOX_ONLY; then
    if ! step_done "docker-frontend"; then
      # Auto-build frontend standalone if not already built
      if [ ! -d "$FRONTEND_DIR/.next/standalone" ]; then
        info "Building frontend (standalone mode)..."
        (
          cd "$FRONTEND_DIR"
          NEXT_PUBLIC_ENV_MODE=local \
          NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1 \
          NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
          NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder \
          NEXT_OUTPUT=standalone \
          pnpm run build
        )
        ok "Frontend built (standalone)"
      else
        ok "Frontend standalone already built"
      fi

      info "Building + pushing frontend Docker image..."
      docker buildx build --platform "${PLATFORMS}" --no-cache \
        -f apps/frontend/Dockerfile \
        -t "${DOCKER_ORG}/kortix-frontend:${VERSION}" \
        -t "${DOCKER_ORG}/kortix-frontend:latest" \
        --push "$REPO_ROOT"
      ok "kortix-frontend → Docker Hub (${VERSION} + latest)"
      add_artifact "${DOCKER_ORG}/kortix-frontend:${VERSION}" "docker-hub"
      step_complete "docker-frontend"
    else
      ok "Frontend Docker already pushed (resuming)"
      add_artifact "${DOCKER_ORG}/kortix-frontend:${VERSION}" "docker-hub"
    fi
  fi

elif $BUILD_DOCKER && $DRY_RUN; then
  ok "(dry-run) Would build + push Docker images"
  $DOCKER_SANDBOX_ONLY && echo "    ${DIM}(sandbox only)${NC}" || echo "    ${DIM}(all 3 images)${NC}"
  $SKIP_DAYTONA || echo "    ${DIM}+ Daytona snapshot${NC}"
else
  info "Skipping Docker (pass --docker to include)"
fi

# ─── Step 7: Write artifacts to CHANGELOG.json ──────────────────────────────
if [ ${#ARTIFACTS[@]} -gt 0 ] && ! $DRY_RUN; then
  info "Writing artifacts to CHANGELOG.json..."
  ARTIFACTS_JSON=$(node -e "
    const arts = process.argv.slice(1).map(a => {
      const [name, target] = a.split('|');
      return { name, target };
    });
    process.stdout.write(JSON.stringify(arts));
  " "${ARTIFACTS[@]}")

  node -e "
    const fs = require('fs');
    const cl = JSON.parse(fs.readFileSync('$CHANGELOG', 'utf8'));
    const entry = cl.find(e => e.version === '$VERSION');
    if (entry) {
      entry.artifacts = JSON.parse(process.argv[1]);
      fs.writeFileSync('$CHANGELOG', JSON.stringify(cl, null, 2) + '\n');
    }
  " "$ARTIFACTS_JSON"
  ok "Artifacts written to CHANGELOG.json (${#ARTIFACTS[@]} items)"
fi

# ─── Step 8: Final validation ──────────────────────────────────────────────
if ! $DRY_RUN; then
  echo ""
  info "Validating published artifacts..."
  VALID=true

  # npm
  if npm view "@kortix/sandbox@$VERSION" version &>/dev/null 2>&1; then
    ok "npm: @kortix/sandbox@$VERSION"
  else
    fail "npm: @kortix/sandbox@$VERSION NOT FOUND"
    VALID=false
  fi

  # GitHub
  if gh release view "v$VERSION" --repo kortix-ai/computer &>/dev/null 2>&1; then
    ok "GitHub: v$VERSION"
  else
    fail "GitHub: v$VERSION NOT FOUND"
    VALID=false
  fi

  # Docker
  if $BUILD_DOCKER; then
    for img in sandbox; do
      if docker manifest inspect "${DOCKER_ORG:-kortix}/$img:$VERSION" &>/dev/null 2>&1; then
        ok "Docker Hub: ${DOCKER_ORG:-kortix}/$img:$VERSION"
      else
        fail "Docker Hub: ${DOCKER_ORG:-kortix}/$img:$VERSION NOT FOUND"
        VALID=false
      fi
    done
    if ! $DOCKER_SANDBOX_ONLY; then
      for img in kortix-api kortix-frontend; do
        if docker manifest inspect "${DOCKER_ORG:-kortix}/$img:$VERSION" &>/dev/null 2>&1; then
          ok "Docker Hub: ${DOCKER_ORG:-kortix}/$img:$VERSION"
        else
          fail "Docker Hub: ${DOCKER_ORG:-kortix}/$img:$VERSION NOT FOUND"
          VALID=false
        fi
      done
    fi
  fi

  if $VALID; then
    ok "All artifacts validated!"
  else
    warn "Some artifacts missing — check above"
  fi
fi

# ─── Step 9: Auto-commit ───────────────────────────────────────────────────
if ! $DRY_RUN && ! $NO_COMMIT; then
  info "Committing version bump..."
  (
    cd "$REPO_ROOT"
    git add sandbox/package.json sandbox/CHANGELOG.json
    [ -f "$GET_KORTIX" ] && git add scripts/get-kortix.sh
    git commit -m "release: v$VERSION" --allow-empty 2>/dev/null || true
  )
  ok "Committed: release: v$VERSION"
  echo ""
  echo "  ${DIM}Push when ready:${NC}"
  echo "    git push"
elif $DRY_RUN; then
  : # no message needed for dry run
else
  echo ""
  echo "  ${DIM}Don't forget to commit + push:${NC}"
  echo "    git add sandbox/package.json sandbox/CHANGELOG.json scripts/get-kortix.sh"
  echo "    git commit -m 'release: v$VERSION'"
  echo "    git push"
fi

# ─── Cleanup state file ─────────────────────────────────────────────────────
if ! $DRY_RUN; then
  rm -f "$STATE_FILE"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${GREEN}${BOLD}  ✓ Release v${VERSION} complete!${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
if [ ${#ARTIFACTS[@]} -gt 0 ]; then
  echo "  Published:"
  for art in "${ARTIFACTS[@]}"; do
    IFS='|' read -r name target <<< "$art"
    echo "    ${CYAN}•${NC} ${name}  ${DIM}(${target})${NC}"
  done
else
  echo "  ${DIM}(dry-run — nothing published)${NC}"
fi
echo ""
