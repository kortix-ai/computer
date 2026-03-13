# opencode-agent-triggers

Declarative `cron` and `webhook` triggers for OpenCode agents, with a built-in scheduler and webhook runtime included in the package.

```
agent markdown frontmatter -> opencode-agent-triggers plugin -> scheduler/webhook runtime -> OpenCode session execution
```

## Core idea: define triggers in the agent `.md`

The main integration pattern is the same OpenCode agent markdown you already use today.
You define triggers directly in the agent `.md` frontmatter next to fields like `description`, `mode`, and `permission`.

Example OpenCode agent file:

```md
---
description: "Ops agent"
mode: subagent
permission:
  bash: allow
  read: allow
triggers:
  - name: "Weekly Reflection"
    enabled: true
    source:
      type: "cron"
      expr: "0 0 10 * * 6"
      timezone: "UTC"
    execution:
      prompt: "Generate a weekly reflection"
      session_mode: "new"

  - name: "Inbound Event"
    enabled: true
    source:
      type: "webhook"
      path: "/hooks/inbound"
      method: "POST"
      secret: "top-secret"
    context:
      extract:
        sender: "data.body.sender"
        topic: "data.body.topic"
      include_raw: true
    execution:
      prompt: |
        Handle this inbound webhook payload.
        Sender: {{ sender }}
        Topic: {{ topic }}
      session_mode: "reuse"
---

# Ops

You are an operations-focused OpenCode agent.
```

## What this package does

`@kortix/opencode-agent-triggers` lets an OpenCode agent define automation directly inside its markdown frontmatter instead of keeping trigger configuration somewhere else.

Current trigger kinds:

- `cron` — runs on the package's embedded scheduler
- `webhook` — exposes an HTTP endpoint and dispatches into an OpenCode session

The package also ships the scheduler state management, cron execution engine, and runtime tools so the entire trigger system is self-contained inside this package.

It is intended to be plug-and-play in the OpenCode plugin ecosystem: install the package, add `createAgentTriggersPlugin(...)` to your plugin stack, and define triggers in agent markdown.

## OpenCode agent integration model

This package is built around how OpenCode agents are authored and loaded.

Default discovery targets:

- `<project>/.opencode/agents`
- `~/.config/opencode/agents`

You can override discovery with `agentPaths` if you want to point the plugin at another agent directory.

## Trigger schema in agent markdown

Add a `triggers:` array to the YAML frontmatter of an agent:

```yaml
---
description: "Ops agent"
mode: subagent
triggers:
  - name: "Weekly Reflection"
    enabled: true
    source:
      type: "cron"
      expr: "0 0 10 * * 6"
      timezone: "UTC"
    execution:
      prompt: "Generate a weekly reflection"

  - name: "Inbound Event"
    enabled: true
    source:
      type: "webhook"
      path: "/hooks/inbound"
      method: "POST"
      secret: "top-secret"
    context:
      extract:
        sender: "data.body.sender"
    execution:
      prompt: "Handle inbound webhook payload from {{ sender }}"
      session_mode: "reuse"
---
```

## Supported fields

Shared trigger fields:

- `name` — human-readable trigger name, unique within the agent
- `enabled` — defaults to `true`

Execution fields:

- `execution.prompt` — prompt body injected when the trigger fires
- `execution.agent_name` — optional override for which agent executes the trigger
- `execution.model_id` — optional model override such as `openai/gpt-5.4`
- `execution.session_mode` — `new` or `reuse`

Context fields:

- `context.extract` — map of template variable names to event paths
- `context.include_raw` — include the full normalized trigger event in the final prompt, defaults to `true`

Cron-specific fields:

- `source.type: cron`
- `source.expr` — 6-field cron expression
- `source.timezone` — optional IANA timezone

Webhook-specific fields:

- `source.type: webhook`
- `source.path` — endpoint path
- `source.method` — HTTP method, defaults to `POST`
- `source.secret` — shared secret for authenticated delivery

## Runtime architecture

The package contains the full trigger runtime:

- markdown discovery for OpenCode agents
- embedded cron scheduler
- persisted cron state file
- webhook HTTP server
- OpenCode session dispatcher
- management tools for inspection and manual control

## Package layout

- `src/plugin.ts` — OpenCode plugin entrypoint
- `src/parser.ts` — agent markdown discovery and trigger parsing
- `src/trigger-manager.ts` — orchestration across cron + webhook runtimes
- `src/cron-store.ts` — persisted embedded scheduler state
- `src/cron-manager.ts` — embedded cron scheduling and execution management
- `src/cron-client.ts` — management facade used by tools and integrations
- `src/webhook-server.ts` — embedded webhook server
- `src/opencode-http-dispatch.ts` — reusable OpenCode HTTP dispatch helper for compatibility layers
- `test/e2e.test.ts` — hermetic end-to-end coverage

By default, cron state is stored in:

- `<project>/.opencode/agent-triggers/cron-state.json`

You can override that with `cronStatePath`.

## Runtime behavior

### Cron triggers

- discovered from agent markdown
- registered into the embedded scheduler included in this package
- namespaced as `{agent}:{trigger}`
- updated on resync if source or execution settings change
- removed if the declaration disappears or becomes disabled
- persisted to a local cron state file
- can be run manually through the `cron_triggers` tool

### Webhook triggers

- mounted on the local webhook server started by the plugin
- dispatched into an OpenCode session via `session.create()` + `session.promptAsync()`
- support templated prompt variables via `context.extract`
- include structured extracted values and the raw normalized event in the prompt body
- support `execution.session_mode: reuse` so repeated webhook calls can continue the same session

## Preferred webhook secret header

Secret-protected webhooks should send:

- `X-Kortix-OpenCode-Trigger-Secret`

The runtime currently also accepts the legacy `X-Kortix-Trigger-Secret` header for compatibility, but the co-branded OpenCode header is the preferred name going forward.

## Usage

This package is intended to be installed as an OpenCode npm plugin.

### Recommended: add the npm package directly to `opencode.jsonc`

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@kortix/opencode-agent-triggers"]
}
```

That is the main intended installation path.

The package exports a default plug-and-play OpenCode plugin, so you should not need to create your own wrapper file unless you want custom runtime options.

### Advanced: create a local wrapper plugin only if you need custom options

```ts
import { createAgentTriggersPlugin } from "@kortix/opencode-agent-triggers"

export default createAgentTriggersPlugin({
  webhookHost: "0.0.0.0",
  webhookPort: 8099,
  publicBaseUrl: "http://localhost:8099",
})
```

Then register that local file in `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugin/agent-triggers.ts"]
}
```

### Define triggers in agent markdown

Once the plugin is loaded, your agents can define `triggers:` directly in their `.md` frontmatter.

## Kortix / sandbox integration

In the Kortix sandbox, this package is intended to be part of the sandbox package stack.

- OpenCode loads it directly from `opencode.jsonc` as an npm plugin
- `@kortix/kortix-opencode` is the main OpenCode config for the sandbox stack
- `packages/sandbox/kortix-master` keeps `/kortix/cron` as a compatibility HTTP API for the frontend and existing consumers
- the actual scheduler/runtime logic lives in `@kortix/opencode-agent-triggers`

So the package is the real implementation, loaded the same way a normal OpenCode npm plugin is loaded, and the sandbox API is the compatibility surface around it.

## Options

- `agentPaths` — explicit agent directories to scan
- `cronStatePath` — path to the embedded scheduler state file
- `webhookHost` — bind host for the webhook server
- `webhookPort` — bind port for the webhook server
- `publicBaseUrl` — externally reachable base URL used in listings
- `autoSync` — whether startup should immediately sync triggers
- `directory` — project directory override for discovery/session creation
- `homeDir` — override for global OpenCode agent discovery

## Tools exposed by the plugin

- `agent_triggers` — list discovered cron/webhook triggers plus scheduler state
- `sync_agent_triggers` — re-read agent markdown and refresh trigger state
- `cron_triggers` — manual scheduler wrapper for create/list/get/update/delete/pause/resume/run/executions

## Verification status

The package is covered by isolated E2E tests that verify:

- OpenCode-style agent discovery from project and global agent directories
- self-contained cron persistence, manual execution, automatic execution, and resync
- webhook dispatch into OpenCode sessions
- webhook secret rejection
- session reuse behavior
- plugin tool behavior
- dockerized execution of the same suite

## Development

```bash
pnpm typecheck
pnpm test:e2e
pnpm docker:e2e
```
