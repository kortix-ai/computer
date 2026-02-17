# OpenCode Publishing Guide

> **For unified releases (CLI + SDK + Sandbox + GitHub Release), use the [release script](./releasing.md).** The manual steps below are for individual component publishing only.

How the Kortix fork of OpenCode is built, published, and deployed into the sandbox.

## Architecture

```
Upstream (anomalyco/opencode)
  └─ npm: opencode-ai@1.1.x          ← stock CLI from anomalyco
  └─ npm: @opencode-ai/sdk@1.1.x     ← stock SDK

Kortix fork (computer/services/opencode, branch: kortix)
  └─ npm: @kortix/opencode-ai@0.x.x  ← our CLI with scan(), custom tools, etc.
  └─ npm: @kortix/opencode-sdk@0.x.x ← our SDK with extra endpoints
```

The sandbox Dockerfile installs `@kortix/opencode-ai` (NOT the upstream `opencode-ai`).  
The frontend SDK uses `@kortix/opencode-sdk`.

## Package Distribution

OpenCode uses a **platform-specific optional dependency** pattern (same as esbuild, turbo, swc):

```
@kortix/opencode-ai (meta-package)
  ├─ bin/opencode              ← Node.js launcher that finds the right binary
  ├─ postinstall.mjs           ← verifies platform binary installed
  └─ optionalDependencies:
       @kortix/opencode-ai-linux-arm64     ← Bun-compiled native binary
       @kortix/opencode-ai-linux-x64
       @kortix/opencode-ai-linux-arm64-musl
       @kortix/opencode-ai-linux-x64-musl
       @kortix/opencode-ai-linux-x64-baseline
       @kortix/opencode-ai-linux-x64-baseline-musl
       @kortix/opencode-ai-darwin-arm64
       @kortix/opencode-ai-darwin-x64
       @kortix/opencode-ai-darwin-x64-baseline
       @kortix/opencode-ai-windows-x64
       @kortix/opencode-ai-windows-x64-baseline
```

When a user runs `npm install -g @kortix/opencode-ai`, npm only downloads the platform binary matching their OS/arch. The `bin/opencode` launcher detects the platform and spawns the correct native binary.

## How to Publish (Local)

### Prerequisites

- Bun 1.3.8 (must match `packageManager` in root `package.json`)
- npm login with access to `@kortix` org on npmjs.org
- Verify: `npm whoami` should return your username

### Step 1: Build CLI (all platforms)

```bash
cd computer/services/opencode

# Install deps
bun install

# Build all 11 platform binaries
cd packages/opencode
KORTIX_BUILD=true OPENCODE_VERSION=<VERSION> bun run build
```

- `KORTIX_BUILD=true` makes the binary reference `@kortix/opencode-ai` instead of `opencode-ai`
- `OPENCODE_VERSION` sets the exact version string baked into the binary
- `--single` flag builds only for the current platform (faster for local testing)
- Outputs to `packages/opencode/dist/<platform>/`

### Step 2: Publish CLI to npm

```bash
# From packages/opencode/
KORTIX_VERSION=<VERSION> bun ./script/publish-kortix.ts latest
```

This script:
1. Reads all platform binaries from `dist/`
2. Rewrites package names from `opencode-*` to `@kortix/opencode-ai-*`
3. Creates the meta-package with `optionalDependencies`
4. Publishes all 11 platform packages + meta-package to npm

Options:
- Tag: `latest` (default), `beta`, `dev`
- `DRY_RUN=true` to skip actual publishing

### Step 3: Build and Publish SDK (if changed)

```bash
# Build SDK
cd packages/sdk/js
bun run build

# Publish
KORTIX_SDK_VERSION=<VERSION> bun ./script/publish-kortix.ts latest
```

### Step 4: Update sandbox/package.json

The Dockerfile reads versions from `sandbox/package.json` — no hardcoded versions to edit.

```bash
# Edit sandbox/package.json:
#   "dependencies": { "@kortix/opencode-ai": "<VERSION>" }
# Also bump SDK in sandbox/opencode/package.json if needed:
#   "@kortix/opencode-sdk": "^<VERSION>"
```

See [sandbox-update-system.md](./sandbox-update-system.md) for the full update architecture.

### Step 5: Publish sandbox update (optional)

If you want running sandboxes to pick up the new CLI/SDK without a Docker rebuild:

```bash
cd computer/sandbox
# Bump "version" in package.json
npm publish
```

### Step 6: Rebuild Docker image (if needed)

Only needed for new sandbox deployments. Running sandboxes update via npm.

```bash
cd computer
./sandbox/push.sh
```

## How to Publish (CI)

The GitHub Actions workflow at `services/opencode/.github/workflows/publish-kortix.yml` automates the full pipeline.

Trigger via **workflow_dispatch** (manual) in the GitHub UI:

1. Go to Actions → "Publish @kortix/opencode-ai"
2. Click "Run workflow"
3. Enter version (e.g., `0.3.0`), tag (`latest`), and optionally enable dry run
4. The workflow builds all platforms, publishes CLI + SDK to npm

Required secrets: `NPM_TOKEN` (npm auth token with publish access to `@kortix` org).

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0-dev | Initial | First Kortix fork publish |
| 0.2.0 | 2026-02-11 | Added `Project.scan()` for automatic git repo discovery |
| 0.3.0 (CLI) / 0.4.0 (SDK) | 2026-02-17 | Upstream sync to v1.2.6, reverted background mode, added project settings UI, Database/Drizzle migration |

## Key Files

| File | Purpose |
|------|---------|
| `services/opencode/packages/opencode/script/build.ts` | Cross-platform binary compiler |
| `services/opencode/packages/opencode/script/publish-kortix.ts` | CLI npm publish script |
| `services/opencode/packages/sdk/js/script/publish-kortix.ts` | SDK npm publish script |
| `services/opencode/.github/workflows/publish-kortix.yml` | CI publish workflow |
| `services/opencode/packages/opencode/src/project/project.ts` | Project model (includes scan()) |
| `sandbox/package.json` | Single source of truth for all sandbox versions |
| `sandbox/Dockerfile` | Reads versions from package.json (no hardcoded versions) |
| `sandbox/postinstall.sh` | Live update deployment script |

## Relationship to Upstream

The Kortix fork (`services/opencode`, branch `kortix`) tracks upstream `anomalyco/opencode` but adds:

- `Project.scan()` — automatic git repo discovery via `Bun.Glob`
- `Project.list()` — triggers scan with 30s TTL cache
- Custom tools in `/opt/opencode/` (show-user, etc.)
- SDK extensions for file operations

When upstream publishes a new version, merge their changes into the `kortix` branch, bump version, and republish. The fork's version scheme (`0.x.x`) is independent of upstream (`1.1.x`).

## Troubleshooting

**Build fails with "bun version mismatch"**  
Check `services/opencode/package.json` → `packageManager` field. Install that exact bun version.

**npm publish fails with 403**  
Run `npm whoami` — must be logged in with access to `@kortix` org. Run `npm login` if needed.

**Docker build fails on `npm install -g @kortix/opencode-ai`**  
The package may not exist yet for the specified version. Check: `npm view @kortix/opencode-ai versions --json`

**Container runs but scan doesn't find repos**  
Verify the container runs `@kortix/opencode-ai` (not `opencode-ai`): `docker exec <container> opencode --version` should show the Kortix version. Check `which opencode` points to the `@kortix` package.

**Scan finds repos but they show as "global"**  
Git's `safe.directory` check blocks `git rev-list` when the repo owner differs from the running user. The Dockerfile sets `git config --system --add safe.directory '*'` to allow all directories. If repos are still not detected, verify this config exists: `docker exec <container> git config --system --get-all safe.directory`
