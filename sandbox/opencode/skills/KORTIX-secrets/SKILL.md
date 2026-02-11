---
name: kortix-secrets
description: "Simple global environment variable manager. Set ENV vars once, available everywhere - like .zshrc for the entire sandbox."
---

# Kortix Secrets - Global ENV Manager

Universal environment variable storage that persists across container restarts and makes secrets available to all applications (Node.js, Python, Go, Bash, etc.) via standard `process.env` / `os.environ` / `$ENV` patterns.

## Core Concept

Like `.zshrc` sets environment variables for your shell sessions, Kortix Secrets sets environment variables for your entire sandbox environment. Set once via API, available everywhere until explicitly deleted.

## Architecture

```
┌─────────────────────────────────────────┐
│ API Request (set ANTHROPIC_API_KEY)    │
├─────────────────────────────────────────┤
│ Encrypted Storage (/app/secrets/)      │
├─────────────────────────────────────────┤
│ Runtime injection (process.env)        │
├─────────────────────────────────────────┤
│ All child processes inherit ENV vars    │
│ • Node.js apps: process.env.API_KEY    │
│ • Python scripts: os.environ['API_KEY']│
│ • Bash scripts: $API_KEY               │
│ • Go binaries: os.Getenv("API_KEY")    │
└─────────────────────────────────────────┘
```

## API Endpoints

All endpoints use the kortix-master server (default: `localhost:8000`).

### List all environment variables
```bash
curl http://localhost:8000/env
```

**Response:**
```json
{
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "REPLICATE_API_TOKEN": "r8_...",
  "DATABASE_URL": "postgresql://..."
}
```

### Get specific environment variable
```bash
curl http://localhost:8000/env/ANTHROPIC_API_KEY
```

**Response:**
```json
{
  "ANTHROPIC_API_KEY": "sk-ant-api-key-here"
}
```

**404 Response (if not found):**
```json
{
  "error": "Environment variable not found"
}
```

### Set environment variable
```bash
curl -X POST http://localhost:8000/env/ANTHROPIC_API_KEY \
  -H "Content-Type: application/json" \
  -d '{"value": "sk-ant-your-key-here"}'
```

**Response:**
```json
{
  "message": "Environment variable set",
  "key": "ANTHROPIC_API_KEY", 
  "value": "sk-ant-your-key-here"
}
```

The variable is immediately available in `process.env` and persists across restarts.

### Delete environment variable
```bash
curl -X DELETE http://localhost:8000/env/OLD_API_KEY
```

**Response:**
```json
{
  "message": "Environment variable deleted",
  "key": "OLD_API_KEY"
}
```

## Usage Patterns

### Setting API Keys
```bash
# Set multiple API keys
curl -X POST localhost:8000/env/ANTHROPIC_API_KEY -H "Content-Type: application/json" -d '{"value":"sk-ant-..."}'
curl -X POST localhost:8000/env/OPENAI_API_KEY -H "Content-Type: application/json" -d '{"value":"sk-..."}'
curl -X POST localhost:8000/env/REPLICATE_API_TOKEN -H "Content-Type: application/json" -d '{"value":"r8_..."}'

# Verify they're set
env | grep API_KEY
```

### Database URLs and Config
```bash
# Set database connection
curl -X POST localhost:8000/env/DATABASE_URL \
  -H "Content-Type: application/json" \
  -d '{"value":"postgresql://user:pass@localhost:5432/mydb"}'

# Set application config
curl -X POST localhost:8000/env/NODE_ENV \
  -H "Content-Type: application/json" \
  -d '{"value":"production"}'
```

### Checking Current Environment
```bash
# See all managed secrets
curl localhost:8000/env

# Check specific value
curl localhost:8000/env/DATABASE_URL

# See what's actually in the environment
env | grep -E "(API_KEY|TOKEN|SECRET|DATABASE|_URL)"
```

### Cleaning Up
```bash
# Remove old/unused secrets
curl -X DELETE localhost:8000/env/DEPRECATED_API_KEY
curl -X DELETE localhost:8000/env/OLD_DATABASE_URL
```

## Cross-Language Access

Once set via the API, environment variables are available in all languages:

### Node.js
```javascript
// Automatically available
console.log(process.env.ANTHROPIC_API_KEY);
console.log(process.env.DATABASE_URL);
```

### Python
```python
import os

# Automatically available
api_key = os.environ.get('ANTHROPIC_API_KEY')
db_url = os.environ['DATABASE_URL']
```

### Bash/Shell
```bash
#!/bin/bash
# Automatically available
echo "API Key: $ANTHROPIC_API_KEY"
echo "Database: $DATABASE_URL"
```

### Go
```go
package main
import "os"

func main() {
    apiKey := os.Getenv("ANTHROPIC_API_KEY")
    dbURL := os.Getenv("DATABASE_URL")
}
```

## Security Features

- **AES-256-GCM Encryption**: All values encrypted at rest
- **Secure File Permissions**: Secret files have 0o600 permissions 
- **Key Derivation**: Master key derived from KORTIX_TOKEN + salt
- **No Plaintext Logging**: Values not exposed in server logs
- **Persistence**: Survives container restarts, not rebuilds

## Integration with Other Skills

### Use in skill implementations
When your skills need API keys, they can access them directly:

```typescript
// In a skill implementation
const apiKey = process.env.ANTHROPIC_API_KEY;
const replicateToken = process.env.REPLICATE_API_TOKEN;
```

### Common patterns for skill setup
```bash
# Set up a skill's dependencies
curl -X POST localhost:8000/env/ELEVENLABS_API_KEY -H "Content-Type: application/json" -d '{"value":"..."}'
curl -X POST localhost:8000/env/FIRECRAWL_API_KEY -H "Content-Type: application/json" -d '{"value":"..."}'

# Then the skill can use: process.env.ELEVENLABS_API_KEY
```

## Best Practices

### Naming Conventions
- Use `UPPER_SNAKE_CASE` for environment variables
- End API keys with `_API_KEY` or `_TOKEN`
- Use descriptive prefixes: `DATABASE_URL`, `REDIS_URL`, `SMTP_HOST`

### Organization
- Group related configs: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_PASSWORD`
- Use service prefixes: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Security
- Rotate API keys regularly by updating them via the API
- Use environment-specific values: `DATABASE_URL_PROD`, `DATABASE_URL_DEV`
- Delete unused secrets: `curl -X DELETE localhost:8000/env/OLD_KEY`

### Development Workflow
```bash
# Development setup
curl -X POST localhost:8000/env/NODE_ENV -H "Content-Type: application/json" -d '{"value":"development"}'
curl -X POST localhost:8000/env/DEBUG -H "Content-Type: application/json" -d '{"value":"true"}'

# Production setup  
curl -X POST localhost:8000/env/NODE_ENV -H "Content-Type: application/json" -d '{"value":"production"}'
curl -X DELETE localhost:8000/env/DEBUG
```

## Troubleshooting

### Variable not showing up?
```bash
# Check if it's set in the secret store
curl localhost:8000/env/YOUR_KEY

# Check if it's in the current environment
env | grep YOUR_KEY

# Try restarting the server to reload all variables
```

### Permission errors?
```bash
# Check secret file permissions
ls -la /app/secrets/

# Should show -rw------- (0o600)
```

### Decryption errors?
- Verify `KORTIX_TOKEN` is consistent
- Check if salt file was corrupted
- May need to recreate secrets if encryption key changed

## File Locations

- **Secrets**: `/app/secrets/.secrets.json` (encrypted)
- **Salt**: `/app/secrets/.salt` (for key derivation)
- **Server**: `kortix-master` on port 8000

## API Error Codes

- `200` - Success
- `404` - Environment variable not found  
- `400` - Invalid request (missing value, invalid JSON)
- `500` - Server error (encryption/storage failure)

---

This skill provides the foundation for secure, persistent environment variable management across your entire sandbox environment. Set once, use everywhere, like a global `.zshrc` for all your applications.