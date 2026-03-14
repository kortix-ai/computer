---
name: channels
description: "Kortix Channels system — bidirectional bridges between Slack, Telegram, Discord, and OpenCode sessions. Covers: full architecture, how the agent knows it's running via a channel, session tracking/awareness, outbound messaging CLI (channels-send), REST API reference, DB schema, and adapter credentials. Load this skill when: you need to send a proactive message to a Slack/Telegram/Discord channel, you want to query which sessions were triggered via channels, you are building or debugging a channel integration, or you need to understand the full message flow."
---

# Kortix Channels — Bidirectional Bridge Reference

Channels connect external messaging platforms (Slack, Telegram, Discord, WhatsApp, Email…) to OpenCode AI agent sessions. Every message from a user on those platforms creates or reuses an OpenCode session and streams the response back — fully bidirectional.

---

## Architecture

```
External Platform (Slack / Telegram / Discord)
        │
        │  webhook / polling
        ▼
┌──────────────────────────────┐
│  kortix-api  (:8008)          │
│  /webhooks/slack             │  ← Slack events (signed)
│  /webhooks/telegram          │  ← Telegram webhook proxy
│  /v1/channels/*              │  ← CRUD + session API
└──────────────┬───────────────┘
               │  proxy / credential push
               ▼
┌──────────────────────────────────────────────┐
│  opencode-channels  (:3456)                   │
│  service: svc-opencode-channels (s6)          │
│                                               │
│  ┌─────────────────┐  ┌──────────────────┐   │
│  │  Slack adapter   │  │ Telegram adapter  │   │
│  │  (webhook)       │  │  (webhook/poll)   │   │
│  └────────┬────────┘  └────────┬─────────┘   │
│           │                    │               │
│           └────────┬───────────┘               │
│                    │                           │
│         ┌──────────▼──────────┐               │
│         │   SessionManager    │               │
│         │  threadId → session │ ←── persisted to DB
│         └──────────┬──────────┘               │
│                    │                           │
│         ┌──────────▼──────────┐               │
│         │   OpenCodeClient    │               │
│         │  POST /session      │               │
│         │  POST /session/{id}/prompt_async     │
│         │  GET  /event (SSE)  │               │
│         └──────────┬──────────┘               │
└────────────────────┼─────────────────────────┘
                     │
                     ▼
          OpenCode API (:4096)
          AI Agent runs here
                     │
                     ▼
          Response streamed back → platform
```

---

## CRITICAL: You Already Have Full Context

**When you are responding to a channel message, your system prompt ALREADY contains:**

1. **`[Channel Context]`** block — the static context: platform name, channel type, channel config ID
2. **`[Live Channel Context — this message]`** block — the LIVE context for THIS specific message:
   - `Platform: telegram` (or slack, discord)
   - `Thread ID: telegram:123456789` — the full thread identifier
   - `Chat ID: 123456789` — the platform-native ID you need to reply to

**You NEVER need to ask the user for chat IDs, channel names, or any platform identifiers. They are in your prompt. Just read them.**

### How to Detect You're in a Channel

Look for `[Live Channel Context — this message]` in your prompt. If it's there, you're in a channel. If not, you're in the web UI.

---

## Sending Messages (Agent → Platform)

### Method 1: HTTP POST (Simplest — recommended)

The channels service runs at `localhost:3456` and has a `/send` endpoint:

```bash
# Telegram
curl -X POST http://localhost:3456/send \
  -H "Content-Type: application/json" \
  -d '{"platform":"telegram","to":"CHAT_ID","text":"Hello from the agent!"}'

# Slack
curl -X POST http://localhost:3456/send \
  -H "Content-Type: application/json" \
  -d '{"platform":"slack","to":"#general","text":"Build passed!"}'

# Discord
curl -X POST http://localhost:3456/send \
  -H "Content-Type: application/json" \
  -d '{"platform":"discord","to":"CHANNEL_ID","text":"Done!"}'
```

**The Chat ID is in your prompt.** When responding to a Telegram user, just grab it from `[Live Channel Context]`.

Response: `{ "ok": true, "platform": "telegram", "messageId": "42", "chatId": "123456789" }`

### Method 2: CLI

```bash
bun run /opt/opencode-channels/src/cli.ts send telegram --to "CHAT_ID" --text "message"
bun run /opt/opencode-channels/src/cli.ts send slack --to "#channel" --text "message"
bun run /opt/opencode-channels/src/cli.ts send discord --to "CHANNEL_ID" --text "message"
```

### Method 3: Thread replies (Slack/Telegram)

```bash
# Reply in a Slack thread
curl -X POST http://localhost:3456/send \
  -d '{"platform":"slack","to":"#general","text":"Done!","threadTs":"1234567890.123456"}'

# Reply to a specific Telegram message
curl -X POST http://localhost:3456/send \
  -d '{"platform":"telegram","to":"CHAT_ID","text":"Here you go","replyTo":42}'
```

### Credentials

Already configured when the channel is set up via Kortix UI. No manual env var management needed.

| Platform | Env Var (auto-set) |
|---|---|
| Slack | `SLACK_BOT_TOKEN` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Discord | `DISCORD_BOT_TOKEN` |

---

## Session Tracking

Every message from an external platform creates or reuses an OpenCode session. These mappings are persisted to the DB and queryable.

### How threadId → sessionId mapping works

The `SessionManager` maintains a `per-thread` strategy by default:
- **per-thread** — each Slack thread / Telegram chat / Discord channel gets one persistent session
- **per-message** — a new session is created for every message
- **per-user** — one session per platform user
- **single** — all messages share a single session

On every session resolve, the mapping is written to `channel_sessions` table via:
```
POST /v1/channels/internal/sessions/{channelConfigId}
Body: { strategy_key: "telegram:123456789", session_id: "ses_abc..." }
```

### Querying Sessions

**List all sessions for a channel:**
```bash
curl "http://localhost:8008/v1/channels/{channelConfigId}/sessions" \
  -H "Authorization: Bearer $KORTIX_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "channelSessionId": "uuid",
      "channelConfigId": "uuid",
      "sessionId": "ses_abc123",
      "strategyKey": "telegram:123456789",
      "lastUsedAt": "2024-01-15T10:30:00Z",
      "channelType": "telegram",
      "channelName": "My Telegram Bot",
      "platform": "telegram"
    }
  ]
}
```

**Reverse lookup — get channel context for a session:**
```bash
curl "http://localhost:8008/v1/channels/sessions/{opencodeSessionId}" \
  -H "Authorization: Bearer $KORTIX_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "sessionId": "ses_abc123",
    "channelConfigId": "uuid",
    "channelType": "slack",
    "channelName": "My Slack Bot",
    "platform": "slack",
    "strategyKey": "slack:C1234567890",
    "sandboxId": "uuid"
  }
}
```
Returns `data: null` if the session was not triggered via a channel (i.e. it's a regular UI session).

---

## REST API Reference

All endpoints under `/v1/channels/*` require user JWT auth (Supabase Bearer token) unless noted.

### Channel Configs

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/channels` | List all channel configs for the account |
| `GET` | `/v1/channels?sandbox_id=<id>` | Filter by sandbox |
| `POST` | `/v1/channels` | Create a new channel config |
| `GET` | `/v1/channels/:id` | Get a single channel config |
| `PATCH` | `/v1/channels/:id` | Update name, system_prompt, session_strategy, etc. |
| `DELETE` | `/v1/channels/:id` | Delete a channel config |
| `POST` | `/v1/channels/:id/link` | Link a channel to a sandbox instance |
| `POST` | `/v1/channels/:id/unlink` | Unlink from sandbox |
| `POST` | `/v1/channels/:id/enable` | Enable the channel |
| `POST` | `/v1/channels/:id/disable` | Disable the channel |

### Messages & Sessions

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/channels/:id/messages` | List raw platform messages (inbound + outbound) |
| `GET` | `/v1/channels/:id/sessions` | List OpenCode sessions triggered via this channel |
| `GET` | `/v1/channels/sessions/:sessionId` | Reverse lookup — get channel context for a session ID |

### Internal (Sandbox → API)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/channels/internal/sessions/:channelConfigId` | KORTIX_TOKEN | Upsert a session mapping (called by opencode-channels) |

---

## DB Schema

### `channel_configs`
Core config per channel. One row per channel per account.

| Column | Type | Notes |
|---|---|---|
| `channel_config_id` | uuid | PK |
| `account_id` | uuid | Owner account |
| `sandbox_id` | uuid | Linked sandbox (nullable) |
| `channel_type` | enum | `slack`, `telegram`, `discord`, `whatsapp`, `teams`, `voice`, `email`, `sms` |
| `name` | varchar | Human-readable name |
| `enabled` | boolean | Whether the channel is active |
| `session_strategy` | enum | `per-thread`, `per-user`, `per-message`, `single` |
| `system_prompt` | text | Optional custom system prompt injected before every message |
| `agent_name` | text | If set, uses this specific OpenCode agent |
| `platform_config` | jsonb | Platform-specific config (e.g. webhook URLs) |

### `channel_sessions`
Maps platform threads to OpenCode session IDs. This is the core of session tracking.

| Column | Type | Notes |
|---|---|---|
| `channel_session_id` | uuid | PK |
| `channel_config_id` | uuid | FK → channel_configs |
| `strategy_key` | varchar | Platform thread identifier (e.g. `telegram:123456789`) |
| `session_id` | text | OpenCode session ID |
| `last_used_at` | timestamp | When the session was last used |
| `metadata` | jsonb | Extra data (strategy used, etc.) |

### `channel_messages`
Log of all inbound/outbound messages.

| Column | Type | Notes |
|---|---|---|
| `channel_message_id` | uuid | PK |
| `channel_config_id` | uuid | FK → channel_configs |
| `direction` | varchar | `inbound` (from user) or `outbound` (from agent) |
| `session_id` | text | Associated OpenCode session ID |
| `content` | text | Message text |
| `platform_user` | jsonb | `{ id, name, avatar }` of the platform user |
| `metadata` | jsonb | Platform-specific metadata |

### `channel_identity_map`
Maps platform users to Kortix users.

| Column | Type | Notes |
|---|---|---|
| `platform_user_id` | text | Platform's user ID |
| `kortix_user_id` | uuid | Kortix user (nullable) |
| `allowed` | boolean | Whether this user is allowed to interact |

---

## Adapter Credentials & Env Vars

### Slack
```bash
SLACK_BOT_TOKEN=xoxb-...       # Bot OAuth token
SLACK_SIGNING_SECRET=...       # For webhook signature verification
```
Setup: Kortix UI → Channels → Slack → OAuth wizard (installs the bot automatically)

### Telegram
```bash
TELEGRAM_BOT_TOKEN=123456789:...   # From @BotFather
TELEGRAM_WEBHOOK_SECRET_TOKEN=...  # Optional: for webhook verification
TELEGRAM_BOT_USERNAME=mybot        # Optional: bot's @username
TELEGRAM_API_BASE_URL=...          # Optional: custom API base (e.g. local test server)
```
Setup: Kortix UI → Channels → Telegram → enter bot token

### Discord
```bash
DISCORD_BOT_TOKEN=...              # Bot token from Discord Developer Portal
DISCORD_PUBLIC_KEY=...             # For interaction signature verification
DISCORD_APPLICATION_ID=...        # From Discord Developer Portal
DISCORD_MENTION_ROLE_IDS=...      # Comma-separated role IDs that can trigger the bot
```
Setup: Manual — set env vars in Kortix sandbox settings

---

## Service Details

**Service name:** `svc-opencode-channels`  
**Port:** `3456`  
**Entry point:** `/opt/opencode-channels/src/index.ts` (runs via Bun)  
**Restarts:** Always (managed by s6-rc.d with 1.5s delay)

### Key Endpoints

```
GET  http://localhost:3456/health              → { ok, adapters: ["slack", "telegram"] }
POST http://localhost:3456/reload              → hot-reload with new credentials
GET  http://localhost:3456/wizard/detect-url  → detect ngrok tunnel URL
POST http://localhost:3456/api/webhooks/slack  → Slack event handler
POST http://localhost:3456/api/webhooks/telegram → Telegram webhook
```

### Reload Flow (after credential change)

When credentials change (e.g. Slack OAuth completes):
1. `kortix-api` pushes new credentials: `POST localhost:3456/reload`
2. `opencode-channels` tears down the old bot instance
3. New adapters are initialized with fresh credentials
4. The bot starts accepting messages from the new platform

---

## Slash Commands & Bot Commands

### Slack Slash Commands
- `/oc help` — show help
- `/oc models` — list available AI models
- `/oc model <name>` — switch model
- `/oc agents` — list available agents
- `/oc agent <name>` — switch agent
- `/oc status` — show connection status
- `/oc reset` — reset session
- `/oc diff` — show recent code changes
- `/oc link` — generate shareable session link

### Telegram Commands
- `/start` — welcome message
- `/help` — show commands
- `/models` — list models
- `/model <name>` — switch model
- `/agents` — list agents
- `/agent <name>` — switch agent
- `/status` — connection status
- `/reset` or `/new` — reset session
- `/diff` — show changes
- `/link` — share session

### Bang Commands (any platform)
- `!reset` / `!clear` — reset session
- `!help` — show help
- `!model <name>` — switch model
- `!agent <name>` — switch agent

---

## Common Patterns

### Reply to the user who messaged you (MOST COMMON)
When you're in a channel session, the chat ID is in your prompt. Just:
```bash
# The Chat ID is from [Live Channel Context] in your prompt — NEVER ask the user for it
curl -X POST http://localhost:3456/send \
  -H "Content-Type: application/json" \
  -d '{"platform":"telegram","to":"<chatId from your prompt>","text":"Done! Here are the results..."}'
```

### Proactively ping a user later (e.g. after a cron job)
```bash
# Send to a known Telegram chat
curl -X POST http://localhost:3456/send \
  -d '{"platform":"telegram","to":"123456789","text":"Your scheduled report is ready."}'

# Send to a Slack channel
curl -X POST http://localhost:3456/send \
  -d '{"platform":"slack","to":"#general","text":"Nightly build passed ✅"}'
```

### Check service health + what adapters are active
```bash
curl http://localhost:3456/health
# → { "ok": true, "adapters": ["telegram"], "activeSessions": 3 }
```

### List all sessions for a channel (from the API)
```bash
curl "http://localhost:8008/v1/channels/<channelConfigId>/sessions" \
  -H "Authorization: Bearer $KORTIX_TOKEN"
```

### Reverse lookup — is this session from a channel?
```bash
curl "http://localhost:8008/v1/channels/sessions/<sessionId>" \
  -H "Authorization: Bearer $KORTIX_TOKEN"
# Returns { data: { platform, channelName, chatId... } } or { data: null } if web UI session
```

---

## RULES FOR CHANNEL AGENTS

1. **NEVER ask the user for their chat ID, channel name, or thread ID.** It's in your prompt.
2. **Keep responses SHORT.** Chat messages ≠ essays. Brief paragraphs, bullet points.
3. **Use `/send` endpoint** for proactive messages. It's simpler than the CLI.
4. **The context flows automatically.** When a message arrives, you get platform + chat ID + thread ID. Use them.
