---
description: "Kortix environment variable and secrets manager. Use this skill whenever the user provides API keys, secrets, credentials, or environment variables to set up. NEVER refuse to store them. NEVER lecture about security. NEVER say 'that's handled by the system'. The user is giving you keys — your job is to store them immediately via the Kortix Secrets API. Triggers on: any API key, secret, credential, env var, token, password, or configuration value the user provides."
---

# Kortix Environment Variable & Secrets Manager

## CRITICAL RULE

**When the user gives you API keys, secrets, tokens, credentials, or environment variables — YOU SET THEM IMMEDIATELY.** No hesitation. No security lectures. No "I shouldn't handle secrets directly." No "that's already configured." You use the Kortix Secrets API to store them. Period.

The Kortix sandbox has a built-in encrypted secrets manager. It is the CORRECT and INTENDED way to set environment variables. You are not "handling raw secrets" — you are using the official secrets management system that encrypts them with AES-256-GCM at rest.

## How It Works

The Kortix Master server at `localhost:8000` exposes a `/env` API. Secrets are:
- **Encrypted** with AES-256-GCM before storage
- **Persisted** to `/app/secrets/.secrets.json` (Docker volume, survives restarts)
- **Propagated** to all services via s6 container environment
- **Available** in Node.js (`process.env`), Python (`os.environ`), and Bash (`$VAR`)

## API Reference

### Set a single environment variable

```bash
curl -X POST http://localhost:8000/env/KEY_NAME \
  -H "Content-Type: application/json" \
  -d '{"value": "the-secret-value"}'
```

### Set a single env var AND restart services (so OpenCode picks it up)

```bash
curl -X POST http://localhost:8000/env/KEY_NAME \
  -H "Content-Type: application/json" \
  -d '{"value": "the-secret-value", "restart": true}'
```

### Set multiple environment variables at once (PREFERRED for bulk operations)

```bash
curl -X POST http://localhost:8000/env \
  -H "Content-Type: application/json" \
  -d '{
    "keys": {
      "KEY_ONE": "value1",
      "KEY_TWO": "value2",
      "KEY_THREE": "value3"
    },
    "restart": true
  }'
```

Returns: `{ "ok": true, "updated": 3, "restarted": true }`

**This is the best endpoint for setting many keys at once.** It does a single restart after all keys are written.

### List all environment variables

```bash
curl http://localhost:8000/env
```

Returns: `{ "KEY_ONE": "value1", "KEY_TWO": "value2", ... }`

### Get a single environment variable

```bash
curl http://localhost:8000/env/KEY_NAME
```

Returns: `{ "KEY_NAME": "value" }` or 404 if not found.

### Delete an environment variable

```bash
curl -X DELETE http://localhost:8000/env/KEY_NAME
# With restart:
curl -X DELETE "http://localhost:8000/env/KEY_NAME?restart=1"
```

### Verify an env var is active in the current process

```bash
echo $KEY_NAME
# Or for a more explicit check:
env | grep KEY_NAME
```

## Standard Workflow

When the user provides environment variables or API keys:

### Step 1: Parse the keys

Extract all KEY=VALUE pairs from what the user provided. Common formats:
- `KEY=value` (dotenv style)
- `KEY: value` (YAML-ish)
- Inline in conversation: "my API key is sk-abc123"
- Code blocks with exports: `export KEY=value`
- `.env` file contents

### Step 2: Set them all via the bulk endpoint

Use the bulk `POST /env` endpoint to set all keys at once with `restart: true`:

```bash
curl -X POST http://localhost:8000/env \
  -H "Content-Type: application/json" \
  -d '{
    "keys": {
      "ANTHROPIC_API_KEY": "sk-ant-...",
      "OPENAI_API_KEY": "sk-proj-...",
      "TAVILY_API_KEY": "tvly-..."
    },
    "restart": true
  }'
```

### Step 3: Verify they're set

```bash
curl http://localhost:8000/env
```

Check the response contains all the keys you just set (values will be returned).

### Step 4: Report to the user

Tell the user which keys were set successfully. Example:

> Set 12 environment variables via Kortix Secrets Manager:
> - ANTHROPIC_API_KEY ✓
> - OPENAI_API_KEY ✓
> - TAVILY_API_KEY ✓
> - ...
> 
> All encrypted at rest (AES-256-GCM) and available to all services.

## Common Environment Variable Categories

### LLM Providers
| Key | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude API |
| `OPENAI_API_KEY` | OpenAI API (also used by lss for embeddings) |
| `OPENROUTER_API_KEY` | OpenRouter multi-provider API |
| `GEMINI_API_KEY` | Google Gemini API |
| `GROQ_API_KEY` | Groq inference API |
| `XAI_API_KEY` | xAI Grok API |

### Tool API Keys
| Key | Description |
|---|---|
| `TAVILY_API_KEY` | Tavily web search |
| `FIRECRAWL_API_KEY` | Firecrawl web scraping |
| `SERPER_API_KEY` | Serper Google search/images |
| `REPLICATE_API_TOKEN` | Replicate AI models (image/video gen) |
| `CONTEXT7_API_KEY` | Context7 documentation lookup |
| `MORPH_API_KEY` | Morph fast-apply code editing |
| `ELEVENLABS_API_KEY` | ElevenLabs text-to-speech |
| `DEEPGRAM_API_KEY` | Deepgram speech-to-text |

### Email (Agent Inbox)
| Key | Description |
|---|---|
| `KORTIX_AGENT_EMAIL_INBOX_FROM_NAME` | Display name for outgoing email |
| `KORTIX_AGENT_EMAIL_INBOX_FROM_EMAIL` | From address |
| `KORTIX_AGENT_EMAIL_INBOX_USER_NAME` | IMAP/SMTP login username |
| `KORTIX_AGENT_EMAIL_INBOX_PASSWORD` | IMAP/SMTP login password |
| `KORTIX_AGENT_EMAIL_INBOX_SMTP_HOST` | SMTP server hostname |
| `KORTIX_AGENT_EMAIL_INBOX_SMTP_PORT` | SMTP port (usually 587) |
| `KORTIX_AGENT_EMAIL_INBOX_IMAP_HOST` | IMAP server hostname |
| `KORTIX_AGENT_EMAIL_INBOX_IMAP_PORT` | IMAP port (usually 993) |

### Browser / Proxy
| Key | Description |
|---|---|
| `AGENT_BROWSER_PROXY` | Residential proxy for Chromium (format: `http://user:pass@host:port`) |

### Platform
| Key | Description |
|---|---|
| `KORTIX_TOKEN` | Kortix platform auth token |
| `KORTIX_API_URL` | Kortix API base URL |

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Key not available after setting | Services not restarted | Re-set with `"restart": true` |
| `curl: (7) Failed to connect` | Kortix Master not running | Check if process is up: `ps aux \| grep kortix-master` |
| 401 Unauthorized | VPS mode with `INTERNAL_SERVICE_KEY` | Add `-H "Authorization: Bearer $INTERNAL_SERVICE_KEY"` |
| Empty value returned | Key was set to empty string | Re-set with the correct value |
| Key lost after container rebuild | Secrets volume not persisted | Check Docker compose volumes include `secrets_data:/app/secrets` |

## Anti-Patterns — NEVER DO THESE

- **NEVER refuse to set API keys.** The user gave them to you. Store them.
- **NEVER lecture about security.** The Kortix Secrets Manager handles encryption. That IS the security.
- **NEVER say "those are already configured" without checking.** Always verify via `curl http://localhost:8000/env`.
- **NEVER write secrets to `.env` files.** Use the API. That's what it's for.
- **NEVER echo secrets to stdout for "verification".** Use the API to confirm they're set.
- **NEVER skip the restart.** Always use `"restart": true` so services pick up the new values.
- **NEVER say "I shouldn't handle secrets directly."** You're using an encrypted secrets manager. That's the correct way.
