CREATE TABLE IF NOT EXISTS kortix.channel_platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  sandbox_id uuid REFERENCES kortix.sandboxes (sandbox_id) ON DELETE SET NULL,
  channel_type kortix.channel_type NOT NULL,
  credentials jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_platform_creds_account
  ON kortix.channel_platform_credentials (account_id);
CREATE INDEX IF NOT EXISTS idx_channel_platform_creds_sandbox
  ON kortix.channel_platform_credentials (sandbox_id);

GRANT ALL ON kortix.channel_platform_credentials TO service_role;
