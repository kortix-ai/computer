# Kortix

Self-host your AI Computer.

## Quick Start

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kortix-ai/computer/main/scripts/get-kortix.sh)
```

Supports local machine and VPS/server (HTTPS + reverse proxy) setups.

## Layout

- `apps/frontend/` — Next.js dashboard
- `kortix-api/` — Bun/Hono backend
- `sandbox/` — sandbox Docker image (Dockerfile, startup, runtime)
- `packages/kortix-opencode/` — OpenCode config directory (agents, tools, skills, plugins)
- `packages/opencode-agent-triggers/` — cron + webhook trigger system
- `packages/lss/` — local semantic search
- `infra/` — Supabase, production IaC
- `scripts/` — installer, release, and dev helpers
- `docs/` — architecture and operational docs

## Commands

- `pnpm dev` — start frontend + API in dev mode
- `pnpm dev:frontend` — start frontend only
- `pnpm dev:api` — start API only
- `pnpm dev:sandbox` — start sandbox with dev bind mounts (hot reload, from `sandbox/`)
- `pnpm dev:sandbox:build` — rebuild and start the sandbox
- `pnpm build` — build all packages (`pnpm -r run build`)
- `pnpm ship <version>` — bump versions, build + push Docker images, create GitHub release
- `pnpm ship --dry-run <version>` — validate without making changes
- `pnpm ship --check` — show current release state
- `pnpm nuke` — tear down local Docker environment
- `pnpm nuke:start` — nuke + restart fresh

## License

See [LICENSE](LICENSE) for details.
