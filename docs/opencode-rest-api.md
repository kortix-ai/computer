# OpenCode REST API Reference

Complete reference for the OpenCode server REST API. Useful for debugging sessions, inspecting tool call data structures, and understanding the data flow.

## Server Info

- **Default port**: `4096` (configurable, our sandbox uses `3111`)
- **Framework**: Hono (TypeScript) on Bun
- **Auth**: Optional HTTP Basic when `OPENCODE_SERVER_PASSWORD` is set
- **Frontend env var**: `NEXT_PUBLIC_OPENCODE_URL` (defaults to `http://localhost:4096`)

All project-scoped endpoints accept an optional `?directory=<path>` query param (or `x-opencode-directory` header).

---

## Quick Start: Debugging a Session

```bash
# List all sessions
curl -s http://localhost:3111/session | python3 -m json.tool | head -30

# Get messages for a session
curl -s http://localhost:3111/session/<SESSION_ID>/message | python3 -m json.tool

# Parse tool parts from a session
curl -s http://localhost:3111/session/<SESSION_ID>/message | python3 -c "
import sys, json
for msg in json.load(sys.stdin):
    for p in msg.get('parts', []):
        if p.get('type') == 'tool':
            tool = p.get('tool', '')
            status = p.get('state', {}).get('status', '')
            print(f'{tool} | {status} | keys: {list(p[\"state\"].get(\"input\",{}).keys())}')
"

# Get session statuses (all at once)
curl -s http://localhost:3111/session/status | python3 -m json.tool

# Health check
curl -s http://localhost:3111/global/health
```

---

## Endpoints

### Session

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/session` | List sessions. Query: `?start=&search=&limit=` |
| `POST` | `/session` | Create session. Body: `{ parentID?, title? }` |
| `GET` | `/session/status` | All session statuses → `Record<string, SessionStatus>` |
| `GET` | `/session/:id` | Get session info |
| `DELETE` | `/session/:id` | Delete session |
| `PATCH` | `/session/:id` | Update session. Body: `{ title? }` |
| `GET` | `/session/:id/children` | Get child sessions |
| `GET` | `/session/:id/todo` | Get session todos |
| `GET` | `/session/:id/message` | **Get all messages with parts** |
| `GET` | `/session/:id/message/:msgId` | Get specific message |
| `POST` | `/session/:id/message` | Send message (sync streaming) |
| `POST` | `/session/:id/prompt_async` | Send message (async fire-and-forget) |
| `POST` | `/session/:id/abort` | Abort active session |
| `POST` | `/session/:id/fork` | Fork session at message |
| `POST` | `/session/:id/revert` | Revert message |
| `GET` | `/session/:id/diff` | File diff. Query: `?messageID=` |

### Permission & Question

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/permission` | List pending permissions |
| `POST` | `/permission/:requestID/reply` | Reply: `{ reply: "once"|"always"|"reject" }` |
| `GET` | `/question` | List pending questions |
| `POST` | `/question/:requestID/reply` | Reply: `{ answers: string[][] }` |
| `POST` | `/question/:requestID/reject` | Reject question |

### File & Search

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/find` | Ripgrep search. Query: `?pattern=` |
| `GET` | `/find/file` | Find files. Query: `?query=&limit=` |
| `GET` | `/file` | List directory. Query: `?path=` |
| `GET` | `/file/content` | Read file. Query: `?path=` |
| `GET` | `/file/status` | Git status of all files |

### PTY (Pseudo-Terminal)

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/pty` | List PTY sessions |
| `POST` | `/pty` | Create PTY. Body: `{ command?, args?, cwd? }` |
| `GET` | `/pty/:id` | Get PTY session |
| `DELETE` | `/pty/:id` | Remove/terminate PTY |
| `GET` (WS) | `/pty/:id/connect` | WebSocket connect to PTY |

### Config & Project

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/config` | Get project config |
| `PATCH` | `/config` | Update project config |
| `GET` | `/config/providers` | List providers + defaults |
| `GET` | `/project` | List all projects |
| `GET` | `/project/current` | Get current project |

### MCP

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/mcp` | Get MCP server statuses |
| `POST` | `/mcp` | Add MCP server |
| `POST` | `/mcp/:name/connect` | Connect MCP server |
| `POST` | `/mcp/:name/disconnect` | Disconnect MCP server |

### Global (no directory param needed)

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/global/health` | Health check → `{ healthy, version }` |
| `GET` | `/global/event` | **SSE** global event stream |
| `GET` | `/global/config` | Get global config |

### Miscellaneous

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/event` | **SSE** project event stream |
| `GET` | `/path` | Path info → `{ home, state, config, directory }` |
| `GET` | `/vcs` | Git info → `{ branch }` |
| `GET` | `/command` | List available commands |
| `GET` | `/agent` | List agents |
| `GET` | `/skill` | List skills |
| `GET` | `/doc` | OpenAPI spec (auto-generated) |
| `GET` | `/experimental/tool/ids` | List all tool IDs |
| `GET` | `/experimental/tool` | List tools with schemas |

---

## SSE Events

### Project-scoped: `GET /event`

Connect and receive real-time updates for the project.

**Initial event:** `{ type: "server.connected" }`
**Heartbeat (30s):** `{ type: "server.heartbeat" }`

Key event types:
- `message.updated` — full message info
- `message.part.updated` — individual part update (tool status change, text streaming)
- `message.part.removed` — part deleted
- `session.created` / `session.updated` / `session.deleted`
- `session.status` — `{ sessionID, status }`
- `permission.asked` / `permission.replied`
- `question.asked` / `question.replied` / `question.rejected`
- `todo.updated` — `{ sessionID, todos }`

### Global: `GET /global/event`

Cross-project events wrapped with `{ directory, payload: { type, properties } }`.

---

## Data Structures

### Message with Parts

```typescript
interface MessageWithParts {
  info: {
    id: string;
    sessionID: string;
    role: "user" | "assistant";
    parentID?: string;      // assistant msg links to parent user msg
    agent?: string;
    model?: { providerID: string; modelID: string };
    error?: string;         // set if assistant errored
  };
  parts: Part[];
}
```

### Part Types

```typescript
type Part =
  | { type: "text"; text: string; synthetic?: boolean }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: string; callID: string; state: ToolState }
  | { type: "file"; mime: string; url: string; filename?: string }
  | { type: "step-start" }
  | { type: "step-finish"; cost?: number; tokens?: TokenInfo }
  | { type: "agent"; name: string }
```

### ToolState

```typescript
type ToolState =
  | { status: "pending"; input?: Record<string, any> }
  | { status: "running"; input: Record<string, any>; metadata?: any; time?: { start: number } }
  | { status: "completed"; input: Record<string, any>; output: string; metadata?: any; title?: string; time?: { start: number; end: number } }
  | { status: "error"; input?: Record<string, any>; error: string; time?: { start: number; end: number } }
```

### Session

```typescript
interface Session {
  id: string;
  title: string;
  directory: string;
  parentID?: string;        // set for sub-sessions (task agent)
  time: { created: number; updated: number; archived?: number };
  share?: { url: string; id: string };
}
```

---

## MCP Tool Part Examples

Tools called via MCP servers (web-search, presentation-gen, image-gen, etc.) come through as regular tool parts. The `tool` field is the MCP tool name, and `state.input` contains the arguments.

### websearch

```json
{
  "type": "tool",
  "tool": "websearch",
  "callID": "call_function_o0cri4lo2v3m_1",
  "state": {
    "status": "completed",
    "input": {
      "query": "Marko Kraemer"
    },
    "output": "Title: Marko O. Kraemer - CEO @ Kortix\nAuthor: ...\nURL: https://linkedin.com/in/markokraemer\nText: ...\n\nTitle: Marko Kraemer - GitHub\nAuthor: \nURL: https://github.com/markokraemer\nText: ...",
    "title": "Web search: Marko Kraemer",
    "metadata": { "truncated": false },
    "time": { "start": 1770840218991, "end": 1770840224573 }
  }
}
```

Output format: Newline-separated blocks with `Title:`, `Author:`, `URL:`, `Published Date:`, `Text:` fields.

### presentation-gen (create_slide)

```json
{
  "type": "tool",
  "tool": "presentation-gen",
  "state": {
    "status": "completed",
    "input": {
      "action": "create_slide",
      "presentation_name": "marko-kraemer",
      "presentation_title": "Marko Kraemer - AI Visionary",
      "slide_title": "Marko Kraemer",
      "content": "# Marko Kraemer\n\n## CEO & Founder at Kortix",
      "slide_number": 1
    },
    "output": "{\"success\":true,\"action\":\"create_slide\",\"presentation_name\":\"marko-kraemer\",\"presentation_path\":\"presentations/marko-kraemer\",\"slide_number\":1,\"slide_title\":\"Marko Kraemer\",\"slide_file\":\"presentations/marko-kraemer/slide_01.html\",\"total_slides\":1}"
  }
}
```

### presentation-gen (preview)

```json
{
  "type": "tool",
  "tool": "presentation-gen",
  "state": {
    "status": "completed",
    "input": {
      "action": "preview",
      "presentation_name": "marko-kraemer"
    },
    "output": "{\"success\":true,\"action\":\"preview\",\"presentation_name\":\"marko-kraemer\",\"viewer_url\":\"http://localhost:3210\",\"viewer_file\":\"presentations/marko-kraemer/viewer.html\",\"message\":\"Preview server started at http://localhost:3210\"}"
  }
}
```

### presentation-gen (error)

```json
{
  "type": "tool",
  "tool": "presentation-gen",
  "state": {
    "status": "completed",
    "input": {
      "action": "create_slide",
      "presentation_name": "marko-kraemer",
      "presentation_title": "..."
    },
    "output": "{\"success\":false,\"error\":\"slide_number must be >= 1\"}"
  }
}
```

Note: presentation-gen errors come back as `status: "completed"` with `success: false` in the JSON output, not as `status: "error"`.
