/**
 * Prompt Caching — Integration Entry Point
 *
 * Single function called from llm.ts to inject cache_control breakpoints
 * into the request body before forwarding to OpenRouter.
 * Safe to call unconditionally — no-ops for models with automatic caching.
 */

import type { ModelConfig } from '../../config/models';
import { CACHE_CONFIG } from './config';
import { injectCacheBreakpoints } from './injector';
import type { OpenAIMessage } from './injector';

/**
 * Inject cache_control breakpoints into the request body's messages array
 * for providers that require explicit caching directives (Anthropic).
 *
 * When injection occurs, replaces `body.messages` with a new array.
 * Individual messages are never mutated — new objects are created.
 */
export function injectCacheControl(
  body: Record<string, unknown>,
  modelConfig: ModelConfig,
): void {
  if (modelConfig.cachingStrategy !== 'manual') return;

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;

  const result = injectCacheBreakpoints(messages as OpenAIMessage[], CACHE_CONFIG);

  if (result.breakpointsUsed > 0) {
    body.messages = result.messages;
    console.log(
      `[LLM][Cache] Injected ${result.breakpointsUsed} cache_control breakpoint(s)`,
    );
  }
}

export { injectCacheBreakpoints } from './injector';
export type { OpenAIMessage, ContentBlock, CacheInjectionResult } from './injector';
export { CACHE_CONFIG } from './config';
export type { CacheInjectionConfig } from './config';
