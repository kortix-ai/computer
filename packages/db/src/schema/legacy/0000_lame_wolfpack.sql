-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "basejump";
--> statement-breakpoint
CREATE TYPE "basejump"."account_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "basejump"."invitation_type" AS ENUM('one_time', '24_hour');--> statement-breakpoint
CREATE TYPE "basejump"."subscription_status" AS ENUM('trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."agent_trigger_type" AS ENUM('telegram', 'slack', 'webhook', 'schedule', 'email', 'github', 'discord', 'teams');--> statement-breakpoint
CREATE TYPE "public"."agent_workflow_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."api_key_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."benchmark_result_status" AS ENUM('completed', 'failed', 'timeout', 'error');--> statement-breakpoint
CREATE TYPE "public"."benchmark_run_status" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."benchmark_run_type" AS ENUM('core_test', 'stress_test');--> statement-breakpoint
CREATE TYPE "public"."memory_extraction_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('fact', 'preference', 'context', 'conversation_summary');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_run_status" AS ENUM('pending', 'embedding', 'clustering', 'labeling', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('pending', 'initializing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('billing', 'technical', 'account', 'feature_request', 'general');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_type" AS ENUM('user', 'admin', 'internal_note');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'awaiting_user', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'super_admin');--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"thread_id" uuid,
	"agent_id" uuid,
	"account_id" uuid NOT NULL,
	"user_id" uuid,
	"bucket_name" varchar(255) NOT NULL,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_size" bigint NOT NULL,
	"content_type" varchar(255),
	"signed_url" text,
	"url_expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "file_uploads_user_storage_unique" UNIQUE("user_id","bucket_name","storage_path"),
	CONSTRAINT "file_uploads_bucket_name_check" CHECK ((bucket_name)::text = ANY ((ARRAY['file-uploads'::character varying, 'browser-screenshots'::character varying])::text[])),
	CONSTRAINT "file_uploads_file_size_check" CHECK (file_size > 0),
	CONSTRAINT "file_uploads_original_filename_check" CHECK (length(TRIM(BOTH FROM original_filename)) > 0)
);
--> statement-breakpoint
ALTER TABLE "file_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "migration_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"migration_name" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now(),
	"status" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "migration_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admin_actions_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"target_user_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "admin_actions_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agents" (
	"agent_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"is_public" boolean DEFAULT false,
	"tags" text[] DEFAULT '{""}',
	"current_version_id" uuid,
	"version_count" integer DEFAULT 1,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"icon_name" varchar(100) NOT NULL,
	"icon_color" varchar(7) DEFAULT '#000000' NOT NULL,
	"icon_background" varchar(7) DEFAULT '#F3F4F6' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "agents_icon_background_format" CHECK ((icon_background IS NULL) OR ((icon_background)::text ~ '^#[0-9A-Fa-f]{6}$'::text)),
	CONSTRAINT "agents_icon_color_format" CHECK ((icon_color IS NULL) OR ((icon_color)::text ~ '^#[0-9A-Fa-f]{6}$'::text))
);
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"balance_after" numeric(12, 4) NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"reference_id" uuid,
	"reference_type" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid,
	"is_expiring" boolean DEFAULT true,
	"expires_at" timestamp with time zone,
	"stripe_event_id" varchar(255),
	"message_id" uuid,
	"thread_id" uuid,
	"processing_source" text,
	"idempotency_key" text,
	"locked_at" timestamp with time zone,
	"triggered_by_user_id" uuid,
	"team_member_email" text,
	CONSTRAINT "unique_stripe_event" UNIQUE("stripe_event_id"),
	CONSTRAINT "credit_ledger_type_check" CHECK (type = ANY (ARRAY['tier_grant'::text, 'purchase'::text, 'admin_grant'::text, 'promotional'::text, 'usage'::text, 'refund'::text, 'adjustment'::text, 'expired'::text, 'tier_upgrade'::text, 'daily_grant'::text, 'daily_refresh'::text]))
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"version_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"version_name" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_description" text,
	"previous_version_id" uuid,
	"model" varchar(255),
	CONSTRAINT "agent_versions_agent_id_version_number_key" UNIQUE("agent_id","version_number"),
	CONSTRAINT "agent_versions_agent_id_version_name_key" UNIQUE("agent_id","version_name"),
	CONSTRAINT "agent_versions_config_structure_check" CHECK ((config ? 'system_prompt'::text) AND (config ? 'tools'::text))
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_keys" (
	"key_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_key" varchar(64) NOT NULL,
	"secret_key_hash" varchar(64) NOT NULL,
	"account_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "api_key_status" DEFAULT 'active',
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_keys_public_key_key" UNIQUE("public_key"),
	CONSTRAINT "api_keys_public_key_format" CHECK ((public_key)::text ~ '^pk_[a-zA-Z0-9]{32}$'::text),
	CONSTRAINT "api_keys_title_not_empty" CHECK (length(TRIM(BOTH FROM title)) > 0)
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vapi_calls" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"call_id" text NOT NULL,
	"agent_id" uuid,
	"thread_id" uuid,
	"phone_number" text NOT NULL,
	"direction" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"duration_seconds" integer,
	"transcript" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cost" numeric(10, 6),
	CONSTRAINT "vapi_calls_call_id_key" UNIQUE("call_id"),
	CONSTRAINT "vapi_calls_direction_check" CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text])),
	CONSTRAINT "vapi_calls_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'ringing'::text, 'in-progress'::text, 'completed'::text, 'ended'::text, 'failed'::text]))
);
--> statement-breakpoint
ALTER TABLE "vapi_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "basejump"."config" (
	"enable_team_accounts" boolean DEFAULT true,
	"enable_personal_account_billing" boolean DEFAULT true,
	"enable_team_account_billing" boolean DEFAULT true,
	"billing_provider" text DEFAULT 'stripe'
);
--> statement-breakpoint
ALTER TABLE "basejump"."config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "basejump"."billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"billing_customer_id" text NOT NULL,
	"status" "basejump"."subscription_status",
	"metadata" jsonb,
	"price_id" text,
	"plan_name" text,
	"quantity" integer,
	"cancel_at_period_end" boolean,
	"created" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"current_period_end" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"ended_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
	"cancel_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
	"canceled_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
	"trial_start" timestamp with time zone DEFAULT timezone('utc'::text, now()),
	"trial_end" timestamp with time zone DEFAULT timezone('utc'::text, now()),
	"provider" text
);
--> statement-breakpoint
ALTER TABLE "basejump"."billing_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "basejump"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_role" "basejump"."account_role" NOT NULL,
	"account_id" uuid NOT NULL,
	"token" text DEFAULT basejump.generate_token(30) NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"account_name" text,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"invitation_type" "basejump"."invitation_type" NOT NULL,
	CONSTRAINT "invitations_token_key" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "basejump"."invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"category" varchar(50) NOT NULL,
	"action" varchar(255) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "basejump"."billing_customers" (
	"account_id" uuid NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"active" boolean,
	"provider" text
);
--> statement-breakpoint
ALTER TABLE "basejump"."billing_customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"agent_id" uuid,
	"agent_version_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"project_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"account_id" uuid NOT NULL,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"icon_name" text,
	"category" text DEFAULT 'Uncategorized',
	"categories" text[] DEFAULT '{""}',
	"last_categorized_at" timestamp with time zone,
	"sandbox_resource_id" uuid
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commitment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"commitment_type" varchar(50),
	"price_id" varchar(255),
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"stripe_subscription_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text
);
--> statement-breakpoint
ALTER TABLE "commitment_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"message_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"type" text NOT NULL,
	"is_llm_message" boolean DEFAULT true NOT NULL,
	"content" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"agent_id" uuid,
	"agent_version_id" uuid,
	"created_by_user_id" uuid,
	"is_omitted" boolean DEFAULT false,
	"is_archived" boolean DEFAULT false,
	"archive_id" uuid
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_mcp_credential_profiles" (
	"profile_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"mcp_qualified_name" text NOT NULL,
	"profile_name" text NOT NULL,
	"display_name" text NOT NULL,
	"encrypted_config" text NOT NULL,
	"config_hash" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_used_at" timestamp with time zone,
	CONSTRAINT "user_mcp_credential_profiles_account_id_mcp_qualified_name__key" UNIQUE("account_id","mcp_qualified_name","profile_name")
);
--> statement-breakpoint
ALTER TABLE "user_mcp_credential_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_balance" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"balance_dollars" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_purchased" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_used" numeric(10, 2) DEFAULT '0' NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "credit_balance_balance_dollars_check" CHECK (balance_dollars >= (0)::numeric),
	CONSTRAINT "credit_balance_total_purchased_check" CHECK (total_purchased >= (0)::numeric),
	CONSTRAINT "credit_balance_total_used_check" CHECK (total_used >= (0)::numeric)
);
--> statement-breakpoint
ALTER TABLE "credit_balance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_dollars" numeric(10, 2) NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"description" text,
	"usage_type" text DEFAULT 'token_overage',
	"created_at" timestamp with time zone DEFAULT now(),
	"subscription_tier" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "credit_usage_amount_dollars_check" CHECK (amount_dollars > (0)::numeric),
	CONSTRAINT "credit_usage_usage_type_check" CHECK (usage_type = ANY (ARRAY['token_overage'::text, 'manual_deduction'::text, 'adjustment'::text]))
);
--> statement-breakpoint
ALTER TABLE "credit_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_dollars" numeric(10, 2) NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"reconciliation_attempts" integer DEFAULT 0,
	"last_reconciliation_attempt" timestamp with time zone,
	"provider" varchar(50) DEFAULT 'stripe',
	"revenuecat_transaction_id" varchar(255),
	"revenuecat_product_id" varchar(255),
	CONSTRAINT "credit_purchases_stripe_payment_intent_id_key" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "credit_purchases_revenuecat_transaction_id_key" UNIQUE("revenuecat_transaction_id"),
	CONSTRAINT "credit_purchases_amount_dollars_check" CHECK (amount_dollars > (0)::numeric),
	CONSTRAINT "credit_purchases_amount_positive" CHECK (amount_dollars > (0)::numeric),
	CONSTRAINT "credit_purchases_provider_check" CHECK ((provider)::text = ANY ((ARRAY['stripe'::character varying, 'revenuecat'::character varying])::text[])),
	CONSTRAINT "credit_purchases_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text]))
);
--> statement-breakpoint
ALTER TABLE "credit_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"template_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{""}',
	"is_public" boolean DEFAULT false,
	"marketplace_published_at" timestamp with time zone,
	"download_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_kortix_team" boolean DEFAULT false,
	"config" jsonb DEFAULT '{}'::jsonb,
	"icon_name" varchar(100) NOT NULL,
	"icon_color" varchar(7) DEFAULT '#000000' NOT NULL,
	"icon_background" varchar(7) DEFAULT '#F3F4F6' NOT NULL,
	"usage_examples" jsonb DEFAULT '[]'::jsonb,
	"categories" text[] DEFAULT '{""}',
	CONSTRAINT "agent_templates_config_structure_check" CHECK ((config ? 'system_prompt'::text) AND (config ? 'tools'::text) AND (config ? 'metadata'::text)),
	CONSTRAINT "agent_templates_icon_background_format" CHECK ((icon_background IS NULL) OR ((icon_background)::text ~ '^#[0-9A-Fa-f]{6}$'::text)),
	CONSTRAINT "agent_templates_icon_color_format" CHECK ((icon_color IS NULL) OR ((icon_color)::text ~ '^#[0-9A-Fa-f]{6}$'::text)),
	CONSTRAINT "agent_templates_tools_structure_check" CHECK (((config -> 'tools'::text) ? 'agentpress'::text) AND ((config -> 'tools'::text) ? 'mcp'::text) AND ((config -> 'tools'::text) ? 'custom_mcp'::text))
);
--> statement-breakpoint
ALTER TABLE "agent_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "arr_monthly_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_index" integer NOT NULL,
	"month_name" text NOT NULL,
	"views" integer DEFAULT 0,
	"signups" integer DEFAULT 0,
	"new_paid" integer DEFAULT 0,
	"churn" integer DEFAULT 0,
	"subscribers" integer DEFAULT 0,
	"mrr" numeric(12, 2) DEFAULT '0',
	"arr" numeric(12, 2) DEFAULT '0',
	"overrides" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"platform" text DEFAULT 'web' NOT NULL,
	CONSTRAINT "arr_monthly_actuals_month_platform_key" UNIQUE("month_index","platform"),
	CONSTRAINT "arr_monthly_actuals_platform_check" CHECK (platform = ANY (ARRAY['web'::text, 'app'::text]))
);
--> statement-breakpoint
ALTER TABLE "arr_monthly_actuals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "google_oauth_tokens" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"encrypted_token" text,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	CONSTRAINT "google_oauth_tokens_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "google_oauth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedback" (
	"feedback_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"account_id" uuid NOT NULL,
	"rating" numeric(2, 1) NOT NULL,
	"feedback_text" text,
	"help_improve" boolean DEFAULT true,
	"context" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "feedback_rating_check" CHECK ((rating >= 0.5) AND (rating <= 5.0) AND ((rating % 0.5) = (0)::numeric))
);
--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_triggers" (
	"trigger_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"agent_id" uuid NOT NULL,
	"trigger_type" "agent_trigger_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"execution_type" varchar(50) DEFAULT 'agent',
	"workflow_id" uuid,
	CONSTRAINT "agent_triggers_execution_type_check" CHECK ((execution_type)::text = ANY ((ARRAY['agent'::character varying, 'workflow'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "agent_triggers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "circuit_breaker_state" (
	"circuit_name" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_failure_time" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "circuit_breaker_state_state_check" CHECK (state = ANY (ARRAY['closed'::text, 'open'::text, 'half_open'::text]))
);
--> statement-breakpoint
ALTER TABLE "circuit_breaker_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"converted_to_paid" boolean DEFAULT false,
	"stripe_checkout_session_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"status" text DEFAULT 'active',
	"error_message" text,
	CONSTRAINT "unique_account_trial" UNIQUE("account_id"),
	CONSTRAINT "trial_history_status_check" CHECK (status = ANY (ARRAY['checkout_pending'::text, 'checkout_created'::text, 'checkout_failed'::text, 'active'::text, 'expired'::text, 'converted'::text, 'cancelled'::text]))
);
--> statement-breakpoint
ALTER TABLE "trial_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"backend_url" text NOT NULL,
	"webhook_secret" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "single_row" CHECK (id = 1)
);
--> statement-breakpoint
ALTER TABLE "webhook_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_workflows_backup" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid,
	"name" varchar(255),
	"description" text,
	"status" "agent_workflow_status",
	"trigger_phrase" varchar(255),
	"is_default" boolean,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"steps" jsonb
);
--> statement-breakpoint
ALTER TABLE "agent_workflows_backup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "distributed_locks" (
	"lock_key" text PRIMARY KEY NOT NULL,
	"holder_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "distributed_locks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now(),
	"processing_started_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "webhook_events_event_id_key" UNIQUE("event_id"),
	CONSTRAINT "webhook_events_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refund_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"stripe_refund_id" text NOT NULL,
	"stripe_charge_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"amount_refunded" numeric(10, 2) NOT NULL,
	"credits_deducted" numeric(10, 2) DEFAULT '0' NOT NULL,
	"refund_reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "refund_history_stripe_refund_id_key" UNIQUE("stripe_refund_id"),
	CONSTRAINT "refund_history_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processed'::text, 'failed'::text]))
);
--> statement-breakpoint
ALTER TABLE "refund_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_base_folders" (
	"folder_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "kb_folders_name_not_empty" CHECK (length(TRIM(BOTH FROM name)) > 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge_base_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_base_entries" (
	"entry_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"file_path" text NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" varchar(255),
	"summary" text NOT NULL,
	"usage_context" varchar(100) DEFAULT 'always',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "kb_entries_file_size_positive" CHECK (file_size > 0),
	CONSTRAINT "kb_entries_filename_not_empty" CHECK (length(TRIM(BOTH FROM filename)) > 0),
	CONSTRAINT "kb_entries_summary_not_empty" CHECK (length(TRIM(BOTH FROM summary)) > 0),
	CONSTRAINT "knowledge_base_entries_usage_context_check" CHECK ((usage_context)::text = ANY ((ARRAY['always'::character varying, 'on_request'::character varying, 'contextual'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "knowledge_base_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_knowledge_entry_assignments" (
	"assignment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true,
	"assigned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_knowledge_entry_assignments_agent_id_entry_id_key" UNIQUE("agent_id","entry_id")
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge_entry_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_refresh_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"refresh_date" date NOT NULL,
	"credits_granted" numeric(10, 2) NOT NULL,
	"tier" text NOT NULL,
	"processed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_refresh_tracking_account_id_refresh_date_key" UNIQUE("account_id","refresh_date")
);
--> statement-breakpoint
ALTER TABLE "daily_refresh_tracking" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"category" varchar(50) DEFAULT NULL,
	"thread_id" uuid,
	"agent_run_id" uuid,
	"related_entity_type" varchar(50) DEFAULT NULL,
	"related_entity_id" uuid,
	"is_global" boolean DEFAULT false,
	"created_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp with time zone,
	"email_error" text,
	"push_sent" boolean DEFAULT false,
	"push_sent_at" timestamp with time zone,
	"push_error" text,
	"retry_count" integer DEFAULT 0,
	"last_retry_at" timestamp with time zone,
	"is_read" boolean DEFAULT false,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"email_enabled" boolean DEFAULT true,
	"push_enabled" boolean DEFAULT true,
	"email_categories" jsonb DEFAULT '{"admin":true,"agent":true,"system":true,"billing":true}'::jsonb,
	"push_categories" jsonb DEFAULT '{"admin":true,"agent":true,"system":true,"billing":true}'::jsonb,
	"push_token" text,
	"push_token_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clustering_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'running',
	"num_clusters" integer,
	"num_threads" integer,
	"date_range_start" timestamp with time zone,
	"date_range_end" timestamp with time zone,
	"algorithm" text DEFAULT 'kmeans',
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "clustering_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "thread_embeddings" (
	"thread_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1536),
	"text_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "thread_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "thread_clusters" (
	"cluster_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"cluster_index" integer NOT NULL,
	"label" text,
	"description" text,
	"thread_count" integer DEFAULT 0,
	"sample_thread_ids" uuid[] DEFAULT '{""}',
	"centroid" vector(1536),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "thread_clusters_run_id_cluster_index_key" UNIQUE("run_id","cluster_index")
);
--> statement-breakpoint
ALTER TABLE "thread_clusters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "taxonomy_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "taxonomy_run_status" DEFAULT 'pending' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"project_count" integer,
	"embedded_count" integer,
	"cluster_count" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renewal_processing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" bigint NOT NULL,
	"period_end" bigint NOT NULL,
	"subscription_id" text NOT NULL,
	"processed_by" text NOT NULL,
	"credits_granted" numeric(10, 2) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now(),
	"stripe_event_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"provider" text DEFAULT 'stripe',
	"revenuecat_transaction_id" text,
	"revenuecat_product_id" text,
	CONSTRAINT "renewal_processing_account_id_period_start_key" UNIQUE("account_id","period_start"),
	CONSTRAINT "renewal_processing_processed_by_check" CHECK (processed_by = ANY (ARRAY['webhook_invoice'::text, 'webhook_subscription'::text, 'manual'::text, 'cron'::text, 'revenuecat_webhook'::text])),
	CONSTRAINT "renewal_processing_provider_check" CHECK (provider = ANY (ARRAY['stripe'::text, 'revenuecat'::text]))
);
--> statement-breakpoint
ALTER TABLE "renewal_processing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversation_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"account_id" uuid NOT NULL,
	"sentiment_score" numeric(3, 2),
	"sentiment_label" text,
	"frustration_score" numeric(3, 2),
	"frustration_signals" jsonb DEFAULT '[]'::jsonb,
	"churn_risk_score" numeric(3, 2),
	"churn_signals" jsonb DEFAULT '[]'::jsonb,
	"primary_topic" text,
	"topics" jsonb DEFAULT '[]'::jsonb,
	"intent_type" text,
	"is_feature_request" boolean DEFAULT false,
	"feature_request_text" text,
	"is_useful" boolean DEFAULT true,
	"use_case_category" text,
	"use_case_summary" text,
	"output_type" text,
	"domain" text,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"user_message_count" integer,
	"assistant_message_count" integer,
	"conversation_duration_seconds" integer,
	"agent_run_status" text,
	"analyzed_at" timestamp with time zone DEFAULT now(),
	"raw_analysis" jsonb DEFAULT '{}'::jsonb,
	"use_case_embedding" vector(1536),
	CONSTRAINT "conversation_analytics_intent_type_check" CHECK (intent_type = ANY (ARRAY['question'::text, 'task'::text, 'complaint'::text, 'feature_request'::text, 'chat'::text])),
	CONSTRAINT "conversation_analytics_sentiment_label_check" CHECK (sentiment_label = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text, 'mixed'::text]))
);
--> statement-breakpoint
ALTER TABLE "conversation_analytics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversation_analytics_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone,
	CONSTRAINT "conversation_analytics_queue_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))
);
--> statement-breakpoint
ALTER TABLE "conversation_analytics_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pricing_views" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"view_count" integer DEFAULT 1 NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pricing_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"balance" numeric(12, 4) DEFAULT '0' NOT NULL,
	"lifetime_granted" numeric(12, 4) DEFAULT '0' NOT NULL,
	"lifetime_purchased" numeric(12, 4) DEFAULT '0' NOT NULL,
	"lifetime_used" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_grant_date" timestamp with time zone,
	"tier" varchar(50) DEFAULT 'free',
	"billing_cycle_anchor" timestamp with time zone,
	"next_credit_grant" timestamp with time zone,
	"stripe_subscription_id" varchar(255),
	"expiring_credits" numeric(12, 4) DEFAULT '0' NOT NULL,
	"non_expiring_credits" numeric(12, 4) DEFAULT '0' NOT NULL,
	"trial_status" varchar(20) DEFAULT 'none',
	"trial_started_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"is_grandfathered_free" boolean DEFAULT false,
	"last_processed_invoice_id" varchar(255),
	"commitment_type" varchar(50),
	"commitment_start_date" timestamp with time zone,
	"commitment_end_date" timestamp with time zone,
	"commitment_price_id" varchar(255),
	"can_cancel_after" timestamp with time zone,
	"last_renewal_period_start" bigint,
	"last_reconciled_at" timestamp with time zone,
	"reconciliation_discrepancy" numeric(10, 2) DEFAULT '0',
	"needs_reconciliation" boolean DEFAULT false,
	"payment_status" text DEFAULT 'active',
	"last_payment_failure" timestamp with time zone,
	"scheduled_tier_change" text,
	"scheduled_tier_change_date" timestamp with time zone,
	"scheduled_price_id" text,
	"provider" varchar(20) DEFAULT 'stripe',
	"revenuecat_customer_id" varchar(255),
	"revenuecat_subscription_id" varchar(255),
	"revenuecat_cancelled_at" timestamp with time zone,
	"revenuecat_cancel_at_period_end" timestamp with time zone,
	"revenuecat_pending_change_product" text,
	"revenuecat_pending_change_date" timestamp with time zone,
	"revenuecat_pending_change_type" text,
	"revenuecat_product_id" text,
	"plan_type" varchar(50) DEFAULT 'monthly',
	"stripe_subscription_status" varchar(50),
	"last_daily_refresh" timestamp with time zone,
	"daily_credits_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "credit_accounts_payment_status_check" CHECK (payment_status = ANY (ARRAY['active'::text, 'failed'::text, 'pending'::text, 'past_due'::text])),
	CONSTRAINT "credit_accounts_plan_type_check" CHECK ((plan_type)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying, 'yearly_commitment'::character varying])::text[])),
	CONSTRAINT "credit_accounts_provider_check" CHECK ((provider)::text = ANY ((ARRAY['stripe'::character varying, 'revenuecat'::character varying, 'manual'::character varying])::text[])),
	CONSTRAINT "credit_accounts_trial_status_check" CHECK ((trial_status)::text = ANY ((ARRAY['none'::character varying, 'active'::character varying, 'expired'::character varying, 'converted'::character varying, 'cancelled'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "credit_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referred_account_id" uuid NOT NULL,
	"referral_code" text NOT NULL,
	"credits_awarded" numeric(12, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "referrals_referred_account_id_key" UNIQUE("referred_account_id"),
	CONSTRAINT "referrals_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'expired'::text]))
);
--> statement-breakpoint
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "referral_stats" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"total_referrals" integer DEFAULT 0 NOT NULL,
	"successful_referrals" integer DEFAULT 0 NOT NULL,
	"total_credits_earned" numeric(12, 4) DEFAULT '0' NOT NULL,
	"last_referral_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "referral_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_memories" (
	"memory_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"content" text NOT NULL,
	"memory_type" "memory_type" DEFAULT 'fact' NOT NULL,
	"embedding" vector(1536),
	"source_thread_id" uuid,
	"confidence_score" double precision DEFAULT 0.8,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_extraction_queue" (
	"queue_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "memory_extraction_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 5,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memory_extraction_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "basejump"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"primary_owner_user_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text,
	"slug" text,
	"personal_account" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"private_metadata" jsonb DEFAULT '{}'::jsonb,
	"public_metadata" jsonb DEFAULT '{}'::jsonb,
	"memory_enabled" boolean DEFAULT true,
	CONSTRAINT "accounts_slug_key" UNIQUE("slug"),
	CONSTRAINT "basejump_accounts_slug_null_if_personal_account_true" CHECK (((personal_account = true) AND (slug IS NULL)) OR ((personal_account = false) AND (slug IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "basejump"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true,
	"push_enabled" boolean DEFAULT false,
	"in_app_enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_presence_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"active_thread_id" text,
	"last_seen" timestamp with time zone DEFAULT now(),
	"platform" text,
	"device_info" jsonb DEFAULT '{}'::jsonb,
	"client_timestamp" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_presence_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"device_token" text NOT NULL,
	"device_type" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "device_tokens_account_id_device_token_key" UNIQUE("account_id","device_token")
);
--> statement-breakpoint
ALTER TABLE "device_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"expired_at" timestamp with time zone,
	CONSTRAINT "referral_codes_code_key" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "referral_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "arr_weekly_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_number" integer NOT NULL,
	"week_start_date" date NOT NULL,
	"views" integer DEFAULT 0,
	"signups" integer DEFAULT 0,
	"new_paid" integer DEFAULT 0,
	"subscribers" integer DEFAULT 0,
	"mrr" numeric(12, 2) DEFAULT '0',
	"arr" numeric(14, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"overrides" jsonb DEFAULT '{}'::jsonb,
	"churn" integer DEFAULT 0,
	"platform" text DEFAULT 'web' NOT NULL,
	CONSTRAINT "arr_weekly_actuals_week_platform_key" UNIQUE("week_number","platform"),
	CONSTRAINT "arr_weekly_actuals_platform_check" CHECK (platform = ANY (ARRAY['web'::text, 'app'::text])),
	CONSTRAINT "arr_weekly_actuals_week_number_check" CHECK ((week_number >= 1) AND (week_number <= 52))
);
--> statement-breakpoint
ALTER TABLE "arr_weekly_actuals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "threads" (
	"thread_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"project_id" uuid,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by_user_id" uuid,
	"team_context" jsonb DEFAULT '{}'::jsonb,
	"user_message_count" integer DEFAULT 0,
	"total_message_count" integer DEFAULT 0,
	"status" "thread_status" DEFAULT 'ready',
	"initialization_error" text,
	"initialization_started_at" timestamp with time zone,
	"initialization_completed_at" timestamp with time zone,
	"memory_enabled" boolean DEFAULT true,
	"name" text DEFAULT 'New Chat',
	"parent_thread_id" uuid,
	"depth_level" integer DEFAULT 0,
	CONSTRAINT "threads_account_thread_unique" UNIQUE("thread_id","account_id"),
	CONSTRAINT "threads_depth_level_non_negative" CHECK (depth_level >= 0)
);
--> statement-breakpoint
ALTER TABLE "threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vercel_analytics_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"device_ids" text[] DEFAULT '{""}'
);
--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deletion_scheduled_for" timestamp with time zone NOT NULL,
	"reason" text,
	"is_cancelled" boolean DEFAULT false,
	"cancelled_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "arr_simulator_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starting_subs" integer DEFAULT 639,
	"starting_mrr" numeric(12, 2) DEFAULT '21646',
	"weekly_visitors" integer DEFAULT 40000,
	"landing_conversion" numeric(5, 2) DEFAULT '25',
	"signup_to_paid" numeric(5, 2) DEFAULT '1',
	"arpu" numeric(10, 2) DEFAULT '34',
	"monthly_churn" numeric(5, 2) DEFAULT '25',
	"visitor_growth" numeric(5, 2) DEFAULT '5',
	"target_arr" numeric(14, 2) DEFAULT '10000000',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "arr_simulator_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_embeddings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1536),
	"text_hash" text,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "taxonomy_nodes" (
	"node_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"level" integer NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"centroid" vector(1536),
	"project_count" integer DEFAULT 0,
	"sample_terms" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_nodes_level_check" CHECK ((level >= 0) AND (level <= 2))
);
--> statement-breakpoint
ALTER TABLE "taxonomy_nodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"type" text NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_used_at" timestamp with time zone,
	"pooled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_type" "benchmark_run_type" NOT NULL,
	"model_name" text NOT NULL,
	"concurrency_level" integer DEFAULT 1 NOT NULL,
	"total_prompts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"status" "benchmark_run_status" DEFAULT 'running' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "benchmark_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_text" text NOT NULL,
	"thread_id" uuid,
	"agent_run_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cold_start_time_ms" integer,
	"total_duration_ms" integer,
	"tool_calls_count" integer DEFAULT 0,
	"tool_calls" jsonb DEFAULT '[]'::jsonb,
	"avg_tool_call_time_ms" double precision,
	"slowest_tool_call" jsonb,
	"stream_chunk_count" integer DEFAULT 0,
	"avg_chunk_interval_ms" double precision,
	"status" "benchmark_result_status" DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tool_call_breakdown" jsonb DEFAULT '{}'::jsonb,
	"expected_tools_present" boolean DEFAULT true,
	"missing_tools" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
ALTER TABLE "benchmark_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "arr_daily_churn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"churn_date" date NOT NULL,
	"deleted_count" integer DEFAULT 0,
	"downgrade_count" integer DEFAULT 0,
	"total_count" integer GENERATED ALWAYS AS ((deleted_count + downgrade_count)) STORED,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "arr_daily_churn_churn_date_key" UNIQUE("churn_date")
);
--> statement-breakpoint
ALTER TABLE "arr_daily_churn" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkout_clicks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_clicks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "archived_context" (
	"archive_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"batch_number" integer NOT NULL,
	"message_count" integer NOT NULL,
	"archived_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"summary" text NOT NULL,
	"messages" jsonb NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "archived_context" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"ticket_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" "ticket_category" DEFAULT 'general' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"resolution_summary" text,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"public_id" text
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"message_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_id" uuid,
	"content" text NOT NULL,
	"message_type" "ticket_message_type" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"email_message_id" text,
	"email_in_reply_to" text,
	"email_references" text[],
	"source" text DEFAULT 'app',
	"sender_email" text,
	CONSTRAINT "chk_message_type_email" CHECK (NOT ((source = 'email'::text) AND (message_type = 'internal_note'::ticket_message_type)))
);
--> statement-breakpoint
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"message_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_path" text NOT NULL,
	"bucket_name" varchar(100) DEFAULT 'ticket-attachments' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ticket_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"chunk_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid,
	"account_id" uuid NOT NULL,
	"chunk_content" text,
	"embedding" vector(1536),
	"last_updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "basejump"."account_user" (
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"account_role" "basejump"."account_role" NOT NULL,
	CONSTRAINT "account_user_pkey" PRIMARY KEY("user_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "basejump"."account_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_taxonomy" (
	"project_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"similarity" double precision NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_taxonomy_pkey" PRIMARY KEY("project_id","node_id"),
	CONSTRAINT "project_taxonomy_similarity_check" CHECK ((similarity >= (0)::double precision) AND (similarity <= (1)::double precision))
);
--> statement-breakpoint
ALTER TABLE "project_taxonomy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "thread_cluster_assignments" (
	"thread_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"cluster_id" uuid,
	"distance" double precision,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "thread_cluster_assignments_pkey" PRIMARY KEY("thread_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "thread_cluster_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions_log" ADD CONSTRAINT "admin_actions_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions_log" ADD CONSTRAINT "admin_actions_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "public"."agent_versions"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "basejump"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "public"."agent_versions"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vapi_calls" ADD CONSTRAINT "vapi_calls_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vapi_calls" ADD CONSTRAINT "vapi_calls_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "basejump"."billing_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."invitations" ADD CONSTRAINT "invitations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."billing_customers" ADD CONSTRAINT "billing_customers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("version_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_sandbox_resource_id_fkey" FOREIGN KEY ("sandbox_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_history" ADD CONSTRAINT "commitment_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("version_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."archived_context"("archive_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mcp_credential_profiles" ADD CONSTRAINT "fk_credential_profiles_account" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balance" ADD CONSTRAINT "credit_balance_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_usage" ADD CONSTRAINT "credit_usage_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_usage" ADD CONSTRAINT "credit_usage_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_usage" ADD CONSTRAINT "credit_usage_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_oauth_tokens" ADD CONSTRAINT "google_oauth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_triggers" ADD CONSTRAINT "agent_triggers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_history" ADD CONSTRAINT "trial_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_folders" ADD CONSTRAINT "knowledge_base_folders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_entries" ADD CONSTRAINT "knowledge_base_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_entries" ADD CONSTRAINT "knowledge_base_entries_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."knowledge_base_folders"("folder_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_entry_assignments" ADD CONSTRAINT "agent_knowledge_entry_assignments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_entry_assignments" ADD CONSTRAINT "agent_knowledge_entry_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_entry_assignments" ADD CONSTRAINT "agent_knowledge_entry_assignments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_base_entries"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_refresh_tracking" ADD CONSTRAINT "daily_refresh_tracking_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_embeddings" ADD CONSTRAINT "thread_embeddings_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_analytics" ADD CONSTRAINT "conversation_analytics_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_analytics" ADD CONSTRAINT "conversation_analytics_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_analytics_queue" ADD CONSTRAINT "conversation_analytics_queue_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_views" ADD CONSTRAINT "pricing_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_account_id_fkey" FOREIGN KEY ("referred_account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_stats" ADD CONSTRAINT "referral_stats_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "fk_account" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "fk_source_thread" FOREIGN KEY ("source_thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_extraction_queue" ADD CONSTRAINT "fk_account" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_extraction_queue" ADD CONSTRAINT "fk_thread" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."accounts" ADD CONSTRAINT "accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."accounts" ADD CONSTRAINT "accounts_primary_owner_user_id_fkey" FOREIGN KEY ("primary_owner_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."accounts" ADD CONSTRAINT "accounts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence_sessions" ADD CONSTRAINT "user_presence_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_parent_thread_id_fkey" FOREIGN KEY ("parent_thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_embeddings" ADD CONSTRAINT "project_embeddings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomy_nodes"("node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_results" ADD CONSTRAINT "benchmark_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_clicks" ADD CONSTRAINT "checkout_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archived_context" ADD CONSTRAINT "archived_context_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archived_context" ADD CONSTRAINT "archived_context_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("ticket_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."ticket_messages"("message_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("ticket_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_thread_account_fkey" FOREIGN KEY ("thread_id","account_id") REFERENCES "public"."threads"("thread_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."account_user" ADD CONSTRAINT "account_user_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basejump"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basejump"."account_user" ADD CONSTRAINT "account_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_taxonomy" ADD CONSTRAINT "project_taxonomy_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "public"."taxonomy_nodes"("node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_taxonomy" ADD CONSTRAINT "project_taxonomy_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_cluster_assignments" ADD CONSTRAINT "thread_cluster_assignments_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "public"."thread_clusters"("cluster_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_cluster_assignments" ADD CONSTRAINT "thread_cluster_assignments_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."clustering_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_cluster_assignments" ADD CONSTRAINT "thread_cluster_assignments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_roles_granted_by" ON "user_roles" USING btree ("granted_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_roles_role" ON "user_roles" USING btree ("role" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_role" ON "user_roles" USING btree ("user_id" uuid_ops,"role" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_file_uploads_account_id" ON "file_uploads" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_file_uploads_account_id_created_at" ON "file_uploads" USING btree ("account_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_file_uploads_agent_id" ON "file_uploads" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_file_uploads_created_at" ON "file_uploads" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_file_uploads_expires" ON "file_uploads" USING btree ("url_expires_at" timestamptz_ops) WHERE (url_expires_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_file_uploads_thread_id" ON "file_uploads" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_file_uploads_user_id" ON "file_uploads" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_admin_actions_admin" ON "admin_actions_log" USING btree ("admin_user_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_admin_actions_target" ON "admin_actions_log" USING btree ("target_user_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_admin_actions_type" ON "admin_actions_log" USING btree ("action_type" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_account_created_desc" ON "agents" USING btree ("account_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agents_account_default" ON "agents" USING btree ("account_id" bool_ops,"is_default" bool_ops) WHERE (is_default = true);--> statement-breakpoint
CREATE INDEX "idx_agents_account_id" ON "agents" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_account_id_is_public" ON "agents" USING btree ("account_id" bool_ops,"is_public" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_account_non_default" ON "agents" USING btree ("account_id" uuid_ops) WHERE (((metadata ->> 'is_suna_default'::text))::boolean IS NOT TRUE);--> statement-breakpoint
CREATE INDEX "idx_agents_account_non_suna" ON "agents" USING btree ("account_id" uuid_ops) WHERE (((metadata ->> 'is_suna_default'::text))::boolean IS NOT TRUE);--> statement-breakpoint
CREATE INDEX "idx_agents_account_suna_default" ON "agents" USING btree ("account_id" uuid_ops) WHERE ((metadata ->> 'is_suna_default'::text) = 'true'::text);--> statement-breakpoint
CREATE INDEX "idx_agents_account_updated_desc" ON "agents" USING btree ("account_id" uuid_ops,"updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_centrally_managed" ON "agents" USING btree (((metadata ->> 'centrally_managed'::text)) text_ops) WHERE ((metadata ->> 'centrally_managed'::text) = 'true'::text);--> statement-breakpoint
CREATE INDEX "idx_agents_created_at" ON "agents" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_created_by" ON "agents" USING btree ("created_by_user_id" uuid_ops) WHERE (created_by_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agents_current_version" ON "agents" USING btree ("current_version_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_icon_name" ON "agents" USING btree ("icon_name" text_ops) WHERE (icon_name IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agents_is_default" ON "agents" USING btree ("is_default" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_is_public" ON "agents" USING btree ("is_public" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_is_public_account_id" ON "agents" USING btree ("is_public" bool_ops,"account_id" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_metadata" ON "agents" USING gin ("metadata" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_suna_default" ON "agents" USING btree (((metadata ->> 'is_suna_default'::text)) text_ops) WHERE ((metadata ->> 'is_suna_default'::text) = 'true'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agents_suna_default_unique" ON "agents" USING btree ("account_id" uuid_ops) WHERE ((metadata ->> 'is_suna_default'::text) = 'true'::text);--> statement-breakpoint
CREATE INDEX "idx_agents_tags" ON "agents" USING gin ("tags" array_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_updated_by" ON "agents" USING btree ("updated_by_user_id" uuid_ops) WHERE (updated_by_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_account_created_debit" ON "credit_ledger" USING btree ("account_id" uuid_ops,"created_at" uuid_ops) WHERE (amount < (0)::numeric);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_account_id" ON "credit_ledger" USING btree ("account_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_account_type_created_desc" ON "credit_ledger" USING btree ("account_id" uuid_ops,"type" uuid_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_created_by" ON "credit_ledger" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_expiry" ON "credit_ledger" USING btree ("account_id" timestamptz_ops,"is_expiring" uuid_ops,"expires_at" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_idempotency" ON "credit_ledger" USING btree ("idempotency_key" text_ops) WHERE (idempotency_key IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_recent_ops" ON "credit_ledger" USING btree ("account_id" text_ops,"created_at" uuid_ops,"amount" uuid_ops,"description" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_reference" ON "credit_ledger" USING btree ("reference_id" text_ops,"reference_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_stripe_event" ON "credit_ledger" USING btree ("stripe_event_id" text_ops) WHERE (stripe_event_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_triggered_by" ON "credit_ledger" USING btree ("triggered_by_user_id" uuid_ops) WHERE (triggered_by_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_type" ON "credit_ledger" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_agent_id" ON "agent_versions" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_agent_version_desc" ON "agent_versions" USING btree ("agent_id" uuid_ops,"version_number" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_config_system_prompt" ON "agent_versions" USING gin (((config ->> 'system_prompt'::text)) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_config_tools" ON "agent_versions" USING gin (((config -> 'tools'::text)) jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_created_at" ON "agent_versions" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_created_by" ON "agent_versions" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_is_active" ON "agent_versions" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_model" ON "agent_versions" USING btree ("model" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_previous_version_id" ON "agent_versions" USING btree ("previous_version_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_versions_version_number" ON "agent_versions" USING btree ("version_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_api_keys_account_id" ON "api_keys" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_api_keys_public_key" ON "api_keys" USING btree ("public_key" text_ops);--> statement-breakpoint
CREATE INDEX "idx_vapi_calls_agent_id" ON "vapi_calls" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_vapi_calls_call_id" ON "vapi_calls" USING btree ("call_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_vapi_calls_created_at" ON "vapi_calls" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_vapi_calls_status" ON "vapi_calls" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_vapi_calls_thread_id" ON "vapi_calls" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_billing_subscriptions_account_id" ON "basejump"."billing_subscriptions" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_billing_subscriptions_billing_customer_id" ON "basejump"."billing_subscriptions" USING btree ("billing_customer_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_invitations_account_id" ON "basejump"."invitations" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_invitations_invited_by_user_id" ON "basejump"."invitations" USING btree ("invited_by_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_account" ON "audit_log" USING btree ("account_id" text_ops,"category" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_category" ON "audit_log" USING btree ("category" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_recent" ON "audit_log" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_billing_customers_account_id" ON "basejump"."billing_customers" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_agent_id" ON "agent_runs" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_agent_version_id" ON "agent_runs" USING btree ("agent_version_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_created_at" ON "agent_runs" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_metadata" ON "agent_runs" USING gin ("metadata" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_started_at" ON "agent_runs" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status" ON "agent_runs" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status_created_desc" ON "agent_runs" USING btree ("status" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status_running" ON "agent_runs" USING btree ("status" text_ops,"started_at" timestamptz_ops) WHERE (status = 'running'::text);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status_started_at" ON "agent_runs" USING btree ("status" text_ops,"started_at" timestamptz_ops) WHERE (status IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status_thread" ON "agent_runs" USING btree ("status" uuid_ops,"thread_id" uuid_ops) WHERE (status = 'running'::text);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_thread_agent_created_desc" ON "agent_runs" USING btree ("thread_id" uuid_ops,"agent_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_thread_created_desc" ON "agent_runs" USING btree ("thread_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_thread_id" ON "agent_runs" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_thread_status" ON "agent_runs" USING btree ("thread_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_runs_thread_status_started" ON "agent_runs" USING btree ("thread_id" text_ops,"status" uuid_ops,"started_at" timestamptz_ops) WHERE (status = 'running'::text);--> statement-breakpoint
CREATE INDEX "idx_projects_account_created" ON "projects" USING btree ("account_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_account_id" ON "projects" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_account_id_is_public" ON "projects" USING btree ("account_id" bool_ops,"is_public" uuid_ops) WHERE (is_public IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_projects_categories_gin" ON "projects" USING gin ("categories" array_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_categorization_stale" ON "projects" USING btree ("updated_at" timestamptz_ops,"last_categorized_at" timestamptz_ops) WHERE ((last_categorized_at IS NULL) OR (last_categorized_at < updated_at));--> statement-breakpoint
CREATE INDEX "idx_projects_category" ON "projects" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_category_created_at" ON "projects" USING btree ("category" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_created_at" ON "projects" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_is_public_account_id" ON "projects" USING btree ("is_public" uuid_ops,"account_id" uuid_ops) WHERE (is_public IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_projects_last_categorized" ON "projects" USING btree ("last_categorized_at" timestamptz_ops) WHERE (last_categorized_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_projects_last_categorized_at" ON "projects" USING btree ("last_categorized_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_project_id" ON "projects" USING btree ("project_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_project_id_account" ON "projects" USING btree ("project_id" uuid_ops,"account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_sandbox_resource" ON "projects" USING btree ("sandbox_resource_id" uuid_ops) WHERE (sandbox_resource_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_projects_sandbox_resource_id" ON "projects" USING btree ("sandbox_resource_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_commitment_history_account" ON "commitment_history" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_commitment_history_active" ON "commitment_history" USING btree ("end_date" timestamptz_ops) WHERE (cancelled_at IS NULL);--> statement-breakpoint
CREATE INDEX "idx_messages_agent_id" ON "messages" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_agent_id_thread_id" ON "messages" USING btree ("agent_id" uuid_ops,"thread_id" uuid_ops,"created_at" timestamptz_ops) WHERE (agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_messages_agent_version_id" ON "messages" USING btree ("agent_version_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_agent_version_id_thread_id" ON "messages" USING btree ("agent_version_id" uuid_ops,"thread_id" uuid_ops,"created_at" uuid_ops) WHERE (agent_version_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_messages_archive_id" ON "messages" USING btree ("archive_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_created_at" ON "messages" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_created_by" ON "messages" USING btree ("created_by_user_id" uuid_ops) WHERE (created_by_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_messages_is_archived" ON "messages" USING btree ("is_archived" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_llm_not_omitted" ON "messages" USING btree ("thread_id" timestamptz_ops,"created_at" uuid_ops) WHERE ((is_llm_message = true) AND (is_omitted = false));--> statement-breakpoint
CREATE INDEX "idx_messages_llm_thread_created" ON "messages" USING btree ("thread_id" timestamptz_ops,"created_at" uuid_ops) WHERE (is_llm_message = true);--> statement-breakpoint
CREATE INDEX "idx_messages_metadata_llm_response_id" ON "messages" USING btree (((metadata ->> 'llm_response_id'::text)) text_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_created" ON "messages" USING btree ("thread_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_created_at" ON "messages" USING btree ("thread_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_created_desc" ON "messages" USING btree ("thread_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_id" ON "messages" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_id_created_at" ON "messages" USING btree ("thread_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_llm" ON "messages" USING btree ("thread_id" uuid_ops,"created_at" timestamptz_ops) WHERE (is_llm_message = true);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_llm_created" ON "messages" USING btree ("thread_id" uuid_ops,"created_at" uuid_ops) WHERE (is_llm_message = true);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_llm_created_asc" ON "messages" USING btree ("thread_id" uuid_ops,"created_at" timestamptz_ops) WHERE (is_llm_message = true);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_optimized_types_created_desc" ON "messages" USING btree ("thread_id" timestamptz_ops,"created_at" uuid_ops) WHERE (type = ANY (ARRAY['user'::text, 'tool'::text, 'assistant'::text]));--> statement-breakpoint
CREATE INDEX "idx_messages_thread_type_created" ON "messages" USING btree ("thread_id" uuid_ops,"type" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_type_created_at" ON "messages" USING btree ("thread_id" uuid_ops,"type" timestamptz_ops,"created_at" text_ops) WHERE (type IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_type_created_desc" ON "messages" USING btree ("thread_id" text_ops,"type" text_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_thread_type_llm_summary_created_desc" ON "messages" USING btree ("thread_id" text_ops,"type" bool_ops,"is_llm_message" uuid_ops,"created_at" bool_ops) WHERE (type = 'summary'::text);--> statement-breakpoint
CREATE INDEX "idx_credential_profiles_account_active" ON "user_mcp_credential_profiles" USING btree ("account_id" bool_ops,"is_active" uuid_ops) WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_credential_profiles_account_mcp" ON "user_mcp_credential_profiles" USING btree ("account_id" uuid_ops,"mcp_qualified_name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credential_profiles_default" ON "user_mcp_credential_profiles" USING btree ("account_id" uuid_ops,"mcp_qualified_name" bool_ops,"is_default" uuid_ops) WHERE (is_default = true);--> statement-breakpoint
CREATE INDEX "idx_credit_balance_account_id" ON "credit_balance" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_usage_account_id" ON "credit_usage" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_usage_created_at" ON "credit_usage" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_usage_message_id" ON "credit_usage" USING btree ("message_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_usage_thread_id" ON "credit_usage" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_account" ON "credit_purchases" USING btree ("account_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_account_id" ON "credit_purchases" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_created_at" ON "credit_purchases" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_provider" ON "credit_purchases" USING btree ("provider" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_reconciled" ON "credit_purchases" USING btree ("status" text_ops,"reconciled_at" timestamptz_ops) WHERE ((status = 'pending'::text) AND (reconciled_at IS NULL));--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_revenuecat_transaction" ON "credit_purchases" USING btree ("revenuecat_transaction_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_status" ON "credit_purchases" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_stripe_payment_intent" ON "credit_purchases" USING btree ("stripe_payment_intent_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_categories" ON "agent_templates" USING gin ("categories" array_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_config_agentpress" ON "agent_templates" USING gin ((((config -> 'tools'::text) -> 'agentpress'::text)) jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_config_tools" ON "agent_templates" USING gin (((config -> 'tools'::text)) jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_created_at" ON "agent_templates" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_creator_created_desc" ON "agent_templates" USING btree ("creator_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_creator_id" ON "agent_templates" USING btree ("creator_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_download_count" ON "agent_templates" USING btree ("download_count" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_icon_name" ON "agent_templates" USING btree ("icon_name" text_ops) WHERE (icon_name IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_is_kortix_team" ON "agent_templates" USING btree ("is_kortix_team" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_is_public" ON "agent_templates" USING btree ("is_public" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_is_public_creator_id" ON "agent_templates" USING btree ("is_public" bool_ops,"creator_id" uuid_ops) WHERE (is_public IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_marketplace_published_at" ON "agent_templates" USING btree ("marketplace_published_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_metadata" ON "agent_templates" USING gin ("metadata" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_name_trgm" ON "agent_templates" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_public_download_published_desc" ON "agent_templates" USING btree ("is_public" timestamptz_ops,"download_count" timestamptz_ops,"marketplace_published_at" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_public_kortix_created_desc" ON "agent_templates" USING btree ("is_public" timestamptz_ops,"is_kortix_team" bool_ops,"created_at" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_tags" ON "agent_templates" USING gin ("tags" array_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_templates_usage_examples" ON "agent_templates" USING gin ("usage_examples" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_arr_monthly_actuals_month_platform" ON "arr_monthly_actuals" USING btree ("month_index" int4_ops,"platform" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_feedback_account_id" ON "feedback" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_feedback_created_at" ON "feedback" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_feedback_message_id" ON "feedback" USING btree ("message_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_feedback_thread_id" ON "feedback" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_feedback_unique" ON "feedback" USING btree ("thread_id" uuid_ops,"message_id" uuid_ops,"account_id" uuid_ops) WHERE ((thread_id IS NOT NULL) AND (message_id IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_agent_triggers_agent_id" ON "agent_triggers" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_triggers_agent_type" ON "agent_triggers" USING btree ("agent_id" uuid_ops,"trigger_type" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_triggers_composio_active" ON "agent_triggers" USING btree (((config ->> 'composio_trigger_id'::text)) text_ops,is_active text_ops) WHERE (trigger_type = 'webhook'::agent_trigger_type);--> statement-breakpoint
CREATE INDEX "idx_agent_triggers_created_at" ON "agent_triggers" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_triggers_is_active" ON "agent_triggers" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_triggers_trigger_type" ON "agent_triggers" USING btree ("trigger_type" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_circuit_breaker_state_state" ON "circuit_breaker_state" USING btree ("state" text_ops) WHERE (state <> 'closed'::text);--> statement-breakpoint
CREATE INDEX "idx_circuit_breaker_state_updated_at" ON "circuit_breaker_state" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_trial_history_account_id" ON "trial_history" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_trial_history_started_at" ON "trial_history" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_trial_history_status" ON "trial_history" USING btree ("status" text_ops) WHERE (status = ANY (ARRAY['checkout_pending'::text, 'checkout_failed'::text]));--> statement-breakpoint
CREATE INDEX "idx_distributed_locks_expires" ON "distributed_locks" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_webhook_events_created_at" ON "webhook_events" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_webhook_events_event_id" ON "webhook_events" USING btree ("event_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_webhook_events_status" ON "webhook_events" USING btree ("status" text_ops) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));--> statement-breakpoint
CREATE INDEX "idx_refund_history_account" ON "refund_history" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_refund_history_status" ON "refund_history" USING btree ("status" text_ops) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));--> statement-breakpoint
CREATE INDEX "idx_refund_history_stripe_refund" ON "refund_history" USING btree ("stripe_refund_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_kb_folders_account_id" ON "knowledge_base_folders" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_kb_entries_account_id" ON "knowledge_base_entries" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_kb_entries_folder_id" ON "knowledge_base_entries" USING btree ("folder_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_knowledge_entry_assignments_account_id" ON "agent_knowledge_entry_assignments" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_kb_entry_assignments_agent_id" ON "agent_knowledge_entry_assignments" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_kb_entry_assignments_entry_id" ON "agent_knowledge_entry_assignments" USING btree ("entry_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_daily_refresh_tracking_account_date" ON "daily_refresh_tracking" USING btree ("account_id" date_ops,"refresh_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_daily_refresh_tracking_created" ON "daily_refresh_tracking" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_account_id" ON "notifications" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_agent_run_id" ON "notifications" USING btree ("agent_run_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_category" ON "notifications" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_created_by" ON "notifications" USING btree ("created_by" uuid_ops) WHERE (created_by IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_notifications_is_global" ON "notifications" USING btree ("is_global" bool_ops) WHERE (is_global = true);--> statement-breakpoint
CREATE INDEX "idx_notifications_is_read" ON "notifications" USING btree ("is_read" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_thread_id" ON "notifications" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_type" ON "notifications" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_user_unread" ON "notifications" USING btree ("user_id" bool_ops,"is_read" uuid_ops) WHERE (is_read = false);--> statement-breakpoint
CREATE INDEX "idx_user_notification_preferences_account_id" ON "user_notification_preferences" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_notification_preferences_push_token" ON "user_notification_preferences" USING btree ("push_token" text_ops) WHERE (push_token IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_clustering_runs_created" ON "clustering_runs" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_clustering_runs_status" ON "clustering_runs" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_thread_embeddings_updated" ON "thread_embeddings" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_thread_clusters_run_id" ON "thread_clusters" USING btree ("run_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_taxonomy_runs_created_at" ON "taxonomy_runs" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_taxonomy_runs_status" ON "taxonomy_runs" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_renewal_processing_account" ON "renewal_processing" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_renewal_processing_period" ON "renewal_processing" USING btree ("account_id" uuid_ops,"period_start" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_renewal_processing_provider" ON "renewal_processing" USING btree ("provider" text_ops);--> statement-breakpoint
CREATE INDEX "idx_renewal_processing_subscription" ON "renewal_processing" USING btree ("subscription_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_account" ON "conversation_analytics" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_analyzed_at" ON "conversation_analytics" USING btree ("analyzed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_churn" ON "conversation_analytics" USING btree ("churn_risk_score" numeric_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_domain" ON "conversation_analytics" USING btree ("domain" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_embedding" ON "conversation_analytics" USING ivfflat ("use_case_embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_feature_req" ON "conversation_analytics" USING btree ("is_feature_request" bool_ops) WHERE is_feature_request;--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_frustration" ON "conversation_analytics" USING btree ("frustration_score" numeric_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_intent" ON "conversation_analytics" USING btree ("intent_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_is_useful" ON "conversation_analytics" USING btree ("is_useful" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_output_type" ON "conversation_analytics" USING btree ("output_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_primary_topic" ON "conversation_analytics" USING btree ("primary_topic" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_sentiment" ON "conversation_analytics" USING btree ("sentiment_label" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_thread" ON "conversation_analytics" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_conv_analytics_use_case" ON "conversation_analytics" USING gin (to_tsvector('english'::regconfig, use_case_summary) tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_analytics_queue_status" ON "conversation_analytics_queue" USING btree ("status" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_analytics_queue_thread" ON "conversation_analytics_queue" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_account_id" ON "credit_accounts" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_commitment" ON "credit_accounts" USING btree ("commitment_end_date" timestamptz_ops) WHERE (commitment_type IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_commitment_active" ON "credit_accounts" USING btree ("account_id" timestamptz_ops,"commitment_end_date" uuid_ops) WHERE (commitment_type IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_daily_balance" ON "credit_accounts" USING btree ("account_id" numeric_ops,"daily_credits_balance" numeric_ops) WHERE (daily_credits_balance > (0)::numeric);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_expiry" ON "credit_accounts" USING btree ("account_id" uuid_ops,"next_credit_grant" timestamptz_ops) WHERE (expiring_credits > (0)::numeric);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_last_daily_refresh" ON "credit_accounts" USING btree ("account_id" uuid_ops,"last_daily_refresh" uuid_ops) WHERE (last_daily_refresh IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_last_grant" ON "credit_accounts" USING btree ("last_grant_date" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_last_renewal_period" ON "credit_accounts" USING btree ("account_id" int8_ops,"last_renewal_period_start" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_last_renewal_period_start" ON "credit_accounts" USING btree ("last_renewal_period_start" int8_ops) WHERE (last_renewal_period_start IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_needs_reconciliation" ON "credit_accounts" USING btree ("needs_reconciliation" bool_ops) WHERE (needs_reconciliation = true);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_next_grant" ON "credit_accounts" USING btree ("next_credit_grant" timestamptz_ops) WHERE (next_credit_grant IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_payment_status" ON "credit_accounts" USING btree ("payment_status" text_ops) WHERE (payment_status <> 'active'::text);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_plan_type" ON "credit_accounts" USING btree ("plan_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_provider" ON "credit_accounts" USING btree ("provider" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_revenuecat_cancel_at_period_end" ON "credit_accounts" USING btree ("revenuecat_cancel_at_period_end" timestamptz_ops) WHERE (revenuecat_cancel_at_period_end IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_revenuecat_customer" ON "credit_accounts" USING btree ("revenuecat_customer_id" text_ops) WHERE (revenuecat_customer_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_revenuecat_pending_change_date" ON "credit_accounts" USING btree ("revenuecat_pending_change_date" timestamptz_ops) WHERE (revenuecat_pending_change_date IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_revenuecat_product_id" ON "credit_accounts" USING btree ("revenuecat_product_id" text_ops) WHERE (revenuecat_product_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_scheduled_tier_change" ON "credit_accounts" USING btree ("account_id" text_ops,"scheduled_tier_change" uuid_ops) WHERE (scheduled_tier_change IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_stripe_subscription_id" ON "credit_accounts" USING btree ("stripe_subscription_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_subscription_status" ON "credit_accounts" USING btree ("stripe_subscription_status" text_ops) WHERE (stripe_subscription_status IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_tier" ON "credit_accounts" USING btree ("tier" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_trial_status" ON "credit_accounts" USING btree ("trial_status" text_ops) WHERE ((trial_status)::text <> 'none'::text);--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_yearly_renewal" ON "credit_accounts" USING btree ("plan_type" timestamptz_ops,"next_credit_grant" timestamptz_ops) WHERE (((plan_type)::text = 'yearly'::text) AND (next_credit_grant IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_referrals_code" ON "referrals" USING btree ("referral_code" text_ops);--> statement-breakpoint
CREATE INDEX "idx_referrals_referred" ON "referrals" USING btree ("referred_account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_referrals_referrer" ON "referrals" USING btree ("referrer_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_referrals_status" ON "referrals" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_memories_account_id" ON "user_memories" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_memories_created_at" ON "user_memories" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_user_memories_embedding_vector" ON "user_memories" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "idx_user_memories_memory_type" ON "user_memories" USING btree ("memory_type" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_user_memories_source_thread" ON "user_memories" USING btree ("source_thread_id" uuid_ops) WHERE (source_thread_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_memory_queue_account_id" ON "memory_extraction_queue" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_memory_queue_priority" ON "memory_extraction_queue" USING btree ("priority" int4_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_memory_queue_status" ON "memory_extraction_queue" USING btree ("status" enum_ops) WHERE (status = ANY (ARRAY['pending'::memory_extraction_status, 'processing'::memory_extraction_status]));--> statement-breakpoint
CREATE INDEX "idx_memory_queue_thread_id" ON "memory_extraction_queue" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_accounts_created_by" ON "basejump"."accounts" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_accounts_id_owner" ON "basejump"."accounts" USING btree ("id" uuid_ops,"primary_owner_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_accounts_memory_enabled" ON "basejump"."accounts" USING btree ("id" uuid_ops) WHERE (memory_enabled = false);--> statement-breakpoint
CREATE INDEX "idx_accounts_personal_owner" ON "basejump"."accounts" USING btree ("personal_account" bool_ops,"primary_owner_user_id" bool_ops) WHERE (personal_account = true);--> statement-breakpoint
CREATE INDEX "idx_accounts_primary_owner" ON "basejump"."accounts" USING btree ("primary_owner_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_accounts_primary_owner_user_id" ON "basejump"."accounts" USING btree ("primary_owner_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_accounts_updated_by" ON "basejump"."accounts" USING btree ("updated_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_presence_sessions_account_id" ON "user_presence_sessions" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_presence_sessions_account_thread" ON "user_presence_sessions" USING btree ("account_id" text_ops,"active_thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_presence_sessions_last_seen" ON "user_presence_sessions" USING btree ("last_seen" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_user_presence_sessions_thread_id" ON "user_presence_sessions" USING btree ("active_thread_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_device_tokens_account_id" ON "device_tokens" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_device_tokens_active" ON "device_tokens" USING btree ("account_id" bool_ops,"is_active" bool_ops) WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_referral_codes_account" ON "referral_codes" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_referral_codes_account_active" ON "referral_codes" USING btree ("account_id" uuid_ops,"expired_at" uuid_ops) WHERE (expired_at IS NULL);--> statement-breakpoint
CREATE INDEX "idx_referral_codes_code" ON "referral_codes" USING btree ("code" text_ops);--> statement-breakpoint
CREATE INDEX "idx_referral_codes_expired" ON "referral_codes" USING btree ("expired_at" timestamptz_ops) WHERE (expired_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_arr_weekly_actuals_week_platform" ON "arr_weekly_actuals" USING btree ("week_number" int4_ops,"platform" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_account_created_desc" ON "threads" USING btree ("account_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_account_id" ON "threads" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_account_id_created_at" ON "threads" USING btree ("account_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_account_id_is_public" ON "threads" USING btree ("account_id" bool_ops,"is_public" uuid_ops) WHERE (is_public IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_threads_account_project" ON "threads" USING btree ("thread_id" uuid_ops,"account_id" uuid_ops,"project_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_account_status" ON "threads" USING btree ("account_id" uuid_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_account_updated_desc" ON "threads" USING btree ("account_id" uuid_ops,"updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_created_at" ON "threads" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_created_by" ON "threads" USING btree ("created_by_user_id" uuid_ops) WHERE (created_by_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_threads_depth_level" ON "threads" USING btree ("depth_level" int4_ops) WHERE (depth_level > 0);--> statement-breakpoint
CREATE INDEX "idx_threads_is_public_account_id" ON "threads" USING btree ("is_public" uuid_ops,"account_id" bool_ops) WHERE (is_public IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_threads_memory_enabled" ON "threads" USING btree ("thread_id" uuid_ops) WHERE (memory_enabled = false);--> statement-breakpoint
CREATE INDEX "idx_threads_metadata" ON "threads" USING gin ("metadata" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_name" ON "threads" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_parent_thread_id" ON "threads" USING btree ("parent_thread_id" uuid_ops) WHERE (parent_thread_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_threads_project_account" ON "threads" USING btree ("project_id" uuid_ops,"account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_project_created" ON "threads" USING btree ("project_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_project_id" ON "threads" USING btree ("project_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_project_updated" ON "threads" USING btree ("project_id" uuid_ops,"updated_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_public" ON "threads" USING btree ("is_public" bool_ops) WHERE (is_public = true);--> statement-breakpoint
CREATE INDEX "idx_threads_status" ON "threads" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_thread_id" ON "threads" USING btree ("thread_id" uuid_ops) WHERE (thread_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_threads_thread_id_account" ON "threads" USING btree ("thread_id" uuid_ops,"account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_thread_id_account_project" ON "threads" USING btree ("thread_id" uuid_ops,"account_id" uuid_ops,"project_id" uuid_ops) WHERE (thread_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_threads_thread_id_project" ON "threads" USING btree ("thread_id" uuid_ops,"project_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_updated_at" ON "threads" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_threads_user_message_count" ON "threads" USING btree ("user_message_count" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_account_deletion_requests_account_id" ON "account_deletion_requests" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_account_deletion_requests_scheduled" ON "account_deletion_requests" USING btree ("deletion_scheduled_for" timestamptz_ops) WHERE ((is_cancelled = false) AND (is_deleted = false));--> statement-breakpoint
CREATE INDEX "idx_account_deletion_requests_status" ON "account_deletion_requests" USING btree ("is_cancelled" bool_ops,"is_deleted" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_account_deletion_requests_user_id" ON "account_deletion_requests" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_active_deletion_request" ON "account_deletion_requests" USING btree ("account_id" uuid_ops) WHERE ((is_cancelled = false) AND (is_deleted = false));--> statement-breakpoint
CREATE INDEX "idx_project_embeddings_updated_at" ON "project_embeddings" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_project_embeddings_vector" ON "project_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "idx_taxonomy_nodes_centroid" ON "taxonomy_nodes" USING ivfflat ("centroid" vector_cosine_ops) WITH (lists=50);--> statement-breakpoint
CREATE INDEX "idx_taxonomy_nodes_level" ON "taxonomy_nodes" USING btree ("level" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_taxonomy_nodes_parent" ON "taxonomy_nodes" USING btree ("parent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_resources_account_id" ON "resources" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_resources_external_id" ON "resources" USING btree ("external_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_resources_external_id_type" ON "resources" USING btree ("external_id" text_ops,"type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_resources_id" ON "resources" USING btree ("id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_resources_pooled" ON "resources" USING btree ("status" text_ops,"type" timestamptz_ops,"pooled_at" timestamptz_ops) WHERE ((status = 'pooled'::text) AND (type = 'sandbox'::text));--> statement-breakpoint
CREATE INDEX "idx_resources_pooled_fifo" ON "resources" USING btree ("pooled_at" timestamptz_ops) WHERE ((status = 'pooled'::text) AND (type = 'sandbox'::text));--> statement-breakpoint
CREATE INDEX "idx_resources_status" ON "resources" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_resources_type" ON "resources" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_created_at" ON "benchmark_runs" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_created_by" ON "benchmark_runs" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_run_type" ON "benchmark_runs" USING btree ("run_type" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_status" ON "benchmark_runs" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_results_prompt_id" ON "benchmark_results" USING btree ("prompt_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_results_run_id" ON "benchmark_results" USING btree ("run_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_results_started_at" ON "benchmark_results" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_benchmark_results_status" ON "benchmark_results" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_arr_daily_churn_date" ON "arr_daily_churn" USING btree ("churn_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_archived_context_account_id" ON "archived_context" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_archived_context_archived_at" ON "archived_context" USING btree ("archived_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_archived_context_batch_number" ON "archived_context" USING btree ("batch_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_archived_context_embedding" ON "archived_context" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_archived_context_thread_id" ON "archived_context" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_account_id" ON "support_tickets" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_account_ticket" ON "support_tickets" USING btree ("account_id" uuid_ops,"ticket_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_assigned_to" ON "support_tickets" USING btree ("assigned_to" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_category" ON "support_tickets" USING btree ("category" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_created_at" ON "support_tickets" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_priority" ON "support_tickets" USING btree ("priority" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_support_tickets_public_id" ON "support_tickets" USING btree ("public_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_status" ON "support_tickets" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_created_at" ON "ticket_messages" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ticket_messages_email_message_id" ON "ticket_messages" USING btree ("email_message_id" text_ops) WHERE (email_message_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_in_reply_to" ON "ticket_messages" USING btree ("email_in_reply_to" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_sender_id" ON "ticket_messages" USING btree ("sender_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_ticket_id" ON "ticket_messages" USING btree ("ticket_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ticket_attachments_message_id" ON "ticket_attachments" USING btree ("message_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ticket_attachments_ticket_id" ON "ticket_attachments" USING btree ("ticket_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documents_account_id" ON "documents" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documents_account_thread" ON "documents" USING btree ("account_id" uuid_ops,"thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documents_embedding" ON "documents" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_documents_thread_id" ON "documents" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documents_user_id" ON "documents" USING btree ("account_id" uuid_ops) WHERE (account_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_account_user_account_id" ON "basejump"."account_user" USING btree ("account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_account_user_composite" ON "basejump"."account_user" USING btree ("user_id" uuid_ops,"account_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_account_user_user_id" ON "basejump"."account_user" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_basejump_account_user_user_id" ON "basejump"."account_user" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_project_taxonomy_node" ON "project_taxonomy" USING btree ("node_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_project_taxonomy_similarity" ON "project_taxonomy" USING btree ("similarity" float8_ops);--> statement-breakpoint
CREATE INDEX "idx_thread_cluster_assignments_cluster" ON "thread_cluster_assignments" USING btree ("cluster_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_thread_cluster_assignments_run" ON "thread_cluster_assignments" USING btree ("run_id" uuid_ops);--> statement-breakpoint
CREATE VIEW "public"."v_circuit_breaker_status" AS (SELECT circuit_breaker_state.circuit_name, circuit_breaker_state.state, circuit_breaker_state.failure_count, circuit_breaker_state.last_failure_time, CASE WHEN circuit_breaker_state.last_failure_time IS NOT NULL THEN EXTRACT(epoch FROM now() - circuit_breaker_state.last_failure_time) ELSE NULL::numeric END AS seconds_since_failure, circuit_breaker_state.updated_at, CASE WHEN circuit_breaker_state.state = 'open'::text AND circuit_breaker_state.last_failure_time IS NOT NULL THEN GREATEST(0::numeric, 60::numeric - EXTRACT(epoch FROM now() - circuit_breaker_state.last_failure_time)) ELSE NULL::numeric END AS seconds_until_retry, CASE WHEN circuit_breaker_state.state = 'closed'::text THEN '✅ Healthy'::text WHEN circuit_breaker_state.state = 'open'::text THEN '🔴 OPEN - Blocking requests'::text WHEN circuit_breaker_state.state = 'half_open'::text THEN '🟡 Testing recovery'::text ELSE NULL::text END AS status_display FROM circuit_breaker_state ORDER BY ( CASE circuit_breaker_state.state WHEN 'open'::text THEN 1 WHEN 'half_open'::text THEN 2 WHEN 'closed'::text THEN 3 ELSE NULL::integer END), circuit_breaker_state.circuit_name);--> statement-breakpoint
CREATE POLICY "Service role can manage all roles" ON "user_roles" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view their own role" ON "user_roles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can create their own file uploads" ON "file_uploads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = file_uploads.account_id) AND (au.user_id = auth.uid())))));--> statement-breakpoint
CREATE POLICY "Users can delete their own file uploads" ON "file_uploads" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their own file uploads" ON "file_uploads" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own file uploads" ON "file_uploads" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role only access" ON "migration_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Only admins can view logs" ON "admin_actions_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));--> statement-breakpoint
CREATE POLICY "Service role manages logs" ON "admin_actions_log" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "agents_delete_own" ON "agents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = agents.account_id) AND (au.user_id = auth.uid()) AND (au.account_role = 'owner'::basejump.account_role)))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))));--> statement-breakpoint
CREATE POLICY "agents_insert_own" ON "agents" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "agents_select_policy" ON "agents" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "agents_update_own" ON "agents" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role manages ledger" ON "credit_ledger" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view own ledger" ON "credit_ledger" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "team_members_can_view_ledger" ON "credit_ledger" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "users can view credit ledger" ON "credit_ledger" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "agent_versions_delete_policy" ON "agent_versions" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM agents
  WHERE ((agents.agent_id = agent_versions.agent_id) AND basejump.has_role_on_account(agents.account_id, 'owner'::basejump.account_role)))));--> statement-breakpoint
CREATE POLICY "agent_versions_insert_policy" ON "agent_versions" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "agent_versions_select_policy" ON "agent_versions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "agent_versions_update_policy" ON "agent_versions" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can manage their own API keys" ON "api_keys" AS PERMISSIVE FOR ALL TO "authenticated" USING ((account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid)))));--> statement-breakpoint
CREATE POLICY "System can insert calls" ON "vapi_calls" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "System can update calls" ON "vapi_calls" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can view their own calls" ON "vapi_calls" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Basejump settings can be read by authenticated users" ON "basejump"."config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Can only view own billing subscription data." ON "basejump"."billing_subscriptions" AS PERMISSIVE FOR SELECT TO public USING ((basejump.has_role_on_account(account_id) = true));--> statement-breakpoint
CREATE POLICY "Invitations can be created by account owners" ON "basejump"."invitations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((basejump.is_set('enable_team_accounts'::text) = true) AND (( SELECT accounts.personal_account
   FROM basejump.accounts
  WHERE (accounts.id = invitations.account_id)) = false) AND (basejump.has_role_on_account(account_id, 'owner'::basejump.account_role) = true)));--> statement-breakpoint
CREATE POLICY "Invitations can be deleted by account owners" ON "basejump"."invitations" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Invitations viewable by account owners" ON "basejump"."invitations" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role manages audit log" ON "audit_log" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view own audit log" ON "audit_log" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Can only view own billing customer data." ON "basejump"."billing_customers" AS PERMISSIVE FOR SELECT TO public USING ((basejump.has_role_on_account(account_id) = true));--> statement-breakpoint
CREATE POLICY "agent_runs_delete_policy" ON "agent_runs" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "agent_runs_insert_policy" ON "agent_runs" AS PERMISSIVE FOR INSERT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "agent_runs_select_policy" ON "agent_runs" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "agent_runs_update_policy" ON "agent_runs" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "project_delete_policy" ON "projects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = projects.account_id) AND (au.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))));--> statement-breakpoint
CREATE POLICY "project_insert_policy" ON "projects" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "project_select_policy" ON "projects" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "project_update_policy" ON "projects" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role can manage commitment history" ON "commitment_history" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view own commitment history" ON "commitment_history" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "message_delete_policy" ON "messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (threads t
     JOIN basejump.account_user au ON ((au.account_id = t.account_id)))
  WHERE ((t.thread_id = messages.thread_id) AND (au.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))));--> statement-breakpoint
CREATE POLICY "message_insert_policy" ON "messages" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "message_select_policy" ON "messages" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "message_update_policy" ON "messages" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "credential_profiles_user_access" ON "user_mcp_credential_profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING ((account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid)))));--> statement-breakpoint
CREATE POLICY "Service role can manage all credit balances" ON "credit_balance" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view their own credit balance" ON "credit_balance" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role can manage all credit usage" ON "credit_usage" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view their own credit usage" ON "credit_usage" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role can manage all credit purchases" ON "credit_purchases" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "users can view credit purchases" ON "credit_purchases" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can create their own templates" ON "agent_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = agent_templates.creator_id) AND (au.user_id = auth.uid())))));--> statement-breakpoint
CREATE POLICY "Users can delete their own templates" ON "agent_templates" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their own templates" ON "agent_templates" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view public templates or their own templates" ON "agent_templates" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "Allow authenticated delete" ON "arr_monthly_actuals" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Allow authenticated insert" ON "arr_monthly_actuals" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Allow authenticated read" ON "arr_monthly_actuals" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Allow authenticated update" ON "arr_monthly_actuals" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "service_role_only" ON "google_oauth_tokens" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Users can delete their own feedback" ON "feedback" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = feedback.account_id) AND (au.user_id = auth.uid())))));--> statement-breakpoint
CREATE POLICY "Users can insert their own feedback" ON "feedback" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their own feedback" ON "feedback" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own feedback" ON "feedback" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "agent_triggers_delete_policy" ON "agent_triggers" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (agents a
     JOIN basejump.account_user au ON ((au.account_id = a.account_id)))
  WHERE ((a.agent_id = agent_triggers.agent_id) AND (au.user_id = auth.uid()) AND (au.account_role = 'owner'::basejump.account_role)))));--> statement-breakpoint
CREATE POLICY "agent_triggers_insert_policy" ON "agent_triggers" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "agent_triggers_select_policy" ON "agent_triggers" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "agent_triggers_update_policy" ON "agent_triggers" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read circuit breaker state" ON "circuit_breaker_state" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Service role has full access to circuit breaker" ON "circuit_breaker_state" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "users can view trial history" ON "trial_history" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((account_id IN ( SELECT wu.account_id
   FROM basejump.account_user wu
  WHERE (wu.user_id = ( SELECT auth.uid() AS uid)))));--> statement-breakpoint
CREATE POLICY "No public access" ON "webhook_config" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "Service role can manage webhook config" ON "webhook_config" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Service role only access" ON "agent_workflows_backup" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Service role full access on distributed_locks" ON "distributed_locks" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Service role full access on webhook_events" ON "webhook_events" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Service role full access on refund_history" ON "refund_history" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view own refund history" ON "refund_history" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "kb_folders_account_access" ON "knowledge_base_folders" AS PERMISSIVE FOR ALL TO public USING ((basejump.has_role_on_account(account_id) = true));--> statement-breakpoint
CREATE POLICY "kb_entries_account_access" ON "knowledge_base_entries" AS PERMISSIVE FOR ALL TO public USING ((basejump.has_role_on_account(account_id) = true));--> statement-breakpoint
CREATE POLICY "kb_entry_assignments_account_access" ON "agent_knowledge_entry_assignments" AS PERMISSIVE FOR ALL TO public USING ((basejump.has_role_on_account(account_id) = true));--> statement-breakpoint
CREATE POLICY "Service role only access" ON "daily_refresh_tracking" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Service role can manage all notifications" ON "notifications" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can update their own notifications" ON "notifications" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own notifications" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role can manage all notification preferences" ON "user_notification_preferences" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can manage their own notification preferences" ON "user_notification_preferences" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Admin read access for clustering_runs" ON "clustering_runs" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));--> statement-breakpoint
CREATE POLICY "Service role bypass for clustering_runs" ON "clustering_runs" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Service role bypass for thread_embeddings" ON "thread_embeddings" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Admin read access for thread_clusters" ON "thread_clusters" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));--> statement-breakpoint
CREATE POLICY "Service role bypass for thread_clusters" ON "thread_clusters" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Service role has full access to taxonomy_runs" ON "taxonomy_runs" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Service role full access on renewal_processing" ON "renewal_processing" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "super_admin_select_analytics" ON "conversation_analytics" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'super_admin'::user_role)))));--> statement-breakpoint
CREATE POLICY "super_admin_select_queue" ON "conversation_analytics_queue" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'super_admin'::user_role)))));--> statement-breakpoint
CREATE POLICY "Users can track their own pricing views" ON "pricing_views" AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "Service role manages credit accounts" ON "credit_accounts" AS PERMISSIVE FOR ALL TO "service_role" USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view own credit account" ON "credit_accounts" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "team_members_can_view_credit_account" ON "credit_accounts" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "team_owners_can_manage_credits" ON "credit_accounts" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "users can view credit accounts" ON "credit_accounts" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role manages referrals" ON "referrals" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view own referrals as referred" ON "referrals" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can view own referrals as referrer" ON "referrals" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Service role manages referral stats" ON "referral_stats" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view own referral stats" ON "referral_stats" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Service role has full access to memories" ON "user_memories" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Users can delete their own memories" ON "user_memories" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can insert their own memories" ON "user_memories" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their own memories" ON "user_memories" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own memories" ON "user_memories" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role has full access to extraction queue" ON "memory_extraction_queue" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Users can view their own extraction queue" ON "memory_extraction_queue" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Accounts are viewable by members" ON "basejump"."accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((primary_owner_user_id = ( SELECT auth.uid() AS uid)) OR (basejump.has_role_on_account(id) = true)));--> statement-breakpoint
CREATE POLICY "Accounts can be edited by owners" ON "basejump"."accounts" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Team accounts can be created by any user" ON "basejump"."accounts" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Account members can manage notification settings" ON "notification_settings" AS PERMISSIVE FOR ALL TO public USING (basejump.has_role_on_account(account_id));--> statement-breakpoint
CREATE POLICY "Account members can manage presence sessions" ON "user_presence_sessions" AS PERMISSIVE FOR ALL TO public USING (basejump.has_role_on_account(account_id));--> statement-breakpoint
CREATE POLICY "Account members can manage device tokens" ON "device_tokens" AS PERMISSIVE FOR ALL TO public USING (basejump.has_role_on_account(account_id));--> statement-breakpoint
CREATE POLICY "Service role manages referral codes" ON "referral_codes" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can create own referral code" ON "referral_codes" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can view own referral code" ON "referral_codes" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Super admins can delete arr_weekly_actuals" ON "arr_weekly_actuals" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'super_admin'::user_role)))));--> statement-breakpoint
CREATE POLICY "Super admins can insert arr_weekly_actuals" ON "arr_weekly_actuals" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Super admins can read arr_weekly_actuals" ON "arr_weekly_actuals" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Super admins can update arr_weekly_actuals" ON "arr_weekly_actuals" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "thread_delete_policy" ON "threads" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM basejump.account_user au
  WHERE ((au.account_id = threads.account_id) AND (au.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))));--> statement-breakpoint
CREATE POLICY "thread_insert_policy" ON "threads" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "thread_select_policy" ON "threads" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "thread_update_policy" ON "threads" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role can manage deletion requests" ON "account_deletion_requests" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can view their own deletion requests" ON "account_deletion_requests" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Super admins can read arr_simulator_config" ON "arr_simulator_config" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'super_admin'::user_role)))));--> statement-breakpoint
CREATE POLICY "Super admins can update arr_simulator_config" ON "arr_simulator_config" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Service role has full access to project_embeddings" ON "project_embeddings" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Service role has full access to taxonomy_nodes" ON "taxonomy_nodes" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Account members can delete resources for their accounts" ON "resources" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM basejump.account_user
  WHERE ((account_user.account_id = resources.account_id) AND (account_user.user_id = auth.uid())))));--> statement-breakpoint
CREATE POLICY "Account members can insert resources for their accounts" ON "resources" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Account members can update resources for their accounts" ON "resources" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Account members can view resources for their accounts" ON "resources" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Admins can view benchmark_runs" ON "benchmark_runs" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));--> statement-breakpoint
CREATE POLICY "Service role full access benchmark_runs" ON "benchmark_runs" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Service role has full access to benchmark_runs" ON "benchmark_runs" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Admins can view benchmark_results" ON "benchmark_results" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));--> statement-breakpoint
CREATE POLICY "Service role full access benchmark_results" ON "benchmark_results" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Service role has full access to benchmark_results" ON "benchmark_results" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Super admins can insert arr_daily_churn" ON "arr_daily_churn" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'super_admin'::user_role)))));--> statement-breakpoint
CREATE POLICY "Super admins can read arr_daily_churn" ON "arr_daily_churn" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Super admins can update arr_daily_churn" ON "arr_daily_churn" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can track their own checkout clicks" ON "checkout_clicks" AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "archived_context_delete_policy" ON "archived_context" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM threads
  WHERE ((threads.thread_id = archived_context.thread_id) AND (basejump.has_role_on_account(threads.account_id) = true)))));--> statement-breakpoint
CREATE POLICY "archived_context_insert_policy" ON "archived_context" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "archived_context_select_policy" ON "archived_context" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "archived_context_update_policy" ON "archived_context" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Service role can manage all tickets" ON "support_tickets" AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can create tickets" ON "support_tickets" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can update limited ticket fields" ON "support_tickets" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can view their own tickets" ON "support_tickets" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Service role can manage all messages" ON "ticket_messages" AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can create messages" ON "ticket_messages" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can view messages on their tickets" ON "ticket_messages" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Service role can manage all attachments" ON "ticket_attachments" AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can upload attachments" ON "ticket_attachments" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can view attachments on their tickets" ON "ticket_attachments" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Account users can be deleted by owners except primary account o" ON "basejump"."account_user" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((basejump.has_role_on_account(account_id, 'owner'::basejump.account_role) = true) AND (user_id <> ( SELECT accounts.primary_owner_user_id
   FROM basejump.accounts
  WHERE (account_user.account_id = accounts.id)))));--> statement-breakpoint
CREATE POLICY "users can view account_users" ON "basejump"."account_user" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role has full access to project_taxonomy" ON "project_taxonomy" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Admin read access for thread_cluster_assignments" ON "thread_cluster_assignments" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));--> statement-breakpoint
CREATE POLICY "Service role bypass for thread_cluster_assignments" ON "thread_cluster_assignments" AS PERMISSIVE FOR ALL TO public;
*/