# Kortix Deployments Refactor — Implementation Plan

**Date:** Feb 19, 2026
**Goal:** Refactor `/v1/deployments` to use Freestyle as a centralized deployment backend, with Kortix managing per-user access control.

---

## Architecture

```
Agent (sandbox)                     Kortix API                           Freestyle
─────────────────                  ──────────                           ──────────

1. Agent detects project type
2. Agent builds request body
3. POST /v1/deployments       ──→  4. Validates auth (sandbox token or JWT)
   Authorization: Bearer xxx          Creates DB record (pending)
                                      Transforms to Freestyle format
                                      POST /web/v1/deployment        ──→ 5. Creates deployment
                                        Auth: Bearer FREESTYLE_API_KEY
                                      Stores freestyleId + liveUrl   ←── 6. Returns deploymentId
                                      Updates status → active
                                      Returns to agent

7. Agent shows https://slug.style.dev URL to user
```

### Access Control (Per-User Isolation)

- Kortix holds ONE central `FREESTYLE_API_KEY`
- Every deployment record in DB is scoped to `accountId`
- All queries filter by authenticated user's `accountId`
- User A cannot see/touch User B's deployments — enforced at DB query level
- Freestyle sees one API key — Kortix is the access control layer

### Freestyle REST API (called server-side by Kortix)

| Operation | Method | URL |
|---|---|---|
| Create deployment | `POST` | `{FREESTYLE_API_URL}/web/v1/deployment` |
| List deployments | `GET` | `{FREESTYLE_API_URL}/web/v1/deployments` |
| Get deployment | `GET` | `{FREESTYLE_API_URL}/execute/v1/deployments/{id}` |
| Get logs | `GET` | `{FREESTYLE_API_URL}/observability/v1/logs?deploymentId={id}` |

### Freestyle `POST /web/v1/deployment` Request Format

```json
{
  "source": {
    "kind": "git | files | tar",
    "url": "...",
    "branch": "...",
    "dir": "...",
    "files": { "path": { "content": "...", "encoding": "..." } }
  },
  "config": {
    "await": true,
    "build": true,
    "domains": ["slug.style.dev"],
    "envVars": { "KEY": "value" },
    "nodeModules": { "express": "^4.18.2" },
    "entrypoint": "server.js",
    "timeout": 60000,
    "staticOnly": false,
    "publicDir": "...",
    "cleanUrls": false,
    "redirects": [],
    "headers": [],
    "networkPermissions": []
  }
}
```

Response: `{ "deploymentId": "..." }`

---

## Files to Change (10)

### 1. `services/kortix-api/src/config.ts`
- Add `FREESTYLE_API_URL` and `FREESTYLE_API_KEY` env vars
- Add `proxy_freestyle_deploy` to `TOOL_PRICING`

### 2. `.env.example`
- Add `FREESTYLE_API_KEY=` and `FREESTYLE_API_URL=https://api.freestyle.sh`

### 3. `services/kortix-api/src/deployments/index.ts`
- Replace `supabaseAuth` with `deploymentAuth` (same pattern as `cronAuth` in `cron/index.ts`)
- Local mode: skip auth, inject mock user
- Cloud mode: accept both Supabase JWT (dashboard) and sandbox tokens (agents)

### 4. `services/kortix-api/src/deployments/routes/deployments.ts` (Full Rewrite)

**Endpoints:**
- `POST /` — Create: validate input → transform to Freestyle format → insert DB (pending) → call Freestyle API → update DB (active/failed) → return
- `GET /` — List: `WHERE account_id = ?` (user isolation)
- `GET /:id` — Get: `WHERE deployment_id = ? AND account_id = ?`
- `POST /:id/stop` — Update DB status to 'stopped'
- `POST /:id/redeploy` — Get existing config, create new Freestyle deployment, update DB
- `DELETE /:id` — Delete from DB
- `GET /:id/logs` — Proxy from Freestyle logs API

**Source transform (same as Freestyle SDK):**
- `git` → `{ kind: "git", url: source_ref, branch, dir: root_path }`
- `code` → `{ kind: "files", files: { "index.ts": { content: code } } }`
- `files` → `{ kind: "files", files: Object.fromEntries(...) }`
- `tar` → `{ kind: "tar", url: tar_url }`

### 5. `packages/db/src/schema/kortix.ts`
- Remove `sourcePath` column from deployments table
- Rename `envVarKeys` → `envVars` (jsonb, `Record<string, string>`)

### 6. `services/postgres/init/00-init-kortix.sql`
- Remove `source_path`, rename `env_var_keys` → `env_vars`

### 7. `sandbox/opencode/skills/deploy/SKILL.md` (Full Rewrite)
- Agent calls `POST /v1/deployments` with `KORTIX_TOKEN`
- No Freestyle SDK, no `.mjs` scripts, no user-facing API key
- Documents project detection, domain naming, framework configs

### 8. `sandbox/opencode/skills/deploy/references/freestyle-api.md`
- Replace with Kortix Deployments API reference

### 9. `services/kortix-api/src/__tests__/e2e-deployments.test.ts`
- Test all endpoints with mocked Freestyle API
- Test per-user isolation
- Test validation and error handling

### 10. Lint & Verify

---

## What Stays Untouched

- Daytona (sandbox orchestrator)
- Sandbox deployer (kortix-master/deployer.ts — internal preview)
- Proxy services (proxy-services.ts — Freestyle is NOT a generic proxy)
- Auth middleware (middleware/auth.ts — unchanged)

---

## How the Agent Uses It

```bash
BASE_URL="${KORTIX_API_URL%/router}"

# Deploy from git
curl -X POST "$BASE_URL/deployments" \
  -H "Authorization: Bearer $KORTIX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "source_type": "git", "source_ref": "https://github.com/user/repo", "domains": ["my-app.style.dev"], "build": true }'

# Deploy inline code
curl -X POST "$BASE_URL/deployments" \
  -H "Authorization: Bearer $KORTIX_TOKEN" \
  -d '{ "source_type": "code", "code": "...", "domains": ["api.style.dev"], "node_modules": { "hono": "^4" } }'

# List / Get / Logs / Delete
curl "$BASE_URL/deployments" -H "Authorization: Bearer $KORTIX_TOKEN"
curl "$BASE_URL/deployments/{id}" -H "Authorization: Bearer $KORTIX_TOKEN"
curl "$BASE_URL/deployments/{id}/logs" -H "Authorization: Bearer $KORTIX_TOKEN"
curl -X DELETE "$BASE_URL/deployments/{id}" -H "Authorization: Bearer $KORTIX_TOKEN"
```
