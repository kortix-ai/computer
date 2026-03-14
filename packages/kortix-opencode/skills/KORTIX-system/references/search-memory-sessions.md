# Search, Memory, and Sessions

Use this file when you need semantic search, persistent memory behavior, or direct session retrieval details.

## Semantic Search (`lss`)

`lss` combines BM25 full-text search with embedding similarity and is continuously updated by `lss-sync`.

### Common commands

```bash
lss "your query" -p /workspace -k 10 --json
lss "auth logic" -p /workspace -e .py -e .ts -k 10 --json
lss "config" -p /workspace -E .json -E .yaml -k 10 --json
lss index /workspace/important-file.md
lss status
```

### HTTP API

```bash
curl "http://localhost:8000/lss/search?q=auth+logic&k=10&path=/workspace&ext=.ts,.py"
curl "http://localhost:8000/lss/status"
```

### Choose the right search tool

| Use `lss` | Use `grep` |
|---|---|
| Conceptual or fuzzy queries | Exact strings |
| Cross-file discovery | Known identifiers |
| Semantic similarity | Literal pattern matching |

## Memory Model

For the full guide, load `memory-context-management`. Core system facts:

- `/workspace` is the persistent ground truth
- the `kortix-memory` plugin captures observations and long-term memory
- `mem_search`, `mem_save`, `session_list`, and `session_get` are the main memory/session tools
- files and memory should reinforce each other rather than compete

## Session Search Quick Reference

For the full workflow, load `session-search`. Core facts:

- primary DB: `/workspace/.local/share/opencode/opencode.db`
- legacy JSON storage: `/workspace/.local/share/opencode/storage/`
- plugin tools: `session_list` and `session_get`
- REST API: `GET /session`, `GET /session/:id/message`, `GET /session/status`, `DELETE /session/:id`
- direct SQL: `sqlite3 /workspace/.local/share/opencode/opencode.db`
- grep path: `/workspace/.local/share/opencode/storage/part/`
- semantic search can target the storage directory with `lss`
