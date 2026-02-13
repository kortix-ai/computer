---
name: kortix-memory
description: "Persistent memory system matching OpenClaw's architecture. Four tiers: MEMORY.md (core, auto-loaded via plugin), memory/*.md (episodic, daily logs + topic files), journal/*.md (session summaries), knowledge/*.md (research/reference). Native memory_search and memory_get tools. Pre-compaction memory flush prevents memory loss."
---

# Memory System

Persistent memory lives at `workspace/.kortix/`. It survives session restarts and container reboots.

## Architecture

The memory system has 3 layers:

1. **Memory Plugin** (`plugin/memory.ts`) — Auto-loads MEMORY.md + daily logs into system prompt, flushes memories before compaction
2. **Memory Tools** (`tools/memory-search.ts`, `tools/memory-get.ts`) — Structured hybrid search and secure file access
3. **Memory Files** — Plain Markdown files on disk, the source of truth

## Layout

```
workspace/.kortix/
├── MEMORY.md           ← Core memory. Auto-loaded every turn by plugin.
├── memory/             ← Episodic memory. Daily logs + topic files.
│   ├── YYYY-MM-DD.md   ← Daily append-only log (today + yesterday auto-loaded)
│   └── *.md            ← Topic files (decisions.md, api-patterns.md, etc.)
├── journal/            ← Session summaries. Written at session end.
│   └── *.md
├── knowledge/          ← Research reports, reference material.
│   └── *.md
└── sessions/           ← Exported session transcripts (auto-indexed by LSS).
    └── *.md
```

## Four Memory Tiers

### Tier 1: Core Memory — `MEMORY.md` (what you know NOW)

**Auto-loaded by the memory plugin into every turn's system prompt.** No tool call needed.

Single file containing everything the agent needs to know immediately.

#### Structure

```markdown
# Memory

## Identity
[Agent name, role, email, key capabilities]

## User
[Name, role, preferences, communication style]

## Project
[Current workspace: tech stack, architecture, key commands, conventions]

## Scratchpad
[Current focus, pending tasks, handoff notes for next session]
```

#### Rules

- **Keep it under ~3000 tokens.** If a section grows too large, move details to `memory/` and leave a summary + pointer.
- **Delta-only updates.** Never rewrite the whole file. Only update specific sections or append to them.
- **Update constantly.** User reveals a preference? Update User. Learn a build command? Update Project.
- **Scratchpad is ephemeral.** Clear completed items. Keep pending items for next session.

#### If MEMORY.md doesn't exist

Create it with sensible defaults:

```markdown
# Memory

## Identity
Kortix — autonomous AI agent with persistent memory, full Linux access, and internet connectivity.

## User
Not yet known. Introduce yourself so I can remember you.

## Project
Not yet scanned. Run `/init` to scan the workspace.

## Scratchpad
First session. Memory system initialized.
```

### Tier 2: Episodic Memory — `memory/*.md` (what happened)

Past experiences, daily logs, decisions, lessons learned. **Searched on demand** via `memory_search` tool or `lss`.

#### Daily Logs (OpenClaw-style)

Write daily entries to `memory/YYYY-MM-DD.md`. Today + yesterday are **auto-loaded** by the memory plugin.

```markdown
# 2025-02-13

## 14:30 — User onboarding
- User name: Marko. Role: Founder at Kortix.
- Prefers autonomous execution, minimal questions.
- Workspace: monorepo with Next.js frontend, Hono backend, Docker sandbox.

## 16:45 — Memory system implementation
- Implemented OpenClaw-style memory plugin with pre-compaction flush.
- Created native memory_search and memory_get tools.
- Key decision: hybrid lss+grep approach for search.
```

Format: `## HH:MM — [Topic]` followed by bullet points. Append-only.

#### Topic Files

For knowledge that doesn't fit in core memory or daily logs:
- `memory/decisions.md` — Key architectural decisions
- `memory/api-patterns.md` — Discovered API patterns
- `memory/agent-performance.md` — Which agents excel at what tasks

Use descriptive filenames. No required naming convention.

### Tier 3: Journal — `journal/*.md` (session summaries)

Written at session end via `/journal` command. Captures:
- What happened this session
- Tasks completed
- Decisions made
- Lessons learned
- Open items

### Tier 4: Knowledge — `knowledge/*.md` (reference material)

Research reports, accumulated expertise, reference documents.
Written by `@kortix-research` or manually by the agent.

## Memory Tools

### `memory_search` — Hybrid semantic + keyword search

**Use this instead of running lss/grep via bash.**

```
memory_search(query: "user deployment preferences")
memory_search(query: "database migration decisions", scope: "memory")
memory_search(query: "what did we discuss about auth", scope: "all")
memory_search(query: "session about API design", scope: "sessions")
```

Parameters:
- `query` — Natural language search query
- `scope` — `all` (default), `core`, `memory`, `journal`, `knowledge`, `sessions`
- `max_results` — 1-20 (default: 6)

Returns structured JSON with: snippet, file_path, line_range, score, source (semantic/keyword).

### `memory_get` — Read a specific memory file

**Use this instead of read/cat for memory files.**

```
memory_get(path: "MEMORY.md")
memory_get(path: "memory/decisions.md")
memory_get(path: "memory/2025-02-13.md", start_line: 10, lines: 20)
```

Parameters:
- `path` — Relative to `.kortix/` or absolute path
- `start_line` — Start line (1-indexed, optional)
- `lines` — Number of lines to read (optional)

Security: restricted to `workspace/.kortix/`, rejects symlinks, non-Markdown files.

## Pre-Compaction Memory Flush

**The memory plugin automatically handles this.** When the context window is about to compact:

1. Plugin injects flush instructions into the compaction context
2. Agent is prompted to write durable memories to `memory/YYYY-MM-DD.md`
3. Agent updates MEMORY.md Scratchpad with current state
4. One flush per compaction cycle (tracked per session)

This prevents memory loss during long sessions — the single most important feature matching OpenClaw's design.

## Session Transcript Indexing

Past sessions can be exported to Markdown for semantic search:

```bash
# Export new sessions to workspace/.kortix/sessions/
python3 ~/.opencode/skills/KORTIX-memory/scripts/export-sessions.py

# Re-export everything
python3 ~/.opencode/skills/KORTIX-memory/scripts/export-sessions.py --force

# Export since a date
python3 ~/.opencode/skills/KORTIX-memory/scripts/export-sessions.py --since 2025-01-01
```

LSS auto-indexes files in `workspace/.kortix/sessions/`.

## Session Lifecycle

### Start
1. **Automatic:** Memory plugin loads MEMORY.md + daily logs into system prompt
2. Check Scratchpad for pending tasks — acknowledge them
3. If MEMORY.md doesn't exist, create it with defaults

### During
4. Update Scratchpad with current focus
5. Update User/Project sections when you learn something
6. Write daily entries to `memory/YYYY-MM-DD.md` for notable events
7. Write to topic files in `memory/` for lasting knowledge
8. Use `memory_search` to recall past decisions and context

### Pre-Compaction (automatic)
9. Memory plugin triggers flush before context compaction
10. Write durable memories to daily log
11. Update Scratchpad with handoff notes

### End
12. Update Scratchpad: clear completed items, leave pending items
13. Optionally run `/journal` for a session summary

## Semantic Search

Full semantic search over everything — powered by `lss` (BM25 + embeddings).

**Prefer `memory_search` tool** for memory-specific queries. Use raw `lss` for broader file search:

```bash
# Search all Desktop files
lss "authentication flow" -p /workspace --json -k 10

# Search a specific project
lss "database schema" -p /workspace/myproject/ --json -k 5
```

Load the `kortix-semantic-search` skill for full LSS details.

## Configuration

Memory behavior is configured in `memory.json` (alongside `opencode.jsonc`):

```json
{
  "enabled": true,
  "basePath": "/workspace/.kortix",
  "search": { "maxResults": 6, "minScore": 0.35 },
  "flush": { "enabled": true, "softThresholdTokens": 4000 },
  "inject": { "coreMemory": true, "dailyLogs": true, "dailyLogDays": 2 }
}
```

## Rules

1. **Always update, never stale.** If information changes, update immediately.
2. **Delta-only.** Never rewrite MEMORY.md in full. Only update specific sections or append.
3. **Be specific.** Include dates, exact values, names. "User prefers Bun" > "User has preferences".
4. **Learn from corrections.** User corrects you? Update MEMORY.md immediately. Same mistake twice is unacceptable.
5. **Proactively remember.** Don't wait to be told. If the user reveals something worth persisting, write it now.
6. **Don't duplicate.** Use `memory_search` before adding. Update existing entries rather than creating duplicates.
7. **Daily logs are append-only.** Never edit past daily entries. Only append new entries to today's log.
8. **Use the tools.** Prefer `memory_search` and `memory_get` over raw bash commands for memory access.
