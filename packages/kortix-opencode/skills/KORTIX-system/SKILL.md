---
name: kortix-system
description: "Complete Kortix sandbox system reference. Covers: container image, s6 services, filesystem layout, persistence model, environment variables, secrets management (API for setting/getting/deleting env vars), ports, runtimes, init scripts, cloud mode, desktop environment, cron triggers (scheduled agent execution), semantic search (lss), session search & management (API + on-disk queries), skill creation guide, and all installed tooling. Load this skill when you need to: understand the sandbox, debug services, configure the environment, set API keys/secrets, schedule cron jobs, search files semantically, query session data, or create new skills."
---

# Kortix System Reference

Use this skill for sandbox and runtime questions: persistence, services, secrets, cloud env, triggers, semantic search, session retrieval, and skill authoring.

This skill now uses a staged structure like `PerplexitySkills`: keep `SKILL.md` as the routing layer, then read the relevant file in `references/` before answering or changing system-facing behavior.

## Reference Map

- `references/overview.md`
  - container image
  - key paths
  - projects
  - services and ports
  - Kortix Master routing
  - runtimes and OpenCode defaults
- `references/persistence.md`
  - what persists vs what resets
  - where long-lived files belong
  - pip, npm, and apk install rules
- `references/environment-and-secrets.md`
  - env model
  - localhost auth behavior
  - secret APIs
  - encryption details
- `references/integrations.md`
  - OAuth integration architecture
  - integration tool workflow
  - `proxyFetch()` guidance
- `references/agent-triggers.md`
  - cron, webhook, and Pipedream event triggers
  - trigger tools and HTTP APIs
  - listener lifecycle and architecture
- `references/search-memory-sessions.md`
  - `lss` usage
  - memory plugin facts
  - session storage and retrieval paths
- `references/skill-authoring.md`
  - skill layout
  - `SKILL.md` format
  - progressive-disclosure rules
- `references/operations-and-debugging.md`
  - init scripts
  - service checks
  - health checks
  - Docker development notes

## How to Use This Skill

### For architecture or sandbox questions

Read `references/overview.md` first.

### For persistence or package installation questions

Read `references/persistence.md` first.

### For API keys, env vars, auth, or secret propagation

Read `references/environment-and-secrets.md` first.

### For Gmail, Slack, GitHub, Sheets, or OAuth-backed tooling

Read `references/integrations.md` first.

### For cron schedules, webhooks, or event-driven automation

Read `references/agent-triggers.md` first.

### For semantic search, memory, or session lookup

Read `references/search-memory-sessions.md` first.

### For building or refactoring more skills

Read `references/skill-authoring.md` first.

### For health checks, boot order, or Docker debugging

Read `references/operations-and-debugging.md` first.

## Non-Negotiable Rules

- If it must survive restarts, it belongs under `/workspace`.
- Use the secret API for secrets instead of writing them into files.
- Use `portless` for manually started dev servers.
- When answering detailed system questions, read the relevant reference file instead of relying on memory.
- When creating large skills, keep `SKILL.md` short and move depth into `references/`.
