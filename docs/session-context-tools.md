# Session Context Tools

Cross-session context retrieval for the OpenCode agent. Two tools let the agent browse and read past sessions with optional semantic compression via TTC (The Token Company).

---

## Architecture

```
Agent calls session_list / session_get
        │
        ▼
  OpenCode Plugin (`packages/kortix-oc/runtime/plugin/kortix-sys/src/index.ts`)
        │
        ├─► OpenCode SDK (session.list / session.get / session.messages / session.todo)
        │       └─► opencode.db (SQLite at /workspace/.local/share/opencode/)
        │
        └─► TTC API (POST https://api.thetokencompany.com/v1/compress)
                └─► bear-1.2 model — semantic compression
```

No local fallback compressor. If TTC is unavailable or `TTC_API_KEY` is not set, conversations are returned uncompressed.

---

## Tools

### `session_list`

Browse past sessions. Returns IDs, titles, timestamps, file change stats, storage paths.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `search` | `string?` | — | Filter by title substring (case-insensitive, client-side) |
| `limit` | `number?` | 20 | Max results, most recent first |

**Output includes:**
- Session ID (`ses_*`), title, created/updated timestamps
- File change summary (files, additions, deletions)
- Parent session ID (if subtask)
- Storage paths for raw SQLite/filesystem access

### `session_get`

Retrieve a session's full conversation with TTC compression.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `session_id` | `string` | — | Session ID from `session_list` |
| `aggressiveness` | `number?` | 0.3 | Compression level 0.0–1.0 |

**Aggressiveness guide:**

| Level | Behavior | Use case |
|-------|----------|----------|
| 0.1 | Light — most detail preserved | Recent/important sessions |
| 0.3 | Balanced (default) | General context retrieval |
| 0.5 | Moderate | Older sessions, broad strokes |
| 0.7+ | Heavy — just the essence | Scanning many sessions quickly |

**Output includes:**
- Metadata header (title, timestamps, file changes, todos) — never compressed
- Compressed conversation transcript with tool call summaries
- Compression stats (original tokens → compressed tokens, % reduction)

---

## Message Processing Pipeline

```
All session messages (SDK)
        │
        ▼
  Filter: keep text + tool parts only
  Skip: reasoning, step-start/finish, snapshot, patch, agent, retry, compaction, subtask
  Skip: synthetic/ignored text parts (compaction artifacts)
        │
        ▼
  Pre-truncation (before TTC):
    Tool call inputs:  200 chars max (head + tail with omission marker)
    Tool call outputs: 2000 chars max
        │
        ▼
  TTC bear-1.2 compression (if API key set + text > 500 chars)
        │
        ▼
  Final output: metadata header + compressed conversation + stats
```

---

## Configuration

### Required

| Env var | Where | Value |
|---------|-------|-------|
| `TTC_API_KEY` | `.env` / sandbox secrets | TTC API key (`ttc_sk_...`) |

The plugin reads env vars via `getEnv()` which checks `process.env` first, then falls back to reading s6 container env files at `/run/s6/container_environment/`. This allows hot-reloading keys without restarting OpenCode.

### Plugin Registration

In the materialized OpenCode config (`/opt/opencode/opencode.jsonc` in sandbox, generated from `packages/kortix-oc/runtime/opencode.jsonc`):

```jsonc
{
  "plugin": ["opencode-pty", "envsitter-guard", "/opt/kortix-oc/runtime/plugin/kortix-oc.ts"]
}
```

---

## Storage Paths

| What | Path |
|------|------|
| OpenCode DB (SQLite) | `/workspace/.local/share/opencode/opencode.db` |
| Session JSON (legacy) | `/workspace/.local/share/opencode/storage/session/global/ses_*.json` |
| Message JSON (legacy) | `/workspace/.local/share/opencode/storage/message/{session_id}/msg_*.json` |
| Part JSON (legacy) | `/workspace/.local/share/opencode/storage/part/{message_id}/prt_*.json` |

The SDK reads from SQLite. Legacy JSON paths are available for raw bash access.

---

## Files

| File | Description |
|------|-------------|
| `packages/kortix-oc/runtime/plugin/kortix-sys/src/index.ts` | Plugin source |
| `packages/kortix-oc/runtime/opencode.jsonc` | Source config template |
| `/opt/kortix-oc/runtime/plugin/kortix-oc.ts` | Runtime wrapper plugin |
| `/opt/opencode/opencode.jsonc` | Materialized sandbox config |
