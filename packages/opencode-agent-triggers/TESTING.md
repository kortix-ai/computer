# Testing Guide — opencode-agent-triggers

The package uses a hermetic E2E harness inspired by `opencode-channels`.

## Quick Start

```bash
pnpm test:e2e
pnpm docker:e2e
pnpm docker:typecheck
```

## Test topology

```
┌─────────────────────────────────────────────────────────────┐
│                     Test Runner                             │
│                                                             │
│  temp agent dir  -> real TriggerManager/plugin             │
│                          |                                  │
│                          +--> embedded cron scheduler      │
│                          +--> persisted cron state file    │
│                          +--> real webhook server          │
│                          +--> mock OpenCode client         │
└─────────────────────────────────────────────────────────────┘
```

## What gets verified

- Default OpenCode agent discovery semantics: project `.opencode/agents` plus global `~/.config/opencode/agents`
- Agent markdown discovery from `.opencode/agents`
- Self-contained cron state creation from markdown
- Manual cron execution through the embedded scheduler
- Automatic cron execution by the embedded scheduler
- Webhook trigger dispatch into OpenCode sessions
- Prompt templating from extracted trigger event context
- Webhook secret rejection via `X-Kortix-OpenCode-Trigger-Secret`
- Session reuse for webhook triggers with `execution.session_mode: reuse`
- Live resync of changed markdown declarations (cron updates + webhook route replacement)
- Real OpenCode plugin tool surface (`agent_triggers`, `sync_agent_triggers`, `cron_triggers`)

## Test files

- `test/e2e.test.ts` — isolated full-flow verification for the self-contained scheduler + webhook runtime
