import type { Context } from 'hono';
import { findConfigByTeamId, verifySlackSignature } from './utils';
import { getSlackPlatformCredentials } from '../../lib/platform-credentials';
import { resolveDirectEndpoint, resolveSandboxTarget } from '../../core/opencode-connector';
import { config as appConfig } from '../../../config';

export async function proxySlackWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const payload = JSON.parse(rawBody);

  if (payload.type === 'url_verification') {
    return c.json({ challenge: payload.challenge });
  }

  const teamId = payload.team_id;
  if (!teamId) return c.json({ ok: true });

  const channelConfig = await findConfigByTeamId(teamId);
  if (!channelConfig?.sandboxId) return c.json({ ok: true });

  let signingSecret = appConfig.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    const platformCreds = await getSlackPlatformCredentials(
      channelConfig.accountId, channelConfig.sandboxId,
    );
    signingSecret = platformCreds?.signingSecret || '';
  }
  if (signingSecret) {
    const timestamp = c.req.header('X-Slack-Request-Timestamp') || '';
    const signature = c.req.header('X-Slack-Signature') || '';
    const valid = await verifySlackSignature(signingSecret, timestamp, rawBody, signature);
    if (!valid) return c.json({ error: 'Invalid signature' }, 401);
  }

  const target = await resolveSandboxTarget(channelConfig.sandboxId);
  if (!target) return c.json({ ok: true });

  const { url, headers } = await resolveDirectEndpoint(target);

  fetch(`${url}/channels/api/webhooks/slack`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'X-Slack-Request-Timestamp': c.req.header('X-Slack-Request-Timestamp') || '',
      'X-Slack-Signature': c.req.header('X-Slack-Signature') || '',
    },
    body: rawBody,
  }).catch(err => console.error('[SLACK] Proxy to sandbox failed:', err));

  return c.json({ ok: true });
}
