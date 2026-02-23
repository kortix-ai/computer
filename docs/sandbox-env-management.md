# Sandbox Environment & Secrets Management

How environment variables and secrets flow through the sandbox container.

---

## Two Parallel Systems

The sandbox has two independent secret stores that coexist:

| System | Stores | Location | Managed By |
|--------|--------|----------|------------|
| **SecretStore** | Tool keys, system env vars, `ONBOARDING_COMPLETE` | `/app/secrets/.secrets.json` (encrypted) | kortix-master `/env` API |
| **OpenCode auth.json** | LLM provider keys, OAuth tokens | `/workspace/.local/share/opencode/auth.json` | OpenCode SDK `client.auth.set()` |

Both are available to the running OpenCode instance — LLM keys from `auth.json`, tool keys from `process.env` (via s6 container environment).

---

## SecretStore (Encrypted)

**Files:**
- `/app/secrets/.secrets.json` — AES-256-GCM encrypted key-value store
- `/app/secrets/.salt` — 32-byte random salt for key derivation
- Docker volume: `sandbox-secrets` (persists across restarts)

**Encryption:** `scryptSync(KORTIX_TOKEN, salt, 32)` derives the key. Each value encrypted with random 16-byte IV. Format: `{iv}:{authTag}:{ciphertext}`.

**Code:** `sandbox/kortix-master/src/services/secret-store.ts`

```
SecretStore.get(key)         → decrypt one
SecretStore.set(key, value)  → encrypt and persist
SecretStore.delete(key)      → remove
SecretStore.getAll()         → decrypt all
SecretStore.setEnv(key, val) → set() + process.env[key]
SecretStore.loadIntoProcessEnv() → bulk load into process.env
```

---

## OpenCode auth.json

**File:** `/workspace/.local/share/opencode/auth.json` (workspace volume)

**Format:**
```json
{
  "anthropic": { "type": "api", "key": "sk-ant-..." },
  "openai": { "type": "api", "key": "sk-..." },
  "github-copilot": { "type": "oauth", "refresh": "...", "access": "...", "expires": 123 }
}
```

**Auth types:** `api` (key string), `oauth` (refresh/access/expires), `wellknown` (key/token)

**Code:** OpenCode's `auth/index.ts` (upstream, in the `opencode-ai` npm package)

---

## How Secrets Get Into Services

All s6 services start with `#!/usr/bin/with-contenv bash`, which reads every file in `/run/s6/container_environment/` as an env var. The pipeline:

```
.secrets.json (encrypted, on volume)
    ↓  sync-s6-env.ts (on boot) or writeS6Env() (on write)
/run/s6/container_environment/{KEY} (one file per key, tmpfs)
    ↓  with-contenv (on service start/restart)
process.env.{KEY} (in each s6 service)
```

The s6 env dir is **tmpfs** — rebuilt every boot from `.secrets.json`. The secrets volume is the source of truth.

---

## Flows

### A. Frontend connects LLM provider (OpenCode SDK path)

```
connect-provider-content.tsx
  → client.auth.set({ providerID: "anthropic", auth: { type: "api", key: "sk-..." } })
  → SDK sends PUT /auth/anthropic to sandbox:8000
  → kortix-master proxies to OpenCode on localhost:4096
  → OpenCode writes /workspace/.local/share/opencode/auth.json
  → OpenCode reads auth.json when making LLM calls
```

### B. Backend sets tool provider key (SecretStore path)

```
PUT /v1/providers/tavily/connect  { keys: { TAVILY_API_KEY: "tvly-..." } }
  → kortix-api calls POST http://sandbox:8000/env
  → kortix-master env.ts:
      1. secretStore.setEnv(key, value)     → encrypt to .secrets.json + process.env
      2. writeS6Env(key, value)             → write /run/s6/container_environment/{KEY}
      3. restartService("svc-opencode-serve") → s6-svc -r (picks up new env via with-contenv)
      4. restartService("svc-opencode-web")
```

### C. Container boot sequence

```
s6-overlay cont-init.d (runs as root, in order):

  97-secrets-to-s6-env.sh:
    mkdir /app/secrets, chown abc:users
    if .secrets.json exists:
      bun sync-s6-env.ts → decrypt all → write to /run/s6/container_environment/

  98-kortix-env (kortix-env-setup.sh):
    if ENV_MODE=cloud:
      write tool API proxy URLs to container_environment
      (TAVILY_API_URL, SERPER_API_URL, etc. → route through Kortix API proxy)
    if local: no-op

  99-customize: desktop theming (unrelated)

Then s6 starts services (all with-contenv):
  svc-kortix-master (port 8000) → also runs secretStore.loadIntoProcessEnv()
  svc-opencode-serve (port 4096) → reads auth.json for LLM keys, env for tool keys
  svc-opencode-web (port 3111)
```

### D. Agent sets env from inside a session (KORTIX-secrets skill)

```
curl -X POST http://localhost:8000/env/MY_SECRET \
  -H "Content-Type: application/json" \
  -d '{"value": "secret-value"}'
  → same as Flow B from step 2 onward
```

---

## API Endpoints (kortix-master, port 8000)

| Method | Path | Description |
|--------|------|-------------|
| `GET /env` | List all secrets (decrypted) |
| `GET /env/:key` | Get one secret |
| `POST /env` | Bulk set: `{keys: {K:V,...}, restart?: bool}` |
| `POST /env/:key` | Set one: `{value: "...", restart?: bool}` |
| `DELETE /env/:key` | Delete one secret |

All writes do dual-write: SecretStore + s6 env dir. Default `restart: true` restarts OpenCode services.

---

## Storage Summary

| What | Path | Persistence | Owner |
|------|------|-------------|-------|
| Encrypted secrets | `/app/secrets/.secrets.json` | `sandbox-secrets` volume | `abc:users` |
| Encryption salt | `/app/secrets/.salt` | `sandbox-secrets` volume | `abc:users` |
| s6 container env | `/run/s6/container_environment/{KEY}` | tmpfs (rebuilt on boot) | `abc:users` |
| OpenCode LLM auth | `/workspace/.local/share/opencode/auth.json` | `sandbox-workspace` volume | `abc:users` |
| Workspace data | `/workspace/` | `sandbox-workspace` volume | `abc:users` |

---

## Common Issues

### Stale onboarding state after reinstall
`ONBOARDING_COMPLETE` lives in `.secrets.json` on the `sandbox-secrets` volume. If volumes survive reinstall, onboarding appears complete. Fix: `docker compose down -v` removes volumes.

### Permission denied on secrets
kortix-master runs as `abc`. The `97-secrets-to-s6-env.sh` init script runs `chown -R abc:users /app/secrets`. If this fails, manual fix:
```bash
docker exec kortix-sandbox chown -R abc:users /app/secrets /run/s6/container_environment
docker exec kortix-sandbox s6-svc -r /run/service/svc-kortix-master
```

### Corrupted secrets (mismatched salt)
If `.salt` gets out of sync with `.secrets.json`, decryption fails. Fix:
```bash
docker exec kortix-sandbox rm -f /app/secrets/.salt /app/secrets/.secrets.json
docker exec kortix-sandbox s6-svc -r /run/service/svc-kortix-master
```

---

## Key Files

| File | Purpose |
|------|---------|
| `sandbox/kortix-master/src/services/secret-store.ts` | AES-256-GCM encrypted storage |
| `sandbox/kortix-master/src/routes/env.ts` | HTTP API for get/set/delete env vars |
| `sandbox/kortix-master/src/scripts/sync-s6-env.ts` | Sync secrets → s6 env dir (boot time) |
| `sandbox/kortix-master/src/index.ts` | Entry point, loads secrets into process.env |
| `sandbox/config/97-secrets-to-s6-env.sh` | Init script: permissions + sync |
| `sandbox/config/kortix-env-setup.sh` | Cloud-mode proxy URL routing |
| `sandbox/s6-services/svc-kortix-master/run` | kortix-master service definition |
| `sandbox/s6-services/svc-opencode-serve/run` | OpenCode API server (port 4096) |
| `sandbox/s6-services/svc-opencode-web/run` | OpenCode web UI (port 3111) |
| `services/kortix-api/src/providers/routes.ts` | Backend provider API (calls sandbox /env) |
| `services/kortix-api/src/providers/registry.ts` | Provider definitions (single source of truth) |
| OpenCode `auth/index.ts` (upstream) | OpenCode auth.json read/write |
