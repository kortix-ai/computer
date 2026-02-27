-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Bootstrap Migration                                                       ║
-- ║                                                                             ║
-- ║  Creates schemas, enables extensions, and installs helper functions         ║
-- ║  that Drizzle ORM cannot manage (it only handles tables/indexes/enums).    ║
-- ║                                                                             ║
-- ║  After this migration runs, `drizzle-kit push` creates the actual tables.  ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ─── Extensions ──────────────────────────────────────────────────────────────
-- pg_cron: in-database cron scheduler (replaces the old in-process setInterval)
-- pg_net:  async HTTP from SQL (pg_cron uses this to call the tick endpoint)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Schemas ─────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS kortix;
CREATE SCHEMA IF NOT EXISTS basejump;

-- ─── Schema Permissions ─────────────────────────────────────────────────────
-- Supabase PostgREST requires USAGE on a schema before it can query tables
-- in that schema via .schema('kortix'). Without this, queries silently return
-- null even if table-level SELECT is granted.
GRANT USAGE ON SCHEMA kortix TO anon;
GRANT USAGE ON SCHEMA kortix TO authenticated;
GRANT USAGE ON SCHEMA kortix TO service_role;

-- ─── Scheduler Helper ────────────────────────────────────────────────────────
-- Called by startScheduler() in kortix-api to register the global safety-net
-- tick job. Runs every minute, POSTs to /v1/cron/tick via pg_net.
CREATE OR REPLACE FUNCTION kortix.configure_scheduler(api_url TEXT, tick_secret TEXT)
RETURNS void AS $$
BEGIN
  -- Remove existing global tick job if any
  PERFORM cron.unschedule('kortix_global_tick')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kortix_global_tick');

  -- Schedule global safety-net tick every minute
  PERFORM cron.schedule(
    'kortix_global_tick',
    '* * * * *',
    format(
      'SELECT net.http_post(url := %L, headers := ''{"Content-Type": "application/json", "x-cron-secret": "%s"}''::jsonb, body := ''{"source": "pg_cron"}''::jsonb, timeout_milliseconds := 30000)',
      api_url || '/v1/cron/tick',
      tick_secret
    )
  );
END;
$$ LANGUAGE plpgsql;
