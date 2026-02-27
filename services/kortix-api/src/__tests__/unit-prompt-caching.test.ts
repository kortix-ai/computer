/**
 * Unit tests for prompt caching — the cache_control breakpoint injection
 * that enables Anthropic prompt caching via OpenRouter.
 */
import { describe, test, expect } from 'bun:test';
import { injectCacheBreakpoints } from '../router/services/prompt-caching/injector';
import type { OpenAIMessage, ContentBlock } from '../router/services/prompt-caching/injector';
import type { CacheInjectionConfig } from '../router/services/prompt-caching/config';
import { calculateCost } from '../router/services/llm';
import type { ModelConfig } from '../router/config/models';

// ─── Test Helpers ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CacheInjectionConfig = {
  keepRecentAssistants: 3,
  minMessagesForPrefixCache: 6,
};

function makeUser(content: string): OpenAIMessage {
  return { role: 'user', content };
}

function makeAssistant(content: string | null): OpenAIMessage {
  return { role: 'assistant', content };
}

function makeSystem(content: string): OpenAIMessage {
  return { role: 'system', content };
}

function makeSystemArray(blocks: ContentBlock[]): OpenAIMessage {
  return { role: 'system', content: blocks };
}

function makeTool(toolCallId: string, content: string): OpenAIMessage {
  return { role: 'tool', tool_call_id: toolCallId, content };
}

/** Build a conversation with N turns (user + assistant pairs) after the system message. */
function buildConversation(turns: number): OpenAIMessage[] {
  const msgs: OpenAIMessage[] = [makeSystem('You are a helpful agent.')];
  for (let i = 0; i < turns; i++) {
    msgs.push(makeUser(`question ${i}`));
    msgs.push(makeAssistant(`answer ${i}`));
  }
  return msgs;
}

// ─── System Message Breakpoint ──────────────────────────────────────────────

describe('injectCacheBreakpoints — system message', () => {
  test('converts string content to array and adds cache_control', () => {
    const messages = [makeSystem('You are helpful.'), makeUser('hi')];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(1);
    const system = result.messages[0];
    expect(Array.isArray(system.content)).toBe(true);
    const blocks = system.content as ContentBlock[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].text).toBe('You are helpful.');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  test('adds cache_control to last text block of array content', () => {
    const messages = [
      makeSystemArray([
        { type: 'text', text: 'Instructions part 1' },
        { type: 'text', text: 'Instructions part 2' },
      ]),
      makeUser('hi'),
    ];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(1);
    const blocks = result.messages[0].content as ContentBlock[];
    expect(blocks[0].cache_control).toBeUndefined();
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  test('skips system message that already has cache_control', () => {
    const messages = [
      makeSystemArray([
        { type: 'text', text: 'Instructions', cache_control: { type: 'ephemeral' } },
      ]),
      makeUser('hi'),
    ];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(0);
    // Returns original array reference when no changes
    expect(result.messages).toBe(messages);
  });

  test('skips system message with empty content', () => {
    const messages = [{ role: 'system', content: '' } as OpenAIMessage, makeUser('hi')];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(0);
  });

  test('skips system message with null content', () => {
    const messages = [{ role: 'system', content: null } as OpenAIMessage, makeUser('hi')];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(0);
  });

  test('handles conversation with no system message', () => {
    const messages = [makeUser('hi'), makeAssistant('hello')];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(0);
    expect(result.messages).toBe(messages);
  });
});

// ─── Prefix Boundary Breakpoint ─────────────────────────────────────────────

describe('injectCacheBreakpoints — prefix boundary', () => {
  test('adds prefix breakpoint with enough messages', () => {
    // 5 turns = 11 messages (system + 5 * (user + assistant))
    // keepRecentAssistants=3, so boundary is before 3rd-from-last assistant
    const messages = buildConversation(5);
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(2); // system + prefix
  });

  test('does not add prefix breakpoint with too few messages', () => {
    // 2 turns = 5 messages (system + 2 * (user + assistant))
    const messages = buildConversation(2);
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(1); // system only
  });

  test('prefix boundary skips correct number of recent assistants', () => {
    const messages = buildConversation(6); // 13 messages: [sys, u0, a0, u1, a1, u2, a2, u3, a3, u4, a4, u5, a5]
    const config: CacheInjectionConfig = { keepRecentAssistants: 2, minMessagesForPrefixCache: 4 };
    const result = injectCacheBreakpoints(messages, config);

    // Walking backwards: a5(12) count=1, a4(10) count=2 → boundary = index 9 (u4)
    expect(result.breakpointsUsed).toBe(2);
    const boundaryMsg = result.messages[9];
    expect(Array.isArray(boundaryMsg.content)).toBe(true);
    const blocks = boundaryMsg.content as ContentBlock[];
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  test('does not place prefix breakpoint on same index as system', () => {
    // System + 2 assistant messages only — not enough for keepRecentAssistants=3
    // boundary returns -1 → only system breakpoint
    const messages = [
      makeSystem('instructions'),
      makeUser('q0'), makeAssistant('a0'),
      makeUser('q1'), makeAssistant('a1'),
    ];
    const config: CacheInjectionConfig = { keepRecentAssistants: 3, minMessagesForPrefixCache: 5 };
    const result = injectCacheBreakpoints(messages, config);

    // Not enough assistant messages for prefix boundary → only system breakpoint
    expect(result.breakpointsUsed).toBe(1);
  });

  test('does not place prefix breakpoint on last message', () => {
    const messages = buildConversation(3);
    // keepRecentAssistants very high → boundary would be at end
    const config: CacheInjectionConfig = { keepRecentAssistants: 1, minMessagesForPrefixCache: 4 };
    const result = injectCacheBreakpoints(messages, config);

    // Boundary is not the last message
    expect(result.breakpointsUsed).toBe(2);
  });
});

// ─── Immutability ───────────────────────────────────────────────────────────

describe('injectCacheBreakpoints — immutability', () => {
  test('does not mutate original messages array', () => {
    const messages = [makeSystem('instructions'), makeUser('hi')];
    const originalContent = messages[0].content;
    const originalLength = messages.length;

    injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(messages[0].content).toBe(originalContent);
    expect(messages.length).toBe(originalLength);
  });

  test('does not mutate original content blocks', () => {
    const originalBlocks: ContentBlock[] = [
      { type: 'text', text: 'Part 1' },
      { type: 'text', text: 'Part 2' },
    ];
    const messages = [makeSystemArray(originalBlocks), makeUser('hi')];

    injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(originalBlocks[1].cache_control).toBeUndefined();
  });

  test('returns original array when no breakpoints injected', () => {
    const messages = [makeUser('hi')];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.messages).toBe(messages);
    expect(result.breakpointsUsed).toBe(0);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('injectCacheBreakpoints — edge cases', () => {
  test('handles empty messages array', () => {
    const result = injectCacheBreakpoints([], DEFAULT_CONFIG);
    expect(result.breakpointsUsed).toBe(0);
    expect(result.messages).toEqual([]);
  });

  test('handles system message with only non-text blocks', () => {
    const messages = [
      makeSystemArray([{ type: 'image_url', image_url: { url: 'data:...' } }]),
      makeUser('hi'),
    ];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.breakpointsUsed).toBe(0);
  });

  test('preserves extra fields on messages', () => {
    const messages: OpenAIMessage[] = [
      { role: 'system', content: 'instructions', name: 'system_prompt' },
      makeUser('hi'),
    ];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    expect(result.messages[0].name).toBe('system_prompt');
  });

  test('handles tool messages in prefix boundary', () => {
    const messages: OpenAIMessage[] = [
      makeSystem('instructions'),
      makeUser('q0'),
      makeAssistant('calling tool'),
      makeTool('t1', 'tool output'),
      makeAssistant('a0'),
      makeUser('q1'), makeAssistant('a1'),
      makeUser('q2'), makeAssistant('a2'),
      makeUser('q3'), makeAssistant('a3'),
    ];
    const result = injectCacheBreakpoints(messages, DEFAULT_CONFIG);

    // Should inject system + prefix breakpoints
    expect(result.breakpointsUsed).toBe(2);
  });
});

// ─── Cache-Aware Billing ────────────────────────────────────────────────────

describe('calculateCost — cache-aware', () => {
  const anthropicModel: ModelConfig = {
    openrouterId: 'anthropic/claude-sonnet-4.5',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    contextWindow: 200000,
    tier: 'free',
    cachingStrategy: 'manual',
    cacheReadPer1M: 0.30,
    cacheWritePer1M: 3.75,
  };

  const genericModel: ModelConfig = {
    openrouterId: 'openai/gpt-4o',
    inputPer1M: 2.50,
    outputPer1M: 10.00,
    contextWindow: 128000,
    tier: 'paid',
  };

  test('uses differential pricing when cache metrics provided', () => {
    // 10000 prompt tokens: 5000 cached, 0 written, 5000 regular
    // Regular: 5000/1M * 3.00 = 0.015
    // Cache read: 5000/1M * 0.30 = 0.0015
    // Output: 1000/1M * 15.00 = 0.015
    // Total before markup: 0.0315
    // With 1.2x: 0.0378
    const cost = calculateCost(anthropicModel, 10000, 1000, 5000, 0);
    expect(cost).toBeCloseTo(0.0378, 4);
  });

  test('uses flat pricing when no cache metrics', () => {
    // 10000/1M * 3.00 + 1000/1M * 15.00 = 0.03 + 0.015 = 0.045 * 1.2 = 0.054
    const cost = calculateCost(anthropicModel, 10000, 1000);
    expect(cost).toBeCloseTo(0.054, 4);
  });

  test('handles cache write tokens', () => {
    // 10000 prompt tokens: 0 cached, 8000 written, 2000 regular
    // Regular: 2000/1M * 3.00 = 0.006
    // Cache write: 8000/1M * 3.75 = 0.03
    // Output: 1000/1M * 15.00 = 0.015
    // Total before markup: 0.051
    // With 1.2x: 0.0612
    const cost = calculateCost(anthropicModel, 10000, 1000, 0, 8000);
    expect(cost).toBeCloseTo(0.0612, 4);
  });

  test('falls back to flat pricing for models without cache config', () => {
    const withCache = calculateCost(genericModel, 10000, 1000, 5000, 0);
    const withoutCache = calculateCost(genericModel, 10000, 1000);
    expect(withCache).toBeCloseTo(withoutCache, 6);
  });

  test('cache savings are significant compared to no caching', () => {
    const noCacheCost = calculateCost(anthropicModel, 10000, 1000);
    const withCacheCost = calculateCost(anthropicModel, 10000, 1000, 8000, 0);
    // Cache should be cheaper because 8000 tokens at 0.30 vs 3.00
    expect(withCacheCost).toBeLessThan(noCacheCost);
  });
});
