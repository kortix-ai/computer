# Sandbox Update System

How running sandboxes are remotely updated without rebuilding the Docker image.

> **Releasing a new version?** See [docs/versioning-releasing.md](./versioning-releasing.md) for the unified release process.

---

## Changelog

Every release includes a structured changelog at `packages/sandbox/CHANGELOG.json`. It is:

- Bundled in the `@kortix/sandbox` npm package
- Deployed to `/opt/kortix/CHANGELOG.json` by `postinstall.sh`
- Served by kortix-master at `GET /kortix/health` (current version's entry)
- Served by the platform API at `GET /v1/platform/sandbox/version` (latest version's entry)
- Shown in the frontend update UI ("What's new in vX.Y.Z")

To add a changelog entry, edit `packages/sandbox/CHANGELOG.json` before running the release script. The release script validates that an entry exists for the target version.

---

## Overview

Every running Kortix sandbox can be updated remotely via a single npm package: `@kortix/sandbox`. This package bundles all Kortix-specific code (agents, skills, tools, configs) and declares all dependency versions. When published to npm, running sandboxes detect the new version and can self-update.

**Single source of truth:** `packages/sandbox/package.json` declares ALL versioned dependencies. Both the Docker first-boot bootstrap (`startup.sh`) and `postinstall.sh` (live updates) read from it. No versions are hardcoded anywhere else.

**Two deployment paths:**

| Path | When | How |
|------|------|-----|
| **First-boot bootstrap** | New container (no ACID symlinks) | `startup.sh` detects `! -L /opt/kortix-master`, runs `npm install @kortix/sandbox@{version}`, triggers `postinstall.sh` in **direct mode** |
| **Live update** | Running sandbox, user clicks "Update" | `POST /kortix/update` → `postinstall.sh` in **staging/ACID mode** → atomic symlink swap |

---

## What `@kortix/sandbox` Controls

### Versions declared in `packages/sandbox/package.json`

```json
{
  "name": "@kortix/sandbox",
  "version": "0.7.17",
  "dependencies": {
    "opencode-ai": "1.2.17",
    "@kortix/kortix-oc": "^0.1.1",
    "@kortix/opencode-channels": "^0.2.0",
    "agent-browser": "^0.10.0"
  },
  "kortix": {
    "globalNpmTools": {
      "portless": "0.5.2"
    },
    "pythonDependencies": {
      "local-semantic-search": "latest",
      "pypdf2": "3.0.1",
      "python-pptx": "1.0.2",
      "pillow": "12.1.0",
      "greenlet": "latest",
      "pyee": "latest",
      "typing-extensions": "latest",
      "playwright": "1.58.0"
    }
  }
}
```

### Files bundled in the npm tarball

| Directory/File | What it is | Deployed to |
|---|---|---|
| `packages/kortix-oc/runtime/agents/` | Agent definitions | `/opt/opencode/agents/` |
| `packages/kortix-oc/runtime/skills/` | Skill definitions | `/opt/opencode/skills/` |
| `packages/kortix-oc/runtime/tools/` | Custom tools | `/opt/opencode/tools/` |
| `packages/kortix-oc/runtime/commands/` | Slash command source markdown | Inlined into `/opt/opencode/opencode.jsonc` during materialization |
| `packages/kortix-oc/runtime/plugin/` | Wrapper plugin + source modules | Kept in `/opt/kortix-oc/runtime/plugin/`, referenced from `/opt/opencode/opencode.jsonc` |
| `packages/kortix-oc/runtime/patches/` | Patch scripts | Kept in `/opt/kortix-oc/runtime/patches/`, applied to `/opt/opencode` during install |
| `packages/kortix-oc/runtime/opencode.jsonc` | OpenCode config | `/opt/opencode/opencode.jsonc` |
| `packages/kortix-oc/runtime/package.json` | OpenCode runtime deps | `/opt/opencode/package.json` |
| `packages/kortix-oc/` | Full source-of-truth package | `/opt/kortix-oc/` |
| `packages/sandbox/kortix-master/` | Proxy server + update handler | `/opt/kortix-master/` |
| `browser-viewer/` | Agent browser viewer (static HTML) | `/opt/agent-browser-viewer/` |
| `packages/sandbox/config/` | Container init scripts | `/custom-cont-init.d/` |
| `packages/sandbox/s6-services/` | Service run scripts (executed by core supervisor) | `/etc/s6-overlay/s6-rc.d/` |
| `packages/sandbox/core/manifest.json` | Core artifact contract | `/opt/kortix/core/manifest.json` |
| `packages/sandbox/core/service-spec.json` | Declarative service graph for supervisor | `/opt/kortix/core/service-spec.json` |
| `packages/sandbox/postinstall.sh` | Deployment script | Runs on `npm install` |
| `packages/sandbox/patch-agent-browser.js` | Agent browser patches | Applied during postinstall |
| `packages/sandbox/startup.sh` | Daytona entrypoint + first-boot bootstrap | `/opt/startup.sh` |

### Secondary deps (resolved by `bun install` during postinstall)

These live in `packages/kortix-oc/runtime/package.json` and auto-resolve within their `^` ranges on every update:

| Package | Range | Purpose |
|---|---|---|
| `@opencode-ai/plugin` | `^1.2.10` | OpenCode plugin system (includes SDK as transitive dep) |
| `@mendable/firecrawl-js` | `^4.12.0` | Web scraping |
| `@tavily/core` | `^0.7.1` | Web search |
| `agent-browser` | `^0.10.0` | Browser automation (local import) |
| `opencode-pty` | `^0.2.1` | PTY management |
| `replicate` | `^1.4.0` | AI model API |

---

## First-Boot Bootstrap Flow

When a fresh `kortix/computer` container starts, there is no Kortix-specific code in the image. The bootstrap happens like this:

```
startup.sh
  → checks: [ ! -L /opt/kortix-master ]
  → detects first boot (ACID symlink not yet created)
  → mkdir -p /opt/kortix-bootstrap
  → npm install --no-audit --no-fund @kortix/sandbox@{KORTIX_SANDBOX_VERSION:-latest}
  → postinstall.sh runs in DIRECT mode

postinstall.sh (direct mode)
  1. npm install -g opencode-ai@{version}         (CLI + musl swap)
  2. npm install -g agent-browser@{version}        (browser automation)
  3. npm install -g portless@{version}             (global npm tool from kortix.globalNpmTools)
  4. npm install -g @kortix/opencode-channels@{v}  (Slack/Telegram channels CLI + lib)
  5. bun install kortix-master → /opt/kortix-master/
  6. rsync @kortix/kortix-oc → /opt/kortix-oc/
  7. bun run kortix-oc materialize → /opt/opencode/
  8. bun install /opt/opencode/
  9. apply patches /opt/opencode/
  10. apply bun-pty musl .so patch
  11. rsync s6-services → /etc/s6-overlay/s6-rc.d/
  12. cp config/ → /custom-cont-init.d/
  13. rsync browser-viewer → /opt/agent-browser-viewer/
  14. uv/pip install python dependencies (lss, pypdf2, pptx, playwright, etc.)
  15. write /opt/kortix/.version
  16. mv deployed dirs → /opt/kortix-staging-{version}/
  17. ln -s staging dirs → /opt/kortix-master, /opt/opencode, etc. (ACID symlinks)

startup.sh continues
  → exec unshare --pid --fork /init  (s6-overlay takes over as PID 1)

s6-overlay
  → starts svc-kortix-master (reads ACID symlinks)
  → svc-sshd, etc.
```

**Important:** Bootstrap uses `npm install` (not `bun install`) because `bun install` hangs under qemu amd64 emulation in Docker. The bootstrap path in `startup.sh` must always use `npm`.

**Duration:** ~3-6 minutes on first boot. Subsequent starts skip the bootstrap entirely (ACID symlink already exists).

---

## Live Update Flow

### Detection

```
Platform API (kortix-api)
  GET /v1/platform/sandbox/version
    → Fetches https://registry.npmjs.org/@kortix/sandbox/latest
    → Returns { version: "0.7.17" }
    → Cached for 5 minutes

Frontend (use-sandbox-update.ts)
  → Polls platform API every 5 min for latest version
  → Compares against sandbox's current version (from GET /kortix/health)
  → Shows "Update available" banner if latest > current
```

### Execution

```
User clicks "Update"
  → Frontend POST {sandboxUrl}/kortix/update { "version": "0.7.17" }
  → Frontend polls GET {sandboxUrl}/kortix/update/status every 2s

Sandbox (kortix-master/src/routes/update.ts)
  → npm install -g @kortix/sandbox@0.7.17
  → npm triggers postinstall.sh in STAGING mode

postinstall.sh (staging / ACID mode)
  → deploys ALL files to /opt/kortix-staging-0.7.17/ (isolated, atomic)
  → writes .manifest with status: "staged"
  → update.ts reads manifest, atomically swaps ACID symlinks
  → kortix-master self-restarts (2s delay so HTTP response completes)

GET /kortix/update/status (polled by frontend every 2s)
  → returns { phase, phaseLabel, phaseProgress, phaseMessage }
  → frontend shows live animated progress bar with percentage + message
```

### Result

The sandbox now runs the exact same software as a freshly bootstrapped container with that version — agents, skills, tools, inline commands, configs, CLI binary, SDK, browser, pip packages — all updated atomically.

---

## How to Push an Update

### 1. Make changes

Edit sandbox wrapper/runtime-image files under `packages/sandbox/` and `packages/sandbox/docker/`, but edit OpenCode runtime files under `packages/kortix-oc/runtime/`.

### 2. Update versions in `packages/sandbox/package.json` (if dependencies changed)

```json
{
  "dependencies": {
    "opencode-ai": "1.2.17",              ← pin upstream CLI version (exact, no ^)
    "agent-browser": "^0.11.0",           ← bump browser version
    "@kortix/opencode-channels": "^0.2.1" ← bump channels version
  },
  "kortix": {
    "globalNpmTools": {
      "portless": "0.5.3"                 ← bump portless version
    },
    "pythonDependencies": {
      "local-semantic-search": "latest",
      "playwright": "1.59.0"              ← bump pip version
    }
  }
}
```

### 3. Bump sandbox version

```json
{
  "version": "0.7.18"    ← this is what triggers update detection
}
```

### 4. Publish to npm

```bash
cd computer/packages/sandbox
npm publish
```

### 5. Done

Running sandboxes will detect the new version within 5 minutes. Users see "Update available" and click to apply.

---

## What Requires a Docker Rebuild

The Docker image (`kortix/computer`) is a stable OS base. Only rebuild it when you change OS-level components that cannot be updated via npm:

| Component | Why |
|---|---|
| Alpine base image + OS packages | `apk add` — can't run from postinstall |
| Bun runtime | Binary install via curl |
| bun-pty musl .so | Rust compilation in multi-stage build |
| uv (Python package runner) | Binary install via curl |
| Chromium | Part of base image |
| Branding assets (wallpaper, icons) | COPY'd into system dirs |
| Workspace directory structure | mkdir + chown at build time |
| s6-overlay registration | `touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-*` |
| Container init scripts (95-setup-sshd, 96-fix-bun-pty, 97-secrets) | Baked into image, not updated by postinstall |
| `startup.sh` (entrypoint) | Baked into `/opt/startup.sh` |

Everything else (kortix-master, opencode, agent-browser, channels, portless, agents, skills, tools, pip packages) flows through `@kortix/sandbox` and is live-updatable without a Docker rebuild.

---

## Architecture Diagram

```
packages/sandbox/package.json  ←── SINGLE SOURCE OF TRUTH
│
├── version: "0.7.17"
│
├── dependencies:
│   ├── opencode-ai: "1.2.17"               ← upstream CLI binary (exact pin)
│   ├── @kortix/kortix-oc: "^0.1.1"         ← OpenCode runtime (public npm package)
│   ├── @kortix/opencode-channels: "^0.2.0" ← Slack/Telegram adapter (public npm package)
│   └── agent-browser: "^0.10.0"            ← browser automation
│
├── kortix.globalNpmTools:
│   └── portless: "0.5.2"                   ← port tunneling (npm install -g)
│
├── kortix.pythonDependencies:
│   ├── local-semantic-search, pypdf2, ...   ← pip packages
│   └── playwright: "1.58.0"                 ← special musl cross-install
│
├── bundled files:
│   └── opencode/package.json               ← secondary deps (auto-resolve):
│       ├── @opencode-ai/plugin: "^1.2.10"  (SDK is a transitive dep of plugin)
│       └── firecrawl, tavily, replicate...
│
│
│   First-boot bootstrap ─────────► startup.sh: ! -L /opt/kortix-master
│   (new sandbox from                npm install @kortix/sandbox@{KORTIX_SANDBOX_VERSION}
│    kortix/computer image)          → postinstall.sh DIRECT mode
│                                    → deploys to /opt/, creates ACID symlinks
│                                    → takes ~3-6 min
│
│   Live update (user-triggered) ──► POST /kortix/update
│   (running sandbox)                npm install -g @kortix/sandbox@{version}
│                                    → postinstall.sh STAGING mode
│                                    → deploys to /opt/kortix-staging-{v}/
│                                    → atomic ACID symlink swap
│
│   Platform API checks ───────────► npm registry for @kortix/sandbox
│   (every 5 min cache)
│
│   Frontend compares ─────────────► sandbox version vs npm latest
│   (use-sandbox-update.ts)          shows "Update available"
│
│   Frontend polls status ─────────► GET /kortix/update/status every 2s
│   (during active update)           { phase, phaseLabel, phaseProgress, phaseMessage }
│                                    animated progress bar in /changelog page
```

---

## Key Files

| File | Purpose |
|---|---|
| `packages/sandbox/package.json` | Single source of truth — all versions, bundled file list |
| `packages/sandbox/postinstall.sh` | Deployment script — direct mode (first boot) + staging/ACID mode (live update) |
| `packages/sandbox/startup.sh` | Daytona entrypoint — first-boot bootstrap detection + PID namespace setup |
| `packages/sandbox/docker/Dockerfile` | Stable OS base image (~2.87GB, no Kortix code pre-baked) |
| `packages/sandbox/kortix-master/src/routes/update.ts` | HTTP endpoint for triggering updates |
| `kortix-api/src/platform/routes/version.ts` | Platform API — checks npm for latest version |
| `apps/frontend/src/hooks/platform/use-sandbox-update.ts` | Frontend hook — version comparison + update trigger + status polling |
| `apps/frontend/src/app/(dashboard)/changelog/page.tsx` | Changelog page — shows live UpdateProgress component during update |

---

## Troubleshooting

### Update stuck / not detected

The platform API caches npm registry responses for 5 minutes. Wait, or restart the platform API.

### Update fails with npm error

Check sandbox logs: `s6-svc -r /run/service/svc-kortix-master` then read `/var/log/s6-overlay/...`. Common cause: npm registry timeout on slow networks. The update can be retried.

### First-boot bootstrap takes too long or fails

Check if the npm install succeeded:
```bash
docker exec kortix-sandbox cat /opt/kortix-bootstrap/node_modules/@kortix/sandbox/package.json | grep version
```

If it failed, the bootstrap error is logged to stdout. Restart the container to retry.

Force a specific version by setting `KORTIX_SANDBOX_VERSION` in your docker-compose:
```yaml
environment:
  KORTIX_SANDBOX_VERSION: "0.7.17"
```

### CLI version didn't change after update

The postinstall compares `opencode --version` output against the declared version. If the format doesn't match exactly, it may skip. Check: `opencode --version` on the sandbox.

### Sandbox reports wrong version after update

Version is written to `/opt/kortix/.version` by postinstall. Check:
```bash
docker exec kortix-sandbox cat /opt/kortix/.version
```
If stale, the postinstall may have failed silently. Check logs or retry the update.

### bun install fails during postinstall

Usually a network issue or disk space. The opencode `bun install` also runs `bash patches/apply.sh` as a postinstall — if patches fail, the whole install fails. Check `/opt/opencode/patches/` for broken patches.

### Bootstrap hangs on amd64 (bun under qemu)

`bun install` hangs under qemu amd64 emulation. The bootstrap path in `startup.sh` always uses `npm install` to avoid this. If you see a hang on first boot, check whether something changed in `startup.sh` to use bun instead of npm.
