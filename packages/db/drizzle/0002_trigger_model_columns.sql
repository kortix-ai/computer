-- Add model selection columns to triggers table
-- Allows users to pick which model (provider + model ID) each cron trigger uses
ALTER TABLE kortix.triggers ADD COLUMN IF NOT EXISTS model_provider_id VARCHAR(255);
ALTER TABLE kortix.triggers ADD COLUMN IF NOT EXISTS model_id VARCHAR(255);
