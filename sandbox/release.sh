#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix Computer — Unified Release Script                                  ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    ./sandbox/release.sh 0.5.0                                              ║
# ║    ./sandbox/release.sh --dry-run 0.5.0                                    ║
# ║    ./sandbox/release.sh --skip-cli --skip-sdk 0.5.0   (sandbox-only)       ║
# ║    ./sandbox/release.sh --docker 0.5.0                 (include Docker)    ║
# ║                                                                            ║
# ║  Publishes: CLI → SDK → Sandbox (npm), GitHub Release, Docker (optional)   ║
# ║  Stamps:    sandbox/package.json, scripts/get-kortix.sh                    ║
# ║                                                                            ║
# ║  See docs/releasing.md for full documentation.                             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX_DIR="$REPO_ROOT/sandbox"
OPENCODE_DIR="$REPO_ROOT/services/opencode"
CHANGELOG="$SANDBOX_DIR/CHANGELOG.json"
PACKAGE_JSON="$SANDBOX_DIR/package.json"
GET_KORTIX="$REPO_ROOT/scripts/get-kortix.sh"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; NC=$'\033[0m'

ok()   { echo "  ${GREEN}✓${NC} $*"; }
fail() { echo "  ${RED}✗${NC} $*" >&2; }
info() { echo "  ${CYAN}▸${NC} $*"; }
warn() { echo "  ${YELLOW}⚠${NC} $*"; }

# ─── Parse args ──────────────────────────────────────────────────────────────
DRY_RUN=false
SKIP_CLI=false
SKIP_SDK=false
BUILD_DOCKER=false
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=true ;;
    --skip-cli)  SKIP_CLI=true ;;
    --skip-sdk)  SKIP_SDK=true ;;
    --docker)    BUILD_DOCKER=true ;;
    -h|--help)
      echo "Usage: ./sandbox/release.sh [flags] <version>"
      echo ""
      echo "Flags:"
      echo "  --dry-run     Validate only, publish nothing"
      echo "  --skip-cli    Skip CLI build+publish (if opencode unchanged)"
      echo "  --skip-sdk    Skip SDK build+publish (if SDK unchanged)"
      echo "  --docker      Also build+push Docker image"
      echo ""
      echo "Examples:"
      echo "  ./sandbox/release.sh 0.5.0"
      echo "  ./sandbox/release.sh --dry-run 0.5.0"
      echo "  ./sandbox/release.sh --skip-cli --skip-sdk 0.5.0"
      exit 0
      ;;
    *)           VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Usage: ./sandbox/release.sh [--dry-run] [--skip-cli] [--skip-sdk] [--docker] <version>"
  exit 1
fi

echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${BOLD}  Kortix Computer Release — v${VERSION}${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
$DRY_RUN && echo "  ${YELLOW}DRY RUN — nothing will be published${NC}"
echo ""

# ─── Prerequisites ───────────────────────────────────────────────────────────
info "Checking prerequisites..."

MISSING=false
for cmd in node npm gh bun; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "Missing: $cmd"
    MISSING=true
  fi
done
$MISSING && exit 1

# Check npm auth
if ! npm whoami &>/dev/null; then
  fail "Not logged in to npm. Run: npm login"
  exit 1
fi
ok "npm auth: $(npm whoami)"

# Check gh auth
if ! gh auth status &>/dev/null 2>&1; then
  fail "Not logged in to gh. Run: gh auth login"
  exit 1
fi
ok "gh auth: ok"

# Check clean working tree (warn only)
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

# ─── Step 2: Check npm availability ─────────────────────────────────────────
info "Checking npm for existing versions..."

if npm view "@kortix/sandbox@$VERSION" version &>/dev/null 2>&1; then
  fail "@kortix/sandbox@$VERSION already exists on npm"
  exit 1
fi
ok "v$VERSION is available on npm"

# ─── Step 3: Bump versions ──────────────────────────────────────────────────
info "Bumping versions to $VERSION..."

if $DRY_RUN; then
  ok "(dry-run) Would bump sandbox/package.json → $VERSION"
  ok "(dry-run) Would bump get-kortix.sh VERSION → $VERSION"
else
  # sandbox/package.json — version + CLI dep
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
    pkg.version = '$VERSION';
    pkg.dependencies['@kortix/opencode-ai'] = '$VERSION';
    fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
  "
  ok "sandbox/package.json → $VERSION"

  # get-kortix.sh — embedded CLI version
  if [ -f "$GET_KORTIX" ]; then
    sed -i.bak "s/^VERSION=\"[^\"]*\"/VERSION=\"$VERSION\"/" "$GET_KORTIX"
    rm -f "${GET_KORTIX}.bak"
    ok "get-kortix.sh VERSION → $VERSION"
  else
    warn "get-kortix.sh not found, skipping stamp"
  fi
fi

# ─── Step 4: Build + publish CLI ────────────────────────────────────────────
if $SKIP_CLI; then
  info "Skipping CLI (--skip-cli)"
else
  info "Building CLI v$VERSION (all platforms)..."
  CLI_DIR="$OPENCODE_DIR/packages/opencode"

  if $DRY_RUN; then
    ok "(dry-run) Would build + publish @kortix/opencode-ai@$VERSION"
  else
    (cd "$OPENCODE_DIR" && bun install)
    (cd "$CLI_DIR" && KORTIX_BUILD=true OPENCODE_VERSION="$VERSION" bun run build)
    ok "CLI built"

    info "Publishing @kortix/opencode-ai@$VERSION..."
    (cd "$CLI_DIR" && KORTIX_VERSION="$VERSION" bun ./script/publish-kortix.ts latest)
    ok "@kortix/opencode-ai@$VERSION published"
  fi
fi

# ─── Step 5: Build + publish SDK ────────────────────────────────────────────
if $SKIP_SDK; then
  info "Skipping SDK (--skip-sdk)"
else
  info "Building SDK v$VERSION..."
  SDK_DIR="$OPENCODE_DIR/packages/sdk/js"

  if $DRY_RUN; then
    ok "(dry-run) Would build + publish @kortix/opencode-sdk@$VERSION"
  else
    (cd "$SDK_DIR" && bun run build)
    ok "SDK built"

    info "Publishing @kortix/opencode-sdk@$VERSION..."
    (cd "$SDK_DIR" && KORTIX_SDK_VERSION="$VERSION" bun ./script/publish-kortix.ts latest)
    ok "@kortix/opencode-sdk@$VERSION published"
  fi
fi

# ─── Step 6: Publish @kortix/sandbox ─────────────────────────────────────────
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

  # Verify
  sleep 5
  if npm view "@kortix/sandbox@$VERSION" version &>/dev/null 2>&1; then
    ok "Verified on npm registry"
  else
    warn "npm registry may be slow to propagate — check manually"
  fi
fi

# ─── Step 7: GitHub Release ─────────────────────────────────────────────────
info "Creating GitHub Release v$VERSION..."

# Generate release notes from changelog
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
fi

# ─── Step 8: Docker (optional) ──────────────────────────────────────────────
if $BUILD_DOCKER; then
  info "Building Docker image..."
  if $DRY_RUN; then
    ok "(dry-run) Would build + push Docker image"
  else
    "$SANDBOX_DIR/push.sh"
    ok "Docker image built and pushed"
  fi
else
  info "Skipping Docker (pass --docker to include)"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo "  ${GREEN}${BOLD}  ✓ Release v${VERSION} complete!${NC}"
echo "  ${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Published:"
$SKIP_CLI  || echo "    ${CYAN}•${NC} @kortix/opencode-ai@$VERSION  ${DIM}(npm)${NC}"
$SKIP_SDK  || echo "    ${CYAN}•${NC} @kortix/opencode-sdk@$VERSION ${DIM}(npm)${NC}"
echo "    ${CYAN}•${NC} @kortix/sandbox@$VERSION      ${DIM}(npm)${NC}"
echo "    ${CYAN}•${NC} v$VERSION                      ${DIM}(GitHub release)${NC}"
$BUILD_DOCKER && echo "    ${CYAN}•${NC} sandbox:$VERSION              ${DIM}(Docker Hub)${NC}"
echo ""
echo "  ${DIM}Don't forget to commit + push the version bump:${NC}"
echo "    git add sandbox/package.json scripts/get-kortix.sh"
echo "    git commit -m 'release: v$VERSION'"
echo "    git push"
echo ""
