import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { createAdapters } from './adapters/registry';
import { createChannelsRouter } from './routes/channels';
import { createPlatformCredentialsRouter } from './routes/platform-credentials';
import { createSlackWizardRouter } from './routes/slack-wizard';
import { webhooksRouter } from './routes/webhooks';
import { filesRouter } from './routes/files';
import { startChannels, stopChannels, getChannelsStatus } from './core/lifecycle';
import { config } from '../config';

const adapters = createAdapters();

const channelsApp = new Hono();

channelsApp.use('/v1/channels/*', supabaseAuth);
channelsApp.route('/v1/channels/platform-credentials', createPlatformCredentialsRouter());
channelsApp.route('/v1/channels/slack-wizard', createSlackWizardRouter());
channelsApp.route('/v1/channels', createChannelsRouter(adapters));
channelsApp.route('/v1/files', filesRouter);

for (const [type, adapter] of adapters) {
  console.log(`[CHANNELS] Registering routes for ${type} adapter`);
  adapter.registerRoutes(webhooksRouter);
}

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
