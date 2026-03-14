#!/usr/bin/env node
/**
 * ship.cjs — Kortix release script
 *
 * Usage:
 *   pnpm ship <version>                  Build + push 3 Docker images, build Hetzner snapshot, create GitHub Release
 *   pnpm ship --no-docker <version>      Version bump only, no Docker build or snapshot
 *   pnpm ship --no-hetzner <version>     Skip Hetzner snapshot build
 *   pnpm ship --check                Show current state
 *   pnpm ship --dry-run <version>    Validate only, no changes
 *   pnpm ship --help                 Show this help
 *
 * What it does:
 *   1. Validates changelog entry exists for the version
 *   2. Bumps versions in release.json, package.json, startup.sh, get-kortix.sh
 *   3. Creates GitHub Release with changelog
 *   4. Builds + pushes 3 Docker images (sandbox, api, frontend)
 *   5. Builds the matching Hetzner snapshot from the pushed sandbox image
 *   6. Commits version bump (you still need to git push)
 *
 * That's it. No npm packages, no OTA tarballs, no staging, no symlinks.
 * Updating a running sandbox = pull new image + recreate container.
 */

const { execSync, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const SANDBOX_DIR = path.join(ROOT, 'sandbox')
const RELEASE_JSON = path.join(SANDBOX_DIR, 'release.json')
const PACKAGE_JSON = path.join(SANDBOX_DIR, 'package.json')
const CHANGELOG_JSON = path.join(SANDBOX_DIR, 'CHANGELOG.json')
const STARTUP_SH = path.join(SANDBOX_DIR, 'startup.sh')
const GET_KORTIX = path.join(ROOT, 'scripts', 'get-kortix.sh')
const BUILD_HETZNER_SNAPSHOT = path.join(ROOT, 'scripts', 'build-hetzner-snapshot.sh')

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const version = args.find(a => !a.startsWith('--') && /^\d+\.\d+\.\d+$/.test(a))

const DOCKER = !flags.has('--no-docker')
const HETZNER = DOCKER && !flags.has('--no-hetzner')
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
  const output = execSync(cmd, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || 'pipe',
    ...opts,
  })
  return typeof output === 'string' ? output.trim() : ''
}

function runPnpm(args, opts = {}) {
  const env = {
    ...process.env,
    ...opts.env,
    PATH: `${path.dirname(process.execPath)}:${opts.env?.PATH || process.env.PATH || ''}`,
  }
  const pnpmExecPath = process.env.npm_execpath
  if (pnpmExecPath && fs.existsSync(pnpmExecPath)) {
    return execFileSync(process.execPath, [pnpmExecPath, ...args], { ...opts, env, cwd: opts.cwd || ROOT, encoding: 'utf8', stdio: opts.stdio || 'pipe' })
  }
  return run(`pnpm ${args.map((arg) => JSON.stringify(arg)).join(' ')}`, { ...opts, env })
}

if (HELP) {
  console.log(`
Usage:
  pnpm ship <version>                  Build + push Docker images + Hetzner snapshot
  pnpm ship --no-docker <version>      Version bump only
  pnpm ship --no-hetzner <version>     Skip Hetzner snapshot build
  pnpm ship --check                    Show current state
  pnpm ship --dry-run <version>        Validate only
  pnpm ship --help                     Show this help

Examples:
  pnpm ship 0.8.0
  pnpm ship --no-docker 0.8.0
  pnpm ship --no-hetzner 0.8.0
`)
  process.exit(0)
}

// ─── CHECK MODE ──────────────────────────────────────────────────────────────
if (CHECK) {
  info('Current state:')
  const release = JSON.parse(fs.readFileSync(RELEASE_JSON))
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON))
  console.log(`  release.json: ${release.version}`)
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
console.log(`  ${B}  Ship v${version}${DOCKER ? ' + Docker' : ''}${HETZNER ? ' + Hetzner' : ''}${DRY ? ' [dry-run]' : ''}${X}`)
console.log(`  ${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}\n`)

// ── Step 1: Validate ──────────────────────────────────────────────────────
info('Validating...')

const changelog = JSON.parse(fs.readFileSync(CHANGELOG_JSON))
const entry = changelog.find(e => e.version === version)
if (!entry) {
  fail(`No changelog entry for v${version}. Add one to sandbox/CHANGELOG.json first.`)
}
ok(`Changelog: "${entry.title}"`)

let releaseExists = false
try {
  run(`gh release view "v${version}" --repo kortix-ai/computer`)
  releaseExists = true
  warn(`GitHub release v${version} already exists — reusing`)
} catch (e) {
  if (!String(e).includes('release not found') && !e.message?.includes('release not found') && !e.stderr?.includes('release not found')) {
    fail(`Failed to check GitHub release: ${e.message || e}`)
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
ok(`package.json → ${version}`)

const release = JSON.parse(fs.readFileSync(RELEASE_JSON))
release.version = version
release.images = {
  sandbox: `kortix/computer:${version}`,
  api: `kortix/kortix-api:${version}`,
  frontend: `kortix/kortix-frontend:${version}`,
}
release.snapshots = {
  daytona: `kortix-sandbox-v${version}`,
  hetzner: `kortix-computer-v${version}`,
}
fs.writeFileSync(RELEASE_JSON, JSON.stringify(release, null, 2) + '\n')
ok(`release.json → ${version}`)

if (fs.existsSync(STARTUP_SH)) {
  let startup = fs.readFileSync(STARTUP_SH, 'utf8')
  startup = startup.replace(/DEFAULT_KORTIX_SANDBOX_VERSION="[^"]*"/, `DEFAULT_KORTIX_SANDBOX_VERSION="${version}"`)
  fs.writeFileSync(STARTUP_SH, startup)
  ok(`startup.sh → ${version}`)
}

if (fs.existsSync(GET_KORTIX)) {
  let installer = fs.readFileSync(GET_KORTIX, 'utf8')
  installer = installer.replace(/DEFAULT_KORTIX_VERSION="[^"]*"/, `DEFAULT_KORTIX_VERSION="${version}"`)
  fs.writeFileSync(GET_KORTIX, installer)
  ok(`get-kortix.sh → ${version}`)
}

// ── Step 3: GitHub Release ────────────────────────────────────────────────
info('Creating GitHub release...')

const releaseNotes = `## ${entry.title}

${entry.description || ''}

### Changes

${entry.changes.map(c => `- **${c.type}**: ${c.text}`).join('\n')}

### How to Update

Pull the new Docker image and recreate your container:
\`\`\`
docker pull kortix/computer:${version}
\`\`\`
Or click **Update** in the Kortix sidebar.
`

const notesFile = path.join(require('node:os').tmpdir(), `kortix-ship-${version}-notes.md`)
fs.writeFileSync(notesFile, releaseNotes)

if (!releaseExists) {
  run(`gh release create "v${version}" \
    --repo kortix-ai/computer \
    --title "v${version} — ${entry.title}" \
    --notes-file "${notesFile}" \
    --latest`)
  ok(`GitHub release v${version} created`)
} else {
  ok(`GitHub release v${version} already exists`)
}

fs.rmSync(notesFile, { force: true })

// ── Step 4: Docker + Hetzner ─────────────────────────────────────────────
if (DOCKER) {
  info('Building Docker images...')

  // Sandbox
  run(`docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -f sandbox/docker/Dockerfile \
    --build-arg SANDBOX_VERSION=${version} \
    -t kortix/computer:${version} \
    -t kortix/computer:latest \
    --push "${ROOT}"`, { stdio: 'inherit' })
  ok(`kortix/computer:${version} pushed`)

  // API
  run(`docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg SERVICE=kortix-api \
    -f kortix-api/Dockerfile \
    -t kortix/kortix-api:${version} \
    -t kortix/kortix-api:latest \
    --push "${ROOT}"`, { stdio: 'inherit' })
  ok(`kortix/kortix-api:${version} pushed`)

  // Frontend
  info('Building frontend...')
  runPnpm(['--dir', 'apps/frontend', 'build'], {
    stdio: 'inherit',
    env: { NEXT_OUTPUT: 'standalone' },
  })
  run(`docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -f apps/frontend/Dockerfile \
    -t kortix/kortix-frontend:${version} \
    -t kortix/kortix-frontend:latest \
    --push "${ROOT}"`, { stdio: 'inherit' })
  ok(`kortix/kortix-frontend:${version} pushed`)

  if (HETZNER) {
    info('Building Hetzner snapshot...')
    if (!fs.existsSync(BUILD_HETZNER_SNAPSHOT)) {
      fail(`Missing snapshot script: ${BUILD_HETZNER_SNAPSHOT}`)
    }
    run(`bash ${JSON.stringify(BUILD_HETZNER_SNAPSHOT)} --yes ${version}`, {
      stdio: 'inherit',
    })
    ok(`Hetzner snapshot kortix-computer-v${version} ready`)
  } else {
    warn('Skipping Hetzner snapshot build')
  }
}

// ── Step 5: Commit ────────────────────────────────────────────────────────
info('Committing version bump...')
run(`git add \
  sandbox/package.json \
  sandbox/release.json \
  sandbox/CHANGELOG.json \
  sandbox/startup.sh \
  scripts/get-kortix.sh`)
const hasStagedChanges = run('git diff --cached --name-only')
if (hasStagedChanges) {
  run(`git commit -m "release: v${version}"`)
  ok(`Committed: release v${version}`)
} else {
  ok(`No version-bump commit needed`)
}

// ── Done ──────────────────────────────────────────────────────────────────
console.log(`\n  ${G}${B}✓ v${version} shipped!${X}`)
console.log(`\n  ${D}Next: git push${X}\n`)
