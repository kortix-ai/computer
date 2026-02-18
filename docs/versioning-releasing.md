# Releasing a New Version

## Overview

Kortix Computer uses **one version number** across all artifacts. The release
script (`sandbox/release.sh`) publishes everything from your local machine.

| Artifact | Published to | How |
|---|---|---|
| `@kortix/opencode-ai` | npm (11 platform binaries) | `publish-kortix.ts` |
| `@kortix/opencode-sdk` | npm | `publish-kortix.ts` |
| `@kortix/sandbox` | npm | `npm publish` |
| GitHub Release | `kortix-ai/computer` | `gh release create` |
| Docker images (3) | Docker Hub | `docker buildx` (multi-platform) |
| Daytona snapshot | Daytona Cloud | `daytona snapshot create` (from Docker Hub registry) |
| Embedded CLI (`get-kortix.sh`) | raw GitHub | `sed` version stamp |

## Prerequisites

One-time setup — these must be authed on your machine:

```bash
npm login          # npm publish access to @kortix org
gh auth login      # GitHub CLI access to kortix-ai/computer
docker login       # Docker Hub (kortixmarko org) — only if using --docker
```

Required on PATH: `node`, `bun`, `npm`, `gh`.

For Docker releases (`--docker`), also need:
- **Docker** running with `buildx` multi-platform support
- **`daytona` CLI** installed and authenticated (unless you pass `--skip-daytona`)
- A buildx builder named `multiarch` (auto-created by the scripts if missing)

## Quick Reference

```bash
# Full release (CLI + SDK + sandbox + GitHub)
./sandbox/release.sh 0.6.0

# Dry run — validate everything, publish nothing
./sandbox/release.sh --dry-run 0.6.0

# Sandbox-only npm release (skip CLI + SDK rebuild)
./sandbox/release.sh --skip-cli --skip-sdk 0.6.0

# Full release + Docker images + Daytona snapshot
./sandbox/release.sh --docker 0.6.0

# Full release + Docker Hub only (no Daytona)
./sandbox/release.sh --docker --skip-daytona 0.6.0

# Full release + Docker sandbox image only (skip API + frontend Docker)
./sandbox/release.sh --docker --sandbox-only 0.6.0

# Full release + Docker, skip auto-commit
./sandbox/release.sh --docker --no-commit 0.6.0
```

## How to Release

### 1. Write the changelog

Edit `sandbox/CHANGELOG.json`. Add a new entry **at the top** of the array:

```json
[
  {
    "version": "0.6.0",
    "date": "2026-02-20",
    "title": "Short descriptive title",
    "description": "One paragraph summary of this release.",
    "changes": [
      { "type": "feature", "text": "What was added" },
      { "type": "fix", "text": "What was fixed" },
      { "type": "improvement", "text": "What was improved" }
    ]
  }
]
```

**Change types:** `feature`, `fix`, `improvement`, `breaking`, `upstream`, `security`, `deprecation`

Do **not** add an `artifacts` array — the release script populates it automatically.

### 2. Dry run

```bash
./sandbox/release.sh --dry-run 0.6.0
```

This validates the changelog, checks npm/GitHub/Daytona availability, previews
release notes, and shows what files would be published — publishes nothing.

### 3. Release

```bash
./sandbox/release.sh 0.6.0
```

The script does everything in order:

| Step | What happens |
|------|-------------|
| **0. Prerequisites** | Checks `node`, `bun`, `npm`, `gh` on PATH. Verifies npm + gh auth. If `--docker`: checks Docker daemon, buildx builder, and daytona CLI **upfront** (not at step 8). |
| **1. Validate changelog** | Reads `CHANGELOG.json`, ensures entry for this version exists with `title` and `changes`. |
| **2. Check existing** | Detects already-published artifacts (npm, GitHub, Daytona) and auto-skips them. This makes re-runs after partial failure safe — no need to unpublish anything. |
| **3. Bump versions** | Stamps `sandbox/package.json` (version + CLI dep) and `scripts/get-kortix.sh` (VERSION line). |
| **4. Build + publish CLI** | Builds 11 platform binaries, publishes `@kortix/opencode-ai@{version}` to npm. Skipped with `--skip-cli` or if already on npm. The publish script handles partial publishes (some binaries already exist) gracefully. |
| **5. Build + publish SDK** | Builds and publishes `@kortix/opencode-sdk@{version}` to npm. Skipped with `--skip-sdk` or if already on npm. |
| **6. Publish sandbox** | `npm publish` for `@kortix/sandbox@{version}`. This triggers live auto-update on all running sandboxes. Waits 5s and verifies on npm registry. |
| **7. GitHub Release** | Creates `v{version}` release on `kortix-ai/computer` with formatted release notes from the changelog entry. |
| **8. Docker** *(optional)* | Only runs when `--docker` is passed. Order: (a) sandbox image, (b) Daytona snapshot (right after sandbox — doesn't wait for API/frontend), (c) API image, (d) frontend image. See [Docker details](#docker-details) below. |
| **9. Write artifacts** | Records every successful publish step in the `artifacts[]` array of the `CHANGELOG.json` entry. |
| **10. Validate** | Checks every expected artifact actually exists on npm, GitHub, Docker Hub. Reports pass/fail for each. |
| **11. Auto-commit** | Commits `sandbox/package.json`, `sandbox/CHANGELOG.json`, and `scripts/get-kortix.sh` with message `release: v{version}`. (Skipped with `--no-commit`.) |

### 4. Push

The script auto-commits but does NOT push. Review the commit, then:

```bash
git push
```

### 5. Verify

```bash
npm view @kortix/sandbox@0.6.0 version
npm view @kortix/opencode-ai@0.6.0 version
npm view @kortix/opencode-sdk@0.6.0 version
gh release view v0.6.0 --repo kortix-ai/computer
```

Running sandboxes auto-detect the new version within ~5 minutes.

## Flags

| Flag | What it does |
|---|---|
| `--dry-run` | Validate only, publish nothing |
| `--skip-cli` | Skip CLI build+publish (when opencode source didn't change) |
| `--skip-sdk` | Skip SDK build+publish (when SDK didn't change) |
| `--docker` | Build+push Docker images (all 3) + create Daytona snapshot |
| `--sandbox-only` | With `--docker`: only build sandbox image (skip API + frontend) |
| `--skip-daytona` | With `--docker`: push to Docker Hub only, skip Daytona snapshot |
| `--no-commit` | Don't auto-commit the version bump at the end |

## Docker Details

### When to build Docker

Build Docker (`--docker`) when the release changes:

- Alpine base packages or OS-level dependencies
- Bun runtime version
- Chromium / Playwright version
- Branding assets (wallpapers, icons)
- Python dependencies in `sandbox/package.json` → `kortix.pythonDependencies`
- Anything NOT deployable via `postinstall.sh`

Most releases **don't need Docker** — the npm live-update mechanism handles everything else.

### What `--docker` does

Docker is built **inline** in `release.sh` (not delegated to `push.sh`) so artifacts are tracked properly.

**Images built (multi-platform: `linux/amd64,linux/arm64`):**

| Image | Dockerfile | Tags |
|---|---|---|
| `kortixmarko/sandbox` | `sandbox/Dockerfile` | `:{version}` + `:latest` |
| `kortixmarko/kortix-api` | `services/Dockerfile` | `:{version}` + `:latest` |
| `kortixmarko/kortix-frontend` | `apps/frontend/Dockerfile` | `:{version}` + `:latest` |

**Frontend auto-build:** If `apps/frontend/.next/standalone` doesn't exist, the script
auto-builds it with `NEXT_OUTPUT=standalone pnpm build` before creating the Docker image.
With `--sandbox-only`, API and frontend images are skipped entirely.

**Daytona snapshot:** After pushing the sandbox image to Docker Hub, creates a Daytona
snapshot using `daytona snapshot create --image kortixmarko/sandbox:{version}`. This pulls
from Docker Hub directly — no local image upload. Uses `--cpu 4 --memory 8 --disk 20`.

**Important:** Daytona rejects `:latest` tags. Always use the versioned tag.

### Using `push.sh` standalone

`push.sh` can also be used independently (outside of `release.sh`) for Docker-only pushes.
It reads the version from `sandbox/package.json`:

```bash
./sandbox/push.sh                    # All 3 images + Daytona snapshot
./sandbox/push.sh --sandbox-only     # Only sandbox image + Daytona
./sandbox/push.sh --skip-daytona     # Docker Hub only, no Daytona
./sandbox/push.sh --skip-frontend    # Skip frontend image
```

**Note:** When using `push.sh` standalone, artifacts are NOT tracked in CHANGELOG.json —
use `release.sh --docker` for tracked releases.

### Docker Socket (OrbStack)

Both scripts auto-detect OrbStack's non-standard Docker socket at
`$HOME/.orbstack/run/docker.sock` and set `DOCKER_HOST` accordingly.

### Buildx Builder

Both scripts use a buildx builder named `multiarch`. If it doesn't exist, they create
it automatically with `docker buildx create --name multiarch --use --bootstrap`.

## Publish Order

The script publishes in this specific order:

1. **CLI first** — because `postinstall.sh` runs `npm install -g @kortix/opencode-ai@{version}`. If the CLI isn't on npm yet, every sandbox update would fail.
2. **SDK second** — because `bun install` in the sandbox resolves `@kortix/opencode-sdk@^X.Y.Z`.
3. **Sandbox last** — this triggers live updates on all running sandboxes.

This is critical. If you skip CLI (`--skip-cli`) but the `sandbox/package.json` references
a CLI version that doesn't exist on npm, sandbox installs will fail. The Dockerfile handles
this gracefully by falling back to the latest published CLI version.

## Resumability

The script tracks completed steps in `.release-state.json` at the repo root. If a
release fails mid-way (e.g. Docker build fails after npm publish), just re-run the
same command:

```bash
# First run — fails at Docker step
./sandbox/release.sh --docker 0.6.0
# ... sandbox Docker fails ...

# Re-run — skips npm/GitHub (already done), resumes at Docker
./sandbox/release.sh --docker 0.6.0
```

The state file is automatically deleted on successful completion. It's also ignored
if the version doesn't match (starting a different version always starts fresh).

Additionally, the conflict check (step 2) detects artifacts that already exist on
npm/GitHub and auto-skips them. Combined with the state file, this means you can
always safely re-run after any failure.

## Versioning

- **MAJOR** — breaking changes (API, config format, data migration)
- **MINOR** — new features, significant updates
- **PATCH** — bug fixes, dependency bumps

## What Gets Updated Automatically

The release script auto-stamps these files:

| File | What changes |
|---|---|
| `sandbox/package.json` | `version` field + `@kortix/opencode-ai` dep version |
| `scripts/get-kortix.sh` | `VERSION="X.Y.Z"` embedded version |
| `sandbox/CHANGELOG.json` | `artifacts[]` array added to the version's entry |

You do NOT need to manually edit versions in these files.

## Artifact Tracking

After each successful publish step, the release script records it in the `artifacts`
array of the changelog entry. The frontend `/changelog` page renders these as a
checklist showing what was published for each version.

Example after a full release with Docker:
```json
{
  "version": "0.6.0",
  "artifacts": [
    { "name": "@kortix/opencode-ai@0.6.0", "target": "npm" },
    { "name": "@kortix/opencode-sdk@0.6.0", "target": "npm" },
    { "name": "@kortix/sandbox@0.6.0", "target": "npm" },
    { "name": "v0.6.0", "target": "github-release" },
    { "name": "kortixmarko/sandbox:0.6.0", "target": "docker-hub" },
    { "name": "kortixmarko/kortix-api:0.6.0", "target": "docker-hub" },
    { "name": "kortixmarko/kortix-frontend:0.6.0", "target": "docker-hub" },
    { "name": "kortix-sandbox-v0.6.0", "target": "daytona" }
  ]
}
```

Artifact targets: `npm`, `docker-hub`, `github-release`, `daytona`.

## Changelog System

Every release includes a structured changelog at `sandbox/CHANGELOG.json`. This file is:

- Bundled in the `@kortix/sandbox` npm package
- Deployed to `/opt/kortix/CHANGELOG.json` by `postinstall.sh`
- Served by kortix-master at `GET /kortix/health` (current version's entry)
- Served by the platform API at `GET /v1/platform/sandbox/version` (latest version's entry)
- Served by the platform API at `GET /v1/platform/sandbox/version/changelog` (full history)
- Shown in the frontend update banner and `/changelog` page

## Troubleshooting

### Partial failure

If CLI published but sandbox didn't — fix the issue and re-run with `--skip-cli --skip-sdk`.
The script checks npm before publishing, so it won't try to re-publish what already exists.

### Version already on npm

```bash
npm unpublish @kortix/sandbox@0.6.0
# Then re-run the release script
```

### GitHub release already exists

```bash
gh release delete v0.6.0 --repo kortix-ai/computer -y
# Then re-run the release script
```

### Daytona snapshot already exists

The script auto-detects this and sets `--skip-daytona` internally. No manual
intervention needed. To force recreation:

```bash
daytona snapshot delete kortix-sandbox-v0.6.0
# Then re-run the release script
```

### Docker build fails with CLI version not on npm

The Dockerfile falls back to the latest published CLI version automatically. This
happens when you build Docker without publishing CLI first (e.g. `--skip-cli`).
The live sandbox update via `postinstall.sh` will install the correct version later.

### Testing locally before release

Validate your changelog entry:
```bash
node -e "const c=require('./sandbox/CHANGELOG.json');const e=c.find(e=>e.version==='0.6.0');if(!e)throw 'missing';console.log('✓',e.title)"
```

Check what files would be published:
```bash
cd sandbox && npm pack --dry-run
```

Validate scripts (syntax check):
```bash
bash -n sandbox/release.sh && echo OK
bash -n sandbox/push.sh && echo OK
```
