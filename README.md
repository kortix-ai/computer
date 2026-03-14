# Kortix

Self-host your AI Computer.

## Quick Start

```bash
curl -fsSL https://kortix.com/install | bash
```

Supports local machine and VPS/server (HTTPS + reverse proxy) setups.

The public installer endpoint is served by the frontend Next.js app at `apps/frontend/src/app/install/route.ts` and streams `scripts/get-kortix.sh` from this repo.

## Local Testing

With the frontend running locally, you can test the same install endpoint at:

```bash
curl -fsSL http://localhost:3000/install | bash
```

Or open `http://localhost:3000/install` in the browser to verify the route behavior locally.

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
- `pnpm ship <version>` — bump versions, build + push Docker images, build Hetzner snapshot, create GitHub release
- `pnpm ship --dry-run <version>` — validate without making changes
- `pnpm ship --check` — show current release state
- `pnpm snapshot [version]` — build the Hetzner snapshot manually
- `pnpm nuke` — tear down local Docker environment
- `pnpm nuke:start` — nuke + restart fresh

## License

See [LICENSE](LICENSE) for details.
