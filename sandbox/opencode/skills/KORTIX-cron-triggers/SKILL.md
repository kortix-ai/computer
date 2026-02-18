---
name: kortix-cron-triggers
description: "Cron trigger management for scheduled agent execution. Use when the user wants to: schedule recurring tasks, set up cron jobs, create timed triggers, automate agent execution on a schedule, manage periodic tasks, view scheduled task history, check execution logs. Triggers on: 'schedule this', 'run every', 'cron job', 'every morning at', 'daily task', 'recurring', 'set a timer for', 'automate this on a schedule', 'trigger at', 'run periodically', 'scheduled trigger', 'timed trigger', 'cron trigger'."
---

# Cron Trigger Service

The Kortix Cron service runs outside the sandbox as a platform service. It manages scheduled triggers that fire agents inside sandboxes on cron schedules using **pg_cron** — each trigger gets its own PostgreSQL-native cron job.

## Quick Start — Local Mode

**In local mode (`ENV_MODE=local`), no authentication is needed.** The API accepts unauthenticated requests and injects a mock user automatically. Don't waste time searching for tokens — just make the requests:

```bash
CRON_URL="${KORTIX_API_URL%/router}"  # strips /router → e.g. http://kortix-api:8008/v1
SANDBOX_ID="${SANDBOX_ID:-kortix-sandbox}"

# Just works — no auth header needed in local mode
curl -X POST "$CRON_URL/cron/triggers" \
  -H "Content-Type: application/json" \
  -d "{
    \"sandbox_id\": \"$SANDBOX_ID\",
    \"name\": \"My Task\",
    \"cron_expr\": \"0 */5 * * * *\",
    \"prompt\": \"Do the thing\"
  }"
```

**Auth strategy:** Always try WITHOUT auth first. If you get a 401, THEN look for `$KORTIX_TOKEN`. Never spend time searching for tokens before making the first request.

## Architecture

- **Service**: `kortix-api` (Bun + Hono)
- **Database**: `kortix` schema in Supabase PostgreSQL (Drizzle ORM)
- **Scheduler**: **pg_cron** — each trigger = one `cron.schedule()` job. No polling, no application-level timers.
- **Executor**: Provider-agnostic. Uses `SandboxProvider.resolveEndpoint()` to reach the sandbox, then calls OpenCode `POST /session/:id/prompt_async`.
- **Auth**: `CRON_TICK_SECRET` header for pg_cron→API, user JWT for CRUD. **In local mode: no auth required.**

## How It Works

1. User creates a trigger via API or UI
2. Backend calls `cron.schedule()` to create a pg_cron job
3. pg_cron fires at the scheduled time → calls `pg_net.http_post()` to `POST /v1/cron/tick/trigger/:id/execute`
4. Tick endpoint validates `x-cron-secret` header, fetches trigger + sandbox from DB
5. Executor calls `SandboxProvider.ensureRunning()` + `resolveEndpoint()` (provider-agnostic — works with Daytona, local Docker, VPS)
6. Creates OpenCode session and sends prompt via `POST /session/:id/prompt_async` (fire-and-forget, 204 response)
7. Execution result recorded in `kortix.executions` table

## Cron Expression Format

6-field extended cron with seconds support:

```
┌──────── second (0-59)
│ ┌────── minute (0-59)
│ │ ┌──── hour (0-23)
│ │ │ ┌── day of month (1-31)
│ │ │ │ ┌ month (1-12 or JAN-DEC)
│ │ │ │ │ ┌ day of week (0-7 or SUN-SAT, 0 and 7 are Sunday)
│ │ │ │ │ │
* * * * * *
```

**Note**: pg_cron only supports 5-field expressions (no seconds). The seconds field is stripped internally via `toPgCronExpr()`. Minimum resolution is 1 minute.

### Common Patterns

| Pattern | Expression |
|---------|-----------|
| Every 5 minutes | `0 */5 * * * *` |
| Every hour | `0 0 * * * *` |
| Daily at 9:00 AM | `0 0 9 * * *` |
| Daily at midnight | `0 0 0 * * *` |
| Every Monday at 8 AM | `0 0 8 * * 1` |
| First of month at noon | `0 0 12 1 * *` |
| Weekdays at 6 PM | `0 0 18 * * 1-5` |

## API Reference

Base URL: The platform API URL (e.g. `https://new-api.kortix.com` or `http://localhost:8008`).

**Authentication:**
- **Local mode** (`ENV_MODE=local`): No auth needed. Omit the `Authorization` header entirely.
- **Cloud mode**: Use `Authorization: Bearer $KORTIX_TOKEN` (`sbt_...` sandbox token). Also accepts Supabase JWTs.
- Tick endpoints use `x-cron-secret` (internal, not user-facing).

**Always try without auth first.** If you get a 401/403, add `$KORTIX_TOKEN`.

```bash
CRON_URL="${KORTIX_API_URL%/router}"  # strips /router → e.g. http://kortix-api:8008/v1
SANDBOX_ID="${SANDBOX_ID:-kortix-sandbox}"
```

All examples below use `$CRON_URL` as the base (NOT `$KORTIX_API_URL` which includes `/router`).
For cloud mode, add `-H "Authorization: Bearer $KORTIX_TOKEN"` to each request.

### Trigger Management

```bash
# Create a trigger - daily report at 9 AM UTC
curl -X POST "$CRON_URL/cron/triggers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sandbox_id": "uuid-of-sandbox",
    "name": "Daily Report",
    "cron_expr": "0 0 9 * * *",
    "timezone": "UTC",
    "agent_name": "kortix-main",
    "model_provider_id": "kortix",
    "model_id": "kortix/basic",
    "prompt": "Generate the daily status report and save it to /workspace/reports/",
    "session_mode": "new"
  }'

# List triggers
curl "$CRON_URL/cron/triggers" \
  -H "Authorization: Bearer $TOKEN"

# List triggers for a specific sandbox
curl "$CRON_URL/cron/triggers?sandbox_id=UUID" \
  -H "Authorization: Bearer $TOKEN"

# Get a specific trigger
curl "$CRON_URL/cron/triggers/{id}" \
  -H "Authorization: Bearer $TOKEN"

# Update a trigger
curl -X PATCH "$CRON_URL/cron/triggers/{id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Updated prompt text",
    "model_provider_id": "kortix",
    "model_id": "kortix/power"
  }'

# Pause a trigger (removes pg_cron job)
curl -X POST "$CRON_URL/cron/triggers/{id}/pause" \
  -H "Authorization: Bearer $TOKEN"

# Resume a trigger (re-creates pg_cron job)
curl -X POST "$CRON_URL/cron/triggers/{id}/resume" \
  -H "Authorization: Bearer $TOKEN"

# Fire a trigger immediately (manual run)
curl -X POST "$CRON_URL/cron/triggers/{id}/run" \
  -H "Authorization: Bearer $TOKEN"

# Delete a trigger
curl -X DELETE "$CRON_URL/cron/triggers/{id}" \
  -H "Authorization: Bearer $TOKEN"
```

### Sandbox Discovery

```bash
# List available models on a sandbox
curl "$CRON_URL/cron/sandboxes/{sandbox_id}/models" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { success: true, data: [{ id: "kortix", name: "kortix", models: [{ id: "kortix/basic", name: "Sonnet" }, ...] }] }

# List available agents on a sandbox
curl "$CRON_URL/cron/sandboxes/{sandbox_id}/agents" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { success: true, data: [{ name: "kortix-main", description: "...", mode: "primary" }, ...] }
```

### Execution History

```bash
# List all executions
curl "$CRON_URL/cron/executions?limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Filter by status
curl "$CRON_URL/cron/executions?status=failed" \
  -H "Authorization: Bearer $TOKEN"

# Executions for a specific trigger
curl "$CRON_URL/cron/executions/by-trigger/{triggerId}" \
  -H "Authorization: Bearer $TOKEN"

# Get execution details
curl "$CRON_URL/cron/executions/{id}" \
  -H "Authorization: Bearer $TOKEN"
```

## Trigger Properties

| Field | Required | Description |
|-------|----------|-------------|
| `sandbox_id` | Yes | UUID of the target sandbox |
| `name` | Yes | Human-readable trigger name |
| `cron_expr` | Yes | 6-field cron expression (seconds stripped for pg_cron) |
| `prompt` | Yes | The prompt to send to the agent |
| `timezone` | No | IANA timezone (default: UTC) |
| `agent_name` | No | Target agent name (e.g., `kortix-main`) |
| `model_provider_id` | No | Model provider (e.g., `kortix`). Paired with `model_id`. |
| `model_id` | No | Model ID (e.g., `kortix/basic` = Sonnet, `kortix/power` = Opus). If not set, defaults to `kortix/basic`. |
| `session_mode` | No | `new` or `reuse` (default: `new`) |
| `session_id` | No | Session ID for `reuse` mode |
| `max_retries` | No | 0-10 (default: 0) |
| `timeout_ms` | No | 1000-3600000 ms (default: 300000 = 5 min) |

## Available Models

| Provider ID | Model ID | Description |
|------------|----------|-------------|
| `kortix` | `kortix/basic` | Claude Sonnet (default) |
| `kortix` | `kortix/power` | Claude Opus 4.6 |

## Session Modes

- **`new`** (default): Creates a fresh OpenCode session for each trigger execution. Best for independent tasks.
- **`reuse`**: Sends prompt to an existing session (specified by `session_id`). Best for ongoing monitoring or conversations that need context continuity.

## Self-Management Examples

Agents can create and manage their own cron triggers from inside the sandbox:

```bash
CRON_URL="${KORTIX_API_URL%/router}"
SANDBOX_ID="${SANDBOX_ID:-kortix-sandbox}"

# Schedule a daily backup at 2 AM (no auth needed in local mode)
curl -X POST "$CRON_URL/cron/triggers" \
  -H "Content-Type: application/json" \
  -d "{
    \"sandbox_id\": \"$SANDBOX_ID\",
    \"name\": \"Daily Backup\",
    \"cron_expr\": \"0 0 2 * * *\",
    \"prompt\": \"Run the backup script at /workspace/scripts/backup.sh and verify the output\",
    \"model_provider_id\": \"kortix\",
    \"model_id\": \"kortix/basic\"
  }"

# List your triggers
curl "$CRON_URL/cron/triggers?sandbox_id=$SANDBOX_ID"

# Check execution history for a trigger
TRIGGER_ID="the-trigger-uuid"
curl "$CRON_URL/cron/executions/by-trigger/$TRIGGER_ID"
```
