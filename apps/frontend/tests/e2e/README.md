# Frontend E2E Tests

This suite verifies the critical self-hosted flow end-to-end:

1. owner signup on `/auth`
2. provider selection
3. tool-key step
4. onboarding entry and dashboard arrival
5. logout/login cycle
6. auth redirect hardening (`/auth?redirect=%2Fonboarding` while authenticated)
7. Generate SSH Key flow from dashboard (dialog + key generation)
8. tunnel lifecycle smoke (create -> fetch -> delete via authenticated API)

## Full Start-To-End Test (installer included)

This is the deterministic "absolute start to dashboard" flow:

```bash
pnpm --dir apps/frontend test:e2e:full
```

It performs:

1. teardown of any existing `~/.kortix` local stack
2. fresh `scripts/get-kortix.sh` local install
3. frontend/API health checks
4. one Playwright E2E test from setup auth -> onboarding -> dashboard -> logout/login

## Prerequisites

- local self-hosted stack running (`http://localhost:13737` frontend, `http://localhost:13738` API)
- Playwright browser installed

## Run

```bash
pnpm --dir apps/frontend test:e2e
```

With custom endpoints:

```bash
E2E_BASE_URL=http://localhost:13737 E2E_API_URL=http://localhost:13738/v1 pnpm --dir apps/frontend test:e2e
```

## Optional deterministic reset

If you want each run to start from "no users", run this first:

```bash
bash apps/frontend/tests/e2e/scripts/reset-self-hosted-state.sh
```

This removes all rows from `auth.users` in the local `supabase-db` container.
