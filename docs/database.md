# Database & @kortix/db

How the Kortix database layer works. Drizzle ORM is the source of truth for all new schema.

## Architecture

```
PostgreSQL (Supabase)
├── public          ← Legacy tables (73 tables). DO NOT TOUCH. Managed by Supabase migrations.
├── basejump        ← Multi-tenancy (accounts, account_user). DO NOT TOUCH.
├── auth            ← Supabase Auth (users, sessions). DO NOT TOUCH.
└── kortix          ← NEW tables. Managed by Drizzle ORM via @kortix/db.
```

**Rule: all new tables go in the `kortix` schema. Never modify `public`, `basejump`, or `auth`.**

Legacy services (kortix-router, kortix-daytona-proxy, frontend) still use `@supabase/supabase-js`
to talk to `public`/`basejump` via PostgREST. New services use `@kortix/db` with Drizzle for direct
Postgres access to the `kortix` schema.

## Package: @kortix/db

Location: `packages/db/`

Shared database package consumed by all new backend services. Contains:

| Path | Purpose |
|------|---------|
| `src/schema/kortix.ts` | Drizzle table/enum/relation definitions for the `kortix` schema |
| `src/client.ts` | `createDb(url)` factory — returns a typed Drizzle client |
| `src/types.ts` | Inferred TypeScript types (select & insert) for all tables |
| `src/index.ts` | Barrel exports — tables, types, client |
| `src/schema/legacy/` | Auto-generated introspection of `public`/`basejump` (reference only, not imported by default) |
| `drizzle.config.ts` | Drizzle Kit config for `kortix` schema (push, generate, studio) |
| `drizzle.config.pull.ts` | Drizzle Kit config for introspecting legacy schemas |

### Exports

```typescript
// Everything you need from one import
import { createDb, sandboxes, triggers, executions } from '@kortix/db';
import type { Sandbox, Trigger, Execution, NewSandbox } from '@kortix/db';
```

Sub-path exports are also available:

```typescript
import { createDb } from '@kortix/db/client';
import { sandboxes, triggers } from '@kortix/db/schema';
import type { Sandbox } from '@kortix/db/types';
```

## Current Schema: `kortix`

### Enums

| Enum | Values |
|------|--------|
| `sandbox_status` | `provisioning`, `active`, `stopped`, `archived`, `pooled`, `error` |
| `execution_status` | `pending`, `running`, `completed`, `failed`, `timeout`, `skipped` |
| `session_mode` | `new`, `reuse` |

### Table: `kortix.sandboxes`

User sandbox/computer instances.

| Column | Type | Notes |
|--------|------|-------|
| `sandbox_id` | `uuid` PK | Auto-generated |
| `account_id` | `uuid` NOT NULL | Owner (basejump account) |
| `name` | `varchar(255)` NOT NULL | Display name |
| `external_id` | `text` | Daytona sandbox ID |
| `status` | `sandbox_status` NOT NULL | Default: `provisioning` |
| `base_url` | `text` NOT NULL | Kortix Master URL |
| `auth_token` | `text` | Token for Kortix Master auth |
| `config` | `jsonb` | Sandbox configuration (snapshot version, etc.) |
| `metadata` | `jsonb` | Extensible metadata |
| `pooled_at` | `timestamptz` | When entered sandbox pool |
| `last_used_at` | `timestamptz` | Last activity timestamp |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

Indexes: `account_id`, `external_id`, `status`, `pooled_at`

### Table: `kortix.triggers`

Cron trigger definitions. Each trigger points to a sandbox and fires on a schedule.

| Column | Type | Notes |
|--------|------|-------|
| `trigger_id` | `uuid` PK | Auto-generated |
| `sandbox_id` | `uuid` FK -> sandboxes | ON DELETE CASCADE |
| `account_id` | `uuid` NOT NULL | Owner |
| `name` | `varchar(255)` NOT NULL | |
| `description` | `text` | |
| `cron_expr` | `varchar(100)` NOT NULL | 6-field: `sec min hour day month weekday` |
| `timezone` | `varchar(50)` NOT NULL | Default: `UTC` |
| `agent_name` | `varchar(255)` | Which agent to run |
| `prompt` | `text` NOT NULL | Prompt to send |
| `session_mode` | `session_mode` NOT NULL | Default: `new` |
| `session_id` | `text` | For reuse mode |
| `is_active` | `boolean` NOT NULL | Default: `true` |
| `max_retries` | `integer` NOT NULL | Default: `0` |
| `timeout_ms` | `integer` NOT NULL | Default: `300000` (5 min) |
| `metadata` | `jsonb` | |
| `last_run_at` | `timestamptz` | |
| `next_run_at` | `timestamptz` | Computed from cron_expr |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

Indexes: `next_run_at`, `sandbox_id`, `account_id`, `is_active`

### Table: `kortix.executions`

History of trigger runs.

| Column | Type | Notes |
|--------|------|-------|
| `execution_id` | `uuid` PK | Auto-generated |
| `trigger_id` | `uuid` FK -> triggers | ON DELETE CASCADE |
| `sandbox_id` | `uuid` FK -> sandboxes | ON DELETE CASCADE |
| `status` | `execution_status` NOT NULL | Default: `pending` |
| `session_id` | `text` | OpenCode session ID |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |
| `duration_ms` | `integer` | |
| `error_message` | `text` | |
| `retry_count` | `integer` NOT NULL | Default: `0` |
| `metadata` | `jsonb` | |
| `created_at` | `timestamptz` NOT NULL | |

Indexes: `trigger_id`, `status`, `created_at`

### Relations

```
sandboxes 1 ──── N triggers
sandboxes 1 ──── N executions
triggers  1 ──── N executions
```

## Using @kortix/db in a Service

### 1. Add the dependency

```json
{
  "dependencies": {
    "@kortix/db": "workspace:*"
  }
}
```

Then run `pnpm install` from the workspace root.

### 2. Create a db client

```typescript
// src/db/index.ts
import { createDb } from '@kortix/db';
import { config } from '../config';

export const db = createDb(config.DATABASE_URL);
```

`createDb` uses `postgres.js` with `prepare: false` (required for Supabase connection pooler).

### 3. Query with Drizzle

```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { sandboxes, triggers } from '@kortix/db';
import type { Sandbox } from '@kortix/db';

// Select
const results = await db
  .select()
  .from(sandboxes)
  .where(eq(sandboxes.accountId, userId));

// Insert
const [sandbox] = await db
  .insert(sandboxes)
  .values({ accountId: userId, name: 'My Sandbox', baseUrl: 'https://...' })
  .returning();

// Update
await db
  .update(sandboxes)
  .set({ status: 'active', updatedAt: new Date() })
  .where(eq(sandboxes.sandboxId, id));

// Delete
await db
  .delete(sandboxes)
  .where(eq(sandboxes.sandboxId, id));
```

## Drizzle Kit Commands

All commands run from `packages/db/`:

```bash
# Push schema changes to live DB (no migration files, direct apply)
bunx drizzle-kit push

# Generate SQL migration files (for review before applying)
bunx drizzle-kit generate

# Apply pending migrations
bunx drizzle-kit migrate

# Open Drizzle Studio (visual DB browser)
bunx drizzle-kit studio

# Introspect legacy schemas (regenerate src/schema/legacy/)
bunx drizzle-kit pull --config drizzle.config.pull.ts
```

**Important:** `drizzle-kit push` is the primary workflow. It compares your TypeScript schema
against the live DB and applies changes directly. No migration files needed for development.
Use `generate` + `migrate` when you need reviewable migration SQL for production deploys.

## Adding New Tables

1. Edit `packages/db/src/schema/kortix.ts` — add your table definition
2. Export the table from `packages/db/src/index.ts`
3. Add inferred types to `packages/db/src/types.ts`
4. Run `bunx drizzle-kit push` from `packages/db/` to apply to live DB
5. Import in your service: `import { myTable } from '@kortix/db'`

## Environment Variables

The `DATABASE_URL` env var must be set for both Drizzle Kit commands and service runtime.

```
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
```

For Drizzle Kit commands, `packages/db/.env` is loaded automatically.
For services, `DATABASE_URL` comes from the service's own env (root `.env` or process env).

## Legacy Schema (Reference Only)

The `src/schema/legacy/` directory contains auto-generated Drizzle definitions from
`drizzle-kit pull` of the `public` and `basejump` schemas. These files:

- Are **not imported** by default (excluded from barrel exports and tsconfig)
- Have broken `auth.users` references (Supabase's auth schema can't be introspected)
- Exist purely as a TypeScript reference for understanding legacy table structure
- Should **never** be used to push/modify the legacy schemas

To regenerate:

```bash
cd packages/db
bunx drizzle-kit pull --config drizzle.config.pull.ts
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/db/src/schema/kortix.ts` | All table, enum, and relation definitions |
| `packages/db/src/client.ts` | `createDb()` factory function |
| `packages/db/src/types.ts` | Inferred TypeScript types |
| `packages/db/src/index.ts` | Barrel exports |
| `packages/db/drizzle.config.ts` | Drizzle Kit config (targets `kortix` schema) |
| `packages/db/drizzle.config.pull.ts` | Drizzle Kit config for legacy introspection |
| `services/kortix-cron/src/db/index.ts` | Example: service consuming `@kortix/db` |
