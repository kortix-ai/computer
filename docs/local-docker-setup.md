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

> **Why `localhost:8008`?** This is the baked-in default. The `docker-entrypoint.sh` rewrites it at container startup when `NEXT_PUBLIC_BACKEND_URL` differs (e.g. `http://localhost:13738/v1` for Docker port remapping, or `https://yourdomain.com/v1` for VPS mode). Always build with `8008` as the default.

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

Straightforward Bun image. `drizzle-kit` is a direct dependency of `kortix-api` (needed for `drizzle-kit push` at runtime). The Dockerfile uses `pnpm install --prod=false` to include it. Can be built **in parallel** with the frontend host build and sandbox build.

> **Important:** The installer-generated compose runs the API with `user: "0:0"` (root) because it needs Docker socket access to manage the sandbox container. The Dockerfile sets `USER bun` but the socket is `root:root rw-rw----`.

### PostgreSQL (pg_cron + pg_net)

```bash
cd /path/to/computer/services/postgres
docker build -t kortix/postgres:latest .
```

Custom PG16 image (~460MB). Stage 1 compiles `pg_net` from source; stage 2 installs `pg_cron` via apt and copies the compiled pg_net. Both extensions are loaded via `shared_preload_libraries`. Can be built **in parallel** with all other images.

> **Note:** The postgres image does NOT contain any schema init scripts. All schema creation is handled by the API's `drizzle-kit push` on startup.

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
curl -s http://localhost:13737/dashboard  # Frontend
curl -s http://localhost:13738/v1/providers  # Provider status (new API)
curl -s http://localhost:13738/v1/setup/onboarding-status  # Onboarding
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
curl -s -X PUT http://localhost:13738/v1/providers/anthropic/connect \
  -H "Content-Type: application/json" \
  -d '{"keys":{"ANTHROPIC_API_KEY":"sk-ant-your-key"}}' | python3 -m json.tool

# Verify via provider list
curl -s http://localhost:13738/v1/providers | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d['providers']:
    if p['id'] == 'anthropic':
        print('Anthropic connected:', p['connected'])
"

# Legacy API still works too
curl -s http://localhost:13738/v1/setup/env | python3 -c "
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

1. User installs via `get-kortix.sh` → browser opens `http://localhost:13737/setup`
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

## CORS Configuration

The API uses mode-aware CORS (see `services/kortix-api/src/index.ts`):

| Mode | Allowed origins |
|---|---|
| **Cloud** (`ENV_MODE=cloud`) | Production domains only (`kortix.com`, `kortix.cloud`, etc.) — **no localhost** |
| **Local** (`ENV_MODE=local`) | Production domains + `http://localhost:3000` + `http://127.0.0.1:3000` |
| **Either mode** | Extra origins from `CORS_ALLOWED_ORIGINS` env var (comma-separated) |

### Why `CORS_ALLOWED_ORIGINS` is needed for Docker

In Docker, the frontend runs on port `13737` and the API on port `13738`. Since these are different origins (`localhost:13737` ≠ `localhost:13738`), the browser enforces CORS. The default `localhost:3000` allowlist doesn't cover the remapped port.

The installer sets `CORS_ALLOWED_ORIGINS=http://localhost:13737,http://127.0.0.1:13737` on the `kortix-api` service in docker-compose.yml.

### VPS mode

VPS mode uses a Caddy reverse proxy where both frontend and API share the same origin (e.g. `https://yourdomain.com`), so CORS isn't an issue. No `CORS_ALLOWED_ORIGINS` needed.

---

## Docker Networking — How the Sandbox Reaches the API

The sandbox needs to call the Kortix API (`KORTIX_API_URL`). How it reaches the API depends on where the API is running.

### Two dev scenarios

| Scenario | API running | Sandbox `KORTIX_API_URL` | Command |
|---|---|---|---|
| **Host dev** (most common) | `pnpm run dev` on Mac | `http://host.docker.internal:8008` | `cd sandbox && docker compose up` |
| **All Docker** | Docker container | `http://kortix-api:8008` | `cd sandbox && docker compose -f docker-compose.yml -f docker-compose.docker.yml up` |

### Host dev (default — no extra config)

You run `pnpm run dev` for `kortix-api` on your Mac. The sandbox container reaches it via `host.docker.internal` — a special Docker DNS name that resolves to the host machine. This is the **default** in `sandbox/docker-compose.yml`.

```bash
cd sandbox
docker compose up        # Just works — KORTIX_API_URL defaults to host.docker.internal:8008
```

### All Docker (API + sandbox both in Docker)

When `kortix-api` runs in Docker too (e.g. via `~/.kortix/docker-compose.yml`), containers need to be on the **same Docker network** for DNS resolution. Use the `docker-compose.docker.yml` override:

```bash
cd sandbox
docker compose -f docker-compose.yml -f docker-compose.docker.yml up
```

This override:
1. Joins the sandbox to the `kortix_default` network (where the API lives)
2. Sets `KORTIX_API_URL=http://kortix-api:8008` (Docker DNS)

If the API's compose project has a different name, override the network:

```bash
KORTIX_NETWORK=computer_default docker compose -f docker-compose.yml -f docker-compose.docker.yml up
```

### All-in-one compose (`docker-compose.local.yml`)

All 4 services in one compose project — they share a network automatically. No extra config needed.

### Installed mode (`get-kortix.sh`)

Same as all-in-one — single compose project, single network (`kortix_default`).

### Programmatic sandbox creation

When `local-docker.ts` creates a sandbox container via the Docker API, it sets `NetworkMode: config.SANDBOX_NETWORK` to put the container on the API's network.

### Quick fix for a running sandbox on the wrong network

```bash
docker network connect kortix_default kortix-sandbox
docker exec kortix-sandbox curl -sf http://kortix-api:8008/v1/health
```

### Key env vars

| Var | Used by | Purpose |
|---|---|---|
| `KORTIX_API_URL` | sandbox container | Base URL the sandbox uses to call the API. Default: `http://host.docker.internal:8008` (host dev). Consumers append service paths like `/v1/router`, `/v1/cron`, etc. |
| `KORTIX_NETWORK` | `docker-compose.docker.yml` | External Docker network to join (default: `kortix_default`) |
| `SANDBOX_NETWORK` | `kortix-api` (`local-docker.ts`) | Network for programmatically-created sandbox containers |
| `KORTIX_URL` | `kortix-api` | URL the API gives to sandboxes for callbacks |

---

## Database Schema Management

Schema is managed declaratively using `drizzle-kit push` — no migration files.

### How it works

1. **Single source of truth:** `packages/db/src/schema/kortix.ts` (kortix schema) and `packages/db/src/schema/public.ts` (public schema billing tables)
2. **On every startup:** `services/kortix-api/src/ensure-schema.ts` shells out to `bun drizzle-kit push --force`
3. **drizzle-kit diffs** the live database against the schema definitions and applies changes (CREATE TABLE, ALTER TABLE, etc.)
4. **Idempotent:** Safe to run on every startup. No-ops if schema is already up to date.

### What gets pushed

| Schema | Tables | Config |
|---|---|---|
| `kortix` | sandboxes, integrations, sandbox_integrations, triggers, executions, deployments, server_entries, api_keys, channel_configs, channel_sessions, channel_messages, channel_identity_map | `schemaFilter: ['kortix']` |
| `public` | credit_accounts, credit_ledger, credit_usage, credit_purchases, account_deletion_requests, api_keys | `schemaFilter: ['public']`, `tablesFilter` whitelist |

### Key files

- `packages/db/src/schema/kortix.ts` — Kortix schema table definitions
- `packages/db/src/schema/public.ts` — Public schema billing/auth table definitions
- `packages/db/drizzle.config.ts` — Drizzle Kit config (schema paths, filters, DB URL)
- `services/kortix-api/src/ensure-schema.ts` — Startup script that runs `drizzle-kit push`

### Startup sequence

```
1. ensureSchema()        — drizzle-kit push creates/updates all tables
2. bootstrapLocalIdentity() — inserts local sandbox row into kortix.sandboxes
3. startScheduler()      — configures pg_cron
4. startChannelService() — starts Slack/Telegram adapters
5. startDrainer()        — starts message queue drainer
```

All services start AFTER schema push completes. If schema push fails, services still start (graceful degradation).

### Why not migration files?

Previous migration-based approach had 3 redundant systems that went out of sync:
1. `packages/db/drizzle/` SQL migration files
2. `services/postgres/init/00-init-kortix.sql` baked into postgres
3. `ensure-schema.ts` running `migrate()` at startup

Migration 0004 referenced a table never created by prior migrations, causing the entire transaction to roll back — leaving the database with zero tables. The declarative `drizzle-kit push` approach eliminates this class of bugs entirely.

---

## Common Issues & Fixes

### Frontend Docker build uses cached (wrong) standalone output

**Symptom:** Container crashes with `Cannot find module '/app/apps/frontend/server.js'` or `Cannot find module 'next'`

**Fix:** Always use `docker build --no-cache` for the frontend image.

### API can't access Docker socket (FailedToOpenSocket)

**Symptom:** `[SANDBOX-LOCAL] list error: FailedToOpenSocket` — sandbox list returns 500, "Failed to load sandboxes" in frontend integration dialog.

**Root cause:** The Dockerfile sets `USER bun` but the Docker socket is owned by `root:root` with permissions `rw-rw----`. The `bun` user can't read it.

**Fix:** The compose file must include `user: "0:0"` on the `kortix-api` service. Both the installer (`get-kortix.sh`) and `docker-compose.local.yml` already have this. If you're writing a custom compose, add it:

```yaml
kortix-api:
  image: kortix/kortix-api:latest
  user: "0:0"  # Required for Docker socket access
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

### Sandbox not found or not owned by account

**Symptom:** 403 error when linking an integration to a sandbox.

**Root cause:** The `kortix.sandboxes` table has no row for the local sandbox. This happens if `bootstrapLocalIdentity()` failed during startup.

**Fix:** Check API logs for `[LOCAL-IDENTITY]` messages. If bootstrap failed:
```bash
# Restart the API — bootstrap runs on every startup
docker compose -f ~/.kortix/docker-compose.yml --project-name kortix restart kortix-api
# Verify the row exists
docker exec kortix-postgres-1 psql -U postgres -c "SELECT sandbox_id, status FROM kortix.sandboxes;"
```

### drizzle-kit not found in container

**Symptom:** `[schema] Schema push failed` with `Cannot find package 'drizzle-kit'`.

**Root cause:** `drizzle-kit` must be a direct dependency of `services/kortix-api` (not just `packages/db`) for pnpm's `--filter` to hoist it.

**Fix:** Ensure `drizzle-kit` is in `services/kortix-api/package.json` dependencies AND the lockfile is up to date:
```bash
pnpm install --filter ./services/kortix-api...
```

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

### Sandbox can't reach the API (KORTIX_API_URL fails)

**Symptom:** Sandbox logs show connection refused or DNS resolution failure for the API.

**Root cause:** Depends on your setup:

| Error | Cause | Fix |
|---|---|---|
| `Could not resolve host: kortix-api` | Sandbox not on API's Docker network | Use `docker-compose.docker.yml` override or connect manually: `docker network connect kortix_default kortix-sandbox` |
| `Connection refused` to `host.docker.internal` | API not running on host | Start `pnpm run dev` for kortix-api |
| `Connection refused` to `kortix-api` | API not in Docker, but using Docker URL | Switch to default (host dev) mode — don't use `docker-compose.docker.yml` |

### Sandbox connection issues (frontend)

**Symptom:** Frontend can't connect to the sandbox.

**Root cause:** All sandbox requests now route through the backend (`/v1/sandbox/*`). Ensure `NEXT_PUBLIC_BACKEND_URL` is correctly set at build time.

**Fix:** Ensure `NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1` is passed during the host build step. This is the baked-in default; the entrypoint rewrites it at runtime when `NEXT_PUBLIC_BACKEND_URL` is set in docker-compose.

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
- **Port mappings:** `13739` (postgres), `13737` (frontend), `13738` (API), `13740` (sandbox master, proxied to OpenCode)
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

### Database Schema
- `packages/db/src/schema/kortix.ts` — Kortix schema table definitions (single source of truth)
- `packages/db/src/schema/public.ts` — Public schema billing/auth table definitions
- `packages/db/drizzle.config.ts` — Drizzle Kit config (schema paths, filters)
- `services/kortix-api/src/ensure-schema.ts` — Startup schema push (`drizzle-kit push --force`)
- `services/kortix-api/src/platform/local-identity.ts` — Bootstrap local sandbox DB record

### PostgreSQL
- `services/postgres/Dockerfile` — Custom PG16 image with pg_cron 1.6 + pg_net 0.20.2 (no init SQL — schema managed by API)

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
- `services/kortix-api/src/integrations/routes.ts` — OAuth integration routes (`/v1/integrations/*`)

### Sandbox
- `sandbox/kortix-master/src/routes/env.ts` — Env routes (GET, POST, DELETE)
- `sandbox/kortix-master/src/services/secret-store.ts` — Encrypted storage
- `sandbox/config/97-secrets-to-s6-env.sh` — Init script (permissions + sync)
- `sandbox/kortix-master/src/scripts/sync-s6-env.ts` — Sync secrets to s6 env

### E2E Testing
- `test/e2e.md` — Full 46-step install-to-verify test plan
