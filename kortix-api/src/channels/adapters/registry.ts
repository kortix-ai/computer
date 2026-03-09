import type { ChannelAdapter } from './adapter';
import type { ChannelType } from '../types';
import { SlackAdapter } from './slack/adapter';

export function createAdapters(): Map<ChannelType, ChannelAdapter> {
  const adapters = new Map<ChannelType, ChannelAdapter>();

  adapters.set('slack', new SlackAdapter());

  return adapters;
}
