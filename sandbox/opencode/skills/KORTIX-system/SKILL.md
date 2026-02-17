---
name: kortix-system
description: "Complete Kortix sandbox system architecture reference. Covers: container image, s6 services, filesystem layout, persistence model, environment variables, secrets, ports, runtimes, init scripts, cloud mode, desktop environment, and all installed tooling. Load this skill when you need to understand how the sandbox works, debug service issues, or configure the environment."
---

# Kortix Sandbox System Architecture

The Kortix sandbox is a Docker container running Alpine Linux with a full XFCE desktop, noVNC remote access, and the OpenCode AI agent platform. This document is the definitive reference for how the system works.

## Container Image

- **Base**: `lscr.io/linuxserver/webtop:latest` (Alpine Linux + XFCE + noVNC)
- **Process manager**: s6-overlay v3 with `s6-rc.d` (NOT the older `services.d`)
- **Entry point**: `/opt/startup.sh` → `unshare --pid --fork /init` (PID namespace so s6 gets PID 1)
- **User**: `abc` (UID 1000, set via `PUID=1000`). All services run as `abc` via `s6-setuidgid abc`.

## Filesystem Layout

```
/workspace/                  ← Docker volume. ONLY thing that persists across restarts.
├── .kortix/                 ← Agent memory (MEMORY.md, memory/, journal/, knowledge/)
├── .agent-browser/          ← Browser automation session sockets
├── .browser-profile/        ← Chromium profile data
├── .lss/                    ← Semantic search index (BM25 + embeddings)
├── .local/share/opencode/   ← OpenCode runtime data (sessions, logs, storage, snapshots)
├── .config/                 ← XDG config
├── .XDG/                    ← XDG runtime
├── .cache/opencode/         ← Bun cache for OpenCode plugins/tools
├── presentations/           ← Generated slide decks
├── ssl/                     ← SSL certificates
├── Desktop/                 ← XFCE desktop files
└── [user files]             ← Everything the user creates

/opt/opencode/               ← OpenCode config (agents, tools, skills, plugins, commands)
├── opencode.jsonc            ← Main OpenCode config
├── agents/                   ← Agent definitions (kortix-main.md, etc.)
├── tools/                    ← Custom tools (web-search, image-gen, etc.)
├── skills/                   ← Skill definitions (this file lives here)
├── commands/                 ← Slash commands (/init, /journal, etc.)
├── plugin/                   ← Plugins (worktree, memory)
├── memory.json               ← Memory system config
└── node_modules/             ← Tool dependencies (installed via bun)

/opt/bun/                    ← Bun runtime
/opt/bun-pty-musl/           ← Musl-compatible bun-pty .so library
/opt/kortix-master/          ← Kortix Master proxy + secret store server
/opt/kortix/                 ← Version info (.version) and changelog
/opt/agent-browser-viewer/   ← Browser viewer HTML UI
/app/secrets/                ← Docker volume. Encrypted secret storage.
/config                      ← Symlink → /workspace
```

## Persistence Model

**Critical: Only TWO things persist across container restarts:**

| Path | Volume | What |
|---|---|---|
| `/workspace` | `workspace` | All user data, agent memory, sessions, config |
| `/app/secrets` | `secrets_data` | Encrypted API keys and environment variables |

**Everything else is ephemeral.** `/opt`, `/usr`, `/etc`, `/tmp` — all reset on container rebuild. If you install packages via `apk add` or `npm install -g`, they will be lost on rebuild. Only `/workspace` survives.

## Services & Ports

All services are managed by s6-rc.d as longruns. Service scripts live at `/etc/s6-overlay/s6-rc.d/svc-*/run`.

| Service | Script | Internal Port | Host Port | Description |
|---|---|---|---|---|
| Kortix Master | `svc-kortix-master` | 8000 | 14000 | Reverse proxy + secret store. Entry point for API access. |
| OpenCode Web | `svc-opencode-web` | 3111 | 14001 | Web UI (SolidJS app from `@kortix/opencode-ai` npm package) |
| OpenCode Serve | `svc-opencode-serve` | 4096 | (proxied via 8000) | Backend API server. Not exposed directly — proxied by Kortix Master. |
| Desktop (noVNC) | (base image) | 6080 / 6081 | 14002 / 14003 | XFCE desktop via VNC. HTTP / HTTPS. |
| Presentation Viewer | `svc-presentation-viewer` | 3210 | 14004 | Serves generated slide decks |
| Agent Browser Stream | (agent-browser) | 9223 | 14005 | Playwright browser automation WebSocket |
| Agent Browser Viewer | `svc-agent-browser-viewer` | 9224 | 14006 | Browser session viewer UI (HTML + SSE bridge) |
| lss-sync | `svc-lss-sync` | — | — | File watcher daemon for semantic search indexing |

### Kortix Master Details

Kortix Master (`/opt/kortix-master/src/index.ts`, runs via Bun) is the main entry point:
- Proxies all requests to OpenCode Serve at `localhost:4096`
- Exposes `/env` API for secret management (GET/POST/DELETE)
- Health check at `/kortix/health`
- Version info at `/kortix/version`

## Environment Variables

### Core Config

| Variable | Value | Description |
|---|---|---|
| `OPENCODE_CONFIG_DIR` | `/opt/opencode` | Where agents, tools, skills, plugins live |
| `KORTIX_WORKSPACE` | `/workspace` | Workspace root |
| `OPENCODE_FILE_ROOT` | `/` | File explorer shows full filesystem (set in svc-opencode-serve) |
| `OPENCODE_PERMISSION` | `{"*":"allow"}` | Auto-approve all tool calls |
| `BUN_PTY_LIB` | `/opt/bun-pty-musl/librust_pty.so` | Musl-compatible PTY library path |
| `BUN_INSTALL` | `/opt/bun` | Bun installation directory |
| `LSS_DIR` | `/workspace/.lss` | Semantic search index location |
| `HOME` | `/workspace` | Set by service scripts (not globally) |
| `DISPLAY` | `:1` | X11 display for desktop apps |

### Agent Browser Config

| Variable | Value |
|---|---|
| `AGENT_BROWSER_EXECUTABLE_PATH` | `/usr/bin/chromium-browser` |
| `AGENT_BROWSER_PRIMARY_SESSION` | `kortix` |
| `AGENT_BROWSER_STREAM_PORT` | `9223` |
| `AGENT_BROWSER_PROFILE` | `/workspace/.browser-profile` |
| `AGENT_BROWSER_SOCKET_DIR` | `/workspace/.agent-browser` |
| `AGENT_BROWSER_ARGS` | `--no-sandbox,--disable-setuid-sandbox,...` |

### Cloud Mode Variables

| Variable | Description |
|---|---|
| `ENV_MODE` | `local` (Docker) or `cloud` (Kortix platform) |
| `KORTIX_API_URL` | Router proxy URL (cloud mode routes SDK calls through this) |
| `KORTIX_TOKEN` | Auth token for Kortix API |
| `SANDBOX_ID` | Sandbox identifier |
| `PROJECT_ID` | Project identifier |

When `ENV_MODE=cloud`, the init script `98-kortix-env` rewrites SDK base URLs:
- `TAVILY_API_URL` → `${KORTIX_API_URL}/tavily`
- `SERPER_API_URL` → `${KORTIX_API_URL}/serper`
- `FIRECRAWL_API_URL` → `${KORTIX_API_URL}/firecrawl`
- `REPLICATE_API_URL` → `${KORTIX_API_URL}/replicate`
- `CONTEXT7_API_URL` → `${KORTIX_API_URL}/context7`

### Desktop Config

| Variable | Value |
|---|---|
| `CUSTOM_PORT` | `6080` |
| `CUSTOM_HTTPS_PORT` | `6081` |
| `SELKIES_MANUAL_WIDTH` | `1920` |
| `SELKIES_MANUAL_HEIGHT` | `1080` |
| `TITLE` | `Kortix Computer` |

## Secrets & Environment Variable System

The sandbox has a unified secret/env management system. Secrets are AES-256-GCM encrypted at rest, stored on a separate Docker volume, and propagated to all services through three mechanisms.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  API Request: POST /env/ANTHROPIC_API_KEY {"value": "sk-..."}  │
├─────────────────────────────────────────────────────────────────┤
│  1. SecretStore.setEnv()                                       │
│     → Encrypts with AES-256-GCM                                │
│     → Writes to /app/secrets/.secrets.json (Docker volume)     │
│     → Sets process.env.ANTHROPIC_API_KEY in Kortix Master      │
│                                                                 │
│  2. writeS6Env()                                               │
│     → Writes /run/s6/container_environment/ANTHROPIC_API_KEY   │
│     → All s6 services pick this up via #!/usr/bin/with-contenv │
│                                                                 │
│  3. (optional) restartService()                                │
│     → Restarts svc-opencode-serve + svc-opencode-web           │
│     → New process inherits updated env from s6                 │
├─────────────────────────────────────────────────────────────────┤
│  Result: Variable available in ALL processes                   │
│  • Node.js: process.env.ANTHROPIC_API_KEY                      │
│  • Python:  os.environ['ANTHROPIC_API_KEY']                    │
│  • Bash:    $ANTHROPIC_API_KEY                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Storage & Encryption

| File | Path | Description |
|---|---|---|
| Encrypted secrets | `/app/secrets/.secrets.json` | JSON: `{ secrets: { KEY: "iv:authTag:ciphertext" }, version: 1 }` |
| Salt | `/app/secrets/.salt` | 32 random bytes, generated on first use |
| s6 env files | `/run/s6/container_environment/KEY` | One plaintext file per key, read by `with-contenv` |

**Encryption details:**
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key derivation**: `scryptSync(KORTIX_TOKEN || 'default-key', salt, 32)`
- **Format**: `iv_hex:authTag_hex:ciphertext_hex`
- **File permissions**: `0o600` on secrets file, `0o700` on secrets directory

### Boot Sequence

On container start, the `97-secrets-to-s6-env` init script runs:

1. **Creates/fixes permissions** on `/app/secrets/` (chown to `abc:users`, chmod 700)
2. **Fixes permissions** on `/run/s6/container_environment/` (chown to `abc:users`)
3. **First run only**: If `.secrets.json` doesn't exist, seeds template keys from `/opt/kortix-master/seed-env.json` — creates placeholder entries for common API keys (all empty strings)
4. **Syncs to s6**: Runs `sync-s6-env.ts` — decrypts all secrets and writes each as a file to `/run/s6/container_environment/KEY`
5. **Kortix Master startup**: Calls `secretStore.loadIntoProcessEnv()` — loads all decrypted secrets into its own `process.env`

### Seed Template Keys

On first run (when `.secrets.json` doesn't exist), these keys are pre-created with empty values from `/opt/kortix-master/seed-env.json`:

```
ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY,
GROQ_API_KEY, XAI_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY,
SERPER_API_KEY, REPLICATE_API_TOKEN, CONTEXT7_API_KEY, ELEVENLABS_API_KEY,
AGENT_BROWSER_PROXY, KORTIX_AGENT_EMAIL_INBOX_* (6 email keys)
```

### API Reference

All endpoints served by Kortix Master at `localhost:8000`. In VPS mode, requires `Authorization: Bearer <INTERNAL_SERVICE_KEY>` header.

#### List all secrets

```bash
curl http://localhost:8000/env
```
Returns: `{ "ANTHROPIC_API_KEY": "sk-ant-...", "OPENAI_API_KEY": "sk-...", ... }`

#### Get one secret

```bash
curl http://localhost:8000/env/ANTHROPIC_API_KEY
```
Returns: `{ "ANTHROPIC_API_KEY": "sk-ant-..." }` or 404 if not found.

#### Set one secret

```bash
curl -X POST http://localhost:8000/env/ANTHROPIC_API_KEY \
  -H "Content-Type: application/json" \
  -d '{"value": "sk-ant-your-key-here"}'
```

The value is immediately:
- Encrypted and persisted to `/app/secrets/.secrets.json`
- Set in Kortix Master's `process.env`
- Written to `/run/s6/container_environment/ANTHROPIC_API_KEY`

**With service restart** (forces OpenCode to pick up the new value):
```bash
curl -X POST http://localhost:8000/env/ANTHROPIC_API_KEY \
  -H "Content-Type: application/json" \
  -d '{"value": "sk-ant-...", "restart": true}'
```

#### Set multiple secrets at once

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
Returns: `{ "ok": true, "updated": 3, "restarted": true }`

By default (`restart` not set to `false`), this auto-restarts `svc-opencode-serve` and `svc-opencode-web`.

#### Delete a secret

```bash
curl -X DELETE http://localhost:8000/env/OLD_KEY
# With restart:
curl -X DELETE "http://localhost:8000/env/OLD_KEY?restart=1"
```

### How Services Access Secrets

Every s6 service script starts with `#!/usr/bin/with-contenv bash`, which sources all files in `/run/s6/container_environment/` as env vars. So:

1. **At boot**: `97-secrets-to-s6-env` decrypts all secrets → writes to s6 env dir → services start with those values
2. **At runtime**: `POST /env/:key` writes to both the encrypted store AND the s6 env dir → already-running processes see the old value (unless restarted)
3. **With `restart: true`**: Also restarts `svc-opencode-serve` + `svc-opencode-web` via `s6-svc -r` so they pick up new values

**For new values to take effect in OpenCode, you usually need `restart: true`** (or the bulk `POST /env` which defaults to restart).

### Cross-Language Access

Once set, env vars are available everywhere:

```javascript
// Node.js / Bun
process.env.ANTHROPIC_API_KEY
```

```python
# Python
import os
os.environ.get('ANTHROPIC_API_KEY')
```

```bash
# Bash
echo $ANTHROPIC_API_KEY
```

### VPS Mode Auth

When `INTERNAL_SERVICE_KEY` is set (VPS deployment), all `/env` endpoints require:
```bash
curl -H "Authorization: Bearer $INTERNAL_SERVICE_KEY" http://localhost:8000/env
```
In local Docker mode (no `INTERNAL_SERVICE_KEY`), all requests are allowed.

### Troubleshooting Secrets

| Problem | Cause | Fix |
|---|---|---|
| Secret not in env | Set without restart | Re-set with `"restart": true` or restart service manually |
| All secrets gone after rebuild | `/app/secrets` volume deleted | Secrets volume must persist. Check `docker compose` volumes. |
| Decryption error | `KORTIX_TOKEN` changed | Must use same token that encrypted the secrets. May need to recreate. |
| Permission denied on `/app/secrets` | Ownership mismatch | `chown -R abc:users /app/secrets && chmod 700 /app/secrets` |
| Seed keys missing | `.secrets.json` existed before seed | Seeding only runs on first boot when no `.secrets.json` exists |

## Init Scripts (Boot Order)

These run as `cont-init.d` scripts during s6 startup, in numerical order:

| Script | File | What It Does |
|---|---|---|
| 96 | `96-fix-bun-pty` | Patches bun-pty `.so` files in `/workspace/.cache/opencode/` for musl compatibility |
| 97 | `97-secrets-to-s6-env` | Syncs encrypted secrets → s6 environment. Seeds template keys on first run. |
| 98 | `98-kortix-env` | Cloud mode: rewrites SDK base URLs to route through Kortix API proxy |
| 99 | `99-customize` | XFCE dark theme, wallpaper, terminal config. Runs once (idempotent via `.heyagi-customized` marker). |

## Runtimes & Tools

### Languages

| Runtime | Location | Notes |
|---|---|---|
| Node.js + npm | Alpine repos (`/usr/bin/node`) | System install |
| Bun | `/opt/bun/bin/bun` | Also at `/usr/local/bin/bun` (symlink) |
| Python 3 + pip | System (`/usr/bin/python3`) | With virtualenv, uv, numpy, playwright, etc. |
| Bash | `/bin/bash` | Alpine default |

### Key Tools

| Tool | Description |
|---|---|
| `opencode` | OpenCode CLI — `opencode serve` (API), `opencode web` (UI) |
| `agent-browser` | Headless browser automation for AI (npm global, uses system Chromium) |
| `lss-sync` | File watcher for semantic search indexing |
| `lss` | Semantic search CLI (BM25 + embeddings) |
| `git` | Version control |
| `curl` | HTTP client |
| `chromium-browser` | System Chromium at `/usr/bin/chromium-browser` |
| `uv` | Python package runner (at `/usr/local/bin/uv`) |
| `bun` | JavaScript/TypeScript runtime and package manager |

### Python Packages (pre-installed)

Versions managed in `sandbox/package.json` under `kortix.pythonDependencies`. Includes: `playwright`, `numpy`, `requests`, `beautifulsoup4`, `lxml`, `Pillow`, and others.

## OpenCode Configuration

Main config at `/opt/opencode/opencode.jsonc`:

- **Default agent**: `kortix-main`
- **Built-in agents disabled**: `build`, `plan`, `explore`, `general` — replaced by Kortix agents
- **Permission**: `allow` (all tool calls auto-approved)
- **Plugins**: `opencode-pty`, `./plugin/worktree.ts`
- **MCP servers**: Context7 (remote, for documentation lookup)
- **Provider**: Kortix router (OpenAI-compatible, routes through `KORTIX_API_URL`)

### Agents

Located at `/opt/opencode/agents/`:

| Agent | File | Role |
|---|---|---|
| `kortix-main` | `kortix-main.md` | Default. General-purpose autonomous agent. |
| `kortix-plan` | `kortix-plan.md` | Structured planning and architecture |
| `kortix-explore` | `kortix-explore.md` | Fast read-only codebase exploration |
| `kortix-research` | `kortix-research.md` | Deep research with citations |
| `kortix-fullstack` | `kortix-fullstack.md` | Full-stack web apps (Convex + Vite React) |
| `kortix-browser` | `kortix-browser.md` | Browser automation via Playwright |
| `kortix-slides` | `kortix-slides.md` | Presentation creation |
| `kortix-image-gen` | `kortix-image-gen.md` | Image generation and editing |
| `kortix-sheets` | `kortix-sheets.md` | Spreadsheets and data analysis |


### Custom Tools

Located at `/opt/opencode/tools/`:

| Tool | File | Description |
|---|---|---|
| Web Search | `web-search.ts` | Tavily search API |
| Image Search | `image-search.ts` | Serper Google Images API |
| Image Gen | `image-gen.ts` | Replicate image generation (Flux) |
| Video Gen | `video-gen.ts` | Replicate video generation (Seedance) |
| Scrape Webpage | `scrape-webpage.ts` | Firecrawl web scraping |
| Presentation Gen | `presentation-gen.ts` | HTML slide deck creation |
| Show User | `show-user.ts` | Present outputs to user UI |


### Slash Commands

Located at `/opt/opencode/commands/`:

| Command | Description |
|---|---|
| `/init` | Scan workspace, populate MEMORY.md |
| `/journal` | Write session summary |
| `/memory-init` | Bootstrap memory system |
| `/memory-status` | Show memory state |
| `/memory-search [query]` | Search all memory |
| `/search [query]` | Full semantic search |
| `/research [topic]` | Deep research via @kortix-research |
| `/email [action]` | Manage agent inbox |
| `/slides [topic]` | Create presentation via @kortix-slides |
| `/spreadsheet [desc]` | Create/edit spreadsheet via @kortix-sheets |

## Debugging

### Check service status

```bash
# s6-rc doesn't have a "status" command — check if process is running
ps aux | grep -E "(opencode|kortix-master|lss-sync|bun)"

# Check service logs (s6 captures stdout/stderr)
cat /var/log/s6-*/svc-opencode-serve/current 2>/dev/null

# Or check s6 scan directory
ls /run/service/
```

### Restart a service

```bash
# s6-rc services can be restarted by sending SIGTERM (s6 auto-restarts longruns)
# Find the PID
pgrep -f "opencode serve"
# Kill it (s6 will restart)
kill $(pgrep -f "opencode serve")
```

### Check secrets

```bash
# List all secrets via API
curl http://localhost:8000/env

# Check if a secret is in the environment
env | grep ANTHROPIC_API_KEY

# Check s6 container environment files
ls /run/s6/container_environment/
```

### Check health

```bash
# Kortix Master health
curl http://localhost:8000/kortix/health

# OpenCode API (via proxy)
curl http://localhost:8000/api/health

# Desktop (noVNC)
curl http://localhost:6080/

# Version info
curl http://localhost:8000/kortix/version
```

### Common issues

| Problem | Cause | Fix |
|---|---|---|
| `opencode` command not found | npm global not in PATH | Use full path: `PATH="/opt/bun/bin:/usr/local/bin:/usr/bin:/bin"` |
| bun-pty crash / segfault | glibc .so on musl | Check `BUN_PTY_LIB` env var, run `96-fix-bun-pty` |
| Secrets not in environment | s6 env not synced | Run `97-secrets-to-s6-env` or set via `curl localhost:8000/env` |
| Service won't start | Wrong permissions | `chown -R abc:abc /workspace` |
| File explorer shows wrong root | `OPENCODE_FILE_ROOT` not set | Check `svc-opencode-serve/run` has `OPENCODE_FILE_ROOT=/` |
| Cloud mode SDK calls fail | `KORTIX_API_URL` empty | Set it via `curl -X POST localhost:8000/env/KORTIX_API_URL ...` |

## Docker Compose

```bash
# Build and start
docker compose -f sandbox/docker-compose.yml up --build -d

# View logs
docker compose -f sandbox/docker-compose.yml logs -f

# Shell into container
docker exec -it kortix-sandbox bash

# Shell as user abc
docker exec -it -u abc kortix-sandbox bash
```

### Volumes

| Volume | Mount | Purpose |
|---|---|---|
| `workspace` | `/workspace` | All persistent data |
| `secrets_data` | `/app/secrets` | Encrypted secrets |

### Resource Limits

- `shm_size: 2gb` — Required for Chromium
- `cap_add: SYS_ADMIN` — Required for PID namespace (`unshare`)
- `security_opt: seccomp=unconfined` — Required for Chromium sandbox
