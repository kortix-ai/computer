# Kortix Instance

This is a **Kortix Instance** — a self-contained, autonomous AI operating system.

## What This Is

A Kortix Instance is the complete runtime environment for an autonomous AI agent. It is not a chatbot. It is not an assistant. It is a fully autonomous digital worker with its own identity, memory, tools, skills, and persistent state.

Everything the agent needs to operate lives inside this sandbox — a Docker container running an Alpine Linux + XFCE desktop environment with all services, tools, and runtimes pre-installed.

---

## Filesystem Layout

`/workspace` is the single root for all user and agent data. Everything lives here.

```
/workspace/                              ← HOME, WORKDIR, KORTIX_WORKSPACE
├── .git/                                ← Workspace itself can be a git repo
├── project-a/                           ← Cloned repos (each with .git/ = a "project")
│   └── .git/
├── project-b/
│   └── .git/
│
├── .kortix/                             ← THE AGENT'S BRAIN
│   ├── identity.md                      ← Agent identity and purpose
│   ├── human.md                         ← User identity and preferences
│   ├── project.md                       ← Project knowledge and conventions
│   ├── scratchpad.md                    ← Working memory (current task state)
│   ├── memory/                          ← Long-term persistent knowledge
│   ├── journal/                         ← Session summaries (episodic memory)
│   └── knowledge/                       ← Research outputs and reference material
│
├── presentations/                       ← Slide deck outputs (served on :3210)
│
├── .local/share/opencode/               ← OpenCode session + state storage
│   └── storage/
│       ├── project/<id>.json            ← Project metadata (auto-detected)
│       ├── session/<projectID>/<id>.json← Sessions scoped to projects
│       ├── message/<sessionID>/*.json   ← Messages
│       └── part/<messageID>/*.json      ← Message parts
│
├── .lss/                                ← Semantic search database (lss.db)
├── .agent-browser/                      ← Browser automation sockets
├── .browser-profile/                    ← Chromium profile data
├── .show-user/                          ← Show-user tool queue (queue.jsonl)
│
├── .config/                             ← XFCE/app configuration (XDG_CONFIG_HOME)
├── .local/                              ← XDG data and state
├── Desktop/                             ← Desktop folder (symlinked presentations)
└── ssl/                                 ← SSL certificates
```

### Path Conventions

| Path | Purpose |
|------|---------|
| `/workspace` | Everything. HOME directory. Agent working directory. |
| `/workspace/.kortix/` | Agent brain — memory, identity, journal, knowledge |
| `/workspace/presentations/` | Slide deck output directory |
| `/workspace/.local/share/opencode/` | OpenCode session storage |
| `/workspace/.lss/` | Semantic search SQLite database |
| `/opt/opencode/` | Agent framework (read-only): agents, tools, skills, commands |
| `/opt/kortix-master/` | Reverse proxy service code |
| `/opt/bun/` | Bun runtime |

### Backward Compatibility

The base Docker image (`linuxserver/webtop:latest` — Alpine XFCE) uses `/config` as the home directory. A symlink `/config → /workspace` exists for backward compatibility with any base image init scripts. **All new code should use `/workspace` directly.**

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOME` | `/workspace` | User home directory |
| `KORTIX_WORKSPACE` | `/workspace` | Primary workspace root (used by project scanning) |
| `OPENCODE_CONFIG_DIR` | `/opt/opencode` | Agent framework directory (agents, tools, skills) |
| `LSS_DIR` | `/workspace/.lss` | Semantic search database location |
| `AGENT_BROWSER_EXECUTABLE_PATH` | `/usr/bin/chromium` | Chromium binary for browser automation |
| `AGENT_BROWSER_SOCKET_DIR` | `/workspace/.agent-browser` | Browser automation socket directory |
| `AGENT_BROWSER_PROFILE` | `/workspace/.browser-profile` | Chromium user profile |
| `AGENT_BROWSER_PRIMARY_SESSION` | `kortix` | Primary browser session name |
| `AGENT_BROWSER_STREAM_PORT` | `9223` | Browser viewport WebSocket stream port |
| `ENV_MODE` | `local` | `local` or `cloud` — controls API proxy routing |
| `SANDBOX_ID` | `local` | Sandbox identifier (set by Daytona in cloud mode) |
| `PROJECT_ID` | `local` | Project identifier (set by orchestrator in cloud mode) |
| `KORTIX_API_URL` | `https://api.kortix.ai/v1/router` | Kortix API base URL (cloud mode) |
| `KORTIX_TOKEN` | — | Authentication token for Kortix API (cloud mode) |

---

## Projects — How They Work

A **project** in the Kortix Instance is a git repository. The project system is entirely automatic — no manual creation required.

### Detection

When OpenCode encounters a directory (via CLI startup, API request, or workspace scan), it runs `Project.fromDirectory(directory)`:

1. Walk **up** the directory tree looking for `.git`
2. If found, extract the **first root commit SHA** (`git rev-list --max-parents=0 --all`)
3. That SHA becomes the project's permanent, stable ID
4. Cache the ID in `.git/opencode` for fast subsequent lookups
5. If no `.git` found or no commits exist, fall back to `id: "global"`

### Discovery (Workspace Scanning)

On startup and periodically, OpenCode scans `$KORTIX_WORKSPACE` (`/workspace`) for all `.git` directories. Every git repo found becomes a project automatically. This means:

- Clone a repo into `/workspace/my-app/` → it becomes a project
- Create a new repo with `git init && git commit` → it becomes a project
- Delete the repo → it disappears from the project list

The scan skips: `node_modules/`, `.git/` internals, `vendor/`, `dist/`, `build/`, `.cache/`, `__pycache__/`, `.venv/`, `target/`, and other hidden directories.

### Identity

Project IDs are based on git history, not filesystem paths. This means:

- **Renaming or moving** a repo keeps the same project ID
- **Cloning** the same repo on another machine produces the same ID
- **Multiple worktrees** of the same repo share one project ID
- IDs are 40-character hex strings (SHA-1 commit hashes)

### Project Data Model

```
Project {
  id: string              // Git root commit SHA or "global"
  worktree: string        // Root git directory path
  vcs: "git" | undefined  // Version control system
  name: string?           // User-defined display name
  icon: {
    url: string?          // Auto-discovered favicon (base64 data URL)
    override: string?     // User-uploaded custom icon
    color: string?        // Avatar color (pink, mint, orange, purple, cyan, lime)
  }
  commands: {
    start: string?        // Startup script for new worktrees
  }
  time: { created, updated, initialized? }
  sandboxes: string[]     // Additional git worktree directories
}
```

### Project-Session Relationship

Sessions are scoped to projects:

- Every session has a `projectID` field linking it to a project
- Sessions are stored at `storage/session/<projectID>/<sessionID>.json`
- Listing sessions only returns those belonging to the current project
- Creating a session automatically assigns it to the current project

### API

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/project` | List all projects (triggers workspace scan) |
| `GET` | `/project/current` | Get the current project for this request's directory |
| `PATCH` | `/project/:projectID` | Update project name, icon, or commands |

---

## Core Concepts

### The Filesystem IS the Default Shared State

The filesystem is the base coordination layer. All agents — the primary orchestrator and every specialist subagent — operate on the **same filesystem**. Files are how agents communicate, coordinate, and persist state by default. Agents, skills, tools, memory, commands — all human-readable files.

When `@kortix-research` writes a research report to `/workspace/.kortix/knowledge/`, the main agent can read it later. When `@kortix-main` updates `/workspace/.kortix/project.md` with new architecture decisions, every subagent sees it on their next run. When any agent writes to `/workspace/.kortix/memory/decisions.md`, that knowledge persists forever.

But this is a full computer. If an agent needs a SQLite database, a vector store, a Redis cache, or a full PostgreSQL instance — it installs and runs it. The filesystem is the foundation, not the ceiling. The agent has root access and the entire Linux software ecosystem at its disposal.

### Memory as First-Class

The `.kortix/` directory inside `/workspace` is the agent's persistent brain. It survives container restarts, session endings, and context window resets. It grows over time as the agent learns.

Memory is organized in tiers:

| Tier | Location | Loading | Purpose |
|---|---|---|---|
| **Core** | `identity.md`, `human.md`, `project.md`, `scratchpad.md` | Always in context | Who am I, who is the user, what is the project, what am I doing right now |
| **Long-term** | `memory/*.md` | Retrieved on demand | Persistent facts, decisions, learnings, preferences |
| **Episodic** | `journal/*.md` | Retrieved on demand | Session summaries — what happened, when, what was learned |
| **Knowledge** | `knowledge/*.md` | Retrieved on demand | Research outputs, reference material, accumulated expertise |

Core memory files are loaded automatically into every conversation. Long-term and episodic memory is searched when relevant using `grep` and `glob` across the `.kortix/` directory.

The agent manages its own memory. It decides what to remember, what to update, and what to forget. This is not an external system — the agent has memory tools built into its behavioral instructions.

### Agents as Specialists

A single primary agent (`@kortix-main`) receives all user tasks and either handles them directly or delegates to specialist subagents:

| Agent | Role |
|---|---|
| `@kortix-main` | Primary orchestrator. Handles general tasks, delegates specialist work. |
| `@kortix-research` | Deep research. Investigates topics, finds sources, produces cited reports. |
| `@kortix-browser` | Browser automation. Controls Chromium e2e — navigates, clicks, fills forms, scrapes dynamic content, takes screenshots, tests web UIs. |
| `@kortix-slides` | Presentations. Creates HTML slide decks with custom themes. |
| `@kortix-sheets` | Spreadsheets. Creates Excel files with formulas, formatting, data analysis. |
| `@kortix-web-dev` | Web development. Builds full-stack apps (Convex + Vite React). |
| `@kortix-image-gen` | Image generation. Creates, edits, upscales images via AI models. |

All agents share the filesystem and memory. The primary agent passes detailed, self-contained prompts to subagents. Subagents return results. The primary agent integrates everything.

### Skills as Knowledge

Skills are modular packages that inject domain-specific knowledge into agents on demand. They are NOT always loaded — they activate only when the task requires them.

Each skill contains:
- `SKILL.md` — Instructions and methodology (loaded into context when triggered)
- `scripts/` — Executable code for deterministic operations
- `references/` — Documentation loaded as needed
- `assets/` — Templates and files used in output

Current skills: `KORTIX-memory`, `KORTIX-semantic-search`, `KORTIX-deep-research`, `KORTIX-browser`, `docx`, `email`, `pdf`, `presentations`, `presentation-viewer`, `remotion`, `KORTIX-skill-creator`, `xlsx`.

### Commands as Workflows

Slash commands provide structured workflows the user can trigger. Defined in `.opencode/commands/` as markdown files with frontmatter.

| Command | Purpose |
|---|---|
| `/memory-init` | Bootstrap the memory system interactively — creates dirs, populates identity, learns about the user, scans the workspace |
| `/memory-status` | Report on all memory tiers — contents, sizes, health |
| `/memory-search` | Search across all memory + past sessions (grep + semantic search) |
| `/memory-forget` | Remove or correct something stored in memory |
| `/search` | Full semantic search across everything — files, memory, session history |
| `/init` | Scan workspace, populate `project.md` |
| `/journal` | Write an end-of-session journal entry |
| `/research` | Deep research on a topic (delegates to `@kortix-research`) |
| `/email` | Manage the agent's email inbox |
| `/slides` | Create a presentation (delegates to `@kortix-slides`) |
| `/spreadsheet` | Create/edit spreadsheets (delegates to `@kortix-sheets`) |

Commands are the primary way a user initializes and interacts with the memory system. On first use, the user runs `/memory-init` to bootstrap everything — no static template files needed.

---

## Services

Background processes that run continuously inside the container, managed by s6-overlay:

| Service | Port | Purpose |
|---|---|---|
| **OpenCode API** | 4096 | Headless API server (proxied by Kortix Master) |
| **OpenCode Web UI** | 3111 | Browser-based agent interface |
| **Kortix Master** | 8000 | Reverse proxy — all external traffic enters here |
| **Presentation Viewer** | 3210 | Watches for and serves slide deck presentations |
| **Agent Browser Stream** | 9223 | WebSocket stream of browser viewport for live preview |
| **Agent Browser Viewer** | 9224 | Web UI to watch/interact with the agent's browser session |
| **lss-sync** | — | File-watcher daemon: inotify-based real-time semantic search indexing |

### Service Architecture

```
External Traffic (port 8000)
    │
    ▼
Kortix Master (reverse proxy)
    │
    ├── /api/* ──────────▶ OpenCode API (port 4096)
    ├── /web/* ──────────▶ OpenCode Web UI (port 3111)
    └── /kortix/* ───────▶ Internal endpoints (health, secrets)

lss-sync (background)
    │
    └── Watches /workspace for file changes
        └── Re-indexes into /workspace/.lss/lss.db
```

---

## Build Architecture

### Base Image

`linuxserver/webtop:latest` — Alpine Linux XFCE providing:
- XFCE desktop environment (lightweight, full-featured)
- Selkies for remote desktop access (port 6080)
- s6-overlay v3 for service management (s6-rc.d)
- Non-root user `abc` (UID 911)

### Docker Layers

1. **Base image** — Alpine Linux + XFCE + s6-overlay v3
2. **System runtimes** — Python 3, Node.js, Bun, uv, Playwright
3. **LSS** — Local Semantic Search (pip package)
4. **Agent Browser** — Headless browser automation (npm global + chromium patch)
5. **OpenCode CLI** — Agent framework CLI (npm global)
6. **OpenCode config** — Agents, tools, skills, commands → `/opt/opencode/`
7. **Kortix Master** — Reverse proxy → `/opt/kortix-master/`
8. **Workspace setup** — Directory structure, permissions, `/config` symlink
9. **Services** — s6-rc.d longrun definitions → `/etc/s6-overlay/s6-rc.d/`
10. **Init scripts** — Container init → `/custom-cont-init.d/`

### Volumes

| Volume | Mount Point | Purpose |
|--------|-------------|---------|
| `workspace` | `/workspace` | All user/agent data (persistent) |
| `secrets_data` | `/app/secrets` | Secret storage |

### Backward Compatibility Note

The base image internally references `/config` as the home directory. A symlink `/config → /workspace` is created during the Docker build. This allows the base image's s6-overlay init scripts and other LinuxServer.io conventions to continue working without modification. **All Kortix code uses `/workspace` directly.**

### Cloud Deployment (Daytona)

In cloud mode, the container runs inside a Daytona sandbox:
- Daytona provides its own PID 1 agent
- `startup.sh` uses `unshare --pid --fork /init` to create a PID namespace where s6-overlay becomes PID 1
- Environment variables (`KORTIX_API_URL`, `KORTIX_TOKEN`, `ENV_MODE=cloud`) are injected by the orchestrator
- In cloud mode, `kortix-env-setup.sh` rewrites SDK base URLs to route through the Kortix API proxy

---

## How the Agent Should Interact

### Path References

- Use `$HOME` or `/workspace` for absolute paths
- Use `~/` shorthand in user-facing output
- Never hardcode `/config` — it's a legacy symlink
- For semantic search: `lss "query" -p /workspace -k 10 --json`
- For memory search: `lss "query" -p /workspace/.kortix/ -k 5 --json`

### Project Awareness

- The agent operates within a project context (determined by its working directory)
- Tools resolve paths relative to `Instance.directory` (the current working directory)
- The system prompt includes the current project's git status, working directory, and platform

### Resource Boundaries

- The agent runs as user `abc` (UID 911) but has `sudo` access
- `/workspace` is fully writable — the agent can create any files or directories
- `/opt/opencode/` is writable — plugins can install at runtime
- System packages can be installed via `apk add`
- The agent has full network access

---

## Secrets

The `.env` file gives the instance its operational identity:
- **API keys** — Access to LLMs, search engines, image generation, web scraping
- **Email credentials** — The agent's own email inbox (not the user's)
- **Service tokens** — Authentication for external services

Secrets are never committed to git. They are injected via environment variables at container start.

---

## How It All Fits Together

1. **Container boots** → s6-overlay starts, XFCE desktop launches, all background services come up.
2. **User opens OpenCode** → Web UI at `:3111` or terminal CLI. Agent framework loads config from `/opt/opencode/`.
3. **Projects detected** → OpenCode scans `/workspace` for git repos. Each repo becomes a project.
4. **Agent activates** → `@kortix-main` loads. Bootstrap instructions tell it to read core memory files (`identity.md`, `human.md`, `project.md`, `scratchpad.md`).
5. **User gives task** → Agent plans, executes, delegates to subagents as needed. All agents read/write the shared filesystem.
6. **Agent remembers** → Important findings written to `memory/`. Session summaries written to `journal/`. Project knowledge updated in `project.md`.
7. **Session ends** → Memory persists on disk. Next session, the agent picks up exactly where it left off, with full context of everything it has learned.
8. **Over time** → The `.kortix/` directory grows. The agent becomes increasingly specialized to this specific user, project, and domain. It gets better the longer you use it.

---

## Design Principles

- **Autonomy over assistance.** The agent acts, decides, and executes. It does not ask for permission.
- **Filesystem as foundation.** The base layer is files — human-readable, git-trackable, grep-searchable. But the agent has a full computer. If it needs a database, a vector store, or any other tool, it installs and uses it.
- **Memory over repetition.** Learn once, remember forever. Never ask the user the same question twice.
- **Truth over comfort.** The agent follows evidence, not expectations.
- **Transparency over magic.** Every memory file is readable. Every decision is traceable. Nothing is hidden.
- **Projects as git repos.** A project is defined by its git identity. No manual setup, no configuration files. Clone a repo, it's a project. Delete it, it's gone.
