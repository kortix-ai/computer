ALTER TABLE "kortix"."channel_configs" DROP CONSTRAINT "channel_configs_sandbox_id_sandboxes_sandbox_id_fk";
--> statement-breakpoint
ALTER TABLE "kortix"."channel_configs" ALTER COLUMN "sandbox_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kortix"."channel_configs" ADD CONSTRAINT "channel_configs_sandbox_id_sandboxes_sandbox_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "kortix"."sandboxes"("sandbox_id") ON DELETE set null ON UPDATE no action;