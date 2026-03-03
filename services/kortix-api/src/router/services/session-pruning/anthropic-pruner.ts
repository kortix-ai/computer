/**
 * Session Pruning — Anthropic Format
 *
 * Mirrors the two-phase algorithm in pruner.ts but operates on Anthropic's
 * message format where tool results are content blocks inside user messages:
 *
 *   OpenAI:   { role: 'tool', content: '<result>' }
 *   Anthropic: { role: 'user', content: [{ type: 'tool_result', content: '<result>' }] }
 *
 * Never mutates the input array — returns new objects on any modification.
 */

import type { PruningSettings, PruningResult } from './settings';
import { CHARS_PER_TOKEN, IMAGE_CHAR_ESTIMATE } from './settings';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnthropicBlock {
  type: string;
  text?: string;
  tool_use_id?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: string | AnthropicBlock[];
  is_error?: boolean;
  [key: string]: unknown;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content?: string | AnthropicBlock[];
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateMessageChars(msg: AnthropicMessage): number {
  if (!msg.content) return 0;
  if (typeof msg.content === 'string') return msg.content.length;

  let chars = 0;
  for (const block of msg.content) {
    switch (block.type) {
      case 'text':
        chars += typeof block.text === 'string' ? block.text.length : 0;
        break;
      case 'tool_use':
        chars += (block.name?.length ?? 0) + JSON.stringify(block.input ?? {}).length;
        break;
      case 'tool_result':
        if (typeof block.content === 'string') {
          chars += block.content.length;
        } else if (Array.isArray(block.content)) {
          for (const inner of block.content) {
            if (inner.type === 'text') chars += inner.text?.length ?? 0;
            else if (inner.type === 'image') chars += IMAGE_CHAR_ESTIMATE;
          }
        }
        break;
      case 'image':
        chars += IMAGE_CHAR_ESTIMATE;
        break;
    }
  }
  return chars;
}

/** True if any content block in a tool_result is an image — skip pruning these. */
function hasImageContent(block: AnthropicBlock): boolean {
  if (typeof block.content !== 'object' || !Array.isArray(block.content)) return false;
  return block.content.some((b) => b.type === 'image');
}

function findAssistantCutoffIndex(
  messages: AnthropicMessage[],
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

function findFirstUserIndex(messages: AnthropicMessage[]): number | null {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'user') return i;
  }
  return null;
}

function softTrimContent(content: string, settings: PruningSettings): string | null {
  if (content.length <= settings.softTrim.maxChars) return null;
  const { headChars, tailChars } = settings.softTrim;
  if (headChars + tailChars >= content.length) return null;
  const head = content.slice(0, headChars);
  const tail = content.slice(content.length - tailChars);
  const note = `\n[Tool result trimmed: kept first ${headChars} and last ${tailChars} of ${content.length} chars.]`;
  return `${head}\n...\n${tail}${note}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Prune tool_result content blocks inside Anthropic-format messages.
 *
 * @param messages            Anthropic messages array (NOT mutated)
 * @param contextWindowTokens Context window size in tokens
 * @param settings            Pruning configuration
 */
export function pruneAnthropicMessages(
  messages: AnthropicMessage[],
  contextWindowTokens: number,
  settings: PruningSettings,
): PruningResult {
  const noop: PruningResult = {
    messages: messages as any,
    pruned: false,
    stats: { softTrimmed: 0, hardCleared: 0, charsSaved: 0 },
  };

  if (!contextWindowTokens || contextWindowTokens <= 0) return noop;
  if (messages.length === 0) return noop;

  const charWindow = contextWindowTokens * CHARS_PER_TOKEN;

  // ── Step 1: Determine prunable range ─────────────────────────────────

  const cutoffIndex = findAssistantCutoffIndex(messages, settings.keepLastAssistants);
  if (cutoffIndex === null) return noop;

  const firstUserIndex = findFirstUserIndex(messages);
  const pruneStartIndex = firstUserIndex === null ? messages.length : firstUserIndex;

  // ── Step 2: Estimate total context size ───────────────────────────────

  let totalChars = 0;
  for (const msg of messages) totalChars += estimateMessageChars(msg);
  if (totalChars / charWindow < settings.softTrimRatio) return noop;

  // ── Step 3: Collect prunable tool_result blocks ───────────────────────
  // Each entry records which message and which block index holds the tool_result.

  const prunableBlocks: Array<{ msgIdx: number; blockIdx: number }> = [];
  for (let i = pruneStartIndex; i < cutoffIndex; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== 'user' || !Array.isArray(msg.content)) continue;
    for (let b = 0; b < msg.content.length; b++) {
      const block = msg.content[b];
      if (block?.type !== 'tool_result') continue;
      if (typeof block.content !== 'string') continue; // skip image/array content
      if (hasImageContent(block)) continue;
      prunableBlocks.push({ msgIdx: i, blockIdx: b });
    }
  }

  if (prunableBlocks.length === 0) return noop;

  // ── Lazy deep-clone helpers ───────────────────────────────────────────
  // Clone only the messages/blocks we actually modify.

  let result: AnthropicMessage[] | null = null;

  const ensureMessageCloned = (msgIdx: number) => {
    if (!result) result = messages.slice();
    if (result[msgIdx] === messages[msgIdx]) {
      const msg = result[msgIdx]!;
      result[msgIdx] = {
        ...msg,
        content: Array.isArray(msg.content) ? msg.content.slice() : msg.content,
      };
    }
  };

  let softTrimmed = 0;
  let charsSaved = 0;

  // ── Step 4: Soft-trim phase ───────────────────────────────────────────

  for (const { msgIdx, blockIdx } of prunableBlocks) {
    const msg = (result ?? messages)[msgIdx]!;
    const block = (msg.content as AnthropicBlock[])[blockIdx]!;
    if (typeof block.content !== 'string') continue;

    const trimmed = softTrimContent(block.content, settings);
    if (trimmed === null) continue;

    ensureMessageCloned(msgIdx);
    const blocks = result![msgIdx]!.content as AnthropicBlock[];
    const saved = block.content.length - trimmed.length;
    blocks[blockIdx] = { ...block, content: trimmed };
    totalChars -= saved;
    charsSaved += saved;
    softTrimmed++;
  }

  // ── Step 5: Check if hard-clear is needed ─────────────────────────────

  if (totalChars / charWindow < settings.hardClearRatio || !settings.hardClear.enabled) {
    if (!result) return noop;
    return {
      messages: result as any,
      pruned: true,
      stats: { softTrimmed, hardCleared: 0, charsSaved },
    };
  }

  // Minimum chars threshold
  let prunableToolChars = 0;
  for (const { msgIdx, blockIdx } of prunableBlocks) {
    const msg = (result ?? messages)[msgIdx]!;
    const block = (msg.content as AnthropicBlock[])[blockIdx]!;
    if (typeof block.content === 'string') prunableToolChars += block.content.length;
  }
  if (prunableToolChars < settings.minPrunableToolChars) {
    if (!result) return noop;
    return {
      messages: result as any,
      pruned: softTrimmed > 0,
      stats: { softTrimmed, hardCleared: 0, charsSaved },
    };
  }

  // ── Step 6: Hard-clear phase ──────────────────────────────────────────

  let hardCleared = 0;

  for (const { msgIdx, blockIdx } of prunableBlocks) {
    if (totalChars / charWindow < settings.hardClearRatio) break;

    const msg = (result ?? messages)[msgIdx]!;
    const block = (msg.content as AnthropicBlock[])[blockIdx]!;
    if (typeof block.content !== 'string') continue;

    const beforeLen = block.content.length;
    ensureMessageCloned(msgIdx);
    const blocks = result![msgIdx]!.content as AnthropicBlock[];
    blocks[blockIdx] = { ...block, content: settings.hardClear.placeholder };
    const saved = beforeLen - settings.hardClear.placeholder.length;
    totalChars -= saved;
    charsSaved += saved;
    hardCleared++;
  }

  return {
    messages: (result ?? messages) as any,
    pruned: softTrimmed > 0 || hardCleared > 0,
    stats: { softTrimmed, hardCleared, charsSaved },
  };
}
