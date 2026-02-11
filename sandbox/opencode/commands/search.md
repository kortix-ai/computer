---
description: Semantic search across all files and memory.
agent: kortix-main
---

# Semantic Search

Search everything semantically using lss (BM25 + OpenAI embeddings).

## Strategy

Run searches across all indexed sources in parallel:

```bash
# Search Desktop files (projects, documents, etc.)
lss "$ARGUMENTS" -p /config/Desktop --json -k 10

# Search agent memory + knowledge
lss "$ARGUMENTS" -p /config/workspace/.kortix/ --json -k 5
```

## Output

Present results grouped by source, ranked by score:

1. **Best matches** — Top results across all sources, with file path and snippet
2. **Memory matches** — Relevant stored knowledge

For each result, show:
- File path
- Relevance score
- Snippet preview

If results reference a specific file, offer to read it for full context.

## Search query

$ARGUMENTS
