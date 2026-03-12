#!/usr/bin/env node
/**
 * ship.cjs — Kortix release script
 *
 * Usage:
 *   pnpm ship <version>           Release (OTA tarball + GitHub Release)
 *   pnpm ship --docker <version>  Release + rebuild/push all Docker images
 *   pnpm ship --check             Validate current state, no changes
 *   pnpm ship --help              Show this help
 *
 * What it does:
 *   1. Validates changelog entry exists for the version
 *   2. Bumps versions in package.json, release.json, startup.sh, get-kortix.sh
 *   3. Runs bundle-runtime.cjs (vendors source packages)
 *   4. Creates OTA tarball: sandbox-runtime-{version}.tar.gz (~5MB, source only)
 *   5. Creates GitHub Release v{version} with changelog as notes
 *   6. Attaches OTA tarball to the GitHub Release
 *   7. [--docker] Builds and pushes kortix/computer, kortix-api, kortix-frontend images
 *   8. Commits version bump (you still need to git push)
 *
 * OTA tarball contents (what running sandboxes download on update):
 *   kortix-master/         proxy server source (no node_modules)
 *   vendor/kortix-oc/      OpenCode runtime, agents, skills, tools
 *   vendor/opencode-channels/
 *   vendor/opencode-agent-triggers/
 *   postinstall.sh         staging deployment script
 *   s6-services/           service definitions
 *   config/                init scripts
 *   browser-viewer/
 *   core/                  manifest + service spec
 *   package.json           version + dep metadata
 *   CHANGELOG.json
 *
 * Running sandboxes download this tarball (not npm), extract it, run postinstall.sh
 * in staging mode, then update.ts atomically swaps symlinks. No npm involved.
 */

const { execSync, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const ROOT = path.resolve(__dirname, '..', '..')
const SANDBOX_DIR = path.join(ROOT, 'packages', 'sandbox')
const RELEASE_JSON = path.join(SANDBOX_DIR, 'release.json')
const PACKAGE_JSON = path.join(SANDBOX_DIR, 'package.json')
const CHANGELOG_JSON = path.join(SANDBOX_DIR, 'CHANGELOG.json')
const STARTUP_SH = path.join(SANDBOX_DIR, 'startup.sh')
const GET_KORTIX = path.join(ROOT, 'scripts', 'get-kortix.sh')

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const version = args.find(a => !a.startsWith('--') && /^\d+\.\d+\.\d+$/.test(a))

const DOCKER = flags.has('--docker')
const CHECK = flags.has('--check')
const HELP = flags.has('--help') || flags.has('-h')
const DRY = flags.has('--dry-run')

// Colors
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m'
const D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m'
const ok   = m => console.log(`  ${G}✓${X} ${m}`)
const fail = m => { console.error(`  ${R}✗${X} ${m}`); process.exit(1) }
const info = m => console.log(`  ${C}▸${X} ${m}`)
const warn = m => console.log(`  ${Y}!${X} ${m}`)

function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || 'pipe',
    ...opts,
  }).trim()
}

function runFile(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || 'pipe',
    ...opts,
  })
}

if (HELP) {
  console.log(`
Usage:
  pnpm ship <version>           Release (OTA tarball + GitHub Release)
  pnpm ship --docker <version>  Release + Docker images
  pnpm ship --check             Validate state
  pnpm ship --dry-run <version> Validate only, no changes
  pnpm ship --help              Show this help

Examples:
  pnpm ship 0.8.0
  pnpm ship --docker 0.8.0
  pnpm ship --dry-run 0.8.0
`)
  process.exit(0)
}

// ─── CHECK MODE ──────────────────────────────────────────────────────────────
if (CHECK) {
  info('Current state:')
  const release = JSON.parse(fs.readFileSync(RELEASE_JSON))
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON))
  console.log(`  release.json: ${release.releaseVersion}`)
  console.log(`  package.json: ${pkg.version}`)
  const gitStatus = run('git status --short')
  if (gitStatus) {
    warn('Uncommitted changes:')
    gitStatus.split('\n').forEach(l => console.log('    ' + l))
  } else {
    ok('Working tree clean')
  }
  try { run('gh auth status'); ok('gh auth OK') } catch { warn('gh CLI not authenticated') }
  process.exit(0)
}

// ─── RELEASE MODE ────────────────────────────────────────────────────────────
if (!version) {
  console.error(`${R}Error: No version specified${X}`)
  console.error(`Usage: pnpm ship <version>  (e.g. pnpm ship 0.8.0)`)
  process.exit(1)
}

console.log(`\n  ${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}`)
console.log(`  ${B}  Ship v${version}${DOCKER ? ' + Docker' : ''}${DRY ? ' [dry-run]' : ''}${X}`)
console.log(`  ${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}\n`)

// ── Step 1: Validate ──────────────────────────────────────────────────────
info('Validating...')

const changelog = JSON.parse(fs.readFileSync(CHANGELOG_JSON))
const entry = changelog.find(e => e.version === version)
if (!entry) {
  fail(`No changelog entry for v${version}. Add one to packages/sandbox/CHANGELOG.json first.`)
}
ok(`Changelog: "${entry.title}"`)

// Check GitHub release doesn't already exist
try {
  run(`gh release view "v${version}" --repo kortix-ai/computer`)
  fail(`GitHub release v${version} already exists`)
} catch (e) {
  if (!e.message.includes('release not found') && !e.stderr?.includes('release not found') && !String(e).includes('release not found')) {
    // only fail if it's not "not found"
    if (String(e).includes('already exists') || !String(e).includes('not found')) {
      // might already exist — re-check
    }
  }
  ok(`GitHub release v${version} not yet created`)
}

if (DRY) {
  ok('Dry run complete — no changes made')
  process.exit(0)
}

// ── Step 2: Bump versions ─────────────────────────────────────────────────
info('Bumping versions...')

const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON))
pkg.version = version
fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n')
ok(`packages/sandbox/package.json → ${version}`)

const release = JSON.parse(fs.readFileSync(RELEASE_JSON))
release.releaseVersion = version
release.sandbox.package.version = version
release.sandbox.image = `kortix/computer:${version}`
release.sandbox.daytonaSnapshot = `kortix-sandbox-v${version}`
release.sandbox.hetznerSnapshotDescription = `kortix-computer-v${version}`
release.api.image = `kortix/kortix-api:${version}`
release.frontend.image = `kortix/kortix-frontend:${version}`
fs.writeFileSync(RELEASE_JSON, JSON.stringify(release, null, 2) + '\n')
ok(`packages/sandbox/release.json → ${version}`)

let startup = fs.readFileSync(STARTUP_SH, 'utf8')
startup = startup.replace(/DEFAULT_KORTIX_SANDBOX_VERSION="[^"]*"/, `DEFAULT_KORTIX_SANDBOX_VERSION="${version}"`)
fs.writeFileSync(STARTUP_SH, startup)
ok(`startup.sh → ${version}`)

let installer = fs.readFileSync(GET_KORTIX, 'utf8')
installer = installer.replace(/DEFAULT_KORTIX_VERSION="[^"]*"/, `DEFAULT_KORTIX_VERSION="${version}"`)
fs.writeFileSync(GET_KORTIX, installer)
ok(`get-kortix.sh → ${version}`)

// ── Step 3: Vendor runtime sources ───────────────────────────────────────
info('Vendoring runtime sources...')
execSync('node scripts/bundle-runtime.cjs', { cwd: SANDBOX_DIR, stdio: 'inherit' })
ok('Source packages vendored')

// ── Step 4: Create OTA tarball ────────────────────────────────────────────
info(`Creating OTA tarball sandbox-runtime-${version}.tar.gz...`)

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kortix-ship-${version}-`))
const tarballName = `sandbox-runtime-${version}.tar.gz`
const tarballPath = path.join(tmpDir, tarballName)

// List of dirs/files to include in the OTA tarball (no node_modules)
const OTA_INCLUDES = [
  'kortix-master',
  'vendor',
  'postinstall.sh',
  's6-services',
  'config',
  'browser-viewer',
  'core',
  'package.json',
  'CHANGELOG.json',
  'patch-agent-browser.js',
]

const existingIncludes = OTA_INCLUDES.filter(f => fs.existsSync(path.join(SANDBOX_DIR, f)))

runFile('tar', [
  '-czf', tarballPath,
  '--exclude=node_modules',
  '--exclude=.git',
  '--exclude=bun.lock',
  '--exclude=*.tgz',
  '-C', SANDBOX_DIR,
  ...existingIncludes,
])

const tarSize = (fs.statSync(tarballPath).size / 1024 / 1024).toFixed(1)
ok(`OTA tarball created: ${tarballName} (${tarSize}MB)`)

// ── Step 5: GitHub Release ────────────────────────────────────────────────
info('Creating GitHub release...')

const releaseNotes = `## ${entry.title}

${entry.description || ''}

### Changes

${entry.changes.map(c => `- **${c.type}**: ${c.text}`).join('\n')}

### How to Update

Running sandboxes will auto-detect this version. Click **Update** in the sidebar.

The sandbox downloads \`sandbox-runtime-${version}.tar.gz\` (~${tarSize}MB) from this release,
stages it with zero downtime, and atomically swaps to the new version.
`

const notesFile = path.join(tmpDir, 'notes.md')
fs.writeFileSync(notesFile, releaseNotes)

run(`gh release create "v${version}" \
  --repo kortix-ai/computer \
  --title "v${version} — ${entry.title}" \
  --notes-file "${notesFile}" \
  --latest \
  "${tarballPath}"`)

ok(`GitHub release v${version} created with OTA tarball attached`)

// ── Step 6: Docker (optional) ─────────────────────────────────────────────
if (DOCKER) {
  info('Building Docker images...')

  // Sandbox image
  run(`docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -f packages/sandbox/docker/Dockerfile \
    -t kortix/computer:${version} \
    -t kortix/computer:latest \
    --push "${ROOT}"`, { stdio: 'inherit' })
  ok(`kortix/computer:${version} pushed`)

  // API image
  run(`docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg SERVICE=kortix-api \
    -f kortix-api/Dockerfile \
    -t kortix/kortix-api:${version} \
    -t kortix/kortix-api:latest \
    --push "${ROOT}"`, { stdio: 'inherit' })
  ok(`kortix/kortix-api:${version} pushed`)

  // Frontend: build then dockerize
  info('Building frontend...')
  run('pnpm --dir apps/frontend build', { stdio: 'inherit' })
  run(`docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -f apps/frontend/Dockerfile \
    -t kortix/kortix-frontend:${version} \
    -t kortix/kortix-frontend:latest \
    --push "${ROOT}"`, { stdio: 'inherit' })
  ok(`kortix/kortix-frontend:${version} pushed`)
}

// ── Step 7: Commit ────────────────────────────────────────────────────────
info('Committing version bump...')
run(`git add \
  packages/sandbox/package.json \
  packages/sandbox/release.json \
  packages/sandbox/CHANGELOG.json \
  packages/sandbox/startup.sh \
  scripts/get-kortix.sh`)
run(`git commit -m "release: v${version}"`)
ok(`Committed: release v${version}`)

// ── Done ──────────────────────────────────────────────────────────────────
// Cleanup temp files
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log(`\n  ${G}${B}✓ v${version} shipped!${X}`)
console.log(`\n  ${D}Next steps:${X}`)
console.log(`    git push`)
if (DOCKER) {
  console.log(`    Update .env: SANDBOX_VERSION=${version}`)
}
console.log()
