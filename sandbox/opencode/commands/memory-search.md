---
description: Search across all memory files for a keyword or topic.
agent: kortix-main
---

# Memory Search

Search the entire memory system for relevant information.

## Search strategy

Run BOTH exact and semantic search for comprehensive results:

### 1. Exact keyword search (grep)
- **Core memory** — grep `workspace/.kortix/MEMORY.md` for `$ARGUMENTS`
- **Long-term memory** — grep across `workspace/.kortix/memory/*.md` for `$ARGUMENTS`
- **Journal** — grep across `workspace/.kortix/journal/*.md` for `$ARGUMENTS`
- **Knowledge** — grep across `workspace/.kortix/knowledge/*.md` for `$ARGUMENTS`

### 2. Semantic search (lss)
Run these in parallel for speed:

```bash
# Search memory semantically (finds related concepts, not just exact keywords)
lss "$ARGUMENTS" -p /config/workspace/.kortix/ --json -k 5
```

## Output

Combine results from both search methods. For each match, show:
- Source (memory file, etc.)
- The matching content or snippet
- Relevance score (for semantic results)

Group results by source:
1. **Memory matches** — from .kortix/ files
2. **Grep matches** — exact keyword hits

If no results found from either method, say so clearly and suggest:
- Related terms to try
- Whether to search Desktop files too: `lss "$ARGUMENTS" -p /config/Desktop --json -k 10`

## Search query

$ARGUMENTS
