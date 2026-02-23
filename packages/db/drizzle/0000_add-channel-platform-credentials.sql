-- Migration: add channel_platform_credentials table
-- Stores per-account platform-level credentials (e.g. Slack App client ID/secret)
-- so local/self-hosted users can configure them via the UI instead of env vars.

CREATE TABLE IF NOT EXISTS "kortix"."channel_platform_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "channel_type" "kortix"."channel_type" NOT NULL,
  "credentials" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_channel_platform_creds_account_type" ON "kortix"."channel_platform_credentials" USING btree ("account_id","channel_type");
