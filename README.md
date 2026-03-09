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
- `packages/` - publishable and reusable packages, including `@kortix/kortix-oc`, `@kortix/sandbox`, `lss`, and `voice`
- `kortix-api/` - the primary Bun/Hono backend
- `scripts/release/` - release scripts, `kortix-api/Dockerfile` - API container, `packages/sandbox/docker/` - sandbox container
- `infra/` - infrastructure and platform config, including Supabase and production IaC
- `scripts/` - repo-wide setup, install, and test helpers
- `docs/` - architecture, release, and operational documentation

## Common Commands

```bash
pnpm dev
pnpm dev:sandbox
docker compose -f packages/sandbox/docker/docker-compose.yml up --build
```

## License

See [LICENSE](LICENSE) for details.
