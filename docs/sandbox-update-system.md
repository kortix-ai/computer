# Sandbox Update System

How running sandboxes are remotely updated without rebuilding the Docker image.

> **Releasing a new version?** See [docs/releasing.md](./releasing.md) for the unified release process.

---

## Changelog

Every release includes a structured changelog at `sandbox/CHANGELOG.json`. It is:

- Bundled in the `@kortix/sandbox` npm package
- Deployed to `/opt/kortix/CHANGELOG.json` by `postinstall.sh`
- Served by kortix-master at `GET /kortix/health` (current version's entry)
- Served by the platform API at `GET /v1/platform/sandbox/version` (latest version's entry)
- Shown in the frontend update UI ("What's new in vX.Y.Z")

To add a changelog entry, edit `sandbox/CHANGELOG.json` before running the release script. The release script validates that an entry exists for the target version.

---

## Overview

Every running Kortix sandbox can be updated remotely via a single npm package: `@kortix/sandbox`. This package bundles all Kortix-specific code (agents, skills, tools, configs) and declares all dependency versions. When published to npm, running sandboxes detect the new version and can self-update.

**Single source of truth:** `sandbox/package.json` declares ALL versioned dependencies. Both the Dockerfile (initial build) and `postinstall.sh` (live updates) read from it. No versions are hardcoded anywhere else.

---

## What `@kortix/sandbox` Controls

### Versions declared in `sandbox/package.json`

```json
{
  "name": "@kortix/sandbox",
  "version": "0.4.16",
  "dependencies": {
    "opencode-ai": "1.2.10",
    "agent-browser": "^0.10.0"
  },
  "kortix": {
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
| `opencode/agents/` | Agent definitions | `/opt/opencode/agents/` |
| `opencode/skills/` | Skill definitions | `/opt/opencode/skills/` |
| `opencode/tools/` | Custom tools | `/opt/opencode/tools/` |
| `opencode/commands/` | Slash commands | `/opt/opencode/commands/` |
| `opencode/plugin/` | Memory plugin, etc. | `/opt/opencode/plugin/` |
| `opencode/patches/` | Patches applied via postinstall | `/opt/opencode/patches/` |
| `opencode/opencode.jsonc` | OpenCode config | `/opt/opencode/opencode.jsonc` |
| `opencode/package.json` | OpenCode deps (SDK, plugin, etc.) | `/opt/opencode/package.json` |
| `kortix-master/` | Proxy server + update handler | `/opt/kortix-master/` |
| `browser-viewer/` | Agent browser viewer (static HTML) | `/opt/agent-browser-viewer/` |
| `config/` | Container init scripts | `/custom-cont-init.d/` |
| `services/` | s6 service definitions | `/etc/s6-overlay/s6-rc.d/` |
| `postinstall.sh` | Deployment script | Runs on `npm install` |
| `patch-agent-browser.js` | Agent browser patches | Applied during postinstall |

### Secondary deps (resolved by `bun install` during postinstall)

These live in `sandbox/opencode/package.json` and auto-resolve within their `^` ranges on every update:

| Package | Range | Purpose |
|---|---|---|
| `@opencode-ai/plugin` | `^1.2.10` | OpenCode plugin system (includes SDK as transitive dep) |
| `@mendable/firecrawl-js` | `^4.12.0` | Web scraping |
| `@tavily/core` | `^0.7.1` | Web search |
| `agent-browser` | `^0.10.0` | Browser automation (local import) |
| `opencode-pty` | `^0.2.1` | PTY management |
| `replicate` | `^1.4.0` | AI model API |

---

## Update Flow

### Detection

```
Platform API (kortix-api)
  GET /v1/platform/sandbox/version
    → Fetches https://registry.npmjs.org/@kortix/sandbox/latest
    → Returns { version: "0.4.17" }
    → Cached for 5 minutes

Frontend (use-sandbox-update.ts)
  → Polls platform API every 5 min for latest version
  → Compares against sandbox's current version (from GET /kortix/health)
  → Shows "Update available" banner if latest > current
```

### Execution

```
User clicks "Update"
  → Frontend POST {sandboxUrl}/kortix/update  { "version": "0.4.17" }

Sandbox (kortix-master/src/routes/update.ts)
  → sudo npm install -g @kortix/sandbox@0.4.17
  → npm triggers postinstall.sh

postinstall.sh (runs inside sandbox)
  1. rsync kortix-master/ → /opt/kortix-master/     (+ bun install)
  2. rsync opencode/      → /opt/opencode/           (+ bun install, resolves SDK/plugin/etc.)
  3. rsync services/      → /etc/s6-overlay/s6-rc.d/ (s6 service scripts)
  4. cp config/           → /custom-cont-init.d/      (init scripts)
  5. npm install -g opencode-ai@{version}              (CLI binary + musl symlink)
  6. npm install -g agent-browser@{version}            (browser automation)
  7. node patch-agent-browser.js                       (browser patches)
  8. rsync browser-viewer/ → /opt/agent-browser-viewer/
  9. Write /opt/kortix/.version                         (version stamp)
  10. pip3 install {pythonDependencies}                  (LSS, pypdf2, pptx, etc.)
  11. pip3 install playwright (musl cross-install)
  12. chown -R 1000:1000 /opt/...                       (fix permissions)

kortix-master (after postinstall completes)
  → Restarts: svc-opencode-serve, svc-opencode-web, svc-lss-sync,
              svc-agent-browser-viewer, svc-presentation-viewer
  → Self-restart: svc-kortix-master (2s delay so HTTP response completes)
```

### Result

The sandbox now runs the exact same software as a freshly built Docker image with that version — agents, skills, tools, configs, CLI binary, SDK, browser, pip packages — all updated.

---

## How to Push an Update

### 1. Make changes

Edit files under `sandbox/` — agents, skills, tools, configs, kortix-master, etc.

### 2. Update versions in `sandbox/package.json` (if dependencies changed)

```json
{
  "dependencies": {
    "opencode-ai": "1.2.10",            ← pin upstream CLI version
    "agent-browser": "^0.11.0"           ← bump browser version
  },
  "kortix": {
    "pythonDependencies": {
      "local-semantic-search": "latest",
      "playwright": "1.59.0"             ← bump pip version
    }
  }
}
```

### 3. Bump sandbox version

```json
{
  "version": "0.4.17"    ← this is what triggers update detection
}
```

### 4. Publish to npm

```bash
cd computer/sandbox
npm publish
```

### 5. Done

Running sandboxes will detect the new version within 5 minutes. Users see "Update available" and click to apply.

---

## What Requires a Docker Rebuild

These are system-level components baked into the Docker image that cannot be live-updated:

| Component | Why |
|---|---|
| Alpine base image + OS packages | `apk add` — can't run from postinstall |
| Bun runtime | Binary install via curl |
| bun-pty musl .so | Rust compilation in multi-stage build |
| uv (Python package runner) | Binary install via curl |
| Chromium | Part of base image |
| Branding assets (wallpaper, icons) | COPY'd into system dirs |
| Workspace directory structure | mkdir + chown at build time |

Everything else flows through `@kortix/sandbox` and is live-updatable.

---

## Architecture Diagram

```
sandbox/package.json  ←── SINGLE SOURCE OF TRUTH
│
├── version: "0.4.16"
│
├── dependencies:
│   ├── opencode-ai: "1.2.10"               ← upstream CLI binary (pinned)
│   └── agent-browser: "^0.10.0"            ← browser automation
│
├── kortix.pythonDependencies:
│   ├── local-semantic-search, pypdf2, ...   ← pip packages
│   └── playwright: "1.58.0"                 ← special musl install
│
├── bundled files:
│   └── opencode/package.json               ← secondary deps (auto-resolve):
│       ├── @opencode-ai/plugin: "^1.2.10"  (SDK is a transitive dep of plugin)
│       └── firecrawl, tavily, replicate...
│
│
│   Dockerfile reads from ──► sandbox/package.json
│   (initial Docker build)     pip versions, CLI version, agent-browser version
│
│   postinstall.sh reads from ► sandbox/package.json
│   (live updates)               CLI, agent-browser, pip versions
│
│
│   Platform API checks ──────► npm registry for @kortix/sandbox
│   (every 5 min cache)
│
│   Frontend compares ────────► sandbox version vs npm latest
│   (use-sandbox-update.ts)     shows "Update available"
│
│   User clicks update ──────► POST /kortix/update
│   (kortix-master)              npm install -g @kortix/sandbox@X
│                                → postinstall.sh deploys everything
│                                → services restart
```

---

## Key Files

| File | Purpose |
|---|---|
| `sandbox/package.json` | Single source of truth — all versions, bundled file list |
| `sandbox/postinstall.sh` | Deployment script — runs on npm install, deploys everything |
| `sandbox/Dockerfile` | Docker image build — reads versions from package.json |
| `sandbox/kortix-master/src/routes/update.ts` | HTTP endpoint for triggering updates |
| `services/kortix-api/src/platform/routes/version.ts` | Platform API — checks npm for latest version |
| `apps/frontend/src/hooks/platform/use-sandbox-update.ts` | Frontend hook — version comparison + update trigger |

---

## Troubleshooting

### Update stuck / not detected

The platform API caches npm registry responses for 5 minutes. Wait, or restart the platform API.

### Update fails with npm error

Check sandbox logs: `s6-svc -r /run/service/svc-kortix-master` then read `/var/log/s6-overlay/...`. Common cause: npm registry timeout on slow networks. The update can be retried.

### CLI version didn't change after update

The postinstall compares `opencode --version` output against the declared version. If the format doesn't match exactly, it may skip. Check: `opencode --version` on the sandbox.

### Sandbox reports wrong version after update

Version is written to `/opt/kortix/.version` by postinstall. Check: `cat /opt/kortix/.version`. If stale, the postinstall may have failed silently (stderr is swallowed in some places).

### bun install fails during postinstall

Usually a network issue or disk space. The opencode `bun install` also runs `bash patches/apply.sh` as a postinstall — if patches fail, the whole install fails. Check `/opt/opencode/patches/` for broken patches.
