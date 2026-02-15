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

export type ChatType = 'dm' | 'group' | 'channel';

export type MessageDirection = 'inbound' | 'outbound';

export interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video' | 'sticker';
  url?: string;
  mimeType?: string;
  name?: string;
  size?: number;
}

export interface ThreadMessage {
  sender: string;
  text: string;
  isBot?: boolean;
}

export interface MessageOverrides {
  model?: { providerID: string; modelID: string };
  agentName?: string;
}

export interface NormalizedMessage {
  externalId: string;
  channelType: ChannelType;
  channelConfigId: string;
  chatType: ChatType;
  content: string;
  attachments: Attachment[];
  platformUser: {
    id: string;
    name: string;
    avatar?: string;
  };
  threadId?: string;
  groupId?: string;
  isMention?: boolean;
  raw?: unknown;
  /** Previous messages in the thread, for context */
  threadContext?: ThreadMessage[];
  /** Per-message overrides for model or agent routing */
  overrides?: MessageOverrides;
}

export interface AgentResponse {
  content: string;
  sessionId: string;
  truncated?: boolean;
  modelName?: string;
  durationMs?: number;
}

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
  authToken: string | null;
  provider: string;
  externalId: string | null;
}
