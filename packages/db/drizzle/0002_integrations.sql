CREATE TYPE "kortix"."integration_status" AS ENUM('active', 'revoked', 'expired', 'error');
--> statement-breakpoint
CREATE TABLE "kortix"."integrations" (
	"integration_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"app" varchar(255) NOT NULL,
	"app_name" varchar(255),
	"provider_name" varchar(50) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"status" "kortix"."integration_status" DEFAULT 'active' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kortix"."sandbox_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kortix"."sandbox_integrations" ADD CONSTRAINT "sandbox_integrations_sandbox_id_sandboxes_sandbox_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kortix"."sandbox_integrations" ADD CONSTRAINT "sandbox_integrations_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "kortix"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_integrations_account" ON "kortix"."integrations" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "idx_integrations_app" ON "kortix"."integrations" USING btree ("app");
--> statement-breakpoint
CREATE INDEX "idx_integrations_provider_account" ON "kortix"."integrations" USING btree ("provider_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_integrations_account_app" ON "kortix"."integrations" USING btree ("account_id", "app", "provider_name");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sandbox_integration_unique" ON "kortix"."sandbox_integrations" USING btree ("sandbox_id", "integration_id");
--> statement-breakpoint
CREATE INDEX "idx_sandbox_integrations_sandbox" ON "kortix"."sandbox_integrations" USING btree ("sandbox_id");
