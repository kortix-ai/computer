# Kortix E2E Test — Full Install to Verify

Complete test from clean slate to every feature working.

---

## Prerequisites

- Docker Desktop running
- No existing `~/.kortix/` directory (or willing to reinstall)
- Pipedream Connect credentials (optional — needed for Step 14+)

---

## Phase 1: Clean Install

### Step 1 — Nuke any previous install
```bash
cd ~/.kortix && docker compose down -v 2>/dev/null; docker rm -f kortix-sandbox 2>/dev/null; rm -rf ~/.kortix
```

### Step 2 — Run the installer
```bash
bash scripts/get-kortix.sh
```

### Step 3 — Choose Local mode
- Select `1` (Local machine)

### Step 4 — Skip integrations (or configure)
- Press `N` to skip (or `Y` + enter Pipedream creds)

### Step 5 — Wait for image pull + startup
- Installer pulls 4 images: postgres, frontend, kortix-api, computer
- Ends with "Kortix is running!" + opens browser to `/setup`

**VERIFY:**
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep kortix
```
- [ ] 4 containers running: `kortix-postgres-1`, `kortix-frontend-1`, `kortix-kortix-api-1`, `kortix-sandbox`

---

## Phase 2: Health Checks

### Step 6 — API health
```bash
curl -s http://localhost:13738/health | jq .
```
- [ ] Returns `{"status":"ok","service":"kortix-api",...}`

### Step 7 — API health (v1 prefix)
```bash
curl -s http://localhost:13738/v1/health | jq .
```
- [ ] Returns `{"status":"ok",...}`

### Step 8 — Frontend loads
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:13737
```
- [ ] Returns `200`

### Step 9 — Database schema created
```bash
docker exec kortix-postgres-1 psql -U postgres -c "\dt kortix.*"
```
- [ ] 12 tables listed (api_keys, channel_configs, channel_identity_map, channel_messages, channel_sessions, deployments, executions, integrations, sandbox_integrations, sandboxes, server_entries, triggers)

### Step 10 — Sandbox healthy
```bash
curl -s http://localhost:13740/kortix/health
```
- [ ] Returns health response (200)

---

## Phase 3: API Endpoints

### Step 11 — System status
```bash
curl -s http://localhost:13738/v1/system/status | jq .
```
- [ ] Returns `{"maintenanceNotice":{"enabled":false},...}`

### Step 12 — Accounts
```bash
curl -s http://localhost:13738/v1/accounts | jq .
```
- [ ] Returns array with one "Local User" account

### Step 13 — Integrations connections (THE BIG ONE)
```bash
curl -s http://localhost:13738/v1/integrations/connections | jq .
```
- [ ] Returns `{"connections":[]}` (200 OK, NOT 500)

### Step 14 — Providers list
```bash
curl -s http://localhost:13738/v1/providers | jq .
```
- [ ] Returns providers data

### Step 15 — Setup status
```bash
curl -s http://localhost:13738/v1/setup/status | jq .
```
- [ ] Returns setup/onboarding status

### Step 16 — Servers list
```bash
curl -s http://localhost:13738/v1/servers | jq .
```
- [ ] Returns servers array

### Step 17 — Cron triggers
```bash
curl -s http://localhost:13738/v1/cron/triggers | jq .
```
- [ ] Returns triggers data (possibly empty)

### Step 18 — Prewarm
```bash
curl -s -X POST http://localhost:13738/v1/prewarm | jq .
```
- [ ] Returns `{"success":true}`

### Step 19 — 404 handling
```bash
curl -s http://localhost:13738/v1/nonexistent | jq .
```
- [ ] Returns `{"error":true,"message":"Not found","status":404}`

---

## Phase 4: Frontend Pages

Open browser at `http://localhost:13737`.

### Step 20 — Setup wizard
- [ ] `http://localhost:13737/setup` loads without errors

### Step 21 — Dashboard
- [ ] `http://localhost:13737/dashboard` loads

### Step 22 — Sessions page
- [ ] `http://localhost:13737/sessions` loads (empty state or list)

### Step 23 — Integrations page
- [ ] `http://localhost:13737/integrations` loads WITHOUT 500 errors in console

### Step 24 — Settings page
- [ ] `http://localhost:13737/settings` loads

### Step 25 — Scheduled tasks
- [ ] `http://localhost:13737/scheduled-tasks` loads

### Step 26 — Files page
- [ ] `http://localhost:13737/files` loads

### Step 27 — Tools page
- [ ] `http://localhost:13737/tools` loads

### Step 28 — Workspace
- [ ] `http://localhost:13737/workspace` loads (sandbox iframe/preview)

---

## Phase 5: Setup Wizard Flow

### Step 29 — Open setup
- Go to `http://localhost:13737/setup`
- [ ] Page renders with provider configuration options

### Step 30 — Add an LLM API key
- Add at least one LLM provider key (Anthropic, OpenAI, etc.)
- [ ] Key saves successfully
- [ ] Provider shows "connected" status

### Step 31 — Verify provider health
```bash
curl -s http://localhost:13738/v1/providers/health | jq .
```
- [ ] Shows configured provider(s) as healthy

---

## Phase 6: Sandbox / Agent

### Step 32 — Sandbox preview proxy
```bash
curl -s http://localhost:13738/v1/preview/kortix-sandbox/8000/kortix/health
```
- [ ] Returns sandbox health through the API proxy

### Step 33 — Start a chat session
- Go to dashboard, start a new session
- Type a simple prompt like "Hello, what can you do?"
- [ ] Agent responds (requires LLM key from Step 30)
- [ ] Session appears in sessions list

### Step 34 — Verify sandbox workspace
```bash
docker exec kortix-sandbox ls /workspace
```
- [ ] Returns workspace contents

---

## Phase 7: Integrations (requires Pipedream creds)

> Skip if integrations were not configured in Step 4.

### Step 35 — Verify Pipedream env vars
```bash
docker exec kortix-kortix-api-1 printenv | grep PIPEDREAM
```
- [ ] `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET`, `PIPEDREAM_PROJECT_ID` are set

### Step 36 — Integration search
```bash
curl -s "http://localhost:13738/v1/integrations/apps?q=gmail" | jq .
```
- [ ] Returns list of matching apps

### Step 37 — Connect an integration (browser)
- Go to `http://localhost:13737/integrations`
- Click connect on any app (e.g. Gmail, GitHub)
- [ ] OAuth popup opens
- [ ] After auth, connection appears in the list

### Step 38 — Verify connection persisted
```bash
curl -s http://localhost:13738/v1/integrations/connections | jq .
```
- [ ] Returns array with the connected integration

---

## Phase 8: CLI

### Step 39 — CLI help
```bash
~/.kortix/kortix help
```
- [ ] Shows command list (start, stop, restart, logs, status, setup, update, open, etc.)

### Step 40 — CLI status
```bash
~/.kortix/kortix status
```
- [ ] Shows all 4 services running

### Step 41 — CLI stop + start
```bash
~/.kortix/kortix stop && ~/.kortix/kortix start
```
- [ ] Services stop cleanly then restart
- [ ] All 4 containers back to running

### Step 42 — CLI logs
```bash
~/.kortix/kortix logs kortix-api-1 --tail 10
```
- [ ] Shows recent API logs

---

## Phase 9: Persistence

### Step 43 — Restart survives
```bash
docker compose -f ~/.kortix/docker-compose.yml --project-name kortix down
docker compose -f ~/.kortix/docker-compose.yml --project-name kortix up -d
```
- Wait for healthy, then:
```bash
curl -s http://localhost:13738/v1/integrations/connections | jq .
```
- [ ] Data persists (schema still exists, connections still there)

### Step 44 — Schema re-push is idempotent
```bash
docker logs kortix-kortix-api-1 2>&1 | grep "\[schema\]"
```
- [ ] Shows "Schema pushed successfully" (no errors, no duplicate table errors)

---

## Phase 10: Error Resilience

### Step 45 — API survives DB restart
```bash
docker restart kortix-postgres-1
```
- Wait 10s, then:
```bash
curl -s http://localhost:13738/v1/health | jq .status
```
- [ ] Returns `"ok"` (API recovers)

### Step 46 — No console errors on frontend
- Open browser DevTools → Console
- Navigate through all pages (dashboard, sessions, integrations, settings, workspace)
- [ ] No 500 errors in console
- [ ] No uncaught exceptions

---

## Result

| Phase | Steps | Description |
|-------|-------|-------------|
| 1 | 1-5 | Clean install |
| 2 | 6-10 | Health checks |
| 3 | 11-19 | API endpoints |
| 4 | 20-28 | Frontend pages |
| 5 | 29-31 | Setup wizard |
| 6 | 32-34 | Sandbox/Agent |
| 7 | 35-38 | Integrations |
| 8 | 39-42 | CLI |
| 9 | 43-44 | Persistence |
| 10 | 45-46 | Error resilience |

**Total: 46 steps. All checkboxes must pass.**
