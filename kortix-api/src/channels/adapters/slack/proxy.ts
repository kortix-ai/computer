import type { Context } from 'hono';
import { verifySlackSignature } from './utils';
import { config as appConfig } from '../../../config';

export async function proxySlackWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const payload = JSON.parse(rawBody);

  if (payload.type === 'url_verification') {
    return c.json({ challenge: payload.challenge });
  }

  const signingSecret = appConfig.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = c.req.header('X-Slack-Request-Timestamp') || '';
    const signature = c.req.header('X-Slack-Signature') || '';
    const valid = await verifySlackSignature(signingSecret, timestamp, rawBody, signature);
    if (!valid) return c.json({ error: 'Invalid signature' }, 401);
  }

  const sandboxUrl = `http://localhost:${appConfig.SANDBOX_PORT_BASE || 14000}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Slack-Request-Timestamp': c.req.header('X-Slack-Request-Timestamp') || '',
    'X-Slack-Signature': c.req.header('X-Slack-Signature') || '',
  };
  if (appConfig.INTERNAL_SERVICE_KEY) {
    headers['Authorization'] = `Bearer ${appConfig.INTERNAL_SERVICE_KEY}`;
  }

  fetch(`${sandboxUrl}/channels/api/webhooks/slack`, {
    method: 'POST',
    headers,
    body: rawBody,
  }).catch(err => console.error('[SLACK] Proxy to sandbox failed:', err));

  return c.json({ ok: true });
}
