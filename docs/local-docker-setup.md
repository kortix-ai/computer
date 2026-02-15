# Local Docker Setup — Dev Guide

Everything about building, publishing, and testing the one-click Docker installer for Kortix.

---

## Architecture

Three Docker images, all published to Docker Hub under `kortixmarko/`:

| Image | Source | Description |
|---|---|---|
| `kortixmarko/kortix-frontend:latest` | `apps/frontend/` | Next.js dashboard (standalone mode) |
| `kortixmarko/kortix-api:latest` | `services/` | Bun/Hono backend API |
| `kortixmarko/sandbox:latest` | `sandbox/` | AI agent sandbox (s6-overlay, OpenCode, kortix-master) |

The installer script (`scripts/get-kortix.sh`) writes `~/.kortix/docker-compose.yml` + `.env` + CLI helper, pulls the images, and starts everything.

---

## Building Docker Images

### Frontend (2-step: host build + Docker package)

The frontend CANNOT be built inside Docker — Next.js standalone builds OOM on 8GB Docker Desktop VMs due to multi-stage layer duplication + 3GB JS heap. Instead:

**Step 1: Build on host**

```bash
cd apps/frontend

NEXT_PUBLIC_ENV_MODE=local \
NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1 \
NEXT_PUBLIC_OPENCODE_URL=http://localhost:14000 \
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
docker build --no-cache -f apps/frontend/Dockerfile -t kortixmarko/kortix-frontend:latest .
```

> **Always use `--no-cache`** for the frontend Docker build. The `COPY` layer caches aggressively and won't pick up new standalone output without it.

The Dockerfile is a simple runner-only image (~100MB):
- COPYs `.next/standalone`, `.next/static`, `public`
- Runs `node apps/frontend/server.js`

**Dockerignore:** `apps/frontend/Dockerfile.dockerignore` uses a whitelist-only approach (starts with `*`, then `!` whitelists). This is critical — a blacklist approach with `node_modules` or `dist` in the ignore list will strip traced dependencies from the standalone output.

### API

```bash
cd /path/to/computer
docker build --build-arg SERVICE=kortix-api -f services/Dockerfile -t kortixmarko/kortix-api:latest .
```

Straightforward Bun image. No special considerations.

### Sandbox

```bash
cd /path/to/computer
docker build -f sandbox/Dockerfile -t kortixmarko/sandbox:latest .
```

Large image (~4GB) with s6-overlay, OpenCode, browser tools, etc. Takes a few minutes.

---

## Pushing to Docker Hub

```bash
docker push kortixmarko/kortix-frontend:latest
docker push kortixmarko/kortix-api:latest
docker push kortixmarko/sandbox:latest
```

All three can be pushed in parallel. Sandbox is the largest (~4GB, takes longest).

Requires `docker login` with the `kortixmarko` Docker Hub credentials.

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

### `NEXT_PUBLIC_OPENCODE_URL` wrong port

**Symptom:** Frontend can't connect to OpenCode (port 4096 instead of 14000).

**Root cause:** `NEXT_PUBLIC_*` vars are baked at build time. If not passed during build, `server-store.ts` falls back to wrong port.

**Fix:** Always pass `NEXT_PUBLIC_OPENCODE_URL=http://localhost:14000` during the host build step.

### `/onboarding` crashes with `useSidebar must be used within a SidebarProvider`

**Root cause:** `SessionChat` → `SessionSiteHeader` calls `useSidebar()`, but `/onboarding` page isn't wrapped in `SidebarProvider`.

**Fix:** The onboarding page wraps content in `<SidebarProvider defaultOpen={false}>`.

---

## Docker Compose (generated by installer)

The installer writes `~/.kortix/docker-compose.yml` with:

- **3 services:** `sandbox`, `kortix-api`, `frontend`
- **2 named volumes:** `sandbox-workspace`, `sandbox-secrets` (persist across upgrades)
- **1 network:** `kortix_default` (bridge, all services connected)
- **Health checks:** sandbox has a health check; frontend and API depend on sandbox being healthy
- **Port mappings:** `3000` (frontend), `8008` (API), `14000` (sandbox master, proxied to OpenCode)

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
- `scripts/tests/test-install.sh` — Installer structure tests (21 tests)
- `scripts/tests/test-cli.sh` — Embedded CLI tests (16 tests)

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
