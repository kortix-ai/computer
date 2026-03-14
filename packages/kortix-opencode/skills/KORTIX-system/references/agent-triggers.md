# Agent Triggers - Cron, Webhook, and Event Triggers

Use this file when you need to create, debug, or explain scheduled and event-driven agent execution.

## Overview

The `@kortix/opencode-agent-triggers` package supports three trigger types:

| Type | How it works | Use case |
|---|---|---|
| Cron | Embedded scheduler inside the sandbox | Daily reports, periodic maintenance |
| Webhook | HTTP server on port `8099` | CI or internal callbacks |
| Event (Pipedream) | External event workers POST into the sandbox | Gmail, GitHub, Slack, Notion, and other app events |

## Trigger Tools

| Tool | Description |
|---|---|
| `agent_triggers` | List trigger definitions and sync state |
| `sync_agent_triggers` | Re-read agent markdown and register triggers |
| `cron_triggers` | Create, update, pause, resume, run, and inspect cron triggers |
| `event_triggers` | Manage Pipedream-backed event listeners |

## Declarative Triggers in Agent Frontmatter

Agents can declare triggers directly in YAML frontmatter.

```yaml
---
description: "My Agent"
mode: primary
triggers:
  - name: "Daily Report"
    enabled: true
    source:
      type: "cron"
      expr: "0 0 9 * * *"
      timezone: "America/New_York"
    execution:
      prompt: "Generate the daily report"
      model_id: "kortix/power"
      session_mode: "reuse"
  - name: "Inbound Webhook"
    enabled: true
    source:
      type: "webhook"
      path: "/hooks/deploy"
      method: "POST"
      secret: "my-secret"
    execution:
      prompt: "Handle the deployment webhook"
      session_mode: "new"
---
```

## Cron Triggers

### 6-field cron format

```text
second minute hour day month weekday
0      */5    *    *   *     *
0      0      9    *   *     *
0      0      8    *   *     1
```

### HTTP API

```bash
curl -X POST "http://localhost:8000/kortix/cron/triggers" \
  -H "Content-Type: application/json" \
  -d '{"name":"Daily Report","cron_expr":"0 0 9 * * *","prompt":"Generate the daily report"}'

curl "http://localhost:8000/kortix/cron/triggers"
curl "http://localhost:8000/kortix/cron/triggers/{id}"
curl -X PATCH "http://localhost:8000/kortix/cron/triggers/{id}" -d '{"prompt":"new prompt"}'
curl -X DELETE "http://localhost:8000/kortix/cron/triggers/{id}"
curl -X POST "http://localhost:8000/kortix/cron/triggers/{id}/pause"
curl -X POST "http://localhost:8000/kortix/cron/triggers/{id}/resume"
curl -X POST "http://localhost:8000/kortix/cron/triggers/{id}/run"
```

### `cron_triggers` examples

```text
cron_triggers action=create name="Nightly Cleanup" cron_expr="0 0 3 * * *" prompt="Run nightly cleanup tasks"
cron_triggers action=list
cron_triggers action=pause trigger_id="..."
cron_triggers action=resume trigger_id="..."
cron_triggers action=run trigger_id="..."
cron_triggers action=executions trigger_id="..."
cron_triggers action=delete trigger_id="..."
```

## Webhook Triggers

- internal webhook server listens on port `8099`
- external traffic is expected to arrive through Kortix Master on port `8000`
- if `source.secret` is set, callers must send `x-kortix-trigger-secret`

## Event Triggers (Pipedream)

Pipedream hosts the polling or app-side trigger worker. The sandbox only receives normalized event deliveries.

### Prerequisites

1. app connected through integrations
2. `KORTIX_TOKEN` configured
3. `SANDBOX_PUBLIC_URL` configured for event delivery
4. trigger plugin loaded and listener server available

### `event_triggers` actions

| Action | Purpose |
|---|---|
| `list_available` | List available trigger components for an app |
| `setup` | Deploy a new listener |
| `list` | List listeners |
| `get` | Get listener details |
| `remove` | Delete listener and remote trigger |
| `pause` | Stop accepting events |
| `resume` | Resume event delivery |

### Example: Gmail new email trigger

```text
event_triggers action=list_available app=gmail

event_triggers action=setup \
  name="New Email Alert" \
  app=gmail \
  component_key=gmail-new-email-received \
  prompt="New email from {{ from }}. Subject: {{ subject }}. Analyze and summarize." \
  configured_props="{\"withTextPayload\": true, \"timer\": {\"intervalSeconds\": 60}}"
```

## Persistence Notes

- cron state path: `/tmp/kortix-agent-triggers/cron-state.json`
- event listener path: `/tmp/kortix-agent-triggers/listener-state.json`

These live under `/tmp`, so they do not survive container restarts unless restored externally.
