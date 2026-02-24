-- Add sandbox_id column to channel_platform_credentials
ALTER TABLE kortix.channel_platform_credentials
  ADD COLUMN sandbox_id UUID REFERENCES kortix.sandboxes(sandbox_id) ON DELETE SET NULL;

-- Drop old unique index (account_id, channel_type)
DROP INDEX IF EXISTS kortix.idx_channel_platform_creds_account_type;

-- New unique index: (account_id, sandbox_id, channel_type) with COALESCE for NULL handling
CREATE UNIQUE INDEX idx_channel_platform_creds_account_sandbox_type
  ON kortix.channel_platform_credentials (account_id, COALESCE(sandbox_id, '00000000-0000-0000-0000-000000000000'), channel_type);

-- Enforce one channel per (sandbox_id, channel_type) on channel_configs
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_configs_sandbox_type
  ON kortix.channel_configs (sandbox_id, channel_type)
  WHERE sandbox_id IS NOT NULL;
