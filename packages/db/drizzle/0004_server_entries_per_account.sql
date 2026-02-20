-- Migration: scope server_entries per-account
-- 
-- Previously server_entries had `id` as the primary key and no account scoping,
-- meaning all users shared the same entries. This adds account_id and changes
-- the PK to an auto-generated UUID, with a unique constraint on (account_id, id).

-- 1. Add the new columns
ALTER TABLE "kortix"."server_entries" ADD COLUMN "entry_id" uuid DEFAULT gen_random_uuid();
ALTER TABLE "kortix"."server_entries" ADD COLUMN "account_id" uuid;

-- 2. Backfill entry_id for existing rows
UPDATE "kortix"."server_entries" SET "entry_id" = gen_random_uuid() WHERE "entry_id" IS NULL;

-- 3. Drop the old primary key on `id`
ALTER TABLE "kortix"."server_entries" DROP CONSTRAINT "server_entries_pkey";

-- 4. Make entry_id NOT NULL and set as new PK
ALTER TABLE "kortix"."server_entries" ALTER COLUMN "entry_id" SET NOT NULL;
ALTER TABLE "kortix"."server_entries" ADD PRIMARY KEY ("entry_id");

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS "idx_server_entries_account" ON "kortix"."server_entries" ("account_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_server_entries_account_id" ON "kortix"."server_entries" ("account_id", "id");
