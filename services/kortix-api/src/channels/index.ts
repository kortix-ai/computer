import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { createAdapters } from './adapters/registry';
import { ChannelEngineImpl } from './core/engine';
import { createChannelsRouter } from './routes/channels';
import { webhooksRouter } from './routes/webhooks';
import { startChannels, stopChannels, getChannelsStatus } from './core/lifecycle';
import { config } from '../config';

const adapters = createAdapters();
const engine = new ChannelEngineImpl(adapters);

const channelsApp = new Hono();

channelsApp.use('/v1/channels/*', supabaseAuth);
channelsApp.route('/v1/channels', createChannelsRouter(engine));

for (const [type, adapter] of adapters) {
  console.log(`[CHANNELS] Registering routes for ${type} adapter`);
  adapter.registerRoutes(webhooksRouter, engine);
}

channelsApp.route('/webhooks', webhooksRouter);

async function startChannelService(): Promise<void> {
  if (!config.CHANNELS_ENABLED) {
    console.log('[CHANNELS] Channels disabled (CHANNELS_ENABLED=false)');
    return;
  }
  await startChannels(engine, adapters);
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
