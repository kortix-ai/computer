import type { ChannelAdapter } from '../adapters/adapter';
import type { ChannelType } from '../types';

let abortController: AbortController | null = null;

export async function startChannels(
  adapters: Map<ChannelType, ChannelAdapter>,
): Promise<void> {
  abortController = new AbortController();

  for (const [type, adapter] of adapters) {
    if (adapter.start) {
      console.log(`[CHANNELS] Starting ${type} adapter...`);
      adapter.start(abortController.signal).catch((err) => {
        console.error(`[CHANNELS] ${type} adapter start failed:`, err);
      });
    }
  }

  console.log(`[CHANNELS] Started with ${adapters.size} adapter(s)`);
}

export async function stopChannels(
  adapters: Map<ChannelType, ChannelAdapter>,
): Promise<void> {
  console.log('[CHANNELS] Shutting down...');

  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  for (const [type, adapter] of adapters) {
    if (adapter.shutdown) {
      try {
        await adapter.shutdown();
        console.log(`[CHANNELS] ${type} adapter shut down`);
      } catch (err) {
        console.error(`[CHANNELS] ${type} adapter shutdown failed:`, err);
      }
    }
  }

  console.log('[CHANNELS] Shutdown complete');
}

export function getChannelsStatus(adapters: Map<ChannelType, ChannelAdapter>): {
  enabled: boolean;
  adapters: string[];
} {
  return {
    enabled: true,
    adapters: Array.from(adapters.keys()),
  };
}
