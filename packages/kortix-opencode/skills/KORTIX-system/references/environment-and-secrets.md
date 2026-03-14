# Environment and Secrets

Use this file when setting API keys, diagnosing env propagation, or reasoning about local vs cloud runtime behavior.

## Cloud Mode Variables

| Variable | Description |
|---|---|
| `ENV_MODE` | `local` or `cloud` |
| `KORTIX_API_URL` | Base URL for Kortix API services |
| `KORTIX_TOKEN` | Outbound auth token from sandbox to Kortix API |
| `INTERNAL_SERVICE_KEY` | Inbound auth token for external callers into the sandbox |
| `SANDBOX_ID` | Sandbox identifier |
| `PROJECT_ID` | Current project identifier |

When `ENV_MODE=cloud`, tool SDK base URLs are routed through the Kortix API proxy for metering.

## Secret Management Rule

When the user gives you a secret or API key, set it immediately through the sandbox API instead of leaving it in files.

## Secret API

All endpoints are served by Kortix Master at `localhost:8000`. Inside the sandbox, no auth is required.

### Set one key

```bash
curl -X POST http://localhost:8000/env/KEY_NAME \
  -H "Content-Type: application/json" \
  -d '{"value": "the-secret-value", "restart": true}'
```

### Set multiple keys

```bash
curl -X POST http://localhost:8000/env \
  -H "Content-Type: application/json" \
  -d '{
    "keys": {
      "ANTHROPIC_API_KEY": "sk-ant-...",
      "OPENAI_API_KEY": "sk-...",
      "TAVILY_API_KEY": "tvly-..."
    },
    "restart": true
  }'
```

### List, get, delete

```bash
curl http://localhost:8000/env
curl http://localhost:8000/env/KEY_NAME
curl -X DELETE http://localhost:8000/env/KEY_NAME
```

`DELETE` always restarts services. `POST` and `PUT` restart only when `restart: true` is provided.

## Encryption Details

- algorithm: AES-256-GCM
- key derivation: `scryptSync(KORTIX_TOKEN || 'default-key', salt, 32)`
- salt path: `/workspace/.secrets/.salt`
- secret store: `/workspace/.secrets/.secrets.json`
- runtime propagation: `/run/s6/container_environment/KEY`

## Common Secret Categories

- LLM providers: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`
- tool providers: `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `SERPER_API_KEY`, `REPLICATE_API_TOKEN`, `CONTEXT7_API_KEY`, `ELEVENLABS_API_KEY`, `MORPH_API_KEY`
- email: `KORTIX_AGENT_EMAIL_INBOX_*`
- browser: `AGENT_BROWSER_PROXY`
