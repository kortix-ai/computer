import type { ChannelEngineImpl } from './engine';
import type { ChannelAdapter } from '../adapters/adapter';
import type { ChannelType } from '../types';

let abortController: AbortController | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export async function startChannels(
  engine: ChannelEngineImpl,
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

  cleanupInterval = setInterval(() => {
    engine.cleanup();
  }, 5 * 60 * 1000);

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

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
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
