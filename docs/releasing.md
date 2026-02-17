# Releasing a New Version

## Overview

Kortix Computer uses **one version number** across all artifacts. The release
script (`sandbox/release.sh`) publishes everything from your local machine.

| Artifact | Published to | How |
|---|---|---|
| `@kortix/sandbox` | npm | `npm publish` |
| `@kortix/opencode-ai` | npm (11 platform binaries) | `publish-kortix.ts` |
| `@kortix/opencode-sdk` | npm | `publish-kortix.ts` |
| GitHub Release | `kortix-ai/computer` | `gh release create` |
| Docker image | Docker Hub + Daytona | `push.sh` (optional) |
| Embedded CLI (`get-kortix.sh`) | raw GitHub | `sed` version stamp |

## Prerequisites

You need these authed on your machine (one-time setup):

```bash
npm login          # npm publish access to @kortix org
gh auth login      # GitHub CLI access to kortix-ai/computer
docker login       # Docker Hub (only if publishing Docker images)
```

Also required on PATH: `node`, `bun`, `npm`, `gh`.

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
  },
  // ... existing entries below
]
```

**Change types:** `feature`, `fix`, `improvement`, `breaking`, `upstream`, `security`, `deprecation`

### 2. Dry run

```bash
./sandbox/release.sh --dry-run 0.6.0
```

This validates the changelog, checks npm availability, and previews
release notes — publishes nothing.

### 3. Release

```bash
./sandbox/release.sh 0.6.0
```

The script will:

1. **Check prerequisites** — npm/gh/bun/node installed and authed
2. **Validate changelog** — entry exists for `0.6.0` with title + changes
3. **Check npm** — `@kortix/sandbox@0.6.0` doesn't already exist
4. **Bump versions** — `sandbox/package.json` (version + CLI dep) + `get-kortix.sh` VERSION
5. **Build + publish CLI** — 11 platform binaries → `@kortix/opencode-ai@0.6.0`
6. **Build + publish SDK** — `@kortix/opencode-sdk@0.6.0`
7. **Publish sandbox** — `@kortix/sandbox@0.6.0` (triggers live update for all running sandboxes)
8. **Create GitHub Release** — `v0.6.0` with auto-generated notes from changelog
9. **(Optional) Build Docker** — via `push.sh` if `--docker` was passed

### 4. Commit the version bump

```bash
git add sandbox/package.json scripts/get-kortix.sh
git commit -m "release: v0.6.0"
git push
```

### 5. Verify

```bash
npm view @kortix/sandbox@0.6.0 version
npm view @kortix/opencode-ai@0.6.0 version
npm view @kortix/opencode-sdk@0.6.0 version
gh release view v0.6.0 --repo kortix-ai/computer
```

Running sandboxes will auto-detect the new version within ~5 minutes.

## Flags

| Flag | What it does |
|---|---|
| `--dry-run` | Validate only, publish nothing |
| `--skip-cli` | Skip CLI build+publish (when opencode source didn't change) |
| `--skip-sdk` | Skip SDK build+publish (when SDK didn't change) |
| `--docker` | Also build+push Docker image |

### Common patterns

```bash
# Full release (everything)
./sandbox/release.sh 0.6.0

# Only sandbox changed (agents, skills, configs) — skip CLI+SDK
./sandbox/release.sh --skip-cli --skip-sdk 0.6.0

# Include Docker (when base image or OS deps changed)
./sandbox/release.sh --docker 0.6.0

# Validate before committing changelog
./sandbox/release.sh --dry-run 0.6.0
```

## When to Include Docker

Build Docker (`--docker`) when the release changes:

- Alpine base packages or OS-level dependencies
- Bun runtime
- Chromium or Playwright base
- Branding assets (wallpapers, icons)
- Anything NOT deployable via `postinstall.sh`

Most releases **don't need Docker** — the npm live update handles everything else.

## Versioning

- **MAJOR** — breaking changes (API, config format, data migration)
- **MINOR** — new features, significant updates
- **PATCH** — bug fixes, dependency bumps

## What Gets Updated Automatically

The release script auto-stamps these files:

| File | What changes |
|---|---|
| `sandbox/package.json` | `version` field + `@kortix/opencode-ai` dep version |
| `scripts/get-kortix.sh` | `VERSION="X.Y.Z"` at line 557 |

You do NOT need to manually edit versions in these files.

## Publish Order

The script publishes in this specific order:

1. **CLI first** — because `postinstall.sh` runs `npm install -g @kortix/opencode-ai@{version}`. If the CLI isn't on npm yet, every sandbox update would fail.
2. **SDK second** — because `bun install` in the sandbox resolves `@kortix/opencode-sdk@^X.Y.Z`.
3. **Sandbox last** — this triggers live updates on all running sandboxes.

## Changelog System

Every release includes a structured changelog at `sandbox/CHANGELOG.json`. This file is:

- Bundled in the `@kortix/sandbox` npm package
- Deployed to `/opt/kortix/CHANGELOG.json` by `postinstall.sh`
- Served by kortix-master at `GET /kortix/health` (current version's entry)
- Served by the platform API at `GET /v1/platform/sandbox/version` (latest version's entry)
- Shown in the frontend update UI ("What's new")

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

### Testing locally before release

Validate your changelog entry:
```bash
node -e "const c=require('./sandbox/CHANGELOG.json');const e=c.find(e=>e.version==='0.6.0');if(!e)throw 'missing';console.log('✓',e.title)"
```

Check what files would be published:
```bash
cd sandbox && npm pack --dry-run
```
