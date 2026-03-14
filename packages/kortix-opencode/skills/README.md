# Kortix Skill Pack

This directory is the built-in skill pack for `computer/packages/kortix-opencode`.

## What lives here

- built-in operational skills that ship with the Kortix OpenCode config
- each skill keeps `SKILL.md` small and pushes long-form docs into subfolders when needed
- `KORTIX-system/` is the central system-reference skill for sandbox, persistence, secrets, triggers, search, and session operations

## Layout

- `*/SKILL.md` - discovery surface and loading instructions
- `*/references/` - deep documentation loaded on demand with `read`
- `*/templates/` - reusable templates when a skill needs them
- `*/assets/` - static supporting files when a skill needs them

## Current built-in skills

- `agent-browser/`
- `agent-harness/`
- `agent-tunnel/`
- `channels/`
- `integrations/`
- `KORTIX-system/`
- `memory-context-management/`
- `opencode/`
- `presentations/`
- `registry-search/`
- `session-search/`
- `woa/`

## KORTIX-system structure

`KORTIX-system/` now follows the same staged-document pattern used in `PerplexitySkills/`:

- `SKILL.md` - trigger surface and routing guide
- `references/overview.md` - architecture, paths, services, ports, runtimes
- `references/persistence.md` - what survives restarts and how to install packages safely
- `references/environment-and-secrets.md` - env model, secret APIs, encryption, cloud vars
- `references/integrations.md` - OAuth and Pipedream integration flow
- `references/agent-triggers.md` - cron, webhook, and event triggers
- `references/search-memory-sessions.md` - `lss`, memory, and session retrieval
- `references/skill-authoring.md` - skill creation rules and structure
- `references/operations-and-debugging.md` - commands, init scripts, health checks, Docker notes
