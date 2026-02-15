import type { ChannelAdapter } from './adapter';
import type { ChannelType } from '../types';
import { TelegramAdapter } from './telegram/adapter';
import { SlackAdapter } from './slack/adapter';

export function createAdapters(): Map<ChannelType, ChannelAdapter> {
  const adapters = new Map<ChannelType, ChannelAdapter>();

  adapters.set('telegram', new TelegramAdapter());
  adapters.set('slack', new SlackAdapter());

  return adapters;
}
