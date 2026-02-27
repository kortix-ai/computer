/**
 * Prompt Caching — Core Injection Logic
 *
 * Adds cache_control breakpoints to an OpenAI-compatible messages array
 * so that OpenRouter can pass them through to providers that require
 * explicit caching directives (Anthropic, Gemini).
 *
 * Pure function — no side effects, never mutates input.
 */

import type { CacheInjectionConfig } from './config';

// Re-use the same loose message type from session-pruning
export interface ContentBlock {
  type: string;
  text?: string;
  cache_control?: { type: string };
  [key: string]: unknown;
}

export interface OpenAIMessage {
  role: string;
  content?: string | ContentBlock[] | null;
  [key: string]: unknown;
}

export interface CacheInjectionResult {
  messages: OpenAIMessage[];
  breakpointsUsed: number;
}

const CACHE_CONTROL = { type: 'ephemeral' } as const;

/**
 * Inject cache_control breakpoints into strategic positions in the messages array.
 *
 * Breakpoint 1: Last text block of the system message (static agent instructions).
 * Breakpoint 2: Conversation prefix boundary (last message before the N most recent assistant turns).
 *
 * Returns a new array — never mutates the input.
 */
export function injectCacheBreakpoints(
  messages: OpenAIMessage[],
  config: CacheInjectionConfig,
): CacheInjectionResult {
  if (!messages || messages.length === 0) {
    return { messages, breakpointsUsed: 0 };
  }

  const result = [...messages];
  let breakpointsUsed = 0;

  // --- Breakpoint 1: System message ---
  const systemIdx = result.findIndex((msg) => msg.role === 'system');
  if (systemIdx >= 0) {
    const tagged = tagLastTextBlock(result[systemIdx]);
    if (tagged) {
      result[systemIdx] = tagged;
      breakpointsUsed++;
    }
  }

  // --- Breakpoint 2: Conversation prefix boundary ---
  if (messages.length >= config.minMessagesForPrefixCache) {
    const boundaryIdx = findPrefixBoundary(result, config.keepRecentAssistants);
    // Must be after system message and not the very last message
    if (boundaryIdx > systemIdx && boundaryIdx < result.length - 1) {
      const tagged = tagLastTextBlock(result[boundaryIdx]);
      if (tagged) {
        result[boundaryIdx] = tagged;
        breakpointsUsed++;
      }
    }
  }

  return {
    messages: breakpointsUsed > 0 ? result : messages,
    breakpointsUsed,
  };
}

/**
 * Add cache_control to the last text content block of a message.
 * Converts string content to array format if needed.
 * Returns a new message object, or null if no text block was found or it already has cache_control.
 */
function tagLastTextBlock(msg: OpenAIMessage): OpenAIMessage | null {
  const blocks = ensureArrayContent(msg);
  if (!blocks) return null;

  // Find last text block
  let lastTextIdx = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === 'text' && blocks[i].text) {
      lastTextIdx = i;
      break;
    }
  }
  if (lastTextIdx === -1) return null;

  // Skip if already tagged
  if (blocks[lastTextIdx].cache_control) return null;

  // Create new content array with the tagged block
  const newBlocks = [...blocks];
  newBlocks[lastTextIdx] = { ...blocks[lastTextIdx], cache_control: CACHE_CONTROL };

  return { ...msg, content: newBlocks };
}

/**
 * Ensure message content is in array-of-blocks format.
 * Returns the content blocks, or null if content is empty/missing.
 */
function ensureArrayContent(msg: OpenAIMessage): ContentBlock[] | null {
  if (typeof msg.content === 'string') {
    if (!msg.content) return null;
    return [{ type: 'text', text: msg.content }];
  }
  if (Array.isArray(msg.content) && msg.content.length > 0) {
    return msg.content;
  }
  return null;
}

/**
 * Find the index of the message at the prefix/recent boundary.
 *
 * Walks backwards from the end, counting assistant messages.
 * Returns the index of the message just before the Nth assistant from the end.
 */
function findPrefixBoundary(messages: OpenAIMessage[], keepRecentAssistants: number): number {
  let assistantCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      assistantCount++;
      if (assistantCount === keepRecentAssistants) {
        // The boundary is the message just before this assistant turn
        return Math.max(0, i - 1);
      }
    }
  }
  // Not enough assistant messages for prefix caching
  return -1;
}
