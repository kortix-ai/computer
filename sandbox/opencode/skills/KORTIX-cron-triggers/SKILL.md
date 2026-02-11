---
name: kortix-cron-triggers
description: "Cron trigger management for scheduled agent execution. Use when the user wants to: schedule recurring tasks, set up cron jobs, create timed triggers, automate agent execution on a schedule, manage periodic tasks, view scheduled task history, check execution logs. Triggers on: 'schedule this', 'run every', 'cron job', 'every morning at', 'daily task', 'recurring', 'set a timer for', 'automate this on a schedule', 'trigger at', 'run periodically', 'scheduled trigger', 'timed trigger', 'cron trigger'."
---

# Cron Trigger Service

The Kortix Cron service runs outside the sandbox as a platform service. It manages scheduled triggers that fire agents inside sandboxes on cron schedules.

## Architecture

- **Service**: `kortix-cron` (Bun + Hono) running at port 8011
- **Database**: `kortix_cron` schema in Supabase PostgreSQL (Drizzle ORM)
- **Scheduler**: Polling loop (1s tick) that checks for due triggers
- **Executor**: Calls OpenCode API inside sandbox to create sessions and send prompts

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

### Common Patterns

| Pattern | Expression |
|---------|-----------|
| Every 30 seconds | `*/30 * * * * *` |
| Every 5 minutes | `0 */5 * * * *` |
| Every hour | `0 0 * * * *` |
| Daily at 9:00 AM | `0 0 9 * * *` |
| Daily at midnight | `0 0 0 * * *` |
| Every Monday at 8 AM | `0 0 8 * * 1` |
| First of month at noon | `0 0 12 1 * *` |
| Weekdays at 6 PM | `0 0 18 * * 1-5` |

## API Reference

Base URL: `http://localhost:8011` (local) or the deployed service URL.

All `/v1/*` endpoints require `Authorization: Bearer <supabase-jwt>`.

### Sandbox Management

```bash
# Register a sandbox
curl -X POST http://localhost:8011/v1/sandboxes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Local Sandbox",
    "base_url": "http://localhost:8000",
    "auth_token": "user:password"
  }'

# List sandboxes
curl http://localhost:8011/v1/sandboxes \
  -H "Authorization: Bearer $TOKEN"

# Check sandbox health
curl -X POST http://localhost:8011/v1/sandboxes/{id}/health \
  -H "Authorization: Bearer $TOKEN"
```

### Trigger Management

```bash
# Create a trigger - daily report at 9 AM UTC
curl -X POST http://localhost:8011/v1/triggers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sandbox_id": "uuid-of-sandbox",
    "name": "Daily Report",
    "cron_expr": "0 0 9 * * *",
    "timezone": "UTC",
    "agent_name": "@kortix-main",
    "prompt": "Generate the daily status report and save it to /workspace/reports/",
    "session_mode": "new"
  }'

# Create a trigger - every 5 minutes health check
curl -X POST http://localhost:8011/v1/triggers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sandbox_id": "uuid-of-sandbox",
    "name": "Health Monitor",
    "cron_expr": "0 */5 * * * *",
    "prompt": "Check system health and report any issues",
    "session_mode": "new",
    "timeout_ms": 60000
  }'

# List triggers
curl http://localhost:8011/v1/triggers \
  -H "Authorization: Bearer $TOKEN"

# Pause a trigger
curl -X POST http://localhost:8011/v1/triggers/{id}/pause \
  -H "Authorization: Bearer $TOKEN"

# Resume a trigger
curl -X POST http://localhost:8011/v1/triggers/{id}/resume \
  -H "Authorization: Bearer $TOKEN"

# Fire a trigger immediately (manual run)
curl -X POST http://localhost:8011/v1/triggers/{id}/run \
  -H "Authorization: Bearer $TOKEN"

# Delete a trigger
curl -X DELETE http://localhost:8011/v1/triggers/{id} \
  -H "Authorization: Bearer $TOKEN"
```

### Execution History

```bash
# List all executions
curl "http://localhost:8011/v1/executions?limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Filter by status
curl "http://localhost:8011/v1/executions?status=failed" \
  -H "Authorization: Bearer $TOKEN"

# Filter by date range
curl "http://localhost:8011/v1/executions?since=2026-02-01T00:00:00Z&until=2026-02-11T00:00:00Z" \
  -H "Authorization: Bearer $TOKEN"

# Executions for a specific trigger
curl http://localhost:8011/v1/executions/by-trigger/{triggerId} \
  -H "Authorization: Bearer $TOKEN"

# Get execution details
curl http://localhost:8011/v1/executions/{id} \
  -H "Authorization: Bearer $TOKEN"
```

### Health Check (no auth)

```bash
curl http://localhost:8011/health
# Returns: { status, service, timestamp, scheduler: { running, tickCount, lastTick } }
```

## Session Modes

- **`new`** (default): Creates a fresh OpenCode session for each trigger execution. Best for independent tasks.
- **`reuse`**: Sends prompt to an existing session (specified by `session_id`). Best for ongoing monitoring or conversations that need context continuity.

## Trigger Properties

| Field | Required | Description |
|-------|----------|-------------|
| `sandbox_id` | Yes | UUID of the target sandbox |
| `name` | Yes | Human-readable trigger name |
| `cron_expr` | Yes | 6-field cron expression |
| `prompt` | Yes | The prompt to send to the agent |
| `timezone` | No | IANA timezone (default: UTC) |
| `agent_name` | No | Target agent (e.g., `@kortix-main`) |
| `session_mode` | No | `new` or `reuse` (default: `new`) |
| `session_id` | No | Session ID for `reuse` mode |
| `max_retries` | No | 0-10 (default: 0) |
| `timeout_ms` | No | 1000-3600000 ms (default: 300000) |
