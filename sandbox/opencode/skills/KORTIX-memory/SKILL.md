---
name: kortix-memory
description: "Persistent memory system. Two tiers: MEMORY.md (core, loaded every session) and memory/*.md (long-term, searched on demand). The agent decides what to remember."
---

# Memory System

Persistent memory lives at `workspace/.kortix/`. It survives session restarts and container reboots.

## Layout

```
workspace/.kortix/
├── MEMORY.md        ← Core memory. Loaded every session.
└── memory/          ← Long-term memory. Searched on demand.
    └── *.md         ← Agent creates files as needed.
```

## Core Memory — `MEMORY.md`

Single file loaded at the start of every session. Contains everything the agent needs to know immediately.

### Structure

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

### Rules

- **Keep it under ~3000 tokens.** If a section grows too large, move details to `memory/` and leave a summary + pointer.
- **Update it constantly.** User reveals a preference? Update the User section. Learn a build command? Update Project. Finish a task? Update Scratchpad.
- **Scratchpad is ephemeral.** Clear completed items. Keep pending items for next session.

### If MEMORY.md doesn't exist

Create it with sensible defaults and ask the user to introduce themselves:

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

## Long-Term Memory — `memory/*.md`

Files the agent creates as needed to store knowledge that doesn't fit in core memory.

### When to write

- A decision worth remembering → create or append to a relevant file
- A user preference discovered → add to a relevant file
- Domain knowledge accumulated → create a topic file
- Research completed → save the report
- Session ending → write a session summary if significant

### How to write

```
# Create or append to any file:
edit("workspace/.kortix/memory/decisions.md", append entry)
write("workspace/.kortix/memory/api-patterns.md", content)
```

Use descriptive filenames. Date entries for temporal context. No required naming conventions — the agent decides the structure.

### How to search

**Exact keyword search (grep):**
```
grep("keyword", path="workspace/.kortix/memory/")
grep("keyword", path="workspace/.kortix/")
glob("workspace/.kortix/memory/*.md")
```

**Semantic search (lss) — for fuzzy/conceptual queries:**
```bash
# Search all memory semantically (finds related concepts, not just exact words)
lss "what are the user's deployment preferences" -p /config/workspace/.kortix/ --json -k 5

# Search everything (Desktop files + memory)
lss "database migration strategy" -p /config/Desktop --json -k 10
```

Use semantic search when:
- The query is conceptual ("how to handle errors") rather than a specific keyword
- You're looking for "something like X" rather than "the exact string X"
- You want to find related topics across many files
- You need to recall past conversations ("what did we discuss about...")

The semantic search index is auto-updated by a real-time file-watcher daemon (`lss-sync`). Load the `kortix-semantic-search` skill for full details.

## Session Lifecycle

### Start
1. Read `workspace/.kortix/MEMORY.md` (the `opencode.md` file reminds you)
2. If it doesn't exist, create it with defaults
3. Check Scratchpad for pending tasks — acknowledge them

### During
4. Update Scratchpad with current focus
5. Update User/Project sections when you learn something
6. Write to `memory/` for anything that doesn't fit in core memory

### End
7. Update Scratchpad: clear completed items, leave handoff notes
8. Optionally write a session summary to `memory/` if the session was significant

## Rules

1. **Always update, never stale.** If information changes, update immediately.
2. **Be specific.** Include dates, exact values, names. "User prefers Bun" > "User has preferences".
3. **Learn from corrections.** User corrects you? Update MEMORY.md immediately. Same mistake twice is unacceptable.
4. **Proactively remember.** Don't wait to be told. If the user reveals something worth persisting, write it now.
5. **Don't duplicate.** Search before adding. Update existing entries rather than creating duplicates.
