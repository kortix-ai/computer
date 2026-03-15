# Kortix

Self-host your AI Computer.

## Quick Start

```bash
curl -fsSL https://kortix.com/install | bash
curl -fsSL http://localhost:3000/install | bash
bash <(curl -fsSL https://raw.githubusercontent.com/kortix-ai/computer/main/scripts/get-kortix.sh)
```

## DEV Commands

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
