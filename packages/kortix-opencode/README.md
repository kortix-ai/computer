# kortix-opencode

Kortix OpenCode config directory — agents, tools, skills, commands, and plugins.

This package IS the `.opencode` config directory. It's mounted at `/opt/opencode` in the sandbox container and symlinked to `.opencode` for local development.

## Structure

```
opencode.jsonc          <- OpenCode config (plugins, model, MCP servers)
package.json            <- dependencies (installed via bun in container)
agents/kortix.md        <- the Kortix agent (natively discovered by OpenCode)
commands/*.md           <- slash commands (natively discovered)
tools/*.ts              <- custom tools (natively discovered)
skills/                 <- built-in skills (natively discovered)
plugin/                 <- plugins loaded individually via opencode.jsonc
  worktree.ts           <- git worktree plugin
  morph.ts              <- morph edit plugin
  orphan-tool-fixer.ts  <- orphan tool-call fixer
  agent-triggers.ts     <- cron/webhook trigger plugin
  agent-tunnel/         <- tunnel client plugin
  kortix-memory/        <- memory system
  kortix-continuation/  <- autonomous continuation plugin
patches/                <- post-install patches for opencode binary + deps
```

## Config

All plugin loading, model selection, and MCP server config is declarative in `opencode.jsonc`:

- **Plugins** listed individually in the `plugin` array (no compositor)
- **Default model** set via `model` field
- **MCP servers** configured in `mcp` block (e.g. Context7)

## Local development

Symlink to `.opencode` in your project root:

```bash
ln -s computer/packages/kortix-opencode .opencode
```

## Sandbox

The sandbox Docker image installs global binaries directly via `npm install -g` (versions pinned as `ARG`s in the Dockerfile). No intermediate `package.json` for binaries.

```bash
# Build and run
pnpm dev:sandbox:build

# Run without rebuilding (uses bind-mounts for live code changes)
pnpm dev:sandbox
```
