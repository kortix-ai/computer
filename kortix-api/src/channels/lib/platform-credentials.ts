import { config } from '../../config';

export interface SlackPlatformCreds {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
}

export function clearPlatformCredentialsCache(): void {
  // No-op: Slack platform credentials are env-only.
}

export async function getSlackPlatformCredentials(
  _accountId?: string,
  _sandboxId?: string | null,
): Promise<SlackPlatformCreds | null> {
  return envCreds();
}

function envCreds(): SlackPlatformCreds | null {
  const clientId = config.SLACK_CLIENT_ID;
  const clientSecret = config.SLACK_CLIENT_SECRET;
  const signingSecret = config.SLACK_SIGNING_SECRET;

  if (clientId && clientSecret && signingSecret) {
    return { clientId, clientSecret, signingSecret };
  }
  return null;
}
