CREATE SCHEMA "kortix";
--> statement-breakpoint
CREATE TYPE "kortix"."api_key_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "kortix"."channel_type" AS ENUM('telegram', 'slack', 'discord', 'whatsapp', 'teams', 'voice', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "kortix"."deployment_source" AS ENUM('git', 'code', 'files', 'tar');--> statement-breakpoint
CREATE TYPE "kortix"."deployment_status" AS ENUM('pending', 'building', 'deploying', 'active', 'failed', 'stopped');--> statement-breakpoint
CREATE TYPE "kortix"."execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'timeout', 'skipped');--> statement-breakpoint
CREATE TYPE "kortix"."sandbox_provider" AS ENUM('daytona', 'local_docker');--> statement-breakpoint
CREATE TYPE "kortix"."sandbox_status" AS ENUM('provisioning', 'active', 'stopped', 'archived', 'pooled', 'error');--> statement-breakpoint
CREATE TYPE "kortix"."session_mode" AS ENUM('new', 'reuse');--> statement-breakpoint
CREATE TYPE "kortix"."session_strategy" AS ENUM('single', 'per-thread', 'per-user', 'per-message');--> statement-breakpoint
CREATE TABLE "kortix"."channel_configs" (
	"channel_config_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "kortix"."channel_identity_map" (
	"channel_identity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_config_id" uuid NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform_user_name" text,
	"kortix_user_id" uuid,
	"allowed" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kortix"."channel_messages" (
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
--> statement-breakpoint
CREATE TABLE "kortix"."channel_sessions" (
	"channel_session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_config_id" uuid NOT NULL,
	"strategy_key" varchar(512) NOT NULL,
	"session_id" text NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kortix"."deployments" (
	"deployment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"sandbox_id" uuid,
	"freestyle_id" text,
	"status" "kortix"."deployment_status" DEFAULT 'pending' NOT NULL,
	"source_type" "kortix"."deployment_source" NOT NULL,
	"source_ref" text,
	"source_path" text,
	"framework" varchar(50),
	"domains" jsonb DEFAULT '[]'::jsonb,
	"live_url" text,
	"env_var_keys" jsonb DEFAULT '[]'::jsonb,
	"build_config" jsonb,
	"entrypoint" text,
	"error" text,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kortix"."executions" (
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
--> statement-breakpoint
CREATE TABLE "kortix"."api_keys" (
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
--> statement-breakpoint
CREATE TABLE "kortix"."sandboxes" (
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
--> statement-breakpoint
CREATE TABLE "kortix"."triggers" (
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
--> statement-breakpoint
ALTER TABLE "kortix"."channel_configs" ADD CONSTRAINT "channel_configs_sandbox_id_sandboxes_sandbox_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."channel_identity_map" ADD CONSTRAINT "channel_identity_map_channel_config_id_channel_configs_channel_config_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "kortix"."channel_configs"("channel_config_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."channel_messages" ADD CONSTRAINT "channel_messages_channel_config_id_channel_configs_channel_config_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "kortix"."channel_configs"("channel_config_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."channel_sessions" ADD CONSTRAINT "channel_sessions_channel_config_id_channel_configs_channel_config_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "kortix"."channel_configs"("channel_config_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."deployments" ADD CONSTRAINT "deployments_sandbox_id_sandboxes_sandbox_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."executions" ADD CONSTRAINT "executions_trigger_id_triggers_trigger_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "kortix"."triggers"("trigger_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."executions" ADD CONSTRAINT "executions_sandbox_id_sandboxes_sandbox_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."api_keys" ADD CONSTRAINT "api_keys_sandbox_id_sandboxes_sandbox_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kortix"."triggers" ADD CONSTRAINT "triggers_sandbox_id_sandboxes_sandbox_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_channel_configs_sandbox" ON "kortix"."channel_configs" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "idx_channel_configs_account" ON "kortix"."channel_configs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_channel_configs_type" ON "kortix"."channel_configs" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "idx_channel_configs_enabled" ON "kortix"."channel_configs" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_channel_identity_config" ON "kortix"."channel_identity_map" USING btree ("channel_config_id");--> statement-breakpoint
CREATE INDEX "idx_channel_identity_platform_user" ON "kortix"."channel_identity_map" USING btree ("platform_user_id");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_config" ON "kortix"."channel_messages" USING btree ("channel_config_id");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_session" ON "kortix"."channel_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_channel_messages_created" ON "kortix"."channel_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_sessions_config" ON "kortix"."channel_sessions" USING btree ("channel_config_id");--> statement-breakpoint
CREATE INDEX "idx_channel_sessions_key" ON "kortix"."channel_sessions" USING btree ("strategy_key");--> statement-breakpoint
CREATE INDEX "idx_deployments_account" ON "kortix"."deployments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_deployments_sandbox" ON "kortix"."deployments" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "idx_deployments_status" ON "kortix"."deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deployments_live_url" ON "kortix"."deployments" USING btree ("live_url");--> statement-breakpoint
CREATE INDEX "idx_deployments_created" ON "kortix"."deployments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_executions_trigger" ON "kortix"."executions" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "idx_executions_status" ON "kortix"."executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_executions_created" ON "kortix"."executions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_kortix_api_keys_public_key" ON "kortix"."api_keys" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "idx_kortix_api_keys_secret_hash" ON "kortix"."api_keys" USING btree ("secret_key_hash");--> statement-breakpoint
CREATE INDEX "idx_kortix_api_keys_sandbox" ON "kortix"."api_keys" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "idx_kortix_api_keys_account" ON "kortix"."api_keys" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_sandboxes_account" ON "kortix"."sandboxes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_sandboxes_external_id" ON "kortix"."sandboxes" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_sandboxes_status" ON "kortix"."sandboxes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sandboxes_pooled_fifo" ON "kortix"."sandboxes" USING btree ("pooled_at");--> statement-breakpoint
CREATE INDEX "idx_sandboxes_auth_token" ON "kortix"."sandboxes" USING btree ("auth_token");--> statement-breakpoint
CREATE INDEX "idx_triggers_next_run" ON "kortix"."triggers" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "idx_triggers_sandbox" ON "kortix"."triggers" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "idx_triggers_account" ON "kortix"."triggers" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_triggers_active" ON "kortix"."triggers" USING btree ("is_active");