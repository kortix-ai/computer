-- pg_cron + pg_net scheduler setup
-- This migration enables PostgreSQL-native scheduling so the
-- database itself triggers the kortix-api tick endpoint every minute.
-- Works on both Supabase (extensions pre-installed) and self-hosted PG.

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Config table for scheduler settings (API URL + shared secret)
CREATE TABLE IF NOT EXISTS kortix.scheduler_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Function that pg_cron invokes every minute.
--    Reads the API URL and secret from scheduler_config,
--    then fires an async HTTP POST via pg_net.
CREATE OR REPLACE FUNCTION kortix.scheduler_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_api_url TEXT;
  v_tick_secret TEXT;
BEGIN
  SELECT value INTO v_api_url FROM kortix.scheduler_config WHERE key = 'api_url';
  SELECT value INTO v_tick_secret FROM kortix.scheduler_config WHERE key = 'tick_secret';

  IF v_api_url IS NULL OR v_tick_secret IS NULL THEN
    RAISE NOTICE '[kortix.scheduler_tick] Not configured — missing api_url or tick_secret in kortix.scheduler_config';
    RETURN;
  END IF;

  -- Fire async POST to the tick endpoint
  PERFORM net.http_post(
    url := v_api_url || '/v1/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_tick_secret
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'fired_at', now()::text
    ),
    timeout_milliseconds := 10000
  );
END;
$$;

-- 4. Schedule the tick — runs every minute
SELECT cron.schedule(
  'kortix-scheduler-tick',
  '* * * * *',
  'SELECT kortix.scheduler_tick()'
);

-- 5. Helper function to configure the scheduler (call once after deploy)
-- Usage: SELECT kortix.configure_scheduler('https://api.kortix.com', 'your-secret-here');
CREATE OR REPLACE FUNCTION kortix.configure_scheduler(
  p_api_url TEXT,
  p_tick_secret TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO kortix.scheduler_config (key, value, updated_at)
  VALUES ('api_url', p_api_url, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO kortix.scheduler_config (key, value, updated_at)
  VALUES ('tick_secret', p_tick_secret, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RAISE NOTICE 'Scheduler configured: api_url=%, tick_secret=(set)', p_api_url;
END;
$$;
