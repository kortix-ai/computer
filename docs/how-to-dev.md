# How to Dev

## Local Development

### 1. Start Supabase (local auth + DB)

```bash
# from repo root
supabase start
# Outputs: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# Copy these into kortix-api/.env and apps/frontend/.env.local

supabase status -o env   # re-print keys any time
```

### 2. Start API + Frontend

```bash
# from repo root — starts kortix-api and Next.js frontend in parallel
pnpm dev
```

### 3. Start Sandbox (Docker)

```bash
# from repo root
docker compose -f packages/sandbox/docker/docker-compose.yml up
```

The sandbox connects back to your locally-running `kortix-api` via `host.docker.internal:8008` (the default). No extra config needed.

> **First boot:** On first start, the sandbox runs `startup.sh` which detects no Kortix code is installed and bootstraps `@kortix/sandbox` from npm (~3-6 min). This only happens once — subsequent starts skip it.

### Environment Files

| File | What goes in it |
|------|----------------|
| `kortix-api/.env` | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY_SECRET`, etc. |
| `apps/frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1` |

Copy `.env.example` files in each directory for a full list of required vars.