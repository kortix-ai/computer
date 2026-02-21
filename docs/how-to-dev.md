# How to Dev

## Prerequisites

- Node.js 22+
- pnpm
- Bun 1.3.8 (for opencode development)
- Docker & Docker Compose

## Frontend Development

1. Install dependencies in the base folder:

```bash
cd computer
pnpm i
```

2. Install dependencies in the frontend app:

```bash
cd apps/frontend
pnpm i
```

3. Set up your frontend environment variables:

```bash
cp apps/frontend/.env.example apps/frontend/.env
# Edit apps/frontend/.env with your values
```

4. Run the frontend dev server:

```bash
pnpm run dev:frontend
```

## Sandbox (Local)

1. Navigate to the sandbox directory:

```bash
cd computer/sandbox
```

2. Set up your environment variables:

```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

3. Start the sandbox:

```bash
docker compose up
```

This will start the sandbox container with:

- Desktop (noVNC) at `http://localhost:6080`
- OpenCode Web UI at `http://localhost:3111`
- Kortix Master at `http://localhost:8000`
- Agent Browser Viewer at `http://localhost:9224`

### Sandbox Filesystem

The sandbox uses `/workspace` as the single root for all user/agent data:

```
/workspace/                  ← HOME dir, WORKDIR, volume mount
  .kortix/                   ← agent brain, memory
  .lss/                      ← semantic search index
  .agent-browser/            ← browser automation sockets
  .browser-profile/          ← chromium profile
  presentations/             ← generated slide decks
  <user projects>/           ← git repos created by users/agents
/config → /workspace         ← symlink for linuxserver base image compat
/opt/opencode/               ← agent config (agents, tools, skills)
```

### Sandbox Services (s6-overlay)

| Service | Port | Run script |
|---------|------|------------|
| opencode-serve | 4096 | `services/opencode-serve/run` |
| opencode-web | 3111 | `services/opencode-web/run` |
| kortix-master | 8000 | `services/kortix-master/run` |
| lss-sync | — | `services/lss-sync/run` |
| agent-browser-viewer | 9224 | `services/agent-browser-viewer/run` |
| presentation-viewer | 3210 | `services/svc-presentation-viewer/run` |

All services run as user `abc` (UID 1000) with `HOME=/workspace`.

## OpenCode (Kortix Fork)

The sandbox runs `@kortix/opencode-ai` — our fork of OpenCode with additional features
(auto project scanning, custom tools). See [opencode-publishing.md](./opencode-publishing.md)
for how to build, publish, and update it.

Source: `computer/services/opencode/` (submodule, branch `kortix`)

## Testing (TDD)

We follow **Test-Driven Development**. Always TDD.

### The Cycle

1. **Write a failing test first** -- before writing any implementation code.
2. **Write the minimum code** to make the test pass.
3. **Refactor** while keeping all tests green.
4. Repeat.

### Rules

- No feature or bug fix lands without a corresponding test.
- Write the test *before* the implementation, not after.
- Tests must be runnable in isolation -- no shared mutable state between test cases.
- Run the full relevant test suite before opening a PR. If tests fail, fix them before pushing.
- Cover edge cases and error paths, not just the happy path.

### Running Tests

```bash
# From the computer/ root -- run all tests via nx
pnpm nx run-many --target=test --parallel

# Run tests for a specific project
pnpm nx run <project>:test

# Run a single test file (bun projects)
bun test path/to/file.test.ts

# Watch mode (where supported)
bun test --watch path/to/file.test.ts

# OpenCode unit tests (939 tests)
cd services/opencode/packages/opencode
bun test

# Sandbox E2E tests (builds Docker image, starts container, validates everything)
cd sandbox
python3 test_sandbox_e2e.py              # full build + test
python3 test_sandbox_e2e.py --no-build   # skip build, reuse image
python3 test_sandbox_e2e.py --keep       # keep container running after tests
```

### What to Test

- **Unit tests** for all business logic, utilities, and pure functions.
- **Integration tests** for API routes, database queries, and service interactions.
- **E2E tests** for critical user flows and sandbox container validation.

### Before You Push

```bash
# 1. Run tests
pnpm nx run-many --target=test --parallel

# 2. Typecheck
pnpm run typecheck

# 3. Build
pnpm run build
```

All three must pass. No exceptions.

## Local Database (PostgreSQL)

When using `docker-compose.local.yml`, a PostgreSQL 16 container starts automatically with `pg_cron` and `pg_net` extensions. No external database setup needed.

```bash
# Start everything (postgres + API + frontend + sandbox)
docker compose -f docker-compose.local.yml up -d

# Connect to psql
docker exec -it computer-postgres-1 psql -U postgres

# Reset database (destroys all data)
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
```

The database is available at `localhost:54322` (user: `postgres`, password: `postgres`).

Key files:
- `services/postgres/Dockerfile` — Custom PG16 image
- `services/postgres/init/00-init-kortix.sql` — Schema + tables + scheduler setup
- `docker-compose.local.yml` — Service definition with `shared_preload_libraries=pg_cron,pg_net`

## Root Environment Variables

For the backend services, copy and configure the root `.env.example`:

```bash
cd computer
cp .env.example .env
# Edit .env with your API keys (LLM providers, etc.)
```
