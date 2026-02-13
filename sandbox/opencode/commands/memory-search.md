---
description: Search across all memory files for a keyword or topic.
agent: kortix-main
---

# Memory Search

Search the entire memory system for relevant information using the native `memory_search` tool.

## Search strategy

Use the `memory_search` tool for structured hybrid search (semantic + keyword):

```
memory_search(query: "$ARGUMENTS", scope: "all")
```

This runs BOTH LSS (BM25 + embeddings) and grep in parallel, merges and deduplicates results.

### If you need broader search

Also search Desktop files if memory results are insufficient:

```bash
lss "$ARGUMENTS" -p /workspace --json -k 10
```

## Output

For each match, show:
- Source file (relative path under .kortix/)
- The matching content or snippet
- Relevance score (for semantic results)
- Source type (semantic vs keyword)

Group results by tier:
1. **Core memory** — from MEMORY.md
2. **Episodic memory** — from memory/*.md
3. **Journal** — from journal/*.md
4. **Knowledge** — from knowledge/*.md
5. **Sessions** — from sessions/*.md

If no results found, suggest:
- Related terms to try
- Whether to search Desktop files too
- Whether to export past sessions: `python3 ~/.opencode/skills/KORTIX-memory/scripts/export-sessions.py`

## Search query

$ARGUMENTS
