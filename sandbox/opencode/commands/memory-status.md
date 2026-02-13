---
description: Show the current state of the agent's memory system including all tiers, tools, and plugin status.
agent: kortix-main
---

# Memory Status

Read and report on the full memory system at `workspace/.kortix/`.

## Core Memory (Tier 1)

Read `workspace/.kortix/MEMORY.md` via `memory_get(path: "MEMORY.md")` and show a summary of each section (Identity, User, Project, Scratchpad).

## Episodic Memory (Tier 2)

List all files in `workspace/.kortix/memory/` and show:
- Total number of files
- Most recent daily log date
- One-line summary of each topic file

## Journal (Tier 3)

List all files in `workspace/.kortix/journal/` and show count + latest entry date.

## Knowledge (Tier 4)

List all files in `workspace/.kortix/knowledge/` and show count + one-line summary of each.

## Session Transcripts

List all files in `workspace/.kortix/sessions/` and show count.
If empty, suggest: `python3 ~/.opencode/skills/KORTIX-memory/scripts/export-sessions.py`

## Health Check

Report:
- Whether MEMORY.md exists and has real content (not default template)
- Approximate token count of MEMORY.md (target: under ~3000 tokens)
- Number of files per tier
- Whether the memory plugin is active (check if MEMORY.md appears in system prompt)
- Whether `memory_search` tool is available (test a simple query)
- Whether LSS is running (`lss status`)
- Any issues (empty sections, stale scratchpad, missing directories)

## System Components

| Component | Status | Description |
|---|---|---|
| Memory Plugin | Check if `plugin/memory.ts` is registered in opencode.jsonc | Auto-loads MEMORY.md + daily logs, pre-compaction flush |
| memory_search tool | Test with a simple query | Hybrid semantic + keyword search |
| memory_get tool | Test by reading MEMORY.md | Secure memory file reader |
| LSS daemon | Run `lss status` | Real-time file indexing for semantic search |

Present as a clean, concise summary.

$ARGUMENTS
