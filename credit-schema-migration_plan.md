## Goal
Move all credit/billing tables from `public` schema to `kortix` schema so everything is unified under one schema.

## Current State
- 5 tables in `public`: `credit_accounts`, `credit_ledger`, `credit_usage`, `credit_purchases`, `account_deletion_requests`
- All `kortix.*` tables (sandboxes, accounts, etc.) are in `kortix` schema
- No FK constraints between credit tables and anything else (just logical `account_id` refs)
- 3 DB functions called via Supabase RPC: `atomic_use_credits`, `atomic_add_credits`, `atomic_reset_expiring_credits` — these DON'T EXIST in local DB (cloud-only)
- `repositories/credits.ts` calls `atomic_use_credits` via raw SQL (fails locally since function doesn't exist)
- Drizzle schema definitions in `packages/db/src/schema/public.ts` use `pgTable()` (public schema)
- Kortix tables use `kortixSchema.table()` from `packages/db/src/schema/kortix.ts`

## Success Criteria
- [ ] All 5 tables exist in `kortix` schema, not `public`
- [ ] Drizzle schema uses `kortixSchema.table()` for all credit tables
- [ ] `drizzle-kit push` succeeds and creates tables in `kortix` schema
- [ ] `atomic_use_credits` function exists locally and works against `kortix.credit_accounts`
- [ ] Credit deduction works end-to-end (Kortix model → billing → balance decremented)
- [ ] Credit deduction works for own-key passthrough (Anthropic key → 0.1× billing → balance decremented)
- [ ] Typecheck passes

## Plan

### Step 1: Create atomic DB functions locally
Create `atomic_use_credits`, `atomic_add_credits`, `atomic_reset_expiring_credits` as SQL functions targeting `kortix.credit_accounts` / `kortix.credit_ledger`. These need to exist before we can test billing.

**Where**: Add to bootstrap migration or a new migration file, OR create via the schema push startup script.
**Better**: Create them in `services/kortix-api/src/shared/db-schema-functions.ts` and execute at startup — same pattern as schema push.

### Step 2: Move table definitions from public.ts → kortix.ts
In `packages/db/src/schema/public.ts`:
- Remove `creditAccounts`, `creditLedger`, `creditUsage`, `creditPurchases`, `accountDeletionRequests`

In `packages/db/src/schema/kortix.ts`:
- Add all 5 tables using `kortixSchema.table(...)` instead of `pgTable(...)`
- Keep exact same column definitions
- Index names need to be unique — prefix with `kortix_` if needed

### Step 3: Update re-exports in packages/db/src/index.ts
- Move the 5 table exports from `'./schema/public'` section to `'./schema/kortix'` section
- `CreditAccount` type also needs to be updated in `types.ts`

### Step 4: Update drizzle.config.ts
- Remove individual table names from `tablesFilter` (they're now under `kortix.*`)
- Can remove `'public'` from `schemaFilter` if no public tables remain (check api_keys, accountUser, billingCustomers — these are basejump/external, not pushed)

### Step 5: Drop old public tables, push new kortix tables
- `drizzle-kit push` will create the new `kortix.credit_*` tables
- SQL to drop old `public.credit_*` tables

### Step 6: Create test credit account for local dev
- Insert a row into `kortix.credit_accounts` for account `d992fbfe-b621-404d-bec1-6e8c8f1c1b34` with balance $1000

### Step 7: Test with Kortix model (power)
- Call `/v1/router/chat/completions` with `sbt_` token → Kortix-managed LLM → bill at 1.2×
- Verify balance decremented

### Step 8: Test with own Anthropic key at 0.1×
- Call `/v1/router/anthropic/messages` with real Anthropic key + `X-Kortix-Token`
- Verify billing at 0.1× and balance decremented

## Anti-Patterns
- Don't change any export names — all consuming code imports `creditAccounts` etc. by name
- Don't add FK constraints (none existed before)
- Don't modify the Supabase RPC path yet — cloud still uses old functions, we'll update those separately

## Risks
- `api_keys` table is also in `public` schema — leave it alone for now (separate migration)
- `billingCustomers` is in `basejump` schema — leave it (read-only reference)
- `accountUser` is in `basejump` schema — leave it (read-only reference)
