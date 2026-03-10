# Kortix

Self-host your AI Computer

## Quick Start

Run the installer

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kortix-ai/computer/main/scripts/get-kortix.sh)
```

The installer supports both:
- Local machine setup
- VPS/server setup (HTTPS + reverse proxy)

## Repository Layout

- `apps/` - product applications like the frontend
- `packages/` - publishable and reusable packages, including `@kortix/kortix-oc`, `@kortix/opencode-agent-triggers`, `@kortix/sandbox`, `lss`, and `voice`
- `kortix-api/` - the primary Bun/Hono backend
- `scripts/release/` - release scripts, `kortix-api/Dockerfile` - API container, `packages/sandbox/docker/` - sandbox container
- `infra/` - infrastructure and platform config, including Supabase and production IaC
- `scripts/` - repo-wide setup, install, and test helpers
- `docs/` - architecture, release, and operational documentation

## OpenCode Agent Triggers

`@kortix/opencode-agent-triggers` lives in `packages/opencode-agent-triggers/` and extends OpenCode agents with declarative automation defined directly inside agent markdown frontmatter.

- Trigger definitions live in OpenCode agent `.md` files under `.opencode/agents/` or `~/.config/opencode/agents/`
- Supported trigger sources today: `cron` and `webhook`
- The package includes its own embedded cron scheduler and persisted trigger state; it is not just a thin client
- Webhook triggers can extract event fields into prompt templates and pass raw trigger context into the session
- `@kortix/kortix-oc` consumes this package as part of the runtime plugin stack

Canonical docs and usage examples live in `packages/opencode-agent-triggers/README.md`.

## Common Commands

```bash
pnpm dev
pnpm dev:sandbox
docker compose -f packages/sandbox/docker/docker-compose.yml up --build
```

## License

See [LICENSE](LICENSE) for details.
