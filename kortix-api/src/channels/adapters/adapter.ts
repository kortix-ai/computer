import type { Hono } from 'hono';
import type { ChannelType, ChannelCapabilities } from '../types';
import type { ChannelConfig } from '@kortix/db';

export interface ChannelAdapter {
  readonly type: ChannelType;
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  registerRoutes(router: Hono): void;

  start?(signal: AbortSignal): Promise<void>;
  shutdown?(): Promise<void>;

  onChannelCreated?(config: ChannelConfig): Promise<void>;
  onChannelRemoved?(config: ChannelConfig): Promise<void>;
}

export abstract class BaseAdapter implements ChannelAdapter {
  abstract readonly type: ChannelType;
  abstract readonly name: string;
  abstract readonly capabilities: ChannelCapabilities;

  abstract registerRoutes(router: Hono): void;

  async onChannelCreated(_config: ChannelConfig): Promise<void> {}
  async onChannelRemoved(_config: ChannelConfig): Promise<void> {}
}
