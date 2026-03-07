# Kortix Memory Plugin — Technical Reference

> **Source**: `packages/kortix-sys-oc-plugin/src/`
> **Runtime**: Bun inside the sandbox Docker container
> **Storage**: SQLite at `~/.local/share/opencode/storage/kortix-memory.db`
> **LSS mirror**: `~/.lss/kortix-mem/` (markdown files for embedding-based search)

---

## 1. Data Structures

### Table: `observations` (short-term — one row per tool execution)

```
┌────┬────────────┬───────────┬──────────────────────┬──────────────────────────┬──────────────────────────┬──────────────────────┬──────────────┬──────────────┐
│ id │ session_id │ type      │ title                │ narrative                │ facts (JSON[])           │ concepts (JSON[])    │ tool_name    │ prompt_number│
├────┼────────────┼───────────┼──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────┼──────────────┼──────────────┤
│ 1  │ ses_abc    │ discovery │ Read config.ts       │ Read /src/config.ts      │ []                       │ ["config","ts"]      │ Read         │ 3            │
│ 2  │ ses_abc    │ change    │ Edited api.ts        │ Edited /src/api.ts       │ ["const x=1 → const y=2"]│ ["api","ts"]         │ Edit         │ 4            │
│ 3  │ ses_abc    │ bugfix    │ Edited auth.ts       │ Edited /src/auth.ts      │ ["fix: null check"]      │ ["auth","ts"]        │ Edit         │ 5            │
│ 4  │ ses_abc    │ change    │ git status           │ $ git status             │ ["M src/api.ts"]         │ ["git","status"]     │ Bash         │ 6            │
│ 5  │ ses_abc    │ discovery │ Searched: TODO        │ grep for "TODO" — 12 hit │ []                       │ ["search"]           │ Grep         │ 7            │
└────┴────────────┴───────────┴──────────────────────┴──────────────────────────┴──────────────────────────┴──────────────────────┴──────────────┴──────────────┘
```

Additional columns: `files_read (JSON[])`, `files_modified (JSON[])`, `created_at (TEXT, datetime)`

**Indexes**: `session_id`, `type`, `created_at DESC`

**FTS5 virtual table** `observations_fts` — indexes: `title`, `narrative`, `facts`, `concepts`
Kept in sync via INSERT/DELETE/UPDATE triggers (no manual indexing needed).

### Table: `long_term_memories` (consolidated by LLM during compaction)

```
┌────┬────────────┬──────────────────────────────────────────────┬─────────────────────────┬────────────┬───────────────────────┐
│ id │ type       │ content                                      │ context                 │ confidence │ tags (JSON[])         │
├────┼────────────┼──────────────────────────────────────────────┼─────────────────────────┼────────────┼───────────────────────┤
│ 1  │ semantic   │ The API uses Express with JWT at /src/auth/  │ Discovered during auth  │ 1.00       │ ["auth","express"]    │
│ 2  │ episodic   │ Built JWT authentication for the Express API │ null                    │ 0.85       │ ["auth","jwt"]        │
│ 3  │ procedural │ Deploy: bun build then docker compose up -d  │ Production workflow     │ 1.00       │ ["deploy","docker"]   │
│ 4  │ semantic   │ Frontend uses SolidJS + Tailwind             │ null                    │ 0.90       │ ["frontend","solidjs"]│
└────┴────────────┴──────────────────────────────────────────────┴─────────────────────────┴────────────┴───────────────────────┘
```

Additional columns: `source_session_id`, `source_observation_ids (JSON[])`, `files (JSON[])`, `created_at`, `updated_at`

**Indexes**: `type`, `confidence DESC`, `created_at DESC`

**FTS5 virtual table** `ltm_fts` — indexes: `content`, `context`, `tags`

### Table: `session_meta` (session tracking)

```
┌──────────┬──────────────┬───────────────────┬──────────────────────┬────────┬────────────┬──────────────┐
│ id (PK)  │ prompt_count │ observation_count │ last_consolidated_at │ status │ started_at │ completed_at │
├──────────┼──────────────┼───────────────────┼──────────────────────┼────────┼────────────┼──────────────┤
│ ses_abc  │ 14           │ 9                 │ 2026-02-25 17:00     │ active │ 2026-02-25 │ null         │
│ ses_xyz  │ 42           │ 31                │ 2026-02-24 23:00     │ done   │ 2026-02-24 │ 2026-02-25   │
└──────────┴──────────────┴───────────────────┴──────────────────────┴────────┴────────────┴──────────────┘
```

Updated via `ensureSession()`, `incrementPromptCount()`, `completeSession()`, `markConsolidated()`.

### TypeScript Interfaces

```typescript
// Observation types: discovery | decision | bugfix | feature | refactor | change
// LTM types:         episodic | semantic | procedural

interface Observation {
  id, sessionId, type, title, narrative, facts[], concepts[],
  filesRead[], filesModified[], toolName, promptNumber, createdAt
}

interface LTMEntry {
  id, type, content, context, sourceSessionId, sourceObservationIds[],
  confidence, tags[], files[], createdAt, updatedAt
}

interface SearchHit {
  id, source ("observation"|"ltm"), type, title, content,
  tags[], files[], createdAt, confidence?, rank?
}
```

---

## 2. Observation Extraction Pipeline

### Source: `extract.ts`

Every tool execution triggers the `tool.execute.after` hook. The extractor runs **deterministically** — no AI calls, pure heuristics.

### Flow

```
tool.execute.before → pendingArgs.set(callID, args)
                                         │
tool.execute.after  → args = pendingArgs.get(callID)
                      │
                      ▼
               extractObservation(raw, sessionId, promptNumber)
                      │
                      ├─ Skip? (tool in SKIP_TOOLS) → null
                      │
                      ├─ Sanitize: stripPrivate(), truncate output to 3000 chars
                      │
                      ├─ Switch on tool name:
                      │   Read  → type: discovery, filesRead: [path]
                      │   Write → type: feature,   filesModified: [path]
                      │   Edit  → type: change|bugfix|refactor, filesModified: [path]
                      │          (classifies by keyword: "fix"→bugfix, "refactor"→refactor)
                      │   Bash  → classifyBash(cmd):
                      │          git *        → change
                      │          npm test     → discovery|bugfix (based on FAIL in output)
                      │          docker *     → change
                      │          curl/wget    → discovery
                      │          mkdir/cp/rm  → change
                      │          default      → discovery
                      │   Grep  → discovery, narrative: "grep for X — N matches"
                      │   Glob  → discovery, narrative: "Found N files matching X"
                      │   web_search → discovery, concepts from query words
                      │   default    → discovery, "Used {tool}"
                      │
                      ▼
               CreateObservationInput → insertObservation(db, obs)
                                        + writeObservationFile(lssDir, id, data)
```

### Skip List

These tools do NOT generate observations:
`mem_search`, `mem_save`, `TodoWrite`, `TodoRead`, `pty_list`, `pty_read`, `pty_kill`, `question`

### Concepts Extraction

`conceptsFromPath("/workspace/apps/frontend/src/auth.ts")`
→ `["workspace", "apps", "frontend", "auth", "ts"]`
(Skips: `src`, `lib`, `dist`, `build`, `node_modules`)

### Privacy

`<private>...</private>` tags in tool args/output are replaced with `[REDACTED]`.

---

## 3. Search Algorithm

### Entry Point: `mem_search` tool → `unifiedSearch()` in `db.ts`

```
Input:
  query: string          — "docker deploy"
  limit?: number         — max results (default 15, cap 100)
  source?: string        — "both" (default) | "ltm" | "observation"
  type?: string          — optional filter (e.g., "bugfix", "semantic")
  sessionId?: string     — optional session filter (observations only)

Output:
  SearchHit[] — unified array, LTM first, then observations
```

### Full Algorithm

```
unifiedSearch("docker deploy", { limit: 15, source: "both" })
│
├─── PHASE 1: Search LTM ──────────────────────────────────────────
│    │
│    searchLTMFts(db, query, { limit, type })
│    │
│    ├─ Step A: Sanitize query
│    │    escapeFts5("docker deploy") → '"docker" "deploy"'
│    │
│    │    Rules:
│    │    - Each word wrapped in double quotes (literal token)
│    │    - AND / OR / NOT pass through as boolean operators
│    │    - Already-quoted phrases "like this" pass through unchanged
│    │    - Double quotes inside words are stripped
│    │
│    ├─ Step B: FTS5 full-text search (primary)
│    │
│    │    SELECT l.*, fts.rank
│    │    FROM ltm_fts fts
│    │    JOIN long_term_memories l ON l.id = fts.rowid
│    │    WHERE ltm_fts MATCH '"docker" "deploy"'
│    │    [AND l.type = ?]          ← optional type filter
│    │    ORDER BY fts.rank
│    │    LIMIT 15
│    │
│    │    How FTS5 MATCH works:
│    │    1. Look up inverted index for token "docker" → posting list {3, 7}
│    │    2. Look up inverted index for token "deploy" → posting list {3, 12}
│    │    3. Intersect (implicit AND): {3}
│    │    4. Score each match with BM25:
│    │       - TF:  more occurrences in the row → higher score
│    │       - IDF: rarer tokens across corpus → higher weight
│    │       - Length norm: shorter docs score higher for same match
│    │    5. rank = negative float (closer to 0 = more relevant)
│    │
│    │    Searches across: content, context, tags (all indexed columns)
│    │    Match in ANY column counts. No per-column weighting.
│    │
│    ├─ Step C: If FTS5 returns results → use them
│    │          If FTS5 returns 0 results OR throws parse error → LIKE fallback
│    │
│    └─ Step D: LIKE fallback (brute-force substring)
│
│         searchLTMLike(db, query, limit, { type })
│
│         SELECT * FROM long_term_memories
│         WHERE (content LIKE '%docker%' OR context LIKE '%docker%' OR tags LIKE '%docker%')
│           AND (content LIKE '%deploy%' OR context LIKE '%deploy%' OR tags LIKE '%deploy%')
│         [AND type = ?]
│         ORDER BY confidence DESC, updated_at DESC
│         LIMIT 15
│
│         - Every word must appear in at least one column (AND across words)
│         - Any column can satisfy a word (OR within each word)
│         - Substring match: "docker" matches "dockerfile", "docker-compose"
│         - No scoring — ordered by confidence then recency
│
├─── PHASE 2: Search Observations ─────────────────────────────────
│    │
│    searchObservationsFts(db, query, { limit, type, sessionId })
│    │
│    │    (identical two-tier pattern, different table + columns)
│    │
│    ├─ FTS5 on observations_fts (indexes: title, narrative, facts, concepts)
│    │
│    │    SELECT o.*, fts.rank
│    │    FROM observations_fts fts
│    │    JOIN observations o ON o.id = fts.rowid
│    │    WHERE observations_fts MATCH '"docker" "deploy"'
│    │    [AND o.type = ?]          ← optional type filter
│    │    [AND o.session_id = ?]    ← optional session filter
│    │    ORDER BY fts.rank
│    │    LIMIT 15
│    │
│    └─ LIKE fallback on observations (title, narrative, facts, concepts)
│         ORDER BY created_at DESC  ← recency, not confidence
│
└─── PHASE 3: Merge ───────────────────────────────────────────────

     // unifiedSearch() in db.ts
     results = [...ltmHits.map(toLTMSearchHit), ...obsHits.map(toObsSearchHit)]
     return results.slice(0, limit)

     LTM always first. No cross-scoring. No interleaving.
     If LTM fills the limit, zero observations appear.
```

### SearchHit mapping

| Source      | SearchHit.title            | SearchHit.content    | SearchHit.tags       | SearchHit.files                     |
|-------------|----------------------------|----------------------|----------------------|-------------------------------------|
| LTM         | `content.slice(0, 100)`    | `content`            | `tags`               | `files`                             |
| Observation | `title`                    | `narrative`          | `concepts`           | `[...filesRead, ...filesModified]`  |

### Output Format (what the agent sees)

```
=== Memory Search: "docker deploy" (4 results) ===

  [LTM/procedural] #3 (confidence: 1.00)
    Deploy: bun build then docker compose up -d
    Files: Dockerfile, docker-compose.yml

  [LTM/semantic] #1 (confidence: 1.00)
    The API uses Express with JWT at /src/auth/

  [obs/change] #4
    $ docker compose build --no-cache
    Files: Dockerfile

  [obs/discovery] #12
    Web search: docker deploy best practices
```

### What's NOT happening

| Feature | Status |
|---------|--------|
| Embeddings / vector similarity | Not used. `"deploy"` won't match `"release"` or `"ship"`. |
| Fuzzy matching | No. `"docker"` won't match `"dokcer"` (typo). |
| Cross-table ranking | No. LTM and observations are scored independently then concatenated. |
| Recency boost | No. BM25 doesn't consider timestamps. |
| Per-column weighting | No. FTS5 treats all indexed columns equally. |
| Semantic search | Only via separate LSS CLI tool (embedding-based), not `mem_search`. |

---

## 4. Context Injection

### What gets injected

On **every LLM call**, the `experimental.chat.messages.transform` hook appends a block to the **end of the latest user message**. Two parts:

#### Part A: Session Context

```xml
<session_context>
Session ID: ses_abc123
</session_context>
```

Always injected if there's an active session. Lets the agent know its session ID for tools like `session_get`.

#### Part B: Long-Term Memory Block

Generated by `context.ts` → `generateLTMBlock()`. Reads from SQLite **directly** (NOT from the search algorithm). Direct table queries:

```sql
-- Episodic (up to 10, highest confidence first)
SELECT * FROM long_term_memories WHERE type = 'episodic'
ORDER BY confidence DESC, updated_at DESC LIMIT 10

-- Semantic (up to 15)
SELECT * FROM long_term_memories WHERE type = 'semantic'
ORDER BY confidence DESC, updated_at DESC LIMIT 15

-- Procedural (up to 10)
SELECT * FROM long_term_memories WHERE type = 'procedural'
ORDER BY confidence DESC, updated_at DESC LIMIT 10
```

Formatted into:

```xml
<long-term-memory>

## Episodic (what happened)
- Built JWT authentication system for the Express API
- Migrated database from MySQL to PostgreSQL [schema.sql]

## Semantic (what I know)
- The API uses Express with JWT middleware at /src/auth/
- Frontend uses SolidJS + Tailwind at apps/frontend/
- Database is PostgreSQL with Drizzle ORM [schema.ts, db.ts]

## Procedural (how to do things)
- Deploy: bun build then docker compose up -d [Dockerfile]
- Run tests: bun test --coverage

</long-term-memory>
```

Max **35 entries** total (10 + 15 + 10). Each entry is one bullet point with optional `[filename]` suffixes (up to 2 files, basename only).

### Where it goes

```
messages array before injection:
  [0] { role: "user",      parts: [{ text: "fix the auth bug" }] }
  [1] { role: "assistant",  parts: [{ text: "I'll look into..." }] }
  [2] { role: "user",      parts: [{ text: "now deploy it" }] }    ← LAST user message

messages array after injection:
  [0] { role: "user",      parts: [{ text: "fix the auth bug" }] }
  [1] { role: "assistant",  parts: [{ text: "I'll look into..." }] }
  [2] { role: "user",      parts: [
          { text: "<session_context>...</session_context>\n\n<long-term-memory>...</long-term-memory>" },  ← PREPENDED
          { text: "now deploy it" }    ← original message unchanged
       ]}
```

The system prompt is **never touched** — this preserves the LLM provider's KV cache. Only the latest user message changes (it changes every turn anyway).

### When it refreshes

The LTM block is **cached in memory** (`cachedLTMBlock` variable). It's regenerated:

| Event | Trigger |
|-------|---------|
| Plugin startup | `initDb()` → `refreshLTMCache()` |
| New session | `chat.message` with new `sessionID` → `refreshLTMCache()` |
| `session.created` event | `event` hook → `refreshLTMCache()` |
| After compaction | `session.compacting` → consolidation → `refreshLTMCache()` |
| Manual `mem_save` | Tool execution → `refreshLTMCache()` |

Between refreshes, the same cached string is prepended to every user message. This avoids hitting SQLite on every LLM call.

### Injection during compaction

When compaction fires, the LTM block is also pushed into the **compaction context** (separate from messages):

```javascript
output.context.push(cachedLTMBlock)
```

This ensures the compacted session summary includes the agent's long-term knowledge, so it doesn't lose context about previous sessions after compaction.

---

## 5. Consolidation Engine

### Source: `consolidate.ts`

Called during the `experimental.session.compacting` hook — the "sleep cycle" that transforms raw observations into durable LTM.

### Flow

```
session.compacting fires
│
├─ 1. getObservationsBySession(db, sessionId) → Observation[]
│     (returns [] → early exit, nothing to consolidate)
│
├─ 2. resolveLLMConfig(opts)
│     Priority 1: Kortix router (KORTIX_API_URL + KORTIX_TOKEN)
│     Priority 2: Anthropic API (ANTHROPIC_API_KEY)
│     null → skip consolidation, log warning
│
├─ 3. getAllLTM(db) → existing LTM entries for dedup context
│
├─ 4. buildUserMessage(observations, existingLTM)
│     Formats up to 80 observations + up to 50 existing LTM
│     Truncates total to 12,000 chars
│
│     Example prompt:
│     ┌──────────────────────────────────────────────────────────────┐
│     │ EXISTING_LTM (do NOT duplicate — use reinforced_ids):       │
│     │   [id=1] [semantic] The API uses Express with JWT...        │
│     │   [id=3] [procedural] Deploy: bun build then docker...      │
│     │                                                              │
│     │ SESSION OBSERVATIONS (23 total):                             │
│     │   [#45] [change] Edited api.ts — Edited /src/api.ts         │
│     │         | Files: /src/api.ts | Facts: const x → const y     │
│     │   [#46] [bugfix] Edited auth.ts — Edited /src/auth.ts       │
│     │         | Files: /src/auth.ts | Facts: fix: null check       │
│     └──────────────────────────────────────────────────────────────┘
│
├─ 5. callLLM(config, CONSOLIDATION_SYSTEM, userMessage, log)
│     Calls either:
│       callOpenAICompatible() → POST {baseURL}/chat/completions
│       callAnthropicAPI()     → POST {baseURL}/v1/messages
│     Model = currentModel (from dashboard) ?? "kortix/basic" or "claude-sonnet-4-5-20250929"
│
├─ 6. parseConsolidationResponse(text)
│     Extracts JSON from response (strips markdown fences if present)
│     Validates each entry has non-empty content string
│
│     Expected JSON shape:
│     {
│       "episodic":      [{ content, context?, tags?, files?, source_observation_ids? }],
│       "semantic":      [...],
│       "procedural":    [...],
│       "reinforced_ids": [5, 12]    ← existing LTM IDs that still hold true
│     }
│
├─ 7. For each new entry: insertLTM(db, input) → SQLite + FTS5 triggers
│
├─ 8. For each reinforced_ids: reinforceLTM(db, id)
│     UPDATE confidence = MIN(1.0, confidence + 0.05)
│     UPDATE updated_at = now
│     (Confidence accumulates: each reinforcement = +0.05, capped at 1.0)
│
└─ 9. markConsolidated(db, sessionId)
      → session_meta.last_consolidated_at = now
```

### LLM Routing

| Priority | Provider | Config Source | Endpoint | Model Default |
|----------|----------|--------------|----------|---------------|
| 1 | Kortix Router | `KORTIX_API_URL` + `KORTIX_TOKEN` | `{url}/chat/completions` (OpenAI-compat) | `kortix/basic` |
| 2 | Anthropic | `ANTHROPIC_API_KEY` | `{url}/v1/messages` | `claude-sonnet-4-5-20250929` |

The `currentModel` captured from the user's dashboard selection overrides the default model for whichever provider is active.

### Consolidation System Prompt (summary)

The LLM is instructed to:
- Classify memories into episodic/semantic/procedural with strict quality criteria
- Deduplicate against existing LTM (return `reinforced_ids` instead of duplicates)
- Include file paths, command flags, error messages — vague memories are rejected
- Capture failures and user preferences as high-value
- Output pure JSON, no commentary

---

## 6. LSS Companion Files

### Source: `lss.ts`

The LSS (Local Semantic Search) system runs as a separate `lss-sync` daemon that watches `~/.lss/` directories and builds an embedding-based search index. The memory plugin writes companion markdown files so memories are also searchable via embeddings (complementing FTS5).

### File Layout

```
~/.lss/kortix-mem/
├── obs_1.md           ← observation #1
├── obs_2.md
├── obs_3.md
├── ltm_semantic_1.md  ← LTM entry #1 (semantic)
├── ltm_episodic_2.md
└── ltm_procedural_3.md
```

### Observation File Format

```markdown
# Read config.ts

Type: discovery

Read /src/config.ts

Tags: config, ts
Files: /src/config.ts
```

### LTM File Format

```markdown
# [semantic] Memory #1

The API uses Express with JWT middleware at /src/auth/

Tags: auth, express
```

LSS is optional — if the directory can't be created, observations still go to SQLite only.

---

## 7. Plugin Hooks

All 6 OpenCode plugin hooks used by `index.ts`:

| Hook | Fires When | What It Does |
|------|-----------|-------------|
| `tool.execute.before` | Before any tool runs | Caches tool args by `callID` into `pendingArgs` Map |
| `tool.execute.after` | After any tool completes | Correlates args → extracts observation → SQLite + LSS |
| `chat.message` | Each user message | Tracks session switch, increments prompt count, captures model |
| `event` | Session lifecycle events | `session.created` → init session; `session.deleted` → mark complete |
| `experimental.chat.messages.transform` | Every LLM call | Appends `<session_context>` + `<long-term-memory>` at the end of the latest user msg |
| `experimental.session.compacting` | Context window compression | Runs LLM consolidation (obs → LTM), injects LTM into compaction context |

### State tracked across hooks

```typescript
let db: Database                                      // SQLite connection
let memDir: string | null                             // LSS directory path
let currentSessionId: string | null                   // Active session
let currentModel: string | null                       // User's selected model (from dashboard)
let promptCount: number                               // Prompts in current session
let cachedLTMBlock: string                            // Cached injection string
const pendingArgs = new Map<string, Record<string, unknown>>()  // callID → args
```

---

## 8. Agent Tools

Four tools exposed to the agent:

### `mem_search` — Unified memory search

```
Args:
  query: string              — "docker deploy"
  limit?: number             — default 15
  source?: "both"|"ltm"|"observation"

Returns: formatted text with [LTM/type] and [obs/type] tagged results
Calls: unifiedSearch() (see Section 3)
```

### `mem_save` — Manual LTM persistence

```
Args:
  text: string               — "The frontend uses Next.js App Router"
  type?: "episodic"|"semantic"|"procedural"  — default "semantic"
  tags?: string              — comma-separated: "frontend,nextjs"

Returns: confirmation with ID
Side effects: insertLTM() + LSS file + refreshLTMCache()
```

### `session_list` — Browse past sessions

```
Args:
  search?: string            — title substring filter
  limit?: number             — default 20

Returns: session IDs, titles, timestamps, file change stats, storage paths
Data source: OpenCode SDK client.session.list()
```

### `session_get` — Retrieve compressed conversation

```
Args:
  session_id: string         — "ses_abc123"
  aggressiveness?: number    — 0.0-1.0 (default 0.3)

Returns: session metadata + compressed conversation + compression stats
Flow: fetch messages → formatMessages() → ttcCompress() via TTC API (bear-1.2)
Compression guide: 0.1=light, 0.3=balanced, 0.5=moderate, 0.7+=heavy
Fallback: returns uncompressed if TTC_API_KEY not set or text < 500 chars
```

---

## 9. End-to-End Data Flow

```
User types message
│
├─ chat.message hook ─────────────────────────────────────────────
│   Track session, increment prompt, capture model
│
├─ messages.transform hook ───────────────────────────────────────
│   Prepend <session_context> + <long-term-memory> to last user msg
│
├─ LLM generates response with tool calls ───────────────────────
│
│   For each tool call:
│   ├─ tool.execute.before → cache args by callID
│   ├─ [tool executes]
│   └─ tool.execute.after  → extract observation
│       ├─ Skip if tool in SKIP_TOOLS
│       ├─ Classify type (discovery/change/bugfix/feature/refactor)
│       ├─ INSERT into observations table (triggers FTS5 sync)
│       └─ Write obs_{id}.md to LSS dir
│
├─ [session continues... more messages, more tool calls] ────────
│
└─ session.compacting fires (context window pressure) ───────────
    ├─ Read all session observations from SQLite
    ├─ Read all existing LTM for dedup context
    ├─ Call LLM to consolidate observations → new LTM entries
    │   ├─ New memories: INSERT into long_term_memories + FTS5
    │   └─ Reinforcements: UPDATE confidence += 0.05 on existing LTM
    ├─ refreshLTMCache() → regenerate injection block
    └─ output.context.push(cachedLTMBlock) → feed into compaction
```
