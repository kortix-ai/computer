export type ChannelType =
  | 'telegram'
  | 'slack'
  | 'discord'
  | 'whatsapp'
  | 'teams'
  | 'voice'
  | 'email'
  | 'sms';

export type SessionStrategy = 'single' | 'per-thread' | 'per-user' | 'per-message';

export interface ChannelCapabilities {
  textChunkLimit: number;
  supportsRichText: boolean;
  supportsEditing: boolean;
  supportsTypingIndicator: boolean;
  supportsAttachments: boolean;
  connectionType: 'webhook' | 'websocket' | 'polling';
}

export interface SandboxTarget {
  sandboxId: string;
  baseUrl: string;
  provider: string;
  externalId: string | null;
}
