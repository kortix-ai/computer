import { Hono } from 'hono';
import { supabaseAuth, combinedAuth } from '../middleware/auth';
import { createAdapters } from './adapters/registry';
import { createChannelsRouter } from './routes/channels';
import { createSlackWizardRouter } from './routes/slack-wizard';
import { webhooksRouter } from './routes/webhooks';
import { filesRouter } from './routes/files';
import { startChannels, stopChannels, getChannelsStatus } from './core/lifecycle';
import { config } from '../config';
import { createInternalChannelsRouter } from './routes/channels-internal';

const adapters = createAdapters();

const channelsApp = new Hono();

// Internal route for sandbox → api calls (Kortix token auth, not user JWT)
// Must be registered BEFORE the supabaseAuth middleware on /v1/channels/*
channelsApp.use('/v1/channels/internal/*', combinedAuth);
channelsApp.route('/v1/channels/internal', createInternalChannelsRouter());

channelsApp.use('/v1/channels/*', supabaseAuth);
// NOTE: platform-credentials router REMOVED — all creds now live in sandbox SecretStore
channelsApp.route('/v1/channels/slack-wizard', createSlackWizardRouter());
channelsApp.route('/v1/channels', createChannelsRouter(adapters));
channelsApp.route('/v1/files', filesRouter);

for (const [type, adapter] of adapters) {
  console.log(`[CHANNELS] Registering routes for ${type} adapter`);
  adapter.registerRoutes(webhooksRouter);
}

// ── Telegram webhook proxy ──────────────────────────────────────────────────
// Telegram is fully sandbox-direct (no DB, no adapter on kortix-api).
// This proxy just forwards webhook POSTs to the sandbox's kortix-master,
// which routes them to opencode-channels. The bot validates Telegram's
// secret token header — no auth needed here.
// This lets both Slack and Telegram share a single ngrok tunnel on port 8008.
webhooksRouter.post('/telegram', async (c) => {
  const sandboxUrl = `http://localhost:${config.SANDBOX_PORT_BASE || 14000}`;
  const rawBody = await c.req.text();

  const headers: Record<string, string> = {
    'Content-Type': c.req.header('Content-Type') || 'application/json',
  };
  // Pass through Telegram's secret token header for validation by the bot
  const secretToken = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secretToken) {
    headers['X-Telegram-Bot-Api-Secret-Token'] = secretToken;
  }
  // Add service key so the sandbox auth middleware lets it through
  if (config.INTERNAL_SERVICE_KEY) {
    headers['Authorization'] = `Bearer ${config.INTERNAL_SERVICE_KEY}`;
  }

  fetch(`${sandboxUrl}/channels/api/webhooks/telegram`, {
    method: 'POST',
    headers,
    body: rawBody,
  }).catch(err => console.error('[TELEGRAM] Proxy to sandbox failed:', err));

  return c.text('OK');
});

channelsApp.route('/webhooks', webhooksRouter);

async function startChannelService(): Promise<void> {
  if (!config.CHANNELS_ENABLED) {
    console.log('[CHANNELS] Channels disabled (CHANNELS_ENABLED=false)');
    return;
  }
  await startChannels(adapters);
}

async function stopChannelService(): Promise<void> {
  await stopChannels(adapters);
}

function getChannelServiceStatus() {
  return getChannelsStatus(adapters);
}

export {
  channelsApp,
  startChannelService,
  stopChannelService,
  getChannelServiceStatus,
};
