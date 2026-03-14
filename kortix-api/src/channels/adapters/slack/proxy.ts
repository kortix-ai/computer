import type { Context } from 'hono';
import { config as appConfig } from '../../../config';

/**
 * Proxy Slack webhook events to the sandbox.
 *
 * Signature verification is handled by opencode-channels inside the sandbox
 * (via @chat-adapter/slack which verifies SLACK_SIGNING_SECRET on every request).
 * kortix-api is a pure pass-through proxy — no credential logic needed here.
 */
export async function proxySlackWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();

  // Handle Slack URL verification challenge synchronously (required by Slack)
  try {
    const payload = JSON.parse(rawBody);
    if (payload.type === 'url_verification') {
      return c.json({ challenge: payload.challenge });
    }
  } catch {
    // Not JSON or no type field — continue with proxy
  }

  const sandboxUrl = `http://localhost:${appConfig.SANDBOX_PORT_BASE || 14000}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Pass through Slack's signature headers so the sandbox can verify
    'X-Slack-Request-Timestamp': c.req.header('X-Slack-Request-Timestamp') || '',
    'X-Slack-Signature': c.req.header('X-Slack-Signature') || '',
  };
  if (appConfig.INTERNAL_SERVICE_KEY) {
    headers['Authorization'] = `Bearer ${appConfig.INTERNAL_SERVICE_KEY}`;
  }

  // Fire-and-forget — respond to Slack immediately (3s timeout compliance)
  fetch(`${sandboxUrl}/channels/api/webhooks/slack`, {
    method: 'POST',
    headers,
    body: rawBody,
  }).catch(err => console.error('[SLACK] Proxy to sandbox failed:', err));

  return c.json({ ok: true });
}
