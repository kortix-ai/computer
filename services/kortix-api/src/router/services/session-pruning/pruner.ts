/**
 * Session Pruning — Core Algorithm
 *
 * Two-phase pruning adapted from OpenClaw's context-pruning extension:
 *   Phase 1 (soft-trim):  Truncate oversized tool results (keep head + tail)
 *   Phase 2 (hard-clear): Replace entire tool results with placeholder text
 *
 * Operates on OpenAI-compatible messages (role: "tool" with string content).
 * Never mutates the input array — returns a new array on any modification.
 */

import type { OpenAIMessage, PruningSettings, PruningResult } from './settings';
import { CHARS_PER_TOKEN, IMAGE_CHAR_ESTIMATE } from './settings';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Estimate character length of a message's content. */
function estimateMessageChars(msg: OpenAIMessage): number {
  if (msg.content === null || msg.content === undefined) {
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      let chars = 0;
      for (const tc of msg.tool_calls) {
        chars +=
          (tc.function?.arguments?.length ?? 0) +
          (tc.function?.name?.length ?? 0);
      }
      return chars || 128;
    }
    return 0;
  }

  if (typeof msg.content === 'string') {
    return msg.content.length;
  }

  if (Array.isArray(msg.content)) {
    let chars = 0;
    for (const block of msg.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        chars += block.text.length;
      } else if (block.type === 'image_url') {
        chars += IMAGE_CHAR_ESTIMATE;
      }
    }
    return chars;
  }

  return 256;
}

/** Check if a message contains image data. */
function hasImageContent(msg: OpenAIMessage): boolean {
  if (typeof msg.content === 'string') {
    return msg.content.startsWith('data:image/');
  }
  if (Array.isArray(msg.content)) {
    return msg.content.some(
      (block) =>
        block.type === 'image_url' ||
        (block.type === 'text' &&
          typeof block.text === 'string' &&
          block.text.startsWith('data:image/')),
    );
  }
  return false;
}

/**
 * Find the index of the Nth-from-last assistant message.
 * Everything before this index is potentially prunable.
 * Returns null if fewer than N assistant messages exist.
 */
function findAssistantCutoffIndex(
  messages: OpenAIMessage[],
  keepLastAssistants: number,
): number | null {
  if (keepLastAssistants <= 0) return messages.length;

  let remaining = keepLastAssistants;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      remaining--;
      if (remaining === 0) return i;
    }
  }
  return null;
}

/** Find the index of the first user message (bootstrap boundary). */
function findFirstUserIndex(messages: OpenAIMessage[]): number | null {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'user') return i;
  }
  return null;
}

/**
 * Soft-trim a single content string.
 * Returns the trimmed string, or null if no trimming needed.
 */
function softTrimContent(
  content: string,
  settings: PruningSettings,
): string | null {
  if (content.length <= settings.softTrim.maxChars) return null;

  const { headChars, tailChars } = settings.softTrim;
  if (headChars + tailChars >= content.length) return null;

  const head = content.slice(0, headChars);
  const tail = content.slice(content.length - tailChars);
  const note = `\n[Tool result trimmed: kept first ${headChars} and last ${tailChars} of ${content.length} chars.]`;

  return `${head}\n...\n${tail}${note}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Prune context messages using the two-phase algorithm.
 *
 * @param messages        OpenAI-compatible messages array (NOT mutated)
 * @param contextWindowTokens  Context window size in tokens
 * @param settings        Pruning configuration
 */
export function pruneMessages(
  messages: OpenAIMessage[],
  contextWindowTokens: number,
  settings: PruningSettings,
): PruningResult {
  const noop: PruningResult = {
    messages,
    pruned: false,
    stats: { softTrimmed: 0, hardCleared: 0, charsSaved: 0 },
  };

  if (!contextWindowTokens || contextWindowTokens <= 0) return noop;
  if (messages.length === 0) return noop;

  const charWindow = contextWindowTokens * CHARS_PER_TOKEN;

  // ── Step 1: Determine prunable range ────────────────────────────────

  const cutoffIndex = findAssistantCutoffIndex(
    messages,
    settings.keepLastAssistants,
  );
  if (cutoffIndex === null) return noop;

  const firstUserIndex = findFirstUserIndex(messages);
  const pruneStartIndex =
    firstUserIndex === null ? messages.length : firstUserIndex;

  // ── Step 2: Estimate total context size ─────────────────────────────

  let totalChars = 0;
  for (const msg of messages) {
    totalChars += estimateMessageChars(msg);
  }

  if (totalChars / charWindow < settings.softTrimRatio) return noop;

  // ── Step 3: Collect prunable tool-result indices ────────────────────

  const prunableIndices: number[] = [];
  for (let i = pruneStartIndex; i < cutoffIndex; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== 'tool') continue;
    if (hasImageContent(msg)) continue;
    prunableIndices.push(i);
  }

  if (prunableIndices.length === 0) return noop;

  // ── Step 4: Soft-trim phase ─────────────────────────────────────────

  let result: OpenAIMessage[] | null = null; // lazy clone
  let softTrimmed = 0;
  let charsSaved = 0;

  for (const i of prunableIndices) {
    const msg = (result ?? messages)[i];
    if (!msg || typeof msg.content !== 'string') continue;

    const trimmed = softTrimContent(msg.content, settings);
    if (trimmed === null) continue;

    if (!result) result = messages.slice();

    const saved = msg.content.length - trimmed.length;
    result[i] = { ...msg, content: trimmed };
    totalChars -= saved;
    charsSaved += saved;
    softTrimmed++;
  }

  // ── Step 5: Check if hard-clear is needed ───────────────────────────

  if (
    totalChars / charWindow < settings.hardClearRatio ||
    !settings.hardClear.enabled
  ) {
    if (!result) return noop;
    return {
      messages: result,
      pruned: true,
      stats: { softTrimmed, hardCleared: 0, charsSaved },
    };
  }

  // Check minimum prunable chars threshold
  let prunableToolChars = 0;
  for (const i of prunableIndices) {
    const msg = (result ?? messages)[i];
    if (!msg || msg.role !== 'tool') continue;
    prunableToolChars += estimateMessageChars(msg);
  }
  if (prunableToolChars < settings.minPrunableToolChars) {
    if (!result) return noop;
    return {
      messages: result,
      pruned: softTrimmed > 0,
      stats: { softTrimmed, hardCleared: 0, charsSaved },
    };
  }

  // ── Step 6: Hard-clear phase ────────────────────────────────────────

  let hardCleared = 0;

  for (const i of prunableIndices) {
    if (totalChars / charWindow < settings.hardClearRatio) break;

    const msg = (result ?? messages)[i];
    if (!msg || msg.role !== 'tool') continue;

    const beforeLen = estimateMessageChars(msg);
    if (!result) result = messages.slice();

    result[i] = { ...msg, content: settings.hardClear.placeholder };
    const afterLen = settings.hardClear.placeholder.length;
    const saved = beforeLen - afterLen;
    totalChars -= saved;
    charsSaved += saved;
    hardCleared++;
  }

  return {
    messages: result ?? messages,
    pruned: softTrimmed > 0 || hardCleared > 0,
    stats: { softTrimmed, hardCleared, charsSaved },
  };
}
