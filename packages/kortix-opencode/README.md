# kortix-opencode

Kortix OpenCode config directory — agents, tools, skills, commands, and plugins.

This package IS the `.opencode` config directory. It's mounted at `/opt/opencode` in the sandbox container and symlinked to `.opencode` for local development.

## Structure

```
opencode.jsonc          ← OpenCode config
package.json            ← dependencies (installed via bun in container)
agents/kortix.md        ← the Kortix agent (natively discovered by OpenCode)
commands/*.md           ← slash commands (natively discovered)
tools/*.ts              ← custom tools (natively discovered)
skills/                 ← built-in skills (natively discovered)
plugin/                 ← plugins loaded via opencode.jsonc
  kortix-opencode.ts    ← main plugin (sub-plugins + provider config)
  agent-triggers.ts     ← cron/webhook trigger plugin
  kortix-sys/           ← memory + continuation system
patches/                ← post-install patches for opencode binary + deps
```

## Local development

Symlink to `.opencode` in your project root:

```bash
ln -s computer/packages/kortix-opencode .opencode
```
