-- Add label column to integrations
ALTER TABLE "kortix"."integrations" ADD COLUMN "label" varchar(255);
--> statement-breakpoint
-- Drop old unique index on (account_id, app, provider_name)
DROP INDEX IF EXISTS "kortix"."idx_integrations_account_app";
--> statement-breakpoint
-- Create new unique index on (account_id, provider_account_id)
CREATE UNIQUE INDEX "idx_integrations_account_provider_account" ON "kortix"."integrations" USING btree ("account_id", "provider_account_id");
--> statement-breakpoint
-- Backfill: link all existing integrations to all sandboxes owned by the same account
INSERT INTO "kortix"."sandbox_integrations" ("sandbox_id", "integration_id")
SELECT s."sandbox_id", i."integration_id"
FROM "kortix"."integrations" i
JOIN "kortix"."sandboxes" s ON s."account_id" = i."account_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "kortix"."sandbox_integrations" si
  WHERE si."sandbox_id" = s."sandbox_id" AND si."integration_id" = i."integration_id"
);
