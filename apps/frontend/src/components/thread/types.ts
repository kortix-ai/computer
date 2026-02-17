import type { Project } from '@/lib/api/threads';
import { Message as BaseApiMessageType } from '@/lib/api/threads';

// Re-export shared types - single source of truth
export type { UnifiedMessage } from '@kortix/shared';

// Re-export streaming types from shared

// Define a type for the params to make React.use() work properly
type ThreadParams = {
  threadId: string;
  projectId: string;
};

// Extend the base Message type with the expected database fields
export interface ApiMessageType extends Omit<BaseApiMessageType, 'type'> {
  message_id?: string;
  thread_id?: string;
  is_llm_message?: boolean;
  metadata?: string;
  created_at?: string;
  updated_at?: string;
  // Allow 'type' to be potentially wider than the base type
  type?: string;
}

// Re-export existing types

