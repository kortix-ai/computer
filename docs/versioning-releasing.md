# Releasing a New Version

## Next Version: `0.7.14`

Current released version is `0.7.13`. The next release should be `0.7.14`.

Update this section after every release so the next person knows what version to use.

## Overview

Kortix Computer uses **one version number** across all artifacts. The release
script (`sandbox/release.sh`) publishes everything from your local machine.

> **Note:** The OpenCode CLI (`opencode-ai`) and SDK (`@opencode-ai/sdk`) are
> upstream packages published by anomalyco. We pin the CLI version in
> `sandbox/package.json` but do **not** publish our own fork. Only the sandbox
> npm package and Docker images are Kortix-published.

| Artifact | Published to | How |
|---|---|---|
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
docker login       # Docker Hub (kortix org) — only if using --docker
```

Required on PATH: `node`, `bun`, `npm`, `gh`.

For Docker releases (`--docker`), also need:
- **Docker** running with `buildx` multi-platform support
- **`daytona` CLI** installed and authenticated (unless you pass `--skip-daytona`)
- A buildx builder named `multiarch` (auto-created by the scripts if missing)

## Quick Reference

```bash
# STANDARD RELEASE — always use --docker
./sandbox/release.sh --docker 0.7.0

# Dry run — validate everything, publish nothing
./sandbox/release.sh --dry-run 0.7.0

# Skip auto-commit (you'll commit manually)
./sandbox/release.sh --docker --no-commit 0.7.0

# Sandbox image only (skip API + frontend Docker images, still creates Daytona snapshot)
./sandbox/release.sh --docker --sandbox-only 0.7.0
```

## CRITICAL: Always Do a Full Release

**Never do a partial release.** Every release MUST build ALL artifacts — npm, GitHub,
Docker images, AND the Daytona snapshot. A half-done release WILL break production.

**Why:** The release script stamps `SANDBOX_VERSION` in `config.ts`. When the API
deploys, it tells Daytona to create sandboxes from snapshot `kortix-sandbox-v{version}`.
If that snapshot doesn't exist because you skipped `--docker`, every new sandbox
creation fails with `"Snapshot not found"` and the platform is broken.

```bash
# THE ONLY WAY TO RELEASE:
./sandbox/release.sh --docker 0.7.0

# Then push + deploy:
git push
```

**Do NOT:**
- Run `release.sh` without `--docker` and "plan to build Docker later"
- Manually bump `SANDBOX_VERSION` without building the matching snapshot
- Push a version bump commit before all artifacts are published
- Use `--skip-daytona` unless you are 100% sure no new sandboxes will be created

## How to Release

### 1. Write the changelog

Edit `sandbox/CHANGELOG.json`. Add a new entry **at the top** of the array:

```json
[
  {
    "version": "0.7.0",
    "date": "2026-02-23",
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

### 2. Pin the upstream CLI version (if updating)

If you're bumping the OpenCode CLI version, update `sandbox/package.json`:

```json
{
  "dependencies": {
    "opencode-ai": "1.2.10"
  }
}
```

This version is read by both the Dockerfile (initial build) and `postinstall.sh` (live updates).

### 3. Dry run

```bash
./sandbox/release.sh --dry-run 0.7.0
```

This validates the changelog, checks npm/GitHub/Daytona availability, previews
release notes, and shows what files would be published — publishes nothing.

### 4. Release (full — always use --docker)

```bash
./sandbox/release.sh --docker 0.7.0
```

The script does everything in order:

| Step | What happens |
|------|-------------|
| **0. Prerequisites** | Checks `node`, `bun`, `npm`, `gh` on PATH. Verifies npm + gh auth. Checks Docker daemon, buildx builder, and daytona CLI **upfront**. |
| **1. Validate changelog** | Reads `CHANGELOG.json`, ensures entry for this version exists with `title` and `changes`. |
| **2. Version lock check** | Checks if a GitHub Release for this version already exists. If it does and we're NOT resuming a previous run, **hard aborts** — someone else already released this version. This prevents two people from releasing the same version simultaneously. |
| **3. Bump versions** | Stamps `sandbox/package.json` (version), `scripts/get-kortix.sh` (VERSION line), and `services/kortix-api/src/config.ts` (SANDBOX_VERSION). |
| **4. GitHub Release (lock)** | Creates `v{version}` release on `kortix-ai/computer` — this **locks** the version. If two people race, only one `gh release create` succeeds. The loser will see it in step 2 next time they run. |
| **5. Publish sandbox** | `npm publish` for `@kortix/sandbox@{version}`. This triggers live auto-update on all running sandboxes. Waits 5s and verifies on npm registry. |
| **6. Docker images** | Builds all 3 images (sandbox, API, frontend) multi-platform and pushes to Docker Hub. Then creates the Daytona snapshot from the sandbox image. |
| **7. Write artifacts** | Records every successful publish step in the `artifacts[]` array of the `CHANGELOG.json` entry. |
| **8. Validate** | Checks every expected artifact actually exists on npm, GitHub, Docker Hub, Daytona. Reports pass/fail for each. |
| **9. Auto-commit** | Commits all version-stamped files with message `release: v{version}`. (Skipped with `--no-commit`.) |

### 5. Push and deploy

The script auto-commits but does NOT push. Review the commit, then:

```bash
git push
```

This triggers the VPS deploy action which rebuilds the API container on prod.
The new API will use `SANDBOX_VERSION` to create sandboxes from the snapshot
you just published. **Everything must be in sync.**

### 6. Verify

```bash
# Check all artifacts exist:
npm view @kortix/sandbox@0.7.0 version
gh release view v0.7.0 --repo kortix-ai/computer
docker manifest inspect kortix/computer:0.7.0
docker manifest inspect kortix/kortix-api:0.7.0
daytona snapshot list | grep 0.7.0

# Check the deployed API uses the right version:
curl -s https://new-api.kortix.com/v1/health | jq .
```

Running sandboxes auto-detect the new version within ~5 minutes.

## Flags

| Flag | What it does |
|---|---|
| `--dry-run` | Validate only, publish nothing |
| `--docker` | Build+push Docker images (all 3) + create Daytona snapshot |
| `--sandbox-only` | With `--docker`: only build sandbox image (skip API + frontend) |
| `--skip-daytona` | With `--docker`: push to Docker Hub only, skip Daytona snapshot |
| `--no-commit` | Don't auto-commit the version bump at the end |

## Docker Details

### Always build Docker

**Every release must include `--docker`.** The release script stamps `SANDBOX_VERSION`
in `config.ts`, and the deployed API uses that to look up the Daytona snapshot. If the
snapshot doesn't exist, sandbox creation is broken for all users.

The npm live-update mechanism (`postinstall.sh`) handles config/tool/skill changes on
*running* sandboxes, but **new sandboxes** are always created from the Daytona snapshot.
No snapshot = no new sandboxes = broken platform.

### What `--docker` does

Docker is built **inline** in `release.sh` (not delegated to `push.sh`) so artifacts are tracked properly.

**Images built (multi-platform: `linux/amd64,linux/arm64`):**

| Image | Dockerfile | Tags |
|---|---|---|
| `kortix/computer` | `sandbox/Dockerfile` | `:{version}` + `:latest` |
| `kortix/kortix-api` | `services/Dockerfile` | `:{version}` + `:latest` |
| `kortix/kortix-frontend` | `apps/frontend/Dockerfile` | `:{version}` + `:latest` |

**Frontend auto-build:** If `apps/frontend/.next/standalone` doesn't exist, the script
auto-builds it with `NEXT_OUTPUT=standalone pnpm build` before creating the Docker image.
With `--sandbox-only`, API and frontend images are skipped entirely.

**Daytona snapshot:** After pushing the sandbox image to Docker Hub, creates a Daytona
snapshot using `daytona snapshot create --image kortix/computer:{version}`. This pulls
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

## Publish Order & Version Locking

The script publishes in this specific order:

1. **GitHub Release first (version lock)** — acts as a distributed lock. If two
   people try to release the same version, only one `gh release create` succeeds.
   The other person's next run will see the release in step 2 and hard abort.
2. **Sandbox second** — `npm publish` triggers live updates on all running sandboxes.
   The sandbox's `postinstall.sh` handles installing the correct upstream CLI version
   (`opencode-ai`) declared in `sandbox/package.json`.
3. **Docker last** — only when `--docker` is passed.

**Why GitHub Release is the lock:** npm publish is irreversible (npm doesn't allow
re-publishing the same version without `unpublish` + wait). By creating the GH release
first, we ensure only one person proceeds to npm publish. If the release crashes after
the GH release but before npm, you can safely re-run — the state file tracks progress.

## Resumability

The script tracks completed steps in `.release-state.json` at the repo root. If a
release fails mid-way (e.g. Docker build fails after npm publish), just re-run the
same command:

```bash
# First run — fails at Docker step
./sandbox/release.sh --docker 0.7.0
# ... sandbox Docker fails ...

# Re-run — skips npm/GitHub (already done), resumes at Docker
./sandbox/release.sh --docker 0.7.0
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
| `sandbox/package.json` | `version` field |
| `scripts/get-kortix.sh` | `KORTIX_VERSION="X.Y.Z"` (installer image tags) + `VERSION="X.Y.Z"` (embedded CLI) |
| `services/kortix-api/src/config.ts` | `SANDBOX_VERSION` constant |
| `sandbox/CHANGELOG.json` | `artifacts[]` array added to the version's entry |

You do NOT need to manually edit versions in these files.

## Upstream OpenCode Version Control

The OpenCode CLI and SDK are **upstream packages** published by anomalyco — we do not
publish our own fork. We control which version runs in every sandbox via exact pins.

### Single source of truth

```
sandbox/package.json
  "dependencies": {
    "opencode-ai": "1.2.10"        ← CLI version (exact pin, no ^ or ~)
  }

sandbox/opencode/package.json
  "dependencies": {
    "@opencode-ai/plugin": "1.2.10" ← plugin version (exact pin, SDK is transitive dep)
  }
```

### Why it will never auto-update

1. **Exact pin** — `"1.2.10"` not `"^1.2.10"`. npm will never resolve a different version.
2. **Explicit version check** — `postinstall.sh` compares `opencode --version` against the
   pinned value. If they match, it skips installation entirely.
3. **No background updater** — there is no cron, watcher, or auto-update mechanism for the
   CLI anywhere in the sandbox. It only changes when you publish a new `@kortix/sandbox`
   with a different pin.
4. **Release script doesn't touch it** — Step 3 (bump versions) only stamps the top-level
   `"version"` field in `sandbox/package.json`. It does **not** modify `dependencies.opencode-ai`.

### Two paths consume the pin

| Path | When | Behavior |
|------|------|----------|
| **Dockerfile** (line ~107) | Docker image build | Reads pin, installs exactly that version. Falls back to `latest` only if the pinned version doesn't exist on npm yet. |
| **postinstall.sh** (line ~73) | Live sandbox update | Reads pin, compares with current `opencode --version`, installs only if different. |

### How to bump the CLI version

```bash
# 1. Check available versions
npm view opencode-ai versions --json

# 2. Update the pin in sandbox/package.json
#    "opencode-ai": "1.2.10"  →  "opencode-ai": "1.3.0"

# 3. Release as usual — the new sandbox package will carry the new pin
./sandbox/release.sh 0.8.0
```

When running sandboxes update to `@kortix/sandbox@0.8.0`, `postinstall.sh` sees the
version mismatch and installs `opencode-ai@1.3.0`.

### How to bump the SDK / plugin version

The SDK (`@opencode-ai/sdk`) is a **transitive dependency** of `@opencode-ai/plugin`.
To update:

```bash
# 1. Update sandbox/opencode/package.json
#    "@opencode-ai/plugin": "1.2.10"  →  "@opencode-ai/plugin": "1.3.0"

# 2. Update apps/frontend/package.json (if SDK types changed)
#    "@opencode-ai/sdk": "^1.2.10"  →  "@opencode-ai/sdk": "^1.3.0"
#    Then: pnpm install --filter Kortix-Computer-Frontend

# 3. Release as usual
```

### How to keep OpenCode the same across a release

Just don't touch the `"opencode-ai"` or `"@opencode-ai/plugin"` values. A sandbox-only
release (new agents, skills, tools, configs, etc.) will ship with the exact same CLI and
SDK versions as before.

## Artifact Tracking

After each successful publish step, the release script records it in the `artifacts`
array of the changelog entry. The frontend `/changelog` page renders these as a
checklist showing what was published for each version.

Example after a full release with Docker:
```json
{
  "version": "0.7.0",
  "artifacts": [
    { "name": "@kortix/sandbox@0.7.0", "target": "npm" },
    { "name": "v0.7.0", "target": "github-release" },
    { "name": "kortix/computer:0.7.0", "target": "docker-hub" },
    { "name": "kortix/kortix-api:0.7.0", "target": "docker-hub" },
    { "name": "kortix/kortix-frontend:0.7.0", "target": "docker-hub" },
    { "name": "kortix-sandbox-v0.7.0", "target": "daytona" }
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

Fix the issue and re-run — the script auto-detects what's already published and skips it.

### Version already on npm

```bash
npm unpublish @kortix/sandbox@0.7.0
# Then re-run the release script
```

### GitHub release already exists (version lock)

The release script now **hard aborts** if a GitHub Release for the version already
exists and you're not resuming a previous run. This is by design — it prevents two
people from releasing the same version.

If you genuinely need to re-release (e.g. the previous release was broken):

```bash
gh release delete v0.7.0 --repo kortix-ai/computer -y
rm -f .release-state.json
# Then re-run the release script
```

### Daytona snapshot already exists

The script auto-detects this and sets `--skip-daytona` internally. No manual
intervention needed. To force recreation:

```bash
daytona snapshot delete kortix-sandbox-v0.7.0
# Then re-run the release script
```

### Docker build fails with CLI version not on npm

The Dockerfile falls back to the latest published CLI version automatically. This
happens when the pinned version in `sandbox/package.json` isn't published yet.
The live sandbox update via `postinstall.sh` will install the correct version later.

### Testing locally before release

Validate your changelog entry:
```bash
node -e "const c=require('./sandbox/CHANGELOG.json');const e=c.find(e=>e.version==='0.7.0');if(!e)throw 'missing';console.log('OK',e.title)"
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
