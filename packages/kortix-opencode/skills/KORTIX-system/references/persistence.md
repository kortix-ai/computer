# Persistence Model

Use this file when you need to know what survives restarts, where to store files, or how to install packages safely.

## Core Rule

Only `/workspace` persists across container restarts and image updates. Anything outside `/workspace` is ephemeral.

## What Persists Automatically

| What | Path | Notes |
|---|---|---|
| User files, repos, data | `/workspace/*` | The workspace is the Docker volume |
| Installed skills | `/workspace/.opencode/skills/` | Marketplace installs survive restarts |
| Secrets | `/workspace/.secrets/` | AES-256-GCM encrypted |
| Agent memory and sessions | `/workspace/.local/share/opencode/` | SQLite and storage files |
| Browser profile | `/workspace/.browser-profile/` | Chrome data |
| Semantic search index | `/workspace/.lss/` | Rebuilt if missing |
| Sandbox state | `/workspace/.kortix/` | Update and loop state |
| pip packages | `/workspace/.local/lib/python3.*/` | `pip install` auto-persists |
| npm global packages | `/workspace/.npm-global/` | `npm install -g` auto-persists |
| Project packages | `/workspace/<project>/node_modules/` | Repo-local installs |
| apk package manifest | `/workspace/.kortix/packages/apk-packages.txt` | Restored on boot through `apk-persist` |

## What Does Not Persist

| What | Path | Notes |
|---|---|---|
| Raw `apk add` installs | `/usr/bin/`, `/usr/lib/` | Lost on restart unless installed via `apk-persist` |
| System config changes | `/etc/` | Lost on recreate |
| Files in `/opt/`, `/tmp/`, `/root/` | various | Ephemeral |

## Safe Installation Patterns

```bash
pip install requests pandas flask
npm install -g typescript ts-node prettier
apk-persist ffmpeg imagemagick sqlite
apk-persist --list
```

## Update-Safe Boot Flow

When a fresh container comes up:

1. `/workspace` is reattached
2. pip packages already exist in `/workspace/.local/`
3. npm globals already exist in `/workspace/.npm-global/`
4. saved apk packages are reinstalled from the manifest
5. PATH includes the persistent bin directories automatically

## Persistence Environment Variables

| Variable | Value | Effect |
|---|---|---|
| `PYTHONUSERBASE` | `/workspace/.local` | pip writes to persistent storage |
| `PIP_USER` | `1` | forces user-mode pip installs |
| `NPM_CONFIG_PREFIX` | `/workspace/.npm-global` | npm globals persist |
| `PATH` | includes persistent bin dirs | commands remain available |

## Practical Rule of Thumb

If a file should survive restarts, put it under `/workspace`. Plans, notes, scripts, generated outputs, and long-lived config all belong there.
