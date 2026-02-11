# Kortix Instance

This is a **Kortix Instance** — a self-contained, autonomous AI operating system.

## What This Is

A Kortix Instance is the complete runtime environment for an autonomous AI agent. It is not a chatbot. It is not an assistant. It is a fully autonomous digital worker with its own identity, memory, tools, skills, and persistent state.

Everything the agent needs to operate lives inside this sandbox:

```
sandbox/
├── KORTIX.md               ← You are here. Instance documentation.
├── .env                     ← Instance secrets (API keys, credentials)
├── Dockerfile               ← Container image (Ubuntu + KDE desktop + tools)
├── docker-compose.yml       ← Container orchestration
│
├── workspace/               ← Persistent working directory (Docker volume)
│   └── .kortix/             ← THE AGENT'S BRAIN (memory, identity, journal)
│       ├── identity.md      ← Agent identity and purpose
│       ├── human.md         ← User identity and preferences
│       ├── project.md       ← Project knowledge and conventions
│       ├── scratchpad.md    ← Working memory (current task state)
│       ├── memory/          ← Long-term persistent knowledge
│       ├── journal/         ← Session summaries (episodic memory)
│       └── knowledge/       ← Research outputs and reference material
│
├── opencode/                ← Agent framework
│   ├── opencode.json        ← Framework configuration
│   ├── agents/              ← Agent definitions (behavioral instructions)
│   ├── skills/              ← Loadable domain knowledge packages
│   │   └── KORTIX-semantic-search/  ← Semantic search skill (lss)
│   └── tools/               ← Custom tool implementations
│
├── config/                  ← Desktop environment configuration
├── services/                ← Background services (auto-start in container)
│   ├── opencode-web/        ← OpenCode Web UI
│   ├── lss-sync/            ← Semantic search index sync daemon
│   ├── agent-browser-viewer/ ← Browser viewer
│   └── KORTIX-presentation-viewer/  ← Presentation viewer
└── assets/                  ← Brand assets (icons, wallpaper)

# Inside the container at runtime (Docker volumes):
/config/
├── Desktop/                 ← Working directory (indexed by lss)
├── workspace/.kortix/       ← Agent brain (indexed by lss)
├── .lss/                    ← lss SQLite database (lss.db)
└── .local/share/opencode/   ← OpenCode session storage
    └── storage/
```

## Core Concepts

### The Filesystem IS the Default Shared State

The filesystem is the base coordination layer. All agents — the primary orchestrator and every specialist subagent — operate on the **same filesystem**. Files are how agents communicate, coordinate, and persist state by default. Agents, skills, tools, memory, commands — all human-readable files.

When `@kortix-research` writes a research report to `workspace/.kortix/knowledge/`, the main agent can read it later. When `@kortix-main` updates `workspace/.kortix/project.md` with new architecture decisions, every subagent sees it on their next run. When any agent writes to `workspace/.kortix/memory/decisions.md`, that knowledge persists forever.

But this is a full computer. If an agent needs a SQLite database, a vector store, a Redis cache, or a full PostgreSQL instance — it installs and runs it. The filesystem is the foundation, not the ceiling. The agent has root access and the entire Linux software ecosystem at its disposal.

### Memory as First-Class

The `.kortix/` directory inside `workspace/` is the agent's persistent brain. It survives container restarts, session endings, and context window resets. It grows over time as the agent learns.

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

Current skills: `KORTIX-memory`, `KORTIX-semantic-search`, `KORTIX-deep-research`, `KORTIX-browser`, `KORTIX-docx`, `KORTIX-email`, `KORTIX-pdf`, `KORTIX-presentations`, `KORTIX-presentation-viewer`, `KORTIX-remotion`, `KORTIX-skill-creator`, `KORTIX-xlsx`.

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

### Services as Infrastructure

Background processes that run continuously inside the container:

| Service | Port | Purpose |
|---|---|---|
| OpenCode Web UI | 3111 | Browser-based agent interface |
| Presentation Viewer | 3210 | Watches for and serves slide deck presentations |
| Agent Browser Stream | 9223 | WebSocket stream of browser viewport for live preview / pair browsing |
| Agent Browser Viewer | 9224 | Web UI to watch/interact with the agent's browser session |
| lss-sync | — | File-watcher daemon: uses inotify to detect changes and re-index into lss semantic search in real time |

Services are managed by s6-overlay and auto-start when the container boots.

### Secrets as Identity

The `.env` files give the instance its operational identity:
- **API keys** — Access to LLMs, search engines, image generation, web scraping
- **Email credentials** — The agent's own email inbox (not the user's)
- **Service tokens** — Authentication for external services

Secrets are never committed to git. They are injected via environment variables at container start.

## How It All Fits Together

1. **Container boots** → Desktop environment starts, background services launch, OpenCode CLI becomes available.
2. **User opens OpenCode** → Web UI at `:3111` or terminal CLI. Agent framework loads `opencode.json` config.
3. **Agent activates** → `@kortix-main` loads. The `opencode.md` bootstrap file instructs the agent to read its core memory files (`identity.md`, `human.md`, `project.md`, `scratchpad.md`) at session start.
4. **User gives task** → Agent plans, executes, delegates to subagents as needed. All agents read/write the shared filesystem.
5. **Agent remembers** → Important findings written to `memory/`. Session summaries written to `journal/`. Project knowledge updated in `project.md`.
6. **Session ends** → Memory persists on disk. Next session, the agent picks up exactly where it left off, with full context of everything it has learned.
7. **Over time** → The `.kortix/` directory grows. The agent becomes increasingly specialized to this specific user, project, and domain. It gets better the longer you use it.

## Design Principles

- **Autonomy over assistance.** The agent acts, decides, and executes. It does not ask for permission.
- **Filesystem as foundation.** The base layer is files — human-readable, git-trackable, grep-searchable. But the agent has a full computer. If it needs a database, a vector store, or any other tool, it installs and uses it.
- **Memory over repetition.** Learn once, remember forever. Never ask the user the same question twice.
- **Truth over comfort.** The agent follows evidence, not expectations.
- **Transparency over magic.** Every memory file is readable. Every decision is traceable. Nothing is hidden.
