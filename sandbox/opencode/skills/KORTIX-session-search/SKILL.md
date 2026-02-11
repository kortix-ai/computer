---
name: kortix-session-search
description: "Complete session search and management for OpenCode. Covers API endpoints, on-disk JSON storage, deterministic file queries (grep, ripgrep, jq, date filtering), semantic search via LSS, session lifecycle, and data schemas. Use whenever you need to find, inspect, query, filter, or manage OpenCode sessions — by title, content, date, cost, agent, status, or meaning."
---

# Session Search & Handling

You have **full access** to OpenCode's session data — both through the REST API and directly on disk. This skill teaches you every method for finding, querying, filtering, and managing sessions.

## Architecture Overview

OpenCode stores all session data as **individual JSON files** in a structured directory tree under:

```
/config/.local/share/opencode/storage/
```

The REST API at `http://localhost:3111` provides higher-level access to the same data. Both methods have tradeoffs — the API is simpler for basic CRUD, but direct file access lets you do powerful queries (grep, jq, date filters, regex) that the API can't.

---

## 1. On-Disk Storage Layout

```
/config/.local/share/opencode/storage/
├── migration                          # Version marker (currently "2")
├── project/
│   └── global.json                    # Project metadata
├── session/
│   └── global/
│       └── ses_{id}.json              # Session metadata (one file per session)
├── session_diff/
│   └── ses_{id}.json                  # File diffs per session (usually [])
├── message/
│   └── ses_{id}/                      # Directory per session
│       └── msg_{id}.json              # Message metadata (one file per message)
├── part/
│   └── msg_{id}/                      # Directory per message
│       └── prt_{id}.json              # Content parts (text, tools, reasoning)
├── todo/
│   └── ses_{id}.json                  # Todo lists per session
└── session_share/                     # Shared session data (usually empty)
```

**Other important locations:**

| Path | Contents |
|------|----------|
| `/config/.local/share/opencode/tool-output/tool_{id}` | Large tool outputs (plain text, 60-230KB each) |
| `/config/.local/share/opencode/log/` | Timestamped structured logs |
| `/config/.local/share/opencode/snapshot/global/` | Bare git repo for file snapshots |
| `/config/.local/share/opencode/bin/rg` | Bundled ripgrep binary |
| `/config/.local/state/opencode/prompt-history.jsonl` | JSONL of all prompts ever entered |

### ID Format

All IDs follow: `{prefix}_{hex-timestamp}{random-suffix}`

| Entity | Prefix | Example |
|--------|--------|---------|
| Session | `ses_` | `ses_3c077220affeH63Puu4UvaAgJm` |
| Message | `msg_` | `msg_c3f88de24001K9micndkF0GLsp` |
| Part | `prt_` | `prt_c3f88de25001CLJ8yDleyTypqP` |
| Tool output | `tool_` | `tool_c3aca2b70001xLkTb5ypHFDn8H` |

The hex portion encodes a creation timestamp — IDs sort chronologically.

---

## 2. Data Schemas

### 2a. Session File (`storage/session/global/ses_{id}.json`)

```json
{
  "id": "ses_3c077220affeH63Puu4UvaAgJm",
  "slug": "witty-engine",
  "version": "1.1.53",
  "projectID": "global",
  "directory": "/config/Desktop",
  "title": "Voice Proxy",
  "parentID": "ses_...",              // OPTIONAL — present for subagent sessions
  "permission": [                     // OPTIONAL — permission overrides for subagents
    { "permission": "todowrite", "action": "deny", "pattern": "*" }
  ],
  "time": {
    "created": 1770592460277,         // Unix milliseconds
    "updated": 1770592476844
  },
  "summary": {
    "additions": 0,
    "deletions": 0,
    "files": 0
  }
}
```

### 2b. Message File (`storage/message/ses_{id}/msg_{id}.json`)

**User message:**
```json
{
  "id": "msg_...",
  "sessionID": "ses_...",
  "role": "user",
  "time": { "created": 1770592460324 },
  "summary": { "title": "Current sessions running inquiry", "diffs": [] },
  "agent": "kortix-proxy",
  "model": { "providerID": "openai", "modelID": "gpt-5.2-chat-latest" }
}
```

**Assistant message:**
```json
{
  "id": "msg_...",
  "sessionID": "ses_...",
  "role": "assistant",
  "time": { "created": 1770592460404, "completed": 1770592463202 },
  "parentID": "msg_...",             // Links to the user message it answers
  "modelID": "gpt-5.2-chat-latest",
  "providerID": "openai",
  "mode": "kortix-proxy",
  "agent": "kortix-proxy",
  "path": { "cwd": "/config/Desktop", "root": "/" },
  "cost": 0.00323715,               // USD cost
  "tokens": {
    "input": 93,
    "output": 26,
    "reasoning": 0,
    "cache": { "read": 15488, "write": 0 }
  },
  "finish": "stop"                   // "stop" or "tool-calls"
}
```

### 2c. Part File (`storage/part/msg_{id}/prt_{id}.json`)

Parts hold the actual content. Each message has 1+ parts.

**Text part:**
```json
{
  "id": "prt_...", "sessionID": "ses_...", "messageID": "msg_...",
  "type": "text",
  "text": "The actual text content here",
  "time": { "start": 1770592465053, "end": 1770592465053 },
  "metadata": { "openai": { "itemId": "msg_..." } }
}
```

**Tool part:**
```json
{
  "id": "prt_...", "sessionID": "ses_...", "messageID": "msg_...",
  "type": "tool",
  "callID": "call_GfLOPqNzhoo...",
  "tool": "session-list",
  "state": {
    "status": "completed",
    "input": { "limit": 15, "filter": "all" },
    "output": "{...}",
    "title": "",
    "metadata": { "truncated": false },
    "time": { "start": 1770592461000, "end": 1770592462000 }
  }
}
```

**Other part types:** `step-start`, `step-finish` (with cost/tokens), `reasoning` (with encrypted content)

### 2d. Todo File (`storage/todo/ses_{id}.json`)

```json
[
  { "id": "1", "content": "Phase 1: Brand Discovery", "status": "completed", "priority": "high" },
  { "id": "2", "content": "Generate symbol variations", "status": "pending", "priority": "medium" }
]
```

Status values: `completed`, `pending`, `cancelled`  
Priority values: `high`, `medium`, `low`

---

## 3. REST API Reference

Base URL: `http://localhost:3111`

### Session Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/session` | List all sessions (newest first) |
| `POST` | `/session` | Create session. Body: `{"title":"..."}` |
| `GET` | `/session/{id}` | Get single session |
| `PATCH` | `/session/{id}` | Update session (e.g. title). Body: `{"title":"..."}` |
| `DELETE` | `/session/{id}` | Delete session permanently |
| `GET` | `/session/status` | Global map of busy sessions `{ses_id: {...}}` |
| `GET` | `/session/{id}/message` | All messages with parts for a session |
| `POST` | `/session/{id}/message` | Send message (synchronous — blocks until response) |
| `POST` | `/session/{id}/prompt_async` | Send prompt (fire-and-forget, returns 204 immediately) |
| `GET` | `/session/{id}/children` | List child/subagent sessions |
| `POST` | `/session/{id}/abort` | Abort running session |
| `POST` | `/session/{id}/share` | Create share link |

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/config` | Full config (agents, commands, keybinds, MCP) |
| `GET` | `/agent` | List all agents with descriptions and prompts |
| `GET` | `/provider` | Provider configs, models, costs |
| `GET` | `/skill` | All skills with full content |
| `GET` | `/permission` | Pending permission requests |
| `GET` | `/project` | Project definitions |
| `GET` | `/event` | SSE stream of real-time events |
| `GET` | `/experimental/tool/ids` | List all tool IDs |
| `GET` | `/experimental/tool?provider=X&model=Y` | Full tool definitions |

### API Response Format

Messages from `GET /session/{id}/message` return:
```json
[
  {
    "info": { "id": "msg_...", "role": "user", "time": {...}, ... },
    "parts": [
      { "type": "text", "text": "..." },
      { "type": "tool", "tool": "bash", "state": { "status": "completed", "output": "..." } }
    ]
  }
]
```

### SSE Event Stream (`GET /event`)

Events are `data:` lines (no `event:` prefix). Parse the JSON to get the type:

```
data: {"type":"session.status","properties":{"sessionID":"ses_...","status":{"type":"busy"}}}
data: {"type":"message.updated","properties":{"info":{"id":"msg_...","role":"assistant",...}}}
data: {"type":"message.part.updated","properties":{"part":{"type":"text",...},"delta":"word "}}
data: {"type":"session.idle","properties":{"sessionID":"ses_..."}}
```

Event types: `server.connected`, `session.status`, `session.idle`, `session.updated`, `message.updated`, `message.part.updated`, `session.diff`, `file.edited`, `command.executed`

The `sessionID` can appear in 3 places depending on event type:
- `properties.sessionID`
- `properties.part.sessionID`
- `properties.info.sessionID`

---

## 4. Deterministic Query Methods

### 4a. Find Sessions by Title (grep/ripgrep)

```bash
# Find all sessions with "research" in the title
rg -l '"title".*research' /config/.local/share/opencode/storage/session/global/ -i

# Find sessions by exact title
rg '"title":"Voice Proxy"' /config/.local/share/opencode/storage/session/global/

# Find sessions by agent/mode
rg '"agent":"kortix-research"' /config/.local/share/opencode/storage/message/ -r -l

# Find sessions that used a specific tool
rg '"tool":"web-search"' /config/.local/share/opencode/storage/part/ -r -l

# Find sessions with subagents (have parentID)
rg '"parentID"' /config/.local/share/opencode/storage/session/global/

# Find child sessions of a specific parent
rg '"parentID":"ses_PARENT_ID_HERE"' /config/.local/share/opencode/storage/session/global/
```

### 4b. Find Sessions by Date

Session timestamps are Unix milliseconds in the JSON. Convert dates for filtering:

```bash
# Get current timestamp in ms
date +%s000

# Sessions created today (compare time.created)
TODAY_START=$(date -d "today 00:00:00" +%s000 2>/dev/null || date -j -f "%Y-%m-%d" "$(date +%Y-%m-%d)" +%s000)
for f in /config/.local/share/opencode/storage/session/global/ses_*.json; do
  created=$(cat "$f" | python3 -c "import json,sys; print(json.load(sys.stdin)['time']['created'])" 2>/dev/null)
  if [ "$created" -gt "$TODAY_START" ] 2>/dev/null; then
    echo "$f: created=$created"
    cat "$f" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'  {d[\"id\"]} | {d[\"title\"]}')"
  fi
done

# Sessions created in the last N hours
python3 -c "
import json, glob, time, sys
hours = int(sys.argv[1]) if len(sys.argv) > 1 else 24
cutoff = (time.time() - hours * 3600) * 1000
for f in sorted(glob.glob('/config/.local/share/opencode/storage/session/global/ses_*.json')):
    with open(f) as fh:
        d = json.load(fh)
    if d['time']['created'] > cutoff:
        age_h = (time.time()*1000 - d['time']['created']) / 3600000
        print(f'{d[\"id\"]} | {d[\"title\"]:50s} | {age_h:.1f}h ago')
" 24

# Sessions updated in the last hour (recently active)
python3 -c "
import json, glob, time
cutoff = (time.time() - 3600) * 1000
for f in sorted(glob.glob('/config/.local/share/opencode/storage/session/global/ses_*.json')):
    with open(f) as fh:
        d = json.load(fh)
    if d['time']['updated'] > cutoff:
        print(f'{d[\"id\"]} | {d[\"title\"]}')
"
```

### 4c. Find Sessions by Cost

```bash
# Sum total cost across all messages in a session
python3 -c "
import json, glob, sys
session_id = sys.argv[1]
total = 0
for f in glob.glob(f'/config/.local/share/opencode/storage/message/{session_id}/msg_*.json'):
    with open(f) as fh:
        d = json.load(fh)
    total += d.get('cost', 0)
print(f'Total cost for {session_id}: \${total:.4f}')
" ses_SESSION_ID_HERE

# Top 10 most expensive sessions
python3 -c "
import json, glob, os
sessions = {}
for f in glob.glob('/config/.local/share/opencode/storage/message/ses_*/msg_*.json'):
    with open(f) as fh:
        d = json.load(fh)
    sid = d.get('sessionID', '')
    sessions[sid] = sessions.get(sid, 0) + d.get('cost', 0)

# Get titles
for sid in sessions:
    sf = f'/config/.local/share/opencode/storage/session/global/{sid}.json'
    if os.path.exists(sf):
        with open(sf) as fh:
            sessions[sid] = (sessions[sid], json.load(fh).get('title', ''))
    else:
        sessions[sid] = (sessions[sid], '???')

for sid, (cost, title) in sorted(sessions.items(), key=lambda x: -x[1][0])[:10]:
    print(f'\${cost:.4f} | {title:50s} | {sid}')
"
```

### 4d. Find Sessions by Content (what the agent actually said/did)

```bash
# Search across all text parts for a keyword
rg "landing page" /config/.local/share/opencode/storage/part/ -r -l --type json

# Find which session a part belongs to (trace back)
python3 -c "
import json
# Given a part file, trace back to its session
with open('/config/.local/share/opencode/storage/part/msg_XXX/prt_YYY.json') as f:
    part = json.load(f)
print(f'Session: {part[\"sessionID\"]}')
print(f'Message: {part[\"messageID\"]}')
"

# Search tool outputs for specific content
rg "error\|failed\|exception" /config/.local/share/opencode/storage/tool-output/ -i -l

# Find all bash commands executed in a session
python3 -c "
import json, glob, sys
session_id = sys.argv[1]
# Find all messages in this session
for mf in sorted(glob.glob(f'/config/.local/share/opencode/storage/message/{session_id}/msg_*.json')):
    with open(mf) as fh:
        msg = json.load(fh)
    msg_id = msg['id']
    # Find tool parts for this message
    for pf in sorted(glob.glob(f'/config/.local/share/opencode/storage/part/{msg_id}/prt_*.json')):
        with open(pf) as fh:
            part = json.load(fh)
        if part.get('type') == 'tool' and part.get('tool') == 'bash':
            state = part.get('state', {})
            inp = state.get('input', {})
            cmd = inp.get('command', '')
            print(f'$ {cmd}')
" ses_SESSION_ID_HERE
```

### 4e. Find Messages by Token Usage

```bash
# Find the most token-heavy messages across all sessions
python3 -c "
import json, glob
results = []
for f in glob.glob('/config/.local/share/opencode/storage/message/ses_*/msg_*.json'):
    with open(f) as fh:
        d = json.load(fh)
    tokens = d.get('tokens', {})
    total = tokens.get('input', 0) + tokens.get('output', 0) + tokens.get('reasoning', 0)
    if total > 0:
        results.append((total, d.get('sessionID', ''), d.get('id', ''), d.get('agent', '')))
for total, sid, mid, agent in sorted(results, reverse=True)[:15]:
    print(f'{total:8d} tokens | {agent:20s} | {sid} | {mid}')
"
```

### 4f. List All Tools Used in a Session

```bash
python3 -c "
import json, glob, sys
from collections import Counter
session_id = sys.argv[1]
tools = Counter()
for mf in glob.glob(f'/config/.local/share/opencode/storage/message/{session_id}/msg_*.json'):
    with open(mf) as fh:
        msg = json.load(fh)
    for pf in glob.glob(f'/config/.local/share/opencode/storage/part/{msg[\"id\"]}/prt_*.json'):
        with open(pf) as fh:
            part = json.load(fh)
        if part.get('type') == 'tool':
            tools[part.get('tool', 'unknown')] += 1
for tool, count in tools.most_common():
    print(f'{count:4d}x {tool}')
" ses_SESSION_ID_HERE
```

---

## 5. Semantic Search with LSS

For meaning-based queries — when you don't know the exact keywords — use Local Semantic Search (`lss`). It combines BM25 full-text + OpenAI embedding similarity.

### Search Session Content Semantically

Session JSON files aren't directly indexed by LSS (it indexes Desktop files and memory). But you can use LSS on any outputs that were saved to disk:

```bash
# Search Desktop for session outputs (agents write results here)
lss "landing page with dark theme" -p /config/Desktop -k 10 --json

# Search agent memory for session-related knowledge
lss "what sessions were created for research tasks" -p /config/workspace/.kortix/ -k 5 --json

# Search a specific project directory an agent built
lss "authentication middleware" -p /config/Desktop/myproject/ -k 5 --json
```

### Index Session Data for Semantic Search

To make session content searchable by meaning, you can index it:

```bash
# Index all session titles (create a searchable index file)
python3 -c "
import json, glob
with open('/tmp/session-index.txt', 'w') as out:
    for f in sorted(glob.glob('/config/.local/share/opencode/storage/session/global/ses_*.json')):
        with open(f) as fh:
            d = json.load(fh)
        out.write(f'{d[\"id\"]} | {d[\"title\"]}\n')
print('Written to /tmp/session-index.txt')
"
lss index /tmp/session-index.txt
lss "voice interface development" -p /tmp -k 5 --json

# Index all assistant text outputs for a session
python3 -c "
import json, glob, sys
session_id = sys.argv[1]
with open(f'/tmp/{session_id}-texts.txt', 'w') as out:
    for mf in sorted(glob.glob(f'/config/.local/share/opencode/storage/message/{session_id}/msg_*.json')):
        with open(mf) as fh:
            msg = json.load(fh)
        if msg.get('role') != 'assistant':
            continue
        for pf in sorted(glob.glob(f'/config/.local/share/opencode/storage/part/{msg[\"id\"]}/prt_*.json')):
            with open(pf) as fh:
                part = json.load(fh)
            if part.get('type') == 'text' and part.get('text'):
                out.write(part['text'] + '\n---\n')
print(f'Written to /tmp/{session_id}-texts.txt')
" ses_SESSION_ID_HERE
```

### Combine Semantic + Deterministic

Best results come from combining both:

```bash
# Step 1: Semantic search to find relevant files/content
lss "database migration strategy" -p /config/Desktop -k 5 --json

# Step 2: Deterministic grep for exact matches in those files
rg "migration" /config/Desktop/project/src/ -l

# Step 3: Check which sessions created those files
rg "project/src" /config/.local/share/opencode/storage/part/ -r -l --type json
```

---

## 6. Comprehensive Session Query Script

This all-in-one Python script handles the most common query patterns:

```bash
# Save as /tmp/session-query.py and run with: python3 /tmp/session-query.py <command> [args]

python3 << 'PYEOF'
import json, glob, os, sys, time
from collections import Counter
from datetime import datetime

STORAGE = "/config/.local/share/opencode/storage"
SESSION_DIR = f"{STORAGE}/session/global"
MESSAGE_DIR = f"{STORAGE}/message"
PART_DIR = f"{STORAGE}/part"
TODO_DIR = f"{STORAGE}/todo"

def load_json(path):
    with open(path) as f:
        return json.load(f)

def all_sessions():
    results = []
    for f in glob.glob(f"{SESSION_DIR}/ses_*.json"):
        results.append(load_json(f))
    return sorted(results, key=lambda s: s["time"]["created"], reverse=True)

def fmt_age(ms):
    secs = (time.time() * 1000 - ms) / 1000
    if secs < 60: return f"{int(secs)}s"
    if secs < 3600: return f"{int(secs/60)}m"
    if secs < 86400: return f"{int(secs/3600)}h"
    return f"{int(secs/86400)}d"

def cmd_list(args):
    """List all sessions with optional title filter"""
    query = " ".join(args).lower() if args else ""
    for s in all_sessions():
        if query and query not in s["title"].lower():
            continue
        parent = " [child]" if s.get("parentID") else ""
        print(f'{s["id"]} | {s["title"]:50s} | {fmt_age(s["time"]["created"])} ago{parent}')

def cmd_recent(args):
    """Sessions from the last N hours (default 24)"""
    hours = int(args[0]) if args else 24
    cutoff = (time.time() - hours * 3600) * 1000
    for s in all_sessions():
        if s["time"]["created"] > cutoff:
            print(f'{s["id"]} | {s["title"]:50s} | {fmt_age(s["time"]["created"])} ago')

def cmd_cost(args):
    """Top sessions by cost"""
    limit = int(args[0]) if args else 10
    costs = {}
    for f in glob.glob(f"{MESSAGE_DIR}/ses_*/msg_*.json"):
        d = load_json(f)
        sid = d.get("sessionID", "")
        costs[sid] = costs.get(sid, 0) + d.get("cost", 0)
    titles = {}
    for s in all_sessions():
        titles[s["id"]] = s["title"]
    for sid, cost in sorted(costs.items(), key=lambda x: -x[1])[:limit]:
        print(f'${cost:.4f} | {titles.get(sid, "???"):50s} | {sid}')

def cmd_tools(args):
    """Tools used in a session"""
    if not args:
        print("Usage: tools <session_id>"); return
    sid = args[0]
    tools = Counter()
    for mf in glob.glob(f"{MESSAGE_DIR}/{sid}/msg_*.json"):
        msg = load_json(mf)
        for pf in glob.glob(f"{PART_DIR}/{msg['id']}/prt_*.json"):
            part = load_json(pf)
            if part.get("type") == "tool":
                tools[part.get("tool", "?")] += 1
    for tool, count in tools.most_common():
        print(f"{count:4d}x {tool}")

def cmd_text(args):
    """All text output from a session"""
    if not args:
        print("Usage: text <session_id>"); return
    sid = args[0]
    for mf in sorted(glob.glob(f"{MESSAGE_DIR}/{sid}/msg_*.json")):
        msg = load_json(mf)
        role = msg.get("role", "?")
        for pf in sorted(glob.glob(f"{PART_DIR}/{msg['id']}/prt_*.json")):
            part = load_json(pf)
            if part.get("type") == "text" and part.get("text"):
                print(f"\n--- [{role}] ---")
                print(part["text"][:2000])

def cmd_children(args):
    """Find all child sessions of a parent"""
    if not args:
        print("Usage: children <session_id>"); return
    pid = args[0]
    for s in all_sessions():
        if s.get("parentID") == pid:
            print(f'{s["id"]} | {s["title"]:50s} | {fmt_age(s["time"]["created"])} ago')

def cmd_agents(args):
    """Count sessions by agent"""
    agents = Counter()
    for f in glob.glob(f"{MESSAGE_DIR}/ses_*/msg_*.json"):
        d = load_json(f)
        if d.get("role") == "assistant":
            agents[d.get("agent", "unknown")] += 1
    for agent, count in agents.most_common():
        print(f"{count:4d} messages | {agent}")

def cmd_search(args):
    """Search text parts for a keyword"""
    if not args:
        print("Usage: search <keyword>"); return
    keyword = " ".join(args).lower()
    seen_sessions = set()
    for pf in glob.glob(f"{PART_DIR}/msg_*/prt_*.json"):
        part = load_json(pf)
        if part.get("type") == "text" and keyword in (part.get("text", "")).lower():
            sid = part.get("sessionID", "")
            if sid not in seen_sessions:
                seen_sessions.add(sid)
                sf = f"{SESSION_DIR}/{sid}.json"
                title = load_json(sf)["title"] if os.path.exists(sf) else "???"
                snippet = part["text"][:200].replace("\n", " ")
                print(f'{sid} | {title}')
                print(f'  ...{snippet}...')

def cmd_stats(args):
    """Overall statistics"""
    sessions = all_sessions()
    msg_count = len(glob.glob(f"{MESSAGE_DIR}/ses_*/msg_*.json"))
    part_count = len(glob.glob(f"{PART_DIR}/msg_*/prt_*.json"))
    total_cost = sum(
        load_json(f).get("cost", 0)
        for f in glob.glob(f"{MESSAGE_DIR}/ses_*/msg_*.json")
    )
    children = sum(1 for s in sessions if s.get("parentID"))
    print(f"Sessions:     {len(sessions)} ({children} children)")
    print(f"Messages:     {msg_count}")
    print(f"Parts:        {part_count}")
    print(f"Total cost:   ${total_cost:.2f}")
    if sessions:
        oldest = min(s["time"]["created"] for s in sessions)
        print(f"Oldest:       {datetime.fromtimestamp(oldest/1000).isoformat()}")
        newest = max(s["time"]["created"] for s in sessions)
        print(f"Newest:       {datetime.fromtimestamp(newest/1000).isoformat()}")

commands = {
    "list": cmd_list, "recent": cmd_recent, "cost": cmd_cost,
    "tools": cmd_tools, "text": cmd_text, "children": cmd_children,
    "agents": cmd_agents, "search": cmd_search, "stats": cmd_stats,
}

if len(sys.argv) < 2 or sys.argv[1] not in commands:
    print("Commands: " + ", ".join(commands.keys()))
    sys.exit(1)

commands[sys.argv[1]](sys.argv[2:])
PYEOF
```

---

## 7. Quick Reference — Common Tasks

### "What's running right now?"
```bash
curl -s http://localhost:3111/session/status | python3 -m json.tool
```

### "List recent sessions"
```bash
curl -s http://localhost:3111/session | python3 -c "
import json,sys
for s in json.load(sys.stdin)[:15]:
    print(f'{s[\"id\"]} | {s[\"title\"]}')"
```

### "What did session X do?"
```bash
curl -s "http://localhost:3111/session/SESSION_ID/message" | python3 -c "
import json,sys
for m in json.load(sys.stdin):
    role = m['info']['role']
    for p in m['parts']:
        if p['type'] == 'text':
            print(f'[{role}] {p[\"text\"][:300]}')"
```

### "Find sessions about topic X"
```bash
# Deterministic (exact match)
rg -i "topic" /config/.local/share/opencode/storage/session/global/ -l

# Semantic (meaning match)
lss "topic description" -p /config/Desktop -k 10 --json
```

### "How much did I spend today?"
```bash
python3 -c "
import json, glob, time
cutoff = (time.time() - 86400) * 1000
total = 0
for f in glob.glob('/config/.local/share/opencode/storage/message/ses_*/msg_*.json'):
    with open(f) as fh:
        d = json.load(fh)
    if d['time']['created'] > cutoff:
        total += d.get('cost', 0)
print(f'Last 24h cost: \${total:.4f}')
"
```

### "Delete old sessions"
```bash
# Via API (safe — also cleans up messages/parts)
curl -s -X DELETE "http://localhost:3111/session/SESSION_ID"

# Bulk delete sessions older than 7 days
python3 -c "
import json, glob, time, subprocess
cutoff = (time.time() - 7 * 86400) * 1000
for f in glob.glob('/config/.local/share/opencode/storage/session/global/ses_*.json'):
    with open(f) as fh:
        d = json.load(fh)
    if d['time']['created'] < cutoff:
        sid = d['id']
        r = subprocess.run(['curl', '-s', '-X', 'DELETE', f'http://localhost:3111/session/{sid}'])
        print(f'Deleted {sid} | {d[\"title\"]}')
"
```

---

## 8. Session Lifecycle

```
CREATE (POST /session)
  │
  ├── PROMPT (POST /session/{id}/prompt_async)     ← fire-and-forget
  │     │
  │     ├── status: busy  (GET /session/status shows it)
  │     │     │
  │     │     ├── Tool calls happen (parts with type:"tool")
  │     │     ├── Text generated (parts with type:"text")
  │     │     ├── Subagents may spawn (children with parentID)
  │     │     │
  │     │     └── finish: "stop" or "tool-calls"
  │     │
  │     └── status: idle  (session.idle SSE event)
  │
  ├── PROMPT again (same session, new conversation turn)
  │
  ├── ABORT (POST /session/{id}/abort)   ← stops current work
  │
  └── DELETE (DELETE /session/{id})      ← permanent removal
```

### Status Transitions

- **idle** → `prompt_async` → **busy** → completes → **idle**
- **busy** → `abort` → **idle** (aborted)
- Any state → `DELETE` → gone

### Subagent Spawning

When an agent uses the `task` tool, OpenCode creates a child session:
- Child session has `parentID` pointing to parent
- Child may have restricted `permission` (e.g. deny `todowrite`)
- Use `GET /session/{id}/children` or grep `parentID` in session files
- Children are independent sessions — they can be queried/aborted separately

---

## 9. Tips & Gotchas

1. **API has no search/filter params** — `GET /session` returns ALL sessions. Filter client-side or use file grep.
2. **Messages endpoint returns all messages** — No pagination. For large sessions, reading files directly is faster.
3. **Part files are the largest data** — 58MB+ across all sessions. The `text` and `tool.state.output` fields hold the bulk.
4. **Tool outputs over ~50KB** are stored separately in `tool-output/tool_{id}` as plain text, referenced by ID.
5. **Timestamps are Unix milliseconds** — divide by 1000 for Python `time.time()` comparisons.
6. **Session IDs sort chronologically** — the hex portion of the ID encodes creation time.
7. **The bundled ripgrep is at** `/config/.local/share/opencode/bin/rg` — use it for fast searches if system `rg` isn't available.
8. **Prompt history** (all prompts ever entered) is at `/config/.local/state/opencode/prompt-history.jsonl`.
9. **The `POST /session/{id}/message` endpoint is synchronous** — it blocks until the full response is generated. Use `prompt_async` for fire-and-forget.
10. **CORS is enabled** — the API accepts requests from any origin with GET/POST/PUT/PATCH/DELETE.
