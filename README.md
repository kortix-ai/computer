# Kortix

Open-source autonomous computer use agent. Monorepo with a Next.js frontend and a unified Bun/Hono backend API.

## Architecture

```
apps/
  frontend/          Next.js 16 — dashboard UI            :3000
services/
  kortix-api/        Unified backend (all services)        :8008
packages/
  db/                Shared database layer (Drizzle ORM)
sandbox/
  docker-compose.yml Local Docker sandbox configuration
```

The `kortix-api` monolith combines all backend functionality into a single service:
- **Router** — API gateway, LLM routing, search & tool proxying
- **Billing** — Stripe/RevenueCat subscriptions, credits, webhooks
- **Platform** — Account init, sandbox provisioning (Daytona + Local Docker)
- **Cron** — Scheduled triggers, execution management
- **Daytona Proxy** — Preview proxy for cloud sandboxes

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Bun](https://bun.sh/) v1.1+
- [pnpm](https://pnpm.io/) v9+
- [Supabase](https://supabase.com/) project (or local via `supabase start`)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (optional, for webhook testing)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in your values (database, Supabase, API keys, etc.)

# 3. Generate per-service .env files
pnpm run env

# 4. Start everything (frontend + backend)
pnpm dev
```

## Environment Setup

All configuration lives in a single root `.env` file. The setup script distributes the relevant variables to each service:

```bash
pnpm run env                      # uses .env (default)
./scripts/setup-env.sh .env.prod  # uses a custom env file
```

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_ANON_KEY` | Supabase anon key (frontend) |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `API_KEY_SECRET` | Shared HMAC secret for API key hashing |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `DAYTONA_API_KEY` | Daytona sandbox management |
| `OPENROUTER_API_KEY` | LLM provider (fill at least one) |
| `ANTHROPIC_API_KEY` | LLM provider |
| `OPENAI_API_KEY` | LLM provider |
| `TAVILY_API_KEY` | Web search provider |

See `.env.example` for the full list.

## Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start frontend + backend API |
| `pnpm dev:services` | Start only the backend API |
| `pnpm dev:frontend` | Start only the frontend |
| `pnpm dev:api` | Start only kortix-api |
| `pnpm stripe` | Forward Stripe webhooks to kortix-api |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm graph` | Visualize dependency graph |

## Stripe Webhooks

To test Stripe webhooks locally:

```bash
# Terminal 1 — start services
pnpm dev

# Terminal 2 — forward Stripe events to the API
pnpm stripe
```

The Stripe CLI will print a webhook signing secret (`whsec_...`). Add it to your root `.env` as `STRIPE_WEBHOOK_SECRET`, then re-run `pnpm run env`.

## Docker

```bash
pnpm docker:build            # Build all images
pnpm docker:up               # Start all containers
pnpm docker:up:backend       # Start backend services only
pnpm docker:up:frontend      # Start frontend only
pnpm docker:down             # Stop everything
```

## Kubernetes

The `k8s/` directory contains Kustomize manifests for deploying to Kubernetes:

```
k8s/
  base/                  # Base manifests (Deployments, Services, HPAs)
  overlays/
    staging/             # Staging overrides (1 replica, :staging tags)
    production/          # Production overrides (2 replicas, :production tags)
```

Preview rendered manifests:

```bash
kubectl kustomize k8s/base
kubectl kustomize k8s/overlays/staging
kubectl kustomize k8s/overlays/production
```

Deploy:

```bash
kubectl apply -k k8s/overlays/staging      # deploy to staging
kubectl apply -k k8s/overlays/production   # deploy to production
```

## Service Ports

| Service | Port |
|---------|------|
| frontend | 3000 |
| kortix-api | 8008 |

## License

See [LICENSE](LICENSE) for details.
