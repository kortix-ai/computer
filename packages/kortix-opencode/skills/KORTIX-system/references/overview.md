# Kortix Sandbox Overview

Use this file when you need the high-level sandbox architecture: container base image, filesystem layout, service map, ports, runtimes, and OpenCode defaults.

## Container Image

- Base: `lscr.io/linuxserver/webtop:latest` (Alpine Linux + XFCE + noVNC)
- Process manager: `s6-overlay` v3 with `s6-rc.d`
- Entry point: `/opt/startup.sh` -> `exec unshare --pid --fork /init`
- User: `abc` (UID 1000); services run under `abc` via `s6-setuidgid abc`

## Key Paths

- `/workspace/` - the persistent Docker volume; user files live here
- `/workspace/.opencode/` - user-installed OpenCode config; persists
- `/workspace/.opencode/skills/` - marketplace-installed skills; persists
- `/workspace/opencode` - symlink to `/workspace/.opencode`
- `/workspace/.secrets/` - encrypted secret storage
- `/workspace/.kortix/` - sandbox state, update status, runtime state
- `/opt/opencode/` - built-in agents, tools, skills, plugins, commands; image-baked and ephemeral
- `/opt/kortix-master/` - reverse proxy and secret-store server; ephemeral

## Projects

A project is a git repository detected automatically by OpenCode.

### Detection

When OpenCode resolves a directory, it:

1. walks upward looking for `.git`
2. reads the first root commit SHA with `git rev-list --max-parents=0 --all`
3. uses that SHA as the stable project ID
4. caches the ID in `.git/opencode`
5. falls back to `id: "global"` if no repo exists

### Identity and discovery

- repos under `/workspace` are discovered automatically during scans
- renaming or moving a repo keeps the same project ID
- cloning the same history elsewhere produces the same ID
- sessions are scoped to projects through a `projectID` field

### Project API

| Method | Route | Description |
|---|---|---|
| `GET` | `/project` | List projects and trigger workspace scan |
| `GET` | `/project/current` | Resolve project from current directory |
| `PATCH` | `/project/:projectID` | Update project name, icon, or commands |

## Services and Ports

All long-running services are managed by `s6-rc.d`.

| Service | Internal Port | Host Port | Description |
|---|---|---|---|
| Kortix Master | 8000 | 14000 | Reverse proxy, secret store, public API entry point |
| OpenCode Web | 3111 | 14001 | Web UI |
| OpenCode Serve | 4096 | proxied via 8000 | Backend API |
| Desktop (noVNC) | 6080 / 6081 | 14002 / 14003 | XFCE desktop |
| Presentation Viewer | 3210 | 14004 | Slide viewer |
| Static Web Server | 3211 | 14008 | Serves standalone HTML/assets |
| Agent Browser Stream | 9223 | 14005 | Browser automation WebSocket |
| Agent Browser Viewer | 9224 | 14006 | Browser session viewer UI |
| lss-sync | - | - | Semantic search indexer |

## Portless Policy

When starting user-facing dev servers manually, always use `portless`.

```bash
portless myapp pnpm dev
portless api npm run start
portless docs python -m http.server
```

Share URLs as `http://<name>.localhost:1355`.

## Kortix Master Quick Reference

Kortix Master runs on port `8000` and handles:

- `/env/*` - secret and env management
- `/api/integrations/*` - OAuth integration proxy routes
- `/kortix/health` - sandbox health
- `/kortix/ports` - port mapping info
- `/kortix/update` - self-update endpoint
- `/lss/search` and `/lss/status` - semantic search HTTP surface
- `/proxy/:port/*` - dynamic local port proxy
- `/*` - catch-all proxy to OpenCode serve on `4096`

## Authentication Model

- Inside sandbox or localhost: no auth required for Kortix Master
- Outside sandbox: callers must provide `INTERNAL_SERVICE_KEY`

Two opposite-direction tokens exist:

| Token | Direction | Purpose |
|---|---|---|
| `INTERNAL_SERVICE_KEY` | external -> sandbox | Authenticate inbound external requests |
| `KORTIX_TOKEN` | sandbox -> external | Authenticate outbound calls to Kortix API; also used for secret encryption |

## Core Environment Variables

| Variable | Value or Purpose |
|---|---|
| `OPENCODE_CONFIG_DIR` | `/opt/opencode` |
| `KORTIX_WORKSPACE` | `/workspace` |
| `OPENCODE_FILE_ROOT` | `/` |
| `OPENCODE_PERMISSION` | `{"*":"allow"}` |
| `BUN_PTY_LIB` | `/opt/bun-pty-musl/librust_pty.so` |
| `LSS_DIR` | `/workspace/.lss` |
| `HOME` | `/workspace` |
| `DISPLAY` | `:1` |

## Agent Browser Variables

| Variable | Value |
|---|---|
| `AGENT_BROWSER_EXECUTABLE_PATH` | `/usr/bin/chromium-browser` |
| `AGENT_BROWSER_PRIMARY_SESSION` | `kortix` |
| `AGENT_BROWSER_STREAM_PORT` | `9223` |
| `AGENT_BROWSER_PROFILE` | `/workspace/.browser-profile` |
| `AGENT_BROWSER_SOCKET_DIR` | `/workspace/.agent-browser` |

## Runtimes and Tools

| Runtime or Tool | Location or Notes |
|---|---|
| Node.js + npm | `/usr/bin/node` |
| Bun | `/opt/bun/bin/bun` and `/usr/local/bin/bun` |
| Python 3 + pip | `/usr/bin/python3` |
| Bash | `/bin/bash` |
| `opencode` | CLI for `serve` and `web` |
| `agent-browser` | Browser automation CLI |
| `ocx` | Marketplace installer |
| `apk-persist` | Persistent Alpine package installer |
| `lss` / `lss-sync` | Semantic search CLI and watcher |

## OpenCode Defaults

- main config: `/opt/opencode/opencode.jsonc`
- default agent: `kortix`
- built-in support agents exist, but domain knowledge is meant to live in skills
- permissions are typically `allow`
- plugins load individually from `opencode.jsonc`
- Context7 is the main MCP documentation server
