---
description: Show the current state of the agent's memory system.
agent: kortix-main
---

# Memory Status

Read and report on the memory system at `workspace/.kortix/`.

## Core Memory

Read `workspace/.kortix/MEMORY.md` and show a summary of each section (Identity, User, Project, Scratchpad).

## Long-Term Memory

List all files in `workspace/.kortix/memory/` and show a one-line summary of each.

## Health Check

Report:
- Whether MEMORY.md exists and has real content (not default template)
- Number of long-term memory files
- Approximate size of MEMORY.md (target: under ~3000 tokens)
- Any issues (empty sections, stale scratchpad)

Present as a clean, concise summary.

$ARGUMENTS
