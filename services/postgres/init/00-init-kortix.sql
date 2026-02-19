-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Kortix — Database Init Script                                             ║
-- ║                                                                            ║
-- ║  Runs ONCE on first container creation (empty data directory).             ║
-- ║  Combines all Drizzle migrations from packages/db/drizzle/ into a single  ║
-- ║  idempotent script.                                                        ║
-- ║                                                                            ║
-- ║  Source migrations (re-sync when schema changes):                          ║
-- ║    - 0000_gray_the_captain.sql          (schema + tables + indexes)        ║
-- ║    - 0001_decouple_channels_sandbox.sql (nullable sandbox_id)             ║
-- ║    - 0001_pg_cron_scheduler.sql         (pg_cron + pg_net scheduler)       ║
-- ║    - 0002_trigger_model_columns.sql     (model columns on triggers)        ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- Extensions (require shared_preload_libraries set in postgres command)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 0000_gray_the_captain.sql
-- Creates kortix schema, all enums, all tables, all indexes, all foreign keys
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS "kortix";

DO $$ BEGIN
  CREATE TYPE "kortix"."api_key_status" AS ENUM('active', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."channel_type" AS ENUM('telegram', 'slack', 'discord', 'whatsapp', 'teams', 'voice', 'email', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."deployment_source" AS ENUM('git', 'code', 'files', 'tar');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."deployment_status" AS ENUM('pending', 'building', 'deploying', 'active', 'failed', 'stopped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'timeout', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."sandbox_provider" AS ENUM('daytona', 'local_docker');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."sandbox_status" AS ENUM('provisioning', 'active', 'stopped', 'archived', 'pooled', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."session_mode" AS ENUM('new', 'reuse');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "kortix"."session_strategy" AS ENUM('single', 'per-thread', 'per-user', 'per-message');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "kortix"."sandboxes" (
  "sandbox_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "provider" "kortix"."sandbox_provider" DEFAULT 'daytona' NOT NULL,
  "external_id" text,
  "status" "kortix"."sandbox_status" DEFAULT 'provisioning' NOT NULL,
  "base_url" text NOT NULL,
  "auth_token" text,
  "config" jsonb DEFAULT '{}'::jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "pooled_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."triggers" (
  "trigger_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sandbox_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "cron_expr" varchar(100) NOT NULL,
  "timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
  "agent_name" varchar(255),
  "prompt" text NOT NULL,
  "session_mode" "kortix"."session_mode" DEFAULT 'new' NOT NULL,
  "session_id" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "max_retries" integer DEFAULT 0 NOT NULL,
  "timeout_ms" integer DEFAULT 300000 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."executions" (
  "execution_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trigger_id" uuid NOT NULL,
  "sandbox_id" uuid NOT NULL,
  "status" "kortix"."execution_status" DEFAULT 'pending' NOT NULL,
  "session_id" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" integer,
  "error_message" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."deployments" (
  "deployment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "sandbox_id" uuid,
  "freestyle_id" text,
  "status" "kortix"."deployment_status" DEFAULT 'pending' NOT NULL,
  "source_type" "kortix"."deployment_source" NOT NULL,
  "source_ref" text,
  "framework" varchar(50),
  "domains" jsonb DEFAULT '[]'::jsonb,
  "live_url" text,
  "env_vars" jsonb DEFAULT '{}'::jsonb,
  "build_config" jsonb,
  "entrypoint" text,
  "error" text,
  "version" integer DEFAULT 1 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."channel_configs" (
  "channel_config_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sandbox_id" uuid,
  "account_id" uuid NOT NULL,
  "channel_type" "kortix"."channel_type" NOT NULL,
  "name" varchar(255) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "credentials" jsonb DEFAULT '{}'::jsonb,
  "platform_config" jsonb DEFAULT '{}'::jsonb,
  "session_strategy" "kortix"."session_strategy" DEFAULT 'per-user' NOT NULL,
  "system_prompt" text,
  "agent_name" varchar(255),
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."channel_identity_map" (
  "channel_identity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_config_id" uuid NOT NULL,
  "platform_user_id" text NOT NULL,
  "platform_user_name" text,
  "kortix_user_id" uuid,
  "allowed" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."channel_messages" (
  "channel_message_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_config_id" uuid NOT NULL,
  "direction" varchar(10) NOT NULL,
  "external_id" text,
  "session_id" text,
  "chat_type" varchar(20),
  "content" text,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "platform_user" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."channel_sessions" (
  "channel_session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_config_id" uuid NOT NULL,
  "strategy_key" varchar(512) NOT NULL,
  "session_id" text NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kortix"."api_keys" (
  "key_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sandbox_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "public_key" varchar(64) NOT NULL,
  "secret_key_hash" varchar(128) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "status" "kortix"."api_key_status" DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ─── Foreign Keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "kortix"."channel_configs" ADD CONSTRAINT "channel_configs_sandbox_id_sandboxes_sandbox_id_fk"
    FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."channel_identity_map" ADD CONSTRAINT "channel_identity_map_channel_config_id_channel_configs_channel_config_id_fk"
    FOREIGN KEY ("channel_config_id") REFERENCES "kortix"."channel_configs"("channel_config_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."channel_messages" ADD CONSTRAINT "channel_messages_channel_config_id_channel_configs_channel_config_id_fk"
    FOREIGN KEY ("channel_config_id") REFERENCES "kortix"."channel_configs"("channel_config_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."channel_sessions" ADD CONSTRAINT "channel_sessions_channel_config_id_channel_configs_channel_config_id_fk"
    FOREIGN KEY ("channel_config_id") REFERENCES "kortix"."channel_configs"("channel_config_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."deployments" ADD CONSTRAINT "deployments_sandbox_id_sandboxes_sandbox_id_fk"
    FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."executions" ADD CONSTRAINT "executions_trigger_id_triggers_trigger_id_fk"
    FOREIGN KEY ("trigger_id") REFERENCES "kortix"."triggers"("trigger_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."executions" ADD CONSTRAINT "executions_sandbox_id_sandboxes_sandbox_id_fk"
    FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."api_keys" ADD CONSTRAINT "api_keys_sandbox_id_sandboxes_sandbox_id_fk"
    FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kortix"."triggers" ADD CONSTRAINT "triggers_sandbox_id_sandboxes_sandbox_id_fk"
    FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_channel_configs_sandbox" ON "kortix"."channel_configs" USING btree ("sandbox_id");
CREATE INDEX IF NOT EXISTS "idx_channel_configs_account" ON "kortix"."channel_configs" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "idx_channel_configs_type" ON "kortix"."channel_configs" USING btree ("channel_type");
CREATE INDEX IF NOT EXISTS "idx_channel_configs_enabled" ON "kortix"."channel_configs" USING btree ("enabled");
CREATE INDEX IF NOT EXISTS "idx_channel_identity_config" ON "kortix"."channel_identity_map" USING btree ("channel_config_id");
CREATE INDEX IF NOT EXISTS "idx_channel_identity_platform_user" ON "kortix"."channel_identity_map" USING btree ("platform_user_id");
CREATE INDEX IF NOT EXISTS "idx_channel_messages_config" ON "kortix"."channel_messages" USING btree ("channel_config_id");
CREATE INDEX IF NOT EXISTS "idx_channel_messages_session" ON "kortix"."channel_messages" USING btree ("session_id");
CREATE INDEX IF NOT EXISTS "idx_channel_messages_created" ON "kortix"."channel_messages" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_channel_sessions_config" ON "kortix"."channel_sessions" USING btree ("channel_config_id");
CREATE INDEX IF NOT EXISTS "idx_channel_sessions_key" ON "kortix"."channel_sessions" USING btree ("strategy_key");
CREATE INDEX IF NOT EXISTS "idx_deployments_account" ON "kortix"."deployments" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "idx_deployments_sandbox" ON "kortix"."deployments" USING btree ("sandbox_id");
CREATE INDEX IF NOT EXISTS "idx_deployments_status" ON "kortix"."deployments" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_deployments_live_url" ON "kortix"."deployments" USING btree ("live_url");
CREATE INDEX IF NOT EXISTS "idx_deployments_created" ON "kortix"."deployments" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_executions_trigger" ON "kortix"."executions" USING btree ("trigger_id");
CREATE INDEX IF NOT EXISTS "idx_executions_status" ON "kortix"."executions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_executions_created" ON "kortix"."executions" USING btree ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_kortix_api_keys_public_key" ON "kortix"."api_keys" USING btree ("public_key");
CREATE INDEX IF NOT EXISTS "idx_kortix_api_keys_secret_hash" ON "kortix"."api_keys" USING btree ("secret_key_hash");
CREATE INDEX IF NOT EXISTS "idx_kortix_api_keys_sandbox" ON "kortix"."api_keys" USING btree ("sandbox_id");
CREATE INDEX IF NOT EXISTS "idx_kortix_api_keys_account" ON "kortix"."api_keys" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_account" ON "kortix"."sandboxes" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_external_id" ON "kortix"."sandboxes" USING btree ("external_id");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_status" ON "kortix"."sandboxes" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_pooled_fifo" ON "kortix"."sandboxes" USING btree ("pooled_at");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_auth_token" ON "kortix"."sandboxes" USING btree ("auth_token");
CREATE INDEX IF NOT EXISTS "idx_triggers_next_run" ON "kortix"."triggers" USING btree ("next_run_at");
CREATE INDEX IF NOT EXISTS "idx_triggers_sandbox" ON "kortix"."triggers" USING btree ("sandbox_id");
CREATE INDEX IF NOT EXISTS "idx_triggers_account" ON "kortix"."triggers" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "idx_triggers_active" ON "kortix"."triggers" USING btree ("is_active");


-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 0001_pg_cron_scheduler.sql
-- Sets up pg_cron + pg_net for database-native scheduling
-- ═══════════════════════════════════════════════════════════════════════════════

-- Config table for scheduler settings (API URL + shared secret)
CREATE TABLE IF NOT EXISTS kortix.scheduler_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Function that pg_cron invokes every minute.
-- Reads the API URL and secret from scheduler_config,
-- then fires an async HTTP POST via pg_net.
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

-- Schedule the global tick — runs every minute
SELECT cron.schedule(
  'kortix-scheduler-tick',
  '* * * * *',
  'SELECT kortix.scheduler_tick()'
);

-- Helper function to configure the scheduler (called by kortix-api on startup)
-- Usage: SELECT kortix.configure_scheduler('http://kortix-api:8008', 'your-secret');
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


-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 0002_trigger_model_columns.sql
-- Adds model selection columns to triggers table
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE kortix.triggers ADD COLUMN IF NOT EXISTS model_provider_id VARCHAR(255);
ALTER TABLE kortix.triggers ADD COLUMN IF NOT EXISTS model_id VARCHAR(255);


-- ═══════════════════════════════════════════════════════════════════════════════
-- Legacy billing tables (public schema)
-- These exist in Supabase cloud. Locally we create them so queries don't crash.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.credit_accounts (
  account_id          UUID PRIMARY KEY,
  balance             NUMERIC(12,4) NOT NULL DEFAULT 0,
  lifetime_granted    NUMERIC(12,4) NOT NULL DEFAULT 0,
  lifetime_purchased  NUMERIC(12,4) NOT NULL DEFAULT 0,
  lifetime_used       NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  last_grant_date     TIMESTAMPTZ,
  tier                VARCHAR(50) DEFAULT 'free',
  billing_cycle_anchor TIMESTAMPTZ,
  next_credit_grant   TIMESTAMPTZ,
  stripe_subscription_id VARCHAR(255),
  expiring_credits    NUMERIC(12,4) NOT NULL DEFAULT 0,
  non_expiring_credits NUMERIC(12,4) NOT NULL DEFAULT 0,
  trial_status        VARCHAR(20) DEFAULT 'none',
  trial_started_at    TIMESTAMPTZ,
  trial_ends_at       TIMESTAMPTZ,
  is_grandfathered_free BOOLEAN DEFAULT false,
  last_processed_invoice_id VARCHAR(255),
  commitment_type     VARCHAR(50),
  commitment_start_date TIMESTAMPTZ,
  commitment_end_date TIMESTAMPTZ,
  commitment_price_id VARCHAR(255),
  can_cancel_after    TIMESTAMPTZ,
  last_renewal_period_start BIGINT,
  payment_status      TEXT DEFAULT 'active',
  last_payment_failure TIMESTAMPTZ,
  scheduled_tier_change TEXT,
  scheduled_tier_change_date TIMESTAMPTZ,
  scheduled_price_id  TEXT,
  provider            VARCHAR(20) DEFAULT 'stripe',
  revenuecat_customer_id VARCHAR(255),
  revenuecat_subscription_id VARCHAR(255),
  revenuecat_cancelled_at TIMESTAMPTZ,
  revenuecat_cancel_at_period_end TIMESTAMPTZ,
  revenuecat_pending_change_product TEXT,
  revenuecat_pending_change_date TIMESTAMPTZ,
  revenuecat_pending_change_type TEXT,
  revenuecat_product_id TEXT,
  plan_type           VARCHAR(50) DEFAULT 'monthly',
  stripe_subscription_status VARCHAR(50),
  last_daily_refresh  TIMESTAMPTZ,
  daily_credits_balance NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL,
  amount          NUMERIC(12,4) NOT NULL,
  balance_after   NUMERIC(12,4) NOT NULL,
  type            TEXT NOT NULL,
  description     TEXT,
  reference_id    UUID,
  reference_type  TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID,
  is_expiring     BOOLEAN DEFAULT true,
  expires_at      TIMESTAMPTZ,
  stripe_event_id VARCHAR(255) UNIQUE,
  message_id      UUID,
  thread_id       UUID
);

CREATE TABLE IF NOT EXISTS public.credit_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL,
  amount_dollars    NUMERIC(10,2) NOT NULL,
  thread_id         UUID,
  message_id        UUID,
  description       TEXT,
  usage_type        TEXT DEFAULT 'token_overage',
  created_at        TIMESTAMPTZ DEFAULT now(),
  subscription_tier TEXT,
  metadata          JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL,
  user_id       UUID NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  reason        TEXT,
  requested_at  TIMESTAMPTZ DEFAULT now(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              UUID NOT NULL,
  amount_dollars          NUMERIC(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_charge_id        TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  description             TEXT,
  metadata                JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT now(),
  completed_at            TIMESTAMPTZ,
  provider                VARCHAR(50) DEFAULT 'stripe',
  revenuecat_transaction_id VARCHAR(255),
  revenuecat_product_id   VARCHAR(255)
);

-- basejump schema (subset needed by billing)
CREATE SCHEMA IF NOT EXISTS basejump;

CREATE TABLE IF NOT EXISTS basejump.billing_customers (
  id          TEXT PRIMARY KEY,
  account_id  UUID NOT NULL,
  email       TEXT,
  active      BOOLEAN,
  provider    TEXT
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Local mock user — default credit account for local mode
-- Auth is bypassed with userId = 00000000-0000-0000-0000-000000000000
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.credit_accounts (account_id, balance, tier, payment_status)
VALUES ('00000000-0000-0000-0000-000000000000', 99999, 'pro', 'active')
ON CONFLICT (account_id) DO NOTHING;
