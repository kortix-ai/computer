import type { Hono } from 'hono';
import type {
  ChannelType,
  ChannelCapabilities,
  NormalizedMessage,
  AgentResponse,
  SessionStrategy,
} from '../types';
import type { ChannelConfig } from '@kortix/db';

export interface PermissionRequest {
  id: string;
  tool: string;
  description: string;
}

export interface FileOutput {
  name: string;
  url: string;
  mimeType?: string;
  content?: Buffer;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  registerRoutes(router: Hono, engine: ChannelEngine): void;

  start?(signal: AbortSignal): Promise<void>;
  shutdown?(): Promise<void>;

  sendResponse(
    config: ChannelConfig,
    message: NormalizedMessage,
    response: AgentResponse,
  ): Promise<void>;

  sendTypingIndicator?(config: ChannelConfig, message: NormalizedMessage): Promise<void>;
  removeTypingIndicator?(config: ChannelConfig, message: NormalizedMessage): Promise<void>;
  onChannelCreated?(config: ChannelConfig): Promise<void>;
  onChannelRemoved?(config: ChannelConfig): Promise<void>;
  validateCredentials?(credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }>;

  sendPermissionRequest?(
    config: ChannelConfig,
    message: NormalizedMessage,
    permission: PermissionRequest,
  ): Promise<void>;

  sendFiles?(
    config: ChannelConfig,
    message: NormalizedMessage,
    files: FileOutput[],
  ): Promise<void>;

  sendUnlinkedMessage?(
    config: ChannelConfig,
    message: NormalizedMessage,
  ): Promise<void>;
}

export interface ChannelEngine {
  processMessage(message: NormalizedMessage): Promise<void>;
  resetSession(configId: string, channelType: string, strategy: SessionStrategy, message: NormalizedMessage): Promise<void>;
}

export abstract class BaseAdapter implements ChannelAdapter {
  abstract readonly type: ChannelType;
  abstract readonly name: string;
  abstract readonly capabilities: ChannelCapabilities;

  abstract registerRoutes(router: Hono, engine: ChannelEngine): void;
  abstract sendResponse(
    config: ChannelConfig,
    message: NormalizedMessage,
    response: AgentResponse,
  ): Promise<void>;

  protected getBotToken(config: ChannelConfig): string | null {
    const credentials = config.credentials as Record<string, unknown>;
    return (credentials?.botToken as string) || null;
  }

  protected getCredential<T>(config: ChannelConfig, key: string): T | undefined {
    const credentials = config.credentials as Record<string, unknown>;
    return credentials?.[key] as T | undefined;
  }

  async sendTypingIndicator(_config: ChannelConfig, _message: NormalizedMessage): Promise<void> {}
  async removeTypingIndicator(_config: ChannelConfig, _message: NormalizedMessage): Promise<void> {}
  async onChannelCreated(_config: ChannelConfig): Promise<void> {}
  async onChannelRemoved(_config: ChannelConfig): Promise<void> {}
  async validateCredentials(_credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }
  async sendPermissionRequest(_config: ChannelConfig, _message: NormalizedMessage, _permission: PermissionRequest): Promise<void> {}
  async sendFiles(_config: ChannelConfig, _message: NormalizedMessage, _files: FileOutput[]): Promise<void> {}
}
