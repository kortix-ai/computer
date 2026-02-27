/**
 * Session Pruning — Integration Entry Point
 *
 * Single function called from llm.ts to apply context pruning.
 * Designed to be safe to call unconditionally — no-ops when pruning
 * is disabled, session is unknown, TTL hasn't expired, or context is small.
 */

import { sessionTracker } from './session-tracker';
import { pruneMessages } from './pruner';
import { DEFAULT_SETTINGS, PRUNING_ENABLED } from './settings';
import type { OpenAIMessage } from './settings';

/**
 * Apply session pruning to the request body's messages array.
 *
 * When pruning occurs, replaces `body.messages` with a pruned copy.
 * Individual messages are never mutated — new objects are created.
 */
export function applySessionPruning(
  body: Record<string, unknown>,
  sessionId: string | undefined,
  contextWindowTokens: number,
): void {
  if (!PRUNING_ENABLED) return;
  if (!sessionId) return;

  sessionTracker.ensureTracked(sessionId);
  if (!sessionTracker.isExpired(sessionId, DEFAULT_SETTINGS.ttlMs)) return;

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;

  const result = pruneMessages(
    messages as OpenAIMessage[],
    contextWindowTokens,
    DEFAULT_SETTINGS,
  );

  if (result.pruned) {
    body.messages = result.messages;
    sessionTracker.touch(sessionId);

    console.log(
      `[LLM][Pruning] session=${sessionId.slice(0, 12)}...: ` +
        `soft-trimmed=${result.stats.softTrimmed}, ` +
        `hard-cleared=${result.stats.hardCleared}, ` +
        `chars-saved=${result.stats.charsSaved}`,
    );
  }
}

export { pruneMessages } from './pruner';
export { sessionTracker } from './session-tracker';
export { DEFAULT_SETTINGS, PRUNING_ENABLED } from './settings';
export type { OpenAIMessage, PruningSettings, PruningResult } from './settings';
