# Plan: Merge All 5 Backend Services Into One Monolith (kortix-api)

**Created:** 2026-02-13
**Status:** completed
**Goal:** Combine kortix-router, kortix-billing, kortix-platform, kortix-cron, and kortix-daytona-proxy into a single `services/kortix-api` Hono app on port 8008.

## Context

5 separate Bun/Hono services share the same DB, same auth patterns, same framework. Total ~8,650 lines. Currently:
- 5 processes, 5 ports, 5 DB connection pools
- Router proxies billing + platform via internal HTTP (wasteful)
- Frontend needs multiple URL configs to talk to them
- Docker Compose runs 5 containers for what's essentially one API

## Success Criteria

- [x] Single `services/kortix-api` service on port 8008
- [x] All routes from all 5 services work identically
- [x] Single DB connection pool (shared `createDb()`)
- [x] Single Supabase client, single Daytona client
- [x] Billing proxy routes removed (direct function calls)
- [x] Platform proxy routes removed (direct function calls)
- [x] Cron scheduler runs in-process via setInterval
- [x] All existing tests still pass (115/115 — cron, platform, deployments, health, version)
- [x] Frontend talks to one URL only
- [x] Docker Compose updated (1 API service instead of 5)
- [x] Old services deleted

## Approach

### Directory Structure

```
services/kortix-api/
  package.json
  tsconfig.json
  src/
    index.ts                    # Single entry point
    config.ts                   # Merged config (all env vars)
    
    # Shared infrastructure
    lib/
      db.ts                     # Single createDb() + singleton
      supabase.ts               # Single Supabase client
      daytona.ts                # Single Daytona SDK client  
      stripe.ts                 # Stripe client (from billing)
      crypto.ts                 # HMAC utils (from router)
    
    middleware/
      auth.ts                   # Unified: Supabase JWT + API key + sandbox token
      cors.ts                   # Single CORS config
    
    # Business domains (1:1 with old services)
    routes/
      health.ts                 # Combined health endpoint
      search.ts                 # /web-search, /image-search (from router)
      llm.ts                    # /v1/chat/completions, /v1/models (from router)
      proxy.ts                  # /tavily/*, /serper/*, etc. (from router)
      billing.ts                # /billing/*, /setup/*, /webhooks/* (from billing)
      platform.ts               # /v1/account/* (from platform)
      cron.ts                   # /v1/sandboxes/*, /v1/triggers/*, /v1/executions/* (from cron)
      daytona-proxy.ts          # /:sandboxId/:port/* (from daytona-proxy)
    
    services/                   # Business logic (moved from each service)
      billing/                  # From kortix-billing/src/services/
      llm/                      # From kortix-router/src/services/llm/
      search/                   # From kortix-router/src/services/
      platform/                 # Providers (daytona, local-docker)
      scheduler/                # From kortix-cron/src/scheduler/
    
    db/
      schema.ts                 # Merged schema (billing's local + @kortix/db)
    
    repositories/               # From router (api-keys, sandboxes, credits)
    
    __tests__/                  # Merged tests
```

### Auth Strategy

Single middleware that handles ALL auth patterns:
1. No auth → health, webhooks (Stripe signature verified in handler)
2. Supabase JWT → billing, platform, cron, daytona-proxy routes
3. API key (sk_/sbt_) → router's search, LLM, proxy routes
4. Dual mode → proxy routes (try API key, else passthrough)
5. Query param token → daytona-proxy (for EventSource/SSE)

### Migration Strategy

1. Create `services/kortix-api/` as a NEW service
2. Copy files from each service, reorganizing into the structure above
3. Update imports (internal refs, @kortix/db)
4. Merge singletons (1 DB pool, 1 Supabase client, 1 Daytona client)
5. Replace HTTP proxy routes with direct route mounting
6. Wire cron scheduler into the startup sequence
7. Update tests
8. Update Docker Compose
9. Update frontend
10. Delete old services (separate PR, keep them around initially)

### Risks

- **Cron scheduler crash takes down API**: Mitigated by try/catch around tick() — already exists
- **Billing schema conflict**: Billing has its own schema.ts that shadows @kortix/db's creditAccounts. Merge into one.
- **Memory/CPU**: All-in-one process uses more memory but eliminates 4 duplicate Bun runtimes + 4 duplicate DB pools. Net win.

## Notes

- Monolith created at `services/kortix-api/` — 10,523 lines, all 5 services merged.
- Old services (kortix-router, kortix-billing, kortix-platform, kortix-cron, kortix-daytona-proxy) deleted.
- Docker Compose updated to 2 services (frontend + kortix-api).
- Typecheck: 3/3 projects pass clean.
- Tests: 115/115 pass (after `db:push` to sync `deployments` table).
- Completed: 2026-02-13.
