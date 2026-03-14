# Development & Release Guide

> **Single source of truth** for local development, sandbox architecture, versioning, and releases.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Local Dev Workflow](#local-dev-workflow)
4. [Sandbox Dev Details](#sandbox-dev-details)
5. [Versioning](#versioning)
6. [Release Flow](#release-flow)
7. [OTA Update Mechanism](#ota-update-mechanism)
8. [Docker Image Architecture](#docker-image-architecture)
9. [Ports Reference](#ports-reference)
10. [Quick Reference Cheatsheet](#quick-reference-cheatsheet)

---

## Quick Start

```bash
# 1. Start Supabase (auth + DB)
supabase start
supabase status -o env  # copy values into kortix-api/.env and apps/frontend/.env.local

# 2. Start dev servers (frontend + API)
pnpm dev

# 3. Start sandbox (optional — only if you need it)
pnpm dev:sandbox
```

---

## Architecture Overview

The sandbox is built in 4 layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Image (kortix/computer)                             │
│  OS: Alpine XFCE, Bun, uv, chromium, SSH, s6-overlay       │
│  Prebaked at: docker build time                             │
│                                                             │
│  /opt/kortix-staging-{version}/   ← actual files live here │
│      kortix-master/               ← proxy/API server        │
│      opencode/                    ← OC runtime config       │
│      kortix-opencode/             ← OpenCode config dir     │
│      opencode-channels/           ← chat adapters           │
│      opencode-agent-triggers/     ← cron/triggers           │
│      agent-browser-viewer/        ← browser viewer UI       │
│      kortix/                      ← version + CHANGELOG     │
│                                                             │
│  /opt/kortix-master    → symlink to kortix-staging-*/kortix-master
│  /opt/opencode         → symlink to kortix-staging-*/opencode
│  (kortix-opencode → /opt/opencode/)                          │
│  (symlinks are the ACID swap mechanism for OTA updates)     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  s6-overlay services (managed by s6-rc)                     │
│  svc-kortix-master  — starts /opt/kortix-master             │
│  svc-sshd           — SSH daemon                            │
│  svc-de             — desktop environment (webtop)          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  kortix-master (proxy + control server)                     │
│  Port 8000 — entry point for all sandbox API calls          │
│  Mounts: /kortix/*, /health, /update, /proxy, /lss, etc.   │
│  Process-manages: opencode, agent-browser, lss, channels    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  /workspace  (persistent volume — user data)                │
│  .kortix/         — opencode config, agent state            │
│  .kortix-state/   — kortix-master persisted state           │
│  .browser-profile/ — Chromium profile                       │
│  .lss/            — semantic search DB                      │
│  .secrets/        — injected env vars (mode 700)            │
└─────────────────────────────────────────────────────────────┘
```

### The symlink contract

Every runtime path in `/opt/` is a symlink to the current staged version:

```
/opt/kortix-master  →  /opt/kortix-staging-0.7.26/kortix-master
/opt/opencode       →  /opt/kortix-staging-0.7.26/opencode
...
```

This is how OTA updates work atomically: `postinstall.sh` builds a new `kortix-staging-{newVersion}/` directory in parallel while the live version keeps running, then `update.ts` swaps all symlinks at once.

---

## Local Dev Workflow

### 1. Frontend

```bash
pnpm dev:frontend
# Runs: Next.js dev server on http://localhost:3000
# Source: apps/frontend/
```

### 2. API

```bash
pnpm dev:api
# Runs: kortix-api on http://localhost:8008
# Source: kortix-api/
```

### 3. Both (common case)

```bash
pnpm dev
```

### 4. Sandbox (when you need it)

```bash
pnpm dev:sandbox
# = docker compose -f .../docker-compose.yml -f .../docker-compose.dev.yml up
```

This uses **two compose files**:
- `docker-compose.yml` — builds the image, sets ports and env
- `docker-compose.dev.yml` — **overlay** that bind-mounts your local source

With the dev overlay, **code changes are live immediately**. You only need `--build` when deps change (see below).

---

## Sandbox Dev Details

### Bind mounts (dev mode)

`docker-compose.dev.yml` mounts local source over the prebaked image:

| Local path | Container path |
|---|---|
| `packages/sandbox/kortix-master/src` | `/opt/kortix-master/src` |
| `packages/kortix-opencode/` | `/opt/opencode/` (agents, tools, skills, plugin, commands) |
| `packages/opencode-channels/src` | `/opt/opencode-channels/src` |
| `packages/opencode-agent-triggers/src` | `/opt/opencode-agent-triggers/src` |

These map into the **active symlink target** — so your edit lands directly in the running code path.

### When to rebuild the image

You **do not** need to rebuild for:
- TypeScript source changes (they're bind-mounted live)
- Adding/editing agents, skills, tools, prompts

You **do** need `pnpm dev:sandbox --build` when:
- `Dockerfile` changes
- `packages/sandbox/package.json` changes (new/removed dep)
- `kortix-master/package.json` or `bun.lock` changes
- `kortix-opencode/package.json` changes

### Restarting services inside the container

```bash
# Restart kortix-master (picks up code changes when not bind-mounted):
docker exec kortix-sandbox s6-svc -r /run/service/svc-kortix-master

# View live logs:
docker exec kortix-sandbox s6log tail /run/service/svc-kortix-master/log/

# Shell into the container:
docker exec -it kortix-sandbox bash
```

### Health check

```bash
curl http://127.0.0.1:14000/kortix/health
# Returns: {"status":"ok","version":"0.7.26"}
```

---

## Versioning

### Semver conventions

| Bump | When |
|---|---|
| **patch** `0.7.x` | Bug fixes, agent/skill updates, small tweaks |
| **minor** `0.x.0` | New features, new services, breaking internal APIs |
| **major** `x.0.0` | Architecture changes, Docker base image overhaul |

### Version locations

The single source of version truth is `packages/sandbox/package.json`. The `ship` script keeps all other locations in sync:

| File | Field |
|---|---|
| `packages/sandbox/package.json` | `"version"` |
| `packages/sandbox/release.json` | `releaseVersion`, `sandbox.image`, etc. |
| `packages/sandbox/startup.sh` | `DEFAULT_KORTIX_SANDBOX_VERSION` |
| `scripts/get-kortix.sh` | `DEFAULT_KORTIX_VERSION` |

### Changelog

Before releasing, add an entry to `packages/sandbox/CHANGELOG.json`:

```json
{
  "version": "0.8.0",
  "date": "2026-03-15",
  "title": "Short title for the release",
  "description": "Optional longer description",
  "changes": [
    { "type": "feature", "text": "Added X" },
    { "type": "fix",     "text": "Fixed Y" }
  ]
}
```

`pnpm ship` will reject if the changelog entry is missing.

---

## Release Flow

### One-liner

```bash
pnpm ship 0.8.0                 # Full release: GitHub Release + Docker images + Hetzner snapshot
pnpm ship --no-docker 0.8.0     # Skip Docker image rebuild/push and snapshot
pnpm ship --no-hetzner 0.8.0    # Skip only the Hetzner snapshot
```

### What `ship` does step by step

1. **Validate** — checks changelog entry exists and inspects whether the GitHub release already exists
2. **Bump versions** — updates all 4 version locations (package.json, release.json, startup.sh, get-kortix.sh)
3. **GitHub Release** — creates `v{version}` release with changelog as notes, or reuses the existing release
4. **Docker** — `docker buildx build --platform linux/amd64,linux/arm64 --push` for `kortix/computer`, `kortix/kortix-api`, and `kortix/kortix-frontend` unless you pass `--no-docker`
5. **Hetzner snapshot** — runs `scripts/build-hetzner-snapshot.sh --yes {version}` after the sandbox image is pushed, unless you pass `--no-docker` or `--no-hetzner`
6. **Commit** — `git commit -m "release: v{version}"` when there are version-bump changes to record (you still run `git push`)

### After shipping

```bash
git push
# Update your .env if needed:
#   SANDBOX_VERSION=0.8.0
```

### Validate state without shipping

```bash
pnpm check
# Shows: version numbers, git status, gh auth status
```

---

## OTA Update Mechanism

Running sandboxes update without Docker rebuilds via a 6-phase ACID flow.

### How a sandbox updates

1. User clicks **Update** in the sidebar (or API call to `POST /kortix/update`)
2. `update.ts` calls `downloadAndStageOTA(version)`:
   - Downloads `https://github.com/kortix-ai/computer/releases/download/v{version}/sandbox-runtime-{version}.tar.gz`
   - Extracts to `/tmp/kortix-ota-extract-{version}/`
   - Runs `postinstall.sh` from the tarball (detected as **staging mode** because `/opt/kortix-master` is a symlink)
3. `postinstall.sh` in **staging mode**:
   - Builds new `kortix-master`, `opencode`, `kortix-opencode`, `opencode-channels`, `opencode-agent-triggers` into `/opt/kortix-staging-{version}/`
   - **Smart dep copy**: if lockfile is unchanged vs. current version, copies `node_modules` instead of running `bun install` (fast path)
   - Writes `/opt/kortix-staging-{version}/.manifest` when done
4. `update.ts` verifies staging succeeded (manifest exists)
5. `update.ts` atomically swaps all `/opt/` symlinks to point to the new staging dir
6. `update.ts` restarts `kortix-master` via s6 and validates health

### ACID properties

- **Atomic** — all symlinks swap together; there's no partial state
- **Zero downtime** — new version staged while current is running
- **Rollback-safe** — old staging dir preserved until `cleanup` phase
- **Fast** — source-only tarball (~5MB) + dep copy shortcut when lockfile unchanged

### OTA tarball contents

```
sandbox-runtime-{version}.tar.gz
├── kortix-master/          proxy server TypeScript source
├── vendor/
│   ├── kortix-opencode/    OpenCode config (agents, tools, skills, plugins)
│   ├── opencode-channels/  chat adapter source
│   └── opencode-agent-triggers/  cron/trigger source
├── postinstall.sh          staging deployment script
├── s6-services/            service definitions
├── config/                 init scripts (kortix-env-setup, customize)
├── browser-viewer/         agent browser viewer UI
├── core/                   manifest + service spec
├── package.json            version + dep metadata
└── CHANGELOG.json
```

---

## Docker Image Architecture

### What's in the image (prebaked at build time)

Everything needed to run, with zero network calls on container start:

| Path | Contents |
|---|---|
| `/opt/bun/` | Bun runtime |
| `/usr/local/bin/uv` | uv (Python package runner) |
| `/opt/bun-pty-musl/librust_pty.so` | musl-compiled bun-pty Rust lib |
| `/opt/kortix-staging-{version}/` | Full sandbox runtime (code + node_modules) |
| `/opt/kortix-master` | Symlink → current staging dir |
| `/opt/opencode` | OpenCode config dir (agents, tools, skills, plugins) |
| `/etc/s6-overlay/s6-rc.d/` | Service definitions |
| `/custom-cont-init.d/` | Init scripts |

### What's NOT in the image

- User workspace data (mounted at `/workspace` as a volume)
- Secrets (injected via env vars → `/workspace/.secrets/`)
- New code versions (delivered via OTA tarball)

### Build command

```bash
# Just the sandbox image (local, for dev):
docker compose -f packages/sandbox/docker/docker-compose.yml build

# Multi-platform release push:
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f packages/sandbox/docker/Dockerfile \
  -t kortix/computer:0.8.0 \
  -t kortix/computer:latest \
  --push .
```

### When to rebuild the image

Only when something in the Dockerfile or its dependency chain changes:
- `Dockerfile` itself
- Any `apk add` package needed
- Bun version
- `packages/sandbox/package.json` (adds/removes a dep that needs prebaking)
- `bun.lock` in a sandbox package

For everything else, `pnpm ship` (OTA tarball) is sufficient.

---

## Ports Reference

All ports are on `127.0.0.1` in dev (no public exposure).

| Host port | Container port | Service |
|---|---|---|
| `14000` | `8000` | Kortix Master (proxy entry point) |
| `14001` | `3111` | OpenCode Web UI |
| `14002` | `6080` | Desktop (noVNC HTTP) |
| `14003` | `6081` | Desktop (noVNC HTTPS) |
| `14004` | `3210` | Presentation Viewer |
| `14005` | `9223` | Agent Browser Stream (WebSocket) |
| `14006` | `9224` | Agent Browser Viewer |
| `14007` | `22` | SSH |
| `14008` | `3211` | Static Web Server |

---

## Quick Reference Cheatsheet

### Start dev

```bash
supabase start
pnpm dev                  # frontend + API
pnpm dev:sandbox          # sandbox (separate terminal)
```

### Check health

```bash
curl http://127.0.0.1:14000/kortix/health
```

### Restart kortix-master inside sandbox

```bash
docker exec kortix-sandbox s6-svc -r /run/service/svc-kortix-master
```

### Shell into sandbox

```bash
docker exec -it kortix-sandbox bash
```

### Release a new version

```bash
# 1. Add changelog entry to packages/sandbox/CHANGELOG.json
# 2. Ship everything:
pnpm ship 0.8.0
git push
```

### Release + new Docker image

```bash
pnpm ship --no-hetzner 0.8.0
git push
```

### Build the Hetzner snapshot manually

```bash
pnpm snapshot 0.8.0
git push
```

### Validate/check state

```bash
pnpm check
```

### Build sandbox image manually

```bash
docker compose -f packages/sandbox/docker/docker-compose.yml build
```

### Force rebuild after dep change

```bash
pnpm dev:sandbox --build
```
