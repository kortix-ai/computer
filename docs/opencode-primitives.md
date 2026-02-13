# OpenCode Primitives

The fundamental building blocks of OpenCode and how Kortix uses them. Read this first if you're new to the project.

**Official docs**: https://opencode.ai/docs

---

## How It All Fits Together

```
                         opencode.jsonc
                    (central configuration)
                             │
          ┌──────────┬───────┼────────┬──────────┐
          │          │       │        │          │
          ▼          ▼       ▼        ▼          ▼
      Providers    Agents  Plugins   MCP      Permissions
      (LLM APIs)  (*.md)  (*.ts)  (servers)  (allow/ask/deny)
          │          │       │        │          │
          │          │       │        │          │
          └──────────┴───────┼────────┴──────────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Agent Runtime  │
                     │               │
                     │  System Prompt │ ← opencode.md + agent .md + AGENTS.md
                     │  + Tools      │ ← built-in + custom + MCP tools
                     │  + Skills     │ ← metadata always visible, body on demand
                     │  + Permissions│ ← global merged with per-agent
                     └───────┬───────┘
                             │
                  ┌──────────┼──────────┐
                  ▼          ▼          ▼
             Commands     Skills     Subagents
             (/slash)   (SKILL.md)  (via Task tool)
```

**The short version**: You configure providers and permissions in `opencode.jsonc`. You define agents as markdown files with frontmatter. Agents have access to tools, can load skills on demand, invoke subagents via the Task tool, and follow rules from `AGENTS.md`. Commands are prompt templates triggered by `/slash` syntax. Plugins hook into runtime events.

---

## Agents

An agent is a specialized AI persona with its own system prompt, model, tool access, and permissions. Agents are the primary interface between the user and the LLM.

### Two Types

| Type | Description | How to invoke |
|------|-------------|---------------|
| **Primary** | User-facing. Cycle between them with **Tab** key. | Tab key, or set as `default_agent` |
| **Subagent** | Specialist. Only invocable by primary agents or via `@mention`. | `@agentname` in chat, or Task tool from another agent |

### File Format

**Location**: `.opencode/agents/<name>.md` (filename = agent name)

```markdown
---
description: What this agent does (shown in UI and to other agents)
mode: primary              # or "subagent"
model: anthropic/claude-opus-4-6  # optional, overrides default
temperature: 0.7           # optional
tools:
  write: false             # disable specific tools
  bash: true
permission:
  bash:
    "*": ask
    "git *": allow
  skill:
    "internal-*": deny
  task:
    "*": allow
---

You are [agent identity]. Your system prompt goes here.

Everything below the frontmatter is injected as the agent's
system prompt, combined with opencode.md and AGENTS.md.
```

### Key Frontmatter Options

| Option | Type | Description |
|--------|------|-------------|
| `description` | string | **Required.** What the agent does. |
| `mode` | `"primary"` \| `"subagent"` | Agent type. Default: `"all"` (both). |
| `model` | string | Model override. Format: `provider/model-id`. |
| `tools` | object | Enable/disable tools. Supports glob patterns (`mcp_*: false`). |
| `permission` | object | Per-agent permission overrides (merged with global). |
| `temperature` | number | 0.0-1.0. Controls response randomness. |
| `top_p` | number | 0.0-1.0. Controls response diversity. |
| `steps` | number | Max agentic loop iterations before forced text response. |
| `hidden` | boolean | Hide from `@` autocomplete (subagents only). |
| `disable` | boolean | Disable the agent entirely. |
| `color` | string | Hex color for UI display. |

Any unrecognized options are passed through to the provider as model options (e.g., `reasoningEffort: "high"`).

### How Agents Delegate to Each Other

Primary agents delegate to subagents via the **Task tool**:

```
Task(@kortix-research, "Research the history of X and produce a cited report")
```

The subagent starts a **fresh session** with zero prior context. The calling agent must include all relevant information in the Task prompt. When the subagent completes, its final message is returned to the caller.

Task permissions control which subagents an agent can invoke:

```yaml
permission:
  task:
    "*": deny
    "kortix-*": allow
    "code-reviewer": ask
```

### Our Agents

| Agent | Mode | Description |
|-------|------|-------------|
| **kortix-main** | primary | Default orchestrator. Handles all tasks, delegates to specialists. Persistent memory. |
| **kortix-proxy** | primary | Voice proxy. Dispatches background tasks, reports results. For VAPI/phone. |
| **kortix-research** | subagent | Deep research. Evidence-based investigations with cited reports. |
| **kortix-web-dev** | subagent | Full-stack web dev. Convex + Vite React. TDD, strict TypeScript. |
| **kortix-browser** | subagent | Browser automation. Real Chromium via agent-browser CLI. |
| **kortix-slides** | subagent | Presentation creator. HTML slides (1920x1080) with brand theming. |
| **kortix-sheets** | subagent | Spreadsheet specialist. Excel, CSV, data analysis. |
| **kortix-image-gen** | subagent | Image generation/editing. Flux, upscaling, background removal. |

> **Docs**: https://opencode.ai/docs/agents

---

## Skills

A skill is a reusable knowledge module loaded **on demand** by an agent. Think of it as a methodology manual — detailed instructions, workflows, scripts, and reference material that only enters context when needed.

### Three-Level Progressive Disclosure

This is the key design pattern. Skills don't bloat context unless needed:

| Level | What | When loaded | Size |
|-------|------|-------------|------|
| **Metadata** | `name` + `description` from frontmatter | **Always in context** as a catalog | ~100 words per skill |
| **Body** | Full SKILL.md content (instructions, workflows) | When agent calls `skill({ name: "..." })` | <5K words |
| **Resources** | Bundled scripts, references, assets, templates | When the skill body references them | Varies |

The agent always sees the skill catalog (all names + descriptions) and decides which to load based on the task at hand.

### File Format

**Location**: `.opencode/skills/<skill-name>/SKILL.md`

One directory per skill. The directory name must match the `name` in frontmatter.

```markdown
---
name: my-skill-name
description: >
  When to load this skill and what it does. This description is ALWAYS
  visible to the agent — it's the trigger that tells the agent when to
  load the full skill body. Be specific about trigger conditions.
---

# My Skill Name

Full instructions, workflows, and reference material here.
This content only enters context when the agent calls:
  skill({ name: "my-skill-name" })

## Bundled Resources

Scripts live at: .opencode/skills/my-skill-name/scripts/
References at:   .opencode/skills/my-skill-name/references/
Assets at:       .opencode/skills/my-skill-name/assets/
```

### Frontmatter Schema

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | 1-64 chars, lowercase alphanumeric with single hyphens. Must match directory name. |
| `description` | **Yes** | 1-1024 chars. Describes what the skill does AND when to load it. Always visible to agents. |
| `license` | No | License identifier. |
| `compatibility` | No | Platform compatibility note. |
| `metadata` | No | Arbitrary key-value pairs (string-to-string). |

**Name validation**: `^[a-z0-9]+(-[a-z0-9]+)*$` — no leading/trailing hyphens, no consecutive hyphens.

### How Agents Load Skills

An agent loads a skill by calling the `skill` tool:

```
skill({ name: "kortix-memory" })
```

The full SKILL.md body is then injected into the agent's context for the remainder of the session. The agent decides when to load based on the description it sees in the catalog.

Subagent definitions often include a "First Action" section:

```markdown
## First Action: Load Skills
skill({ name: "kortix-deep-research" })
skill({ name: "kortix-paper-search" })
```

### Skill Permissions

Control which skills agents can access:

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

To disable the skill tool entirely for an agent: `tools: { skill: false }`

### Skill Directory Structure

A skill can bundle scripts, references, and assets alongside the SKILL.md:

```
.opencode/skills/my-skill/
├── SKILL.md                 # Required — frontmatter + instructions
├── scripts/                 # Optional — executable code (Python, Bash, etc.)
│   ├── verify.py
│   └── compile.sh
├── references/              # Optional — additional docs loaded on demand
│   └── style-guide.md
├── assets/                  # Optional — templates, fonts, images
│   └── template.tex
└── rules/                   # Optional — topic-specific rule files
    ├── topic-a.md
    └── topic-b.md
```

### Discovery Locations (searched in order)

| Location | Scope |
|----------|-------|
| `.opencode/skills/<name>/SKILL.md` | Project |
| `~/.config/opencode/skills/<name>/SKILL.md` | Global |
| `.claude/skills/<name>/SKILL.md` | Project (Claude Code compat) |
| `~/.claude/skills/<name>/SKILL.md` | Global (Claude Code compat) |
| `.agents/skills/<name>/SKILL.md` | Project (Agent compat) |
| `~/.agents/skills/<name>/SKILL.md` | Global (Agent compat) |

### Our Skills (23)

| Skill | Purpose | Has Scripts |
|-------|---------|:-----------:|
| **kortix-memory** | Persistent memory system (MEMORY.md + long-term) | - |
| **kortix-plan** | Structured 5-phase planning for complex tasks | - |
| **kortix-semantic-search** | Semantic search via LSS (BM25 + embeddings) | - |
| **kortix-session-search** | Search/manage OpenCode sessions (API + on-disk) | - |
| **kortix-secrets** | Global environment variable manager | - |
| **kortix-cron-triggers** | Cron trigger management for scheduled agent execution | - |
| **kortix-email** | Send/receive email via IMAP/SMTP with curl | - |
| **kortix-web-research** | Lightweight web exploration (comparisons, lookups) | - |
| **kortix-deep-research** | Thorough scientific research with cited reports | - |
| **kortix-paper-search** | Academic paper search via OpenAlex (240M+ works) | - |
| **kortix-paper-creator** | LaTeX scientific paper writing (TDD pipeline) | Yes |
| **kortix-skill-creator** | Guide for creating new skills | - |
| **kortix-browser** | Browser automation via agent-browser CLI | - |
| **kortix-presentations** | HTML slide deck creation (1920x1080) | - |
| **kortix-presentation-viewer** | Slide viewer + preview server (port 3210) | Yes |
| **kortix-xlsx** | Spreadsheet creation/editing (.xlsx, .csv) | Yes |
| **kortix-docx** | Word document creation/editing (.docx) | Yes |
| **kortix-pdf** | PDF processing (read, merge, split, forms, OCR) | Yes |
| **kortix-legal-writer** | Legal document drafting with Bluebook citations | Yes |
| **kortix-logo-creator** | Logo design (AI symbols + Google Fonts typography) | Yes |
| **kortix-elevenlabs** | Text-to-speech, voice cloning, sound effects | Yes |
| **kortix-domain-research** | Domain availability checking (RDAP + whois) | Yes |
| **remotion-best-practices** | Video creation in React (Remotion framework) | - |

> **Docs**: https://opencode.ai/docs/skills

---

## Commands

A command is a `/slash`-triggered prompt template. When a user types `/research quantum computing`, the command's template is injected as a message with the arguments substituted in. Commands can route to a specific agent and model.

### File Format

**Location**: `.opencode/commands/<name>.md` (filename = command name, minus `.md`)

```markdown
---
description: What this command does (shown in autocomplete)
agent: kortix-main       # optional — which agent handles this
model: anthropic/claude-opus-4-6  # optional — model override
subtask: false           # optional — force subagent invocation
---

The prompt template goes here. Use placeholders:

$ARGUMENTS — all arguments after the command name
$1, $2     — positional arguments
!`git log --oneline -5` — shell command output injection
@src/index.ts — file content inclusion

Example: Research $ARGUMENTS thoroughly and produce a cited report.
```

### Key Options

| Option | Type | Description |
|--------|------|-------------|
| `description` | string | Shown in TUI autocomplete. |
| `agent` | string | Agent to execute the command. Default: current agent. |
| `model` | string | Model override for this command. |
| `subtask` | boolean | Force subagent invocation (prevents context pollution). |

### Template Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `$ARGUMENTS` | Everything after the command name | `/research quantum computing` → `quantum computing` |
| `$1`, `$2`, `$3`... | Positional arguments | `/deploy staging v2.1` → `$1=staging`, `$2=v2.1` |
| `` !`command` `` | Shell command output injected inline | `` !`git log --oneline -5` `` |
| `@filepath` | File content included inline | `@src/index.ts` |

### Built-in TUI Commands

These come with OpenCode and can't be removed (but can be overridden):

`/compact`, `/connect`, `/details`, `/editor`, `/exit`, `/export`, `/help`, `/init`, `/models`, `/new`, `/redo`, `/sessions`, `/share`, `/themes`, `/thinking`, `/undo`, `/unshare`

### Our Commands (10)

| Command | Agent | Description |
|---------|-------|-------------|
| `/memory-init` | kortix-main | Bootstrap the memory system, learn about the user |
| `/memory-status` | kortix-main | Show memory state and health check |
| `/memory-search` | kortix-main | Search all memory files (keyword + semantic) |
| `/search` | kortix-main | Semantic search across all files and memory |
| `/init` | kortix-main | Scan workspace, populate Project section of MEMORY.md |
| `/journal` | kortix-main | Write a session summary to memory |
| `/research` | kortix-main | Deep research (delegates to @kortix-research) |
| `/email` | kortix-main | Check inbox, send, read, manage email |
| `/slides` | kortix-main | Create presentation (delegates to @kortix-slides) |
| `/spreadsheet` | kortix-main | Create/edit spreadsheet (delegates to @kortix-sheets) |

> **Docs**: https://opencode.ai/docs/commands

---

## Tools

Tools are functions the LLM can call to interact with the system. There are three categories.

### Built-in Tools

| Tool | Permission Key | Description |
|------|---------------|-------------|
| `bash` | `bash` | Execute shell commands |
| `edit` | `edit` | Modify files via exact string replacement |
| `write` | `edit` | Create or overwrite files |
| `patch` | `edit` | Apply patches to files |
| `read` | `read` | Read file contents |
| `grep` | `grep` | Regex content search (uses ripgrep) |
| `glob` | `glob` | Find files by pattern (uses ripgrep) |
| `list` | `list` | List directory contents |
| `skill` | `skill` | Load a SKILL.md into context |
| `todowrite` | `todowrite` | Manage task/todo lists |
| `todoread` | `todoread` | Read task/todo lists |
| `webfetch` | `webfetch` | Fetch web page content |
| `websearch` | `websearch` | Web search via Exa AI |
| `question` | `question` | Ask user questions during execution |
| `lsp` | `lsp` | LSP code intelligence (experimental) |

**Note**: The `edit` permission covers `edit`, `write`, `patch`, and `multiedit` — all file modification tools.

### Custom Tools

User-defined TypeScript/JavaScript functions in `.opencode/tools/`. Filename = tool name.

```typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Query the database",
  args: {
    query: tool.schema.string().describe("SQL query"),
  },
  async execute(args, context) {
    // context has: agent, sessionID, messageID, directory, worktree
    return `Result: ${args.query}`
  },
})
```

Multiple exports per file: each named export becomes `<filename>_<exportname>`.

### MCP Tools

Tools provided by external MCP servers (configured in `opencode.jsonc`). Auto-registered with `servername_` prefix.

### Tool Configuration

Enable/disable tools globally or per-agent:

```json
{
  "tools": { "write": false },
  "agent": {
    "readonly-agent": {
      "tools": { "edit": false, "bash": false, "mcp_*": false }
    }
  }
}
```

Supports **glob patterns**: `"my-mcp*": false` disables all tools from that MCP server.

### Our Custom Tools (7)

| Tool File | Description |
|-----------|-------------|
| `image-gen.ts` | AI image generation/editing (Replicate: Flux, Recraft, BRIA) |
| `image-search.ts` | Google Images search via Serper API |
| `presentation-gen.ts` | HTML slide creation, validation, PDF/PPTX export |
| `scrape-webpage.ts` | Web page extraction via Firecrawl |
| `show-user.ts` | Present files/images/URLs to the user's UI |
| `video-gen.ts` | Video generation (ByteDance Seedance via Replicate) |
| `web-search.ts` | Web search via Tavily API |

> **Docs**: https://opencode.ai/docs/tools | https://opencode.ai/docs/custom-tools

---

## Rules (AGENTS.md)

Rules are custom instructions included in the LLM's context for every session. They provide project-level conventions, coding standards, and constraints.

**Rules = project context.** Agent prompts = behavioral identity. They complement each other.

### File Locations (Precedence: Last Wins)

| Location | Scope |
|----------|-------|
| `~/.config/opencode/AGENTS.md` | Global |
| `AGENTS.md` (project root, traverses up to git root) | Project |
| `~/.claude/CLAUDE.md` | Global (Claude Code fallback) |
| `CLAUDE.md` (project root) | Project (Claude Code fallback) |

### Custom Instruction Files

Load additional rule files from paths, globs, or URLs:

```json
{
  "instructions": [
    "CONTRIBUTING.md",
    "docs/guidelines.md",
    ".cursor/rules/*.md",
    "https://example.com/shared-rules.md"
  ]
}
```

> **Docs**: https://opencode.ai/docs/rules

---

## Permissions

Permissions control what agents can do. Every tool invocation is checked against the permission configuration.

### Three Actions

| Action | Behavior |
|--------|----------|
| `"allow"` | Execute without user approval |
| `"ask"` | Prompt user for approval (once / always / reject) |
| `"deny"` | Block entirely |

### Configuration

Set all permissions at once:
```json
{ "permission": "allow" }
```

Or per tool:
```json
{
  "permission": {
    "*": "ask",
    "bash": "allow",
    "edit": "deny"
  }
}
```

### Granular Rules (Object Syntax)

Match against specific arguments using wildcards (`*`, `?`):

```json
{
  "permission": {
    "bash": {
      "*": "ask",
      "git *": "allow",
      "npm test": "allow",
      "rm -rf *": "deny"
    },
    "edit": {
      "*": "allow",
      "*.lock": "deny"
    }
  }
}
```

**Last matching rule wins.** Put catch-all `"*"` first, specific rules after.

### All Permission Keys

| Key | Matches Against | Notes |
|-----|----------------|-------|
| `bash` | Parsed command string | |
| `edit` | File path | Covers edit, write, patch, multiedit |
| `read` | File path | `.env` files denied by default |
| `glob` | Glob pattern | |
| `grep` | Regex pattern | |
| `list` | Directory path | |
| `task` | Subagent type | Controls which subagents can be invoked |
| `skill` | Skill name | Controls which skills can be loaded |
| `webfetch` | URL | |
| `websearch` | Query string | |
| `external_directory` | Path | Access outside project. Default: `ask` |
| `doom_loop` | (automatic) | Same tool call 3x with identical input. Default: `ask` |

### Per-Agent Overrides

Agent permissions merge with global. Agent-specific rules take precedence:

```yaml
# In agent .md frontmatter
permission:
  bash:
    "git push *": deny
  task:
    "*": allow
```

> **Docs**: https://opencode.ai/docs/permissions

---

## MCP Servers

**Model Context Protocol** servers add external tools to OpenCode. Two types: local (subprocess) and remote (HTTP).

### Configuration

```jsonc
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "headers": { "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}" },
      "enabled": true
    },
    "local-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-server"],
      "environment": { "API_KEY": "{env:MY_KEY}" },
      "enabled": true
    }
  }
}
```

MCP tools are auto-registered with the server name as prefix: `context7_resolve-library-id`, `context7_query-docs`, etc.

**Disable MCP tools** globally or per-agent using glob patterns: `"context7_*": false`

### Our MCP Servers

| Server | Type | Purpose |
|--------|------|---------|
| **context7** | Remote | Library/framework documentation lookup |

> **Docs**: https://opencode.ai/docs/mcp

---

## Plugins

Plugins are JS/TS modules that hook into OpenCode runtime events. They can add custom tools, intercept tool execution, inject shell environment variables, and react to session lifecycle events.

### Loading

| Source | Location |
|--------|----------|
| npm packages | Listed in `"plugin": ["package-name"]` in config |
| Local files | `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (global) |

npm plugins are auto-installed via Bun at startup.

### Plugin Structure

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Hook into events
    "session.idle": async (input, output) => { /* ... */ },
    "tool.execute.before": async (input, output) => { /* ... */ },
    "shell.env": async (input, output) => { output.env.MY_VAR = "value" },

    // Register custom tools
    tool: {
      my_tool: tool({ description: "...", args: {}, execute: async () => "result" }),
    },
  }
}
```

### Key Events

| Category | Events |
|----------|--------|
| **Session** | `session.created`, `session.idle`, `session.compacted`, `session.error`, `session.updated`, `session.deleted`, `session.status`, `session.diff` |
| **Tool** | `tool.execute.before`, `tool.execute.after` |
| **File** | `file.edited`, `file.watcher.updated` |
| **Message** | `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed` |
| **Permission** | `permission.asked`, `permission.replied` |
| **Shell** | `shell.env` |
| **Compaction** | `experimental.session.compacting` |
| **Other** | `command.executed`, `todo.updated`, `installation.updated`, `server.connected` |

### Our Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| **opencode-pty** | npm | PTY (pseudo-terminal) sessions for long-running processes |
| **worktree** | local | Git worktree isolation for parallel dev sessions |
| **background-agents** | local (disabled) | Fire-and-forget async delegation with completion tracking |

> **Docs**: https://opencode.ai/docs/plugins

---

## Configuration (opencode.jsonc)

The central config file. Lives at `.opencode/opencode.jsonc` (project-level) or `~/.config/opencode/opencode.json` (global).

### Precedence Chain (later overrides earlier)

1. Remote config (`.well-known/opencode`)
2. Global config (`~/.config/opencode/opencode.json`)
3. Custom config (`OPENCODE_CONFIG` env var)
4. Project config (`.opencode/opencode.jsonc`)
5. `.opencode/` directories (agents, commands, skills, tools, plugins)
6. Inline config (`OPENCODE_CONFIG_CONTENT` env var)

### Variable Substitution

```jsonc
{
  "apiKey": "{env:MY_API_KEY}",        // Environment variable
  "prompt": "{file:./my-prompt.md}"     // File contents
}
```

### Our Config

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow",               // Global: allow everything
  "plugin": ["opencode-pty", "./plugin/worktree.ts"],
  "autoupdate": true,
  "default_agent": "kortix-main",      // Kortix-Main is the default
  "provider": {
    "kortix": {                         // Kortix gateway (10 models)
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "{env:KORTIX_API_URL}/v1" },
      "models": { /* ... 10 models ... */ }
    },
    "anthropic": { "name": "Anthropic" }  // Native Anthropic provider
  },
  "mcp": {
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" }
  }
}
```

> **Docs**: https://opencode.ai/docs/config

---

## Runtime: What Gets Loaded Into Context

When a session starts with a given agent, the LLM's system context is composed from multiple sources. Understanding this is critical for designing agents and skills.

```
┌──────────────────────────────────────────────────────────────┐
│                    LLM SYSTEM CONTEXT                         │
│                                                              │
│  1. opencode.md           ← Global system prompt             │
│     (44 lines)              Always loaded for every agent.   │
│                             Identity, boot sequence, rules.  │
│                                                              │
│  2. Agent .md body        ← Agent-specific system prompt     │
│     (varies, ~100-200       The agent's behavioral DNA.      │
│      lines)                 Identity, tools, delegation.     │
│                                                              │
│  3. AGENTS.md             ← Project/global rules             │
│     (if present)            Coding standards, conventions.   │
│                                                              │
│  4. Skill metadata        ← Name + description of ALL       │
│     catalog                 skills. Always present.          │
│     (~100 words each,       Agent uses this to decide which  │
│      23 skills)             skills to load.                  │
│                                                              │
│  5. Tool descriptions     ← All enabled tools with their    │
│                             parameter schemas. Built-in +    │
│                             custom + MCP tools.              │
│                                                              │
│  6. Conversation          ← User messages + assistant        │
│     history                 responses + tool calls/results.  │
│                             Grows during session. Compacted  │
│                             when too large.                  │
│                                                              │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  LOADED ON DEMAND (via tool calls during conversation):      │
│                                                              │
│  • Skill bodies           ← Full SKILL.md content, loaded   │
│                             via skill() tool call.           │
│                                                              │
│  • File contents          ← Loaded via read() tool.         │
│                                                              │
│  • Search results         ← From grep(), glob(), web, etc.  │
│                                                              │
│  • Subagent results       ← From Task tool completions.     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key takeaway**: The system prompt = `opencode.md` + agent `.md` + `AGENTS.md` + skill catalog + tool descriptions. Skills and file contents are loaded on demand during the conversation, not at startup.

---

## Key Files Reference

### Project-Level

| Path | Purpose |
|------|---------|
| `.opencode/opencode.jsonc` | Central configuration (providers, agents, plugins, MCP, permissions) |
| `.opencode/opencode.md` | Global system prompt (loaded for every agent, every session) |
| `.opencode/.env` | Environment variables (secrets, API keys) |
| `.opencode/agents/*.md` | Agent definitions (filename = agent name) |
| `.opencode/skills/*/SKILL.md` | Skill definitions (directory name = skill name) |
| `.opencode/commands/*.md` | Command definitions (filename = command name) |
| `.opencode/tools/*.ts` | Custom tool implementations (filename = tool name) |
| `.opencode/plugin/*.ts` | Local plugins |
| `.opencode/package.json` | Dependencies for plugins and tools (Bun) |
| `.opencode/tsconfig.json` | TypeScript config for plugins/tools |
| `AGENTS.md` | Project-level rules/instructions |

### Global

| Path | Purpose |
|------|---------|
| `~/.config/opencode/opencode.json` | Global configuration |
| `~/.config/opencode/AGENTS.md` | Global rules |
| `~/.config/opencode/agents/` | Global agents |
| `~/.config/opencode/skills/` | Global skills |
| `~/.config/opencode/commands/` | Global commands |
| `~/.config/opencode/tools/` | Global custom tools |
| `~/.config/opencode/plugins/` | Global plugins |
| `~/.config/opencode/themes/` | Custom themes |

### Data

| Path | Purpose |
|------|---------|
| `~/.local/share/opencode/auth.json` | Provider credentials |
| `~/.local/share/opencode/mcp-auth.json` | MCP OAuth tokens |
| `~/.local/share/opencode/storage/` | Session data (JSON files) |
| `~/.cache/opencode/node_modules/` | Cached npm plugin installations |

---

## Summary

| Primitive | What it is | How many we have | File format |
|-----------|-----------|:----------------:|-------------|
| **Agent** | AI persona with prompt, model, tools, permissions | 8 | `.md` with YAML frontmatter |
| **Skill** | Reusable knowledge module loaded on demand | 23 | `SKILL.md` with YAML frontmatter |
| **Command** | `/slash` prompt template | 10 | `.md` with YAML frontmatter |
| **Tool** | Function the LLM can call | 15 built-in + 7 custom + MCP | `.ts` (custom) |
| **Rule** | Project/global instructions | 1 file | `AGENTS.md` (markdown) |
| **Permission** | Access control (allow/ask/deny) | Per tool/agent | JSON in config |
| **MCP Server** | External tool provider | 1 | JSON in config |
| **Plugin** | Runtime event hooks | 2 active + 1 disabled | `.ts` |
| **Provider** | LLM API backend | 2 (Kortix, Anthropic) | JSON in config |
