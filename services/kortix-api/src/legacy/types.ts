export interface LegacyThread {
  thread_id: string;
  account_id: string;
  project_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  user_message_count: number;
  total_message_count: number;
  migrated_session_id: string | null;
}

export interface LegacyMessage {
  message_id: string;
  thread_id: string;
  type: string;
  is_llm_message: boolean;
  content: LegacyContent;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type LegacyContent =
  | LegacyUserContent
  | LegacyAssistantContent
  | LegacyToolContent
  | LegacyReasoningContent
  | LegacyStatusContent
  | LegacyImageContent
  | Record<string, unknown>;

export interface LegacyUserContent {
  role: 'user';
  content: string;
}

export interface LegacyAssistantContent {
  role: 'assistant';
  content: string | null;
  tool_calls?: LegacyToolCall[];
}

export interface LegacyToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LegacyToolContent {
  role: 'tool';
  name: string;
  content: string;
  tool_call_id: string;
}

export interface LegacyReasoningContent {
  reasoning_content: string;
}

export interface LegacyStatusContent {
  status_type: string;
}

export interface LegacyImageContent {
  role: 'user';
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface TransformedSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransformedMessage {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  createdAt: number;
  parentID?: string;
}

export interface TransformedPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text' | 'tool' | 'reasoning';
  data: Record<string, unknown>;
}

export interface MigrationResult {
  sessionId: string;
  messagesImported: number;
  partsImported: number;
}
