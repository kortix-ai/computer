# Auth E2E Test Suite

End-to-end tests for the Kortix sandbox authentication system.

## Quick Start

```bash
# Run all tests (requires sandbox + kortix-api running)
./computer/scripts/tests/test-auth-e2e.sh

# Run a specific section
./computer/scripts/tests/test-auth-e2e.sh --section sandbox
./computer/scripts/tests/test-auth-e2e.sh --section token
./computer/scripts/tests/test-auth-e2e.sh --section cors

# Verbose mode (show response bodies)
./computer/scripts/tests/test-auth-e2e.sh --verbose
```

## Prerequisites

| Requirement | How to start |
|-------------|-------------|
| Docker container `kortix-sandbox` on `127.0.0.1:14000` | `docker compose up -d` in `computer/sandbox/` |
| kortix-api on `127.0.0.1:8008` | `pnpm run dev` in `computer/services/kortix-api/` |
| `jq` | `brew install jq` |
| `/tmp/sandbox_token.txt` | Contains `kortix_sb_*` token (optional — skips section 4 if missing) |
| `/tmp/api_key.txt` | Contains `kortix_*` user API key (optional — skips sections 5/11 if missing) |

## Environment Variables

Override defaults with:

```bash
SANDBOX_HOST=10.0.0.1 SANDBOX_PORT=8000 API_PORT=9000 ./test-auth-e2e.sh
```

## Test Sections

### Section 1: INTERNAL_SERVICE_KEY Auth — Bearer Header
Tests that the sandbox correctly validates `Authorization: Bearer <key>` on protected routes.

| # | Test | Expected |
|---|------|----------|
| 1.1 | Correct Bearer key | 200 |
| 1.2 | Wrong Bearer key | 401 |
| 1.3 | No auth header | 401 |
| 1.4 | Empty Bearer value | 401 |
| 1.5 | Missing "Bearer" prefix | 401 |
| 1.6 | "Basic" auth scheme | 401 |

### Section 1b: INTERNAL_SERVICE_KEY Auth — Query Parameter
Tests the `?token=` query parameter fallback (used by WebSocket clients).

| # | Test | Expected |
|---|------|----------|
| 1.7 | Correct key via `?token=` | 200 |
| 1.8 | Wrong key via `?token=` | 401 |
| 1.9 | Empty `?token=` | 401 |

### Section 1c: Timing-Safe Comparison
Verifies the sandbox uses constant-time comparison to prevent timing attacks.

| # | Test | Method |
|---|------|--------|
| 1.10 | `crypto.timingSafeEqual()` in source | Static analysis |
| 1.11 | SHA-256 pre-hash (constant-length buffers) | Static analysis |
| 1.12 | Near-miss key (1 char different) | HTTP request → 401 |
| 1.13 | Key with extra whitespace | HTTP request → 401 |

### Section 2: Auth Bypass Routes
Verifies that health and docs endpoints are accessible without authentication.

| # | Route | Expected |
|---|-------|----------|
| 2.1 | `/kortix/health` | 200 (no auth) |
| 2.2 | `/docs` | 200 (Scalar UI) |
| 2.3 | `/docs/openapi.json` | 200 (merged spec, >50 paths) |

### Section 2b: Protected Routes Reject Without Auth
Verifies every major route category returns 401 without credentials.

Routes tested: `/env/list`, `/lss/search`, `/file/content`, `/kortix/ports`, `/session`, `/memory/search`

### Section 3: Authed Route Categories
Verifies all route categories respond correctly with valid auth.

Routes tested: `/env/list`, `/kortix/ports`, `/session`, `/agent`, `/file/content`, `/lss/search`, `/memory/search`, `/kortix/update/status`

### Section 4: KORTIX_TOKEN (Sandbox → API)
Tests the sandbox-to-API authentication token (`kortix_sb_*` prefix).

| # | Test | Expected |
|---|------|----------|
| 4.1 | Token has `kortix_sb_` prefix | Pass |
| 4.2 | Token length >= 40 chars | Pass |
| 4.3 | API accepts token | Non-401 |
| 4.4 | Old `sbt_` prefix rejected | 401/403/404 |

### Section 5: User API Key Auth
Tests user API keys (`kortix_*` prefix) against kortix-api.

| # | Test | Expected |
|---|------|----------|
| 5.1 | Key has `kortix_` prefix | Pass |
| 5.2 | API accepts key | Non-401 |
| 5.3 | Wrong key rejected | 401/403 |

### Section 6: CORS Enforcement
Tests the sandbox CORS policy restricts origins to localhost by default.

| # | Test | Expected |
|---|------|----------|
| 6.1 | `localhost:3000` allowed | `Access-Control-Allow-Origin` header |
| 6.2 | `127.0.0.1:8008` allowed | `Access-Control-Allow-Origin` header |
| 6.3 | `evil.example.com` blocked | No ACAO header for that origin |
| 6.4 | Preflight OPTIONS | Returns `Access-Control-Allow-Methods` |
| 6.5 | Source code check | `defaultCorsOrigins` defined |

> **Note:** If CORS tests show "skipped" with `Access-Control-Allow-Origin: *`, the updated sandbox code hasn't been deployed yet. Run `docker cp` + restart to fix.

### Section 7: Port Security
Verifies Docker port bindings use `127.0.0.1` (not `0.0.0.0`).

| # | Test | Method |
|---|------|--------|
| 7.1 | `docker-compose.yml` bindings | File grep |
| 7.2 | Running container bindings | `docker port` |
| 7.3 | Port 8000 → 127.0.0.1:14000 | File grep |

### Section 8: Key Sync & Self-Healing
Static checks verifying the self-healing auth infrastructure exists.

| # | Test | File |
|---|------|------|
| 8.1 | `sandbox-health.ts` exists | kortix-api |
| 8.2 | Periodic health interval | sandbox-health.ts |
| 8.3 | Retry with backoff | sandbox-health.ts |
| 8.4 | Key sync function | sandbox-health.ts |
| 8.5 | `_syncAttempts` counter | local-preview.ts |
| 8.6 | Key persisted to `.env` | config.ts |
| 8.7 | s6 env dir used for sync | sandbox-health.ts / local-preview.ts |

### Section 9: OpenCode Integration Tools
Verifies all 7 integration tools use `getEnv()` for filesystem fallback.

Tools checked: `integration-{list,search,connect,actions,run,request,exec}.ts` + `lib/get-env.ts`

### Section 10: Token Format Validation
Validates token format patterns.

| Token | Expected Format |
|-------|----------------|
| INTERNAL_SERVICE_KEY | 64-char lowercase hex (`[0-9a-f]{64}`) |
| SANDBOX_TOKEN | `kortix_sb_` + 32 alphanumeric |
| User API Key | `kortix_` + 32 alphanumeric |

### Section 11: Proxy Chain (kortix-api → sandbox)
Tests the full proxy chain from kortix-api through to the sandbox.

> **Note:** These tests require the API proxy routes to be configured. They skip gracefully if routes return 404.

### Section 12: WebSocket Auth
Static source code checks for WebSocket authentication.

| # | Test | Method |
|---|------|--------|
| 12.1 | WS uses `verifyServiceKey()` | Source grep |
| 12.2 | WS supports `?token=` param | Source grep |
| 12.3 | WS returns 401 on failure | Source grep |

## Auth Architecture

```
Frontend ──[Supabase JWT]──→ kortix-api ──[INTERNAL_SERVICE_KEY]──→ sandbox
CLI/API  ──[kortix_ key]───→ kortix-api ──[INTERNAL_SERVICE_KEY]──→ sandbox
Sandbox  ──[KORTIX_TOKEN]──→ kortix-api ──→ LLM providers / integrations
```

### Token Types

| Token | Format | Direction | Purpose |
|-------|--------|-----------|---------|
| Supabase JWT | `eyJhbGci...` | Browser → API | Dashboard auth |
| User API Key | `kortix_` + 32 | CLI → API | Programmatic access |
| Sandbox Token | `kortix_sb_` + 32 | Sandbox → API | Identity + billing |
| INTERNAL_SERVICE_KEY | 64-char hex | API → Sandbox | Platform-to-sandbox auth |

### Self-Healing Flow

1. kortix-api sends request to sandbox with `INTERNAL_SERVICE_KEY`
2. If sandbox returns 401 → key mismatch detected
3. `sandbox-health.ts` triggers `attemptKeySync()`:
   - Writes key to `/run/s6/container_environment/INTERNAL_SERVICE_KEY` via `docker exec`
   - Restarts `kortix-master` via `s6-svc -r`
4. Progressive backoff: 3 retries at 2s, 5s, 10s intervals
5. Periodic health monitor runs every 60s to catch drift

## Debug Guide

### Sandbox returns 401 for everything
```bash
# Check what key the sandbox has
docker exec kortix-sandbox cat /run/s6/container_environment/INTERNAL_SERVICE_KEY

# Check what key the API has
grep INTERNAL_SERVICE_KEY computer/services/kortix-api/.env

# If they differ, sync manually:
docker exec kortix-sandbox bash -c "echo '<api-key>' > /run/s6/container_environment/INTERNAL_SERVICE_KEY"
docker exec kortix-sandbox sudo s6-svc -r /run/service/svc-kortix-master
```

### CORS returns `*` instead of allowlist
The updated sandbox code hasn't been deployed. Run:
```bash
docker cp computer/sandbox/kortix-master/src/index.ts kortix-sandbox:/opt/kortix-master/src/index.ts
docker exec kortix-sandbox sudo s6-svc -r /run/service/svc-kortix-master
```

### Ports bound to 0.0.0.0
The container was created before `docker-compose.yml` was updated. Recreate:
```bash
cd computer/sandbox && docker compose down && docker compose up -d
```

### OpenCode integration tools get 401
OpenCode ignores SIGTERM so it can't be restarted. The tools read the key from the filesystem:
```bash
# Verify the key file exists inside the container
docker exec kortix-sandbox cat /run/s6/container_environment/INTERNAL_SERVICE_KEY
```
