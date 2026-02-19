# Local Docker Setup — Dev Guide

Everything about building, publishing, and testing the one-click Docker installer for Kortix.

---

## Architecture

Four Docker images, all published to Docker Hub under `kortix/`:

| Image | Source | Description |
|---|---|---|
| `kortix/kortix-frontend:latest` | `apps/frontend/` | Next.js dashboard (standalone mode) |
| `kortix/kortix-api:latest` | `services/` | Bun/Hono backend API |
| `kortix/postgres:latest` | `services/postgres/` | PostgreSQL 16 + pg_cron + pg_net (scheduler) |
| `kortix/computer:latest` | `sandbox/` | AI agent sandbox (s6-overlay, OpenCode, kortix-master) |

The installer script (`scripts/get-kortix.sh`) writes `~/.kortix/docker-compose.yml` + `.env` + CLI helper, pulls the images, and starts everything.

---

## Building Docker Images

### Build order & parallelism

The four images have different build characteristics:

| Image | Build time | Bottleneck | Depends on host build? |
|---|---|---|---|
| Frontend | ~30s host build + ~10s Docker | Next.js standalone build (host) | YES — must `pnpm run build` first |
| API | ~20-30s | `pnpm install` inside Docker | No |
| Postgres | ~2-3min | Compiling pg_net from source | No |
| Sandbox | ~2-5min | Large image, many layers (~4GB) | No |

**Key insight:** API, Postgres, and Sandbox Docker builds do NOT depend on the frontend host build. Start all four simultaneously for maximum parallelism:

```
Timeline (optimised):
───────────────────────────────────────────────────────────
 T=0   Frontend host build (pnpm run build)
       API Docker build ──────────┐
       Postgres Docker build ─────┼── run in parallel
       Sandbox Docker build ──────┘
 T=30s Frontend host build done
       Frontend Docker build ─────
 T=40s Frontend Docker image ready
 T=30s API Docker image ready
 T=2m  Postgres Docker image ready
 T=3m  Sandbox Docker image ready
───────────────────────────────────────────────────────────
 Push all 4 in parallel immediately after each finishes
```

### Frontend (2-step: host build + Docker package)

The frontend CANNOT be built inside Docker — Next.js standalone builds OOM on 8GB Docker Desktop VMs due to multi-stage layer duplication + 3GB JS heap. Instead:

**Step 1: Build on host**

```bash
cd apps/frontend

NEXT_PUBLIC_ENV_MODE=local \
NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1 \
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder \
NEXT_OUTPUT=standalone \
pnpm run build
```

This produces `.next/standalone/` with `apps/frontend/server.js` and all traced `node_modules`.

> **Important:** `NEXT_OUTPUT=standalone` triggers `output: 'standalone'` in `next.config.ts`. The `outputFileTracingRoot` is set to `../../` (monorepo root) so the standalone output uses `apps/frontend/server.js` NOT `computer/apps/frontend/server.js`.

**Step 2: Docker package**

```bash
cd /path/to/computer  # Must be repo root!
docker build --no-cache -f apps/frontend/Dockerfile -t kortix/kortix-frontend:latest .
```

> **Always use `--no-cache`** for the frontend Docker build. The `COPY` layer caches aggressively and won't pick up new standalone output without it.

The Dockerfile is a simple runner-only image (~100MB):
- COPYs `.next/standalone`, `.next/static`, `public`
- Runs `node apps/frontend/server.js`

**Dockerignore:** `apps/frontend/Dockerfile.dockerignore` uses a whitelist-only approach (starts with `*`, then `!` whitelists). This is critical — a blacklist approach with `node_modules` or `dist` in the ignore list will strip traced dependencies from the standalone output.

### API

```bash
cd /path/to/computer
docker build --build-arg SERVICE=kortix-api -f services/Dockerfile -t kortix/kortix-api:latest .
```

Straightforward Bun image. No special considerations. Can be built **in parallel** with the frontend host build and sandbox build.

### PostgreSQL (pg_cron + pg_net)

```bash
cd /path/to/computer/services/postgres
docker build -t kortix/postgres:latest .
```

Custom PG16 image (~460MB). Stage 1 compiles `pg_net` from source; stage 2 installs `pg_cron` via apt and copies the compiled pg_net. Both extensions are loaded via `shared_preload_libraries`. Can be built **in parallel** with all other images.

### Sandbox

```bash
cd /path/to/computer
docker build -f sandbox/Dockerfile -t kortix/computer:latest .
```

Large image (~4GB) with s6-overlay, OpenCode, browser tools, etc. Takes a few minutes. Can be built **in parallel** with the frontend host build, API build, and Postgres build.

---

## Multi-Platform Builds (amd64 + arm64)

**Critical:** All images MUST be built for both `linux/amd64` and `linux/arm64`. If you only build for one platform, Docker Desktop will use **qemu emulation** on the other — running at ~10-20% speed, causing services to hang and timeout.

### One-time setup

```bash
# Create a buildx builder that supports multi-platform
docker buildx create --name multiarch --use --bootstrap
```

### Build & push multi-platform (build + push in one step)

`docker buildx build --platform` builds natively for each arch and pushes a multi-arch manifest. Docker Hub then serves the correct image per platform automatically.

```bash
cd /path/to/computer

# Sandbox (multi-platform, builds Rust + Node for each arch natively)
docker buildx build --platform linux/amd64,linux/arm64 \
  -f sandbox/Dockerfile -t kortix/computer:latest --push .

# API
docker buildx build --platform linux/amd64,linux/arm64 \
  --build-arg SERVICE=kortix-api \
  -f services/Dockerfile -t kortix/kortix-api:latest --push .

# PostgreSQL (pg_cron + pg_net)
docker buildx build --platform linux/amd64,linux/arm64 \
  -f services/postgres/Dockerfile -t kortix/postgres:latest --push services/postgres/

# Frontend (after host build)
docker buildx build --platform linux/amd64,linux/arm64 --no-cache \
  -f apps/frontend/Dockerfile -t kortix/kortix-frontend:latest --push .
```

> **Note:** `--push` is required because multi-platform images can't be loaded into the local Docker daemon (they contain multiple architectures). The images go directly to Docker Hub. To test locally, build for your platform only with `docker build` (no buildx).

### Local-only build (single platform, for dev/testing)

```bash
docker build -f sandbox/Dockerfile -t kortix/computer:latest .
```

This builds for your host platform only. Fast, but the image won't work on other architectures.

---

## Pushing to Docker Hub

When using `docker buildx build --push`, images are pushed automatically during build. For single-platform builds:

```bash
docker push kortix/kortix-frontend:latest
docker push kortix/kortix-api:latest
docker push kortix/postgres:latest
docker push kortix/computer:latest
```

All four can be pushed in parallel. Sandbox is the largest (~4GB, takes longest). Push each image as soon as its build finishes — don't wait for all four.

Requires `docker login` with the `kortix` Docker Hub credentials.

---

## AI Agent Build Workflow (PTY-based)

When using an AI coding agent (OpenCode, Claude Code, etc.) to build and push, use **PTY sessions** for all long-running processes. This avoids blocking on `sleep` or timeouts and maximises parallelism.

### Key principles

1. **Never sleep/poll.** Use `pty_spawn` with `notifyOnExit=true` — the agent gets a notification the moment a process exits, with exit code and last output line.
2. **Parallelise everything independent.** API build, Sandbox build, and Frontend host build have no dependencies between them — spawn all three simultaneously.
3. **Chain dependents sequentially.** Frontend Docker build depends on the host build finishing first. Wait for the PTY exit notification, then spawn the Docker build.
4. **Push as soon as ready.** Each image can be pushed the moment its build exits successfully — don't wait for all three.
5. **Use `pty_read` with `pattern`** to check build status without reading thousands of lines of Docker output. Filter for `error`, `tagged`, `Pushed`, `digest`, etc.

### Optimal PTY flow

```
Phase 1 — Build (4 parallel PTY sessions):
  pty_spawn: Frontend host build    (pnpm run build)       notifyOnExit=true
  pty_spawn: API Docker build       (docker build ...)     notifyOnExit=true
  pty_spawn: Postgres Docker build  (docker build ...)     notifyOnExit=true
  pty_spawn: Sandbox Docker build   (docker build ...)     notifyOnExit=true

  → Agent continues working on other tasks
  → Each PTY notifies on exit with exit code

Phase 2 — Frontend Docker build (triggered by Phase 1 notification):
  [Frontend host build exits 0]
  pty_spawn: Frontend Docker build  (docker build --no-cache ...) notifyOnExit=true

Phase 3 — Push (each triggered by its build completing):
  [API build exits 0]       → pty_spawn: docker push kortix/kortix-api:latest
  [Postgres build exits 0]  → pty_spawn: docker push kortix/postgres:latest
  [Sandbox build exits 0]   → pty_spawn: docker push kortix/computer:latest
  [Frontend Docker exits 0] → pty_spawn: docker push kortix/kortix-frontend:latest

  All pushes run in parallel with notifyOnExit=true.

Phase 4 — Restart (after all pushes complete):
  cd ~/.kortix && docker compose down && docker compose up -d
```

### PTY commands reference

```bash
# Spawn a build (returns immediately, runs in background)
pty_spawn command="docker" args=["build", ...] title="API Build" notifyOnExit=true

# Check progress without blocking (pattern-filtered)
pty_read id="pty_xxx" pattern="error|tagged|DONE" ignoreCase=true

# Read the tail of output
pty_read id="pty_xxx" offset=<totalLines - 20>

# List all sessions and their status
pty_list

# Clean up finished sessions
pty_kill id="pty_xxx" cleanup=true
```

### Error handling

- If a build exits non-zero, use `pty_read` with `pattern="error|ERROR|failed"` to find the failure.
- Frontend Docker build failures are almost always cache-related — ensure `--no-cache`.
- Sandbox build failures are usually network-related (package downloads) — retry.

---

## Testing End-to-End

### Clean install test

```bash
# Tear down existing install (including volumes!)
cd ~/.kortix && docker compose down -v
rm -rf ~/.kortix

# Run installer
bash scripts/get-kortix.sh

# Verify
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -s http://localhost:3000/dashboard  # Frontend
curl -s http://localhost:8008/v1/providers  # Provider status (new API)
curl -s http://localhost:8008/v1/setup/onboarding-status  # Onboarding
```

### Quick restart with new images (no volume reset)

```bash
cd ~/.kortix
docker compose down
docker compose up -d
```

### Restart single service

```bash
cd ~/.kortix
docker compose down frontend && docker compose up -d frontend
```

### Test key save flow

```bash
# Connect a provider (new API)
curl -s -X PUT http://localhost:8008/v1/providers/anthropic/connect \
  -H "Content-Type: application/json" \
  -d '{"keys":{"ANTHROPIC_API_KEY":"sk-ant-your-key"}}' | python3 -m json.tool

# Verify via provider list
curl -s http://localhost:8008/v1/providers | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d['providers']:
    if p['id'] == 'anthropic':
        print('Anthropic connected:', p['connected'])
"

# Legacy API still works too
curl -s http://localhost:8008/v1/setup/env | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ANTHROPIC configured:', d['configured']['ANTHROPIC_API_KEY'])
"
```

---

## Key Architecture: Installed Mode vs Repo/Dev Mode

The provider API routes (`services/kortix-api/src/providers/routes.ts`) and legacy setup routes (`services/kortix-api/src/setup/index.ts`) both operate in two modes:

### Repo/Dev Mode (running from source)

- Detected by `findRepoRoot()` finding `docker-compose.local.yml`
- Reads/writes `.env` and `sandbox/.env` files directly on disk
- Used when running `pnpm dev` locally

### Installed/Docker Mode (via `get-kortix.sh`)

- No repo root found — `findRepoRoot()` returns `null`
- API container has NO access to host filesystem
- All keys are stored in the sandbox's encrypted secret store
- Flow: Frontend → `PUT /v1/providers/:id/connect` → kortix-api → `POST http://sandbox:8000/env` → sandbox's `kortix-master` → encrypted storage in `/app/secrets/.secrets.json`
- Keys are synced to s6 container environment (`/run/s6/container_environment/`) so services pick them up via `with-contenv`

### Sandbox Secret Store

- Location: `/app/secrets/.secrets.json` (encrypted with AES-256-GCM)
- Salt: `/app/secrets/.salt` (random 32 bytes, generated on first write)
- Docker volume: `sandbox-secrets` (persists across container restarts)
- The `kortix-master` process runs as user `abc` (via `s6-setuidgid`), so `/app/secrets/` must be owned by `abc:users`
- The `97-secrets-to-s6-env.sh` init script runs as root during container start and `chown -R abc:users /app/secrets/` + `/run/s6/container_environment/`

---

## Frontend Setup Flow

The setup/onboarding flow is an **overlay on top of the dashboard**, not a separate page.

### Components

| Component | File | Purpose |
|---|---|---|
| `SetupOverlay` | `components/dashboard/setup-overlay.tsx` | Two-step overlay: welcome splash → provider connection card |
| `ProviderSettings` | `components/providers/provider-settings.tsx` | OpenCode-inspired provider management (connect/disconnect per provider) |
| `ConnectProviderDialog` | `components/providers/connect-provider-dialog.tsx` | Per-provider key entry dialog |
| `layout-content.tsx` | `components/dashboard/layout-content.tsx` | Dashboard layout, renders `SetupOverlay` when `!onboardingComplete` |
| `/setup` page | `app/setup/page.tsx` | Just redirects to `/dashboard` (overlay handles everything) |
| `/onboarding` page | `app/onboarding/page.tsx` | Chat session with onboarding agent |

### Flow

1. User installs via `get-kortix.sh` → browser opens `http://localhost:3000/setup`
2. `/setup` redirects to `/dashboard`
3. Dashboard layout checks onboarding status → shows `SetupOverlay`
4. Welcome step: "Welcome to" + Kortix logo + confetti (auto-advances after 4s)
5. Provider step: card overlay with `ProviderSettings` showing LLM providers with Connect buttons
6. User clicks Connect on a provider → dialog opens → enters API key → saves
7. Continue button enables once at least one LLM provider is connected
8. Continue → dismisses overlay → navigates to `/onboarding`
9. Onboarding: creates OpenCode session, chats with `kortix-onboarding` agent
10. Agent calls `onboarding_complete` tool → confetti → dashboard unlocked

### Sidebar

- Sidebar is closed by default when setup overlay is active (`defaultSidebarOpen={!showSetupOverlay}` passed to `AppProviders`)
- The `/onboarding` page wraps content in `<SidebarProvider defaultOpen={false}>` since it uses `SessionChat` which contains `useSidebar()` calls

---

## Common Issues & Fixes

### Frontend Docker build uses cached (wrong) standalone output

**Symptom:** Container crashes with `Cannot find module '/app/apps/frontend/server.js'` or `Cannot find module 'next'`

**Fix:** Always use `docker build --no-cache` for the frontend image.

### Sandbox `kortix-master` crashes with EACCES

**Symptom:** `EACCES: permission denied, open '/app/secrets/.secrets.json'` or `.salt` or `/run/s6/container_environment/...`

**Root cause:** `kortix-master` runs as user `abc` but `/app/secrets/` (Docker volume) is created with root ownership.

**Fix:** The `97-secrets-to-s6-env.sh` init script handles this automatically by running `chown -R abc:users /app/secrets/` and fixing `/run/s6/container_environment/` permissions. If you see this on a running container:

```bash
docker exec kortix-sandbox bash -c "chown -R abc:users /app/secrets && chown -R abc:users /run/s6/container_environment"
docker exec kortix-sandbox s6-svc -r /run/service/svc-kortix-master
```

### Stale secrets from previous container run

**Symptom:** `kortix-master` crashes on startup even after fixing permissions, due to corrupted/mismatched `.salt` or `.secrets.json`.

**Fix:**
```bash
docker exec kortix-sandbox rm -f /app/secrets/.salt /app/secrets/.secrets.json
docker exec kortix-sandbox s6-svc -r /run/service/svc-kortix-master
```

### Frontend OOM during Docker build

**Symptom:** Docker build crashes or Docker Desktop becomes unresponsive.

**Root cause:** Multi-stage Dockerfile + Next.js standalone build = ~7GB memory needed.

**Fix:** Don't build inside Docker. Build on host, package into runner-only image (current approach).

### Sandbox connection issues

**Symptom:** Frontend can't connect to the sandbox.

**Root cause:** All sandbox requests now route through the backend (`/v1/sandbox/*`). Ensure `NEXT_PUBLIC_BACKEND_URL` is correctly set at build time.

**Fix:** Ensure `NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1` is passed during the host build step.

### `/onboarding` crashes with `useSidebar must be used within a SidebarProvider`

**Root cause:** `SessionChat` → `SessionSiteHeader` calls `useSidebar()`, but `/onboarding` page isn't wrapped in `SidebarProvider`.

**Fix:** The onboarding page wraps content in `<SidebarProvider defaultOpen={false}>`.

---

## Docker Compose (generated by installer)

The installer writes `~/.kortix/docker-compose.yml` with:

- **4 services:** `postgres`, `sandbox`, `kortix-api`, `frontend`
- **3 named volumes:** `postgres-data`, `sandbox-workspace`, `sandbox-secrets` (persist across upgrades)
- **1 network:** `kortix_default` (bridge, all services connected)
- **Health checks:** postgres and sandbox have health checks; API depends on postgres being healthy; frontend depends on API being started
- **Port mappings:** `54322` (postgres), `3000` (frontend), `8008` (API), `14000` (sandbox master, proxied to OpenCode)
- **Database:** PostgreSQL with `pg_cron` and `pg_net` extensions for scheduled trigger execution. `kortix-api` connects via `DATABASE_URL` and configures `pg_cron` on startup.

### CLI commands (via `~/.kortix/kortix`)

| Command | Description |
|---|---|
| `kortix start` | Start all services |
| `kortix stop` | Stop all services |
| `kortix restart` | Restart all services |
| `kortix update` | Pull latest images and restart (preserves volumes) |
| `kortix status` | Show container status |
| `kortix logs` | Show logs (follows) |
| `kortix uninstall` | Full teardown with volume removal (prompts for confirmation) |

---

## File Reference

### Install System
- `scripts/get-kortix.sh` — One-click installer + embedded CLI
- `scripts/tests/test-install.sh` — Installer structure tests
- `scripts/tests/test-cli.sh` — Embedded CLI tests

### PostgreSQL (Local Database)
- `services/postgres/Dockerfile` — Custom PG16 image with pg_cron 1.6 + pg_net 0.20.2
- `services/postgres/init/00-init-kortix.sql` — Init SQL: creates `kortix` schema, all tables, indexes, pg_cron/pg_net extensions, `scheduler_tick()` function, global tick cron job
- `sandbox/push.sh` — Builds + pushes `kortix/postgres` image to Docker Hub

### Frontend — Setup & Onboarding
- `apps/frontend/src/components/dashboard/setup-overlay.tsx` — Setup overlay (welcome + providers)
- `apps/frontend/src/components/dashboard/layout-content.tsx` — Dashboard layout with overlay integration
- `apps/frontend/src/components/providers/provider-settings.tsx` — OpenCode-inspired provider management
- `apps/frontend/src/components/providers/connect-provider-dialog.tsx` — Per-provider key entry dialog
- `apps/frontend/src/hooks/providers/use-providers.ts` — React Query hooks for provider API
- `apps/frontend/src/app/onboarding/page.tsx` — Onboarding chat page
- `apps/frontend/src/app/setup/page.tsx` — Redirect to /dashboard

### Frontend — Docker Build
- `apps/frontend/Dockerfile` — Runner-only image (COPYs prebuilt standalone)
- `apps/frontend/Dockerfile.dockerignore` — Whitelist-only approach
- `apps/frontend/next.config.ts` — `outputFileTracingRoot`, `output: standalone`

### Backend — Provider & Setup API
- `services/kortix-api/src/providers/registry.ts` — Shared provider registry (single source of truth)
- `services/kortix-api/src/providers/routes.ts` — Unified provider API (`/v1/providers/*`)
- `services/kortix-api/src/setup/index.ts` — Legacy setup routes (backward compat, onboarding)

### Sandbox
- `sandbox/kortix-master/src/routes/env.ts` — Env routes (GET, POST, DELETE)
- `sandbox/kortix-master/src/services/secret-store.ts` — Encrypted storage
- `sandbox/config/97-secrets-to-s6-env.sh` — Init script (permissions + sync)
- `sandbox/kortix-master/src/scripts/sync-s6-env.ts` — Sync secrets to s6 env
