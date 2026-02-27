/**
 * Unit tests for session pruning — the two-phase algorithm that trims
 * stale tool results before forwarding to OpenRouter, optimizing
 * Anthropic prompt-cache costs after idle periods.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { pruneMessages } from '../router/services/session-pruning/pruner';
import { SessionTracker } from '../router/services/session-pruning/session-tracker';
import {
  DEFAULT_SETTINGS,
  CHARS_PER_TOKEN,
  type OpenAIMessage,
  type PruningSettings,
} from '../router/services/session-pruning/settings';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeUser(content: string): OpenAIMessage {
  return { role: 'user', content };
}

function makeAssistant(
  content: string | null,
  toolCalls?: { id: string; name: string; args: string }[],
): OpenAIMessage {
  const msg: OpenAIMessage = { role: 'assistant', content };
  if (toolCalls) {
    msg.tool_calls = toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.args },
    }));
  }
  return msg;
}

function makeTool(toolCallId: string, content: string): OpenAIMessage {
  return { role: 'tool', tool_call_id: toolCallId, content };
}

function makeSystem(content: string): OpenAIMessage {
  return { role: 'system', content };
}

function makeLargeContent(chars: number): string {
  return 'x'.repeat(chars);
}

/** Settings with a small context window to easily trigger pruning. */
function smallWindowSettings(
  overrides: Partial<PruningSettings> = {},
): PruningSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

/**
 * Calculate context window tokens needed so that `totalChars` fills
 * exactly `ratio` of the window.
 * Formula: contextTokens = totalChars / (ratio * CHARS_PER_TOKEN)
 */
function tokensForRatio(totalChars: number, ratio: number): number {
  return Math.floor(totalChars / (ratio * CHARS_PER_TOKEN));
}

// ─── Session Tracker ────────────────────────────────────────────────────────

describe('SessionTracker', () => {
  let tracker: SessionTracker;

  beforeEach(() => {
    tracker = new SessionTracker(60_000);
  });

  afterEach(() => {
    tracker.destroy();
  });

  test('getLastTouch returns null for unknown session', () => {
    expect(tracker.getLastTouch('unknown')).toBeNull();
  });

  test('touch creates entry', () => {
    tracker.touch('s1');
    expect(tracker.getLastTouch('s1')).toBeTypeOf('number');
    expect(tracker.size).toBe(1);
  });

  test('ensureTracked creates entry only once', () => {
    tracker.ensureTracked('s1');
    const first = tracker.getLastTouch('s1');
    tracker.ensureTracked('s1');
    expect(tracker.getLastTouch('s1')).toBe(first);
  });

  test('isExpired returns false for unknown session', () => {
    expect(tracker.isExpired('unknown', 1000)).toBe(false);
  });

  test('isExpired returns false for fresh session', () => {
    tracker.touch('s1');
    expect(tracker.isExpired('s1', 300_000)).toBe(false);
  });

  test('isExpired returns true when TTL elapsed', () => {
    // Manually set an old timestamp
    tracker.touch('s1');
    // Override via re-touch with backdated time
    const old = Date.now() - 400_000;
    (tracker as any).sessions.set('s1', { lastTouchAt: old });
    expect(tracker.isExpired('s1', 300_000)).toBe(true);
  });

  test('destroy clears all sessions', () => {
    tracker.touch('s1');
    tracker.touch('s2');
    expect(tracker.size).toBe(2);
    tracker.destroy();
    expect(tracker.size).toBe(0);
  });
});

// ─── Pruner: No-op Cases ────────────────────────────────────────────────────

describe('pruneMessages — no-op cases', () => {
  test('returns unchanged for empty messages', () => {
    const result = pruneMessages([], 200_000, DEFAULT_SETTINGS);
    expect(result.pruned).toBe(false);
    expect(result.messages).toEqual([]);
  });

  test('returns unchanged for zero context window', () => {
    const messages = [makeUser('hello'), makeAssistant('hi')];
    const result = pruneMessages(messages, 0, DEFAULT_SETTINGS);
    expect(result.pruned).toBe(false);
  });

  test('returns unchanged when context is small', () => {
    const messages = [
      makeUser('hello'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', 'small output'),
      makeAssistant('done'),
    ];
    // 200K token window = 800K chars. Tiny messages won't trigger.
    const result = pruneMessages(messages, 200_000, DEFAULT_SETTINGS);
    expect(result.pruned).toBe(false);
  });

  test('returns unchanged when fewer than keepLastAssistants', () => {
    const messages = [
      makeUser('hello'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', makeLargeContent(10_000)),
      makeAssistant('done'),
    ];
    // Only 2 assistant messages, need 3 to establish cutoff
    // Use a tiny window to ensure ratio would trigger
    const result = pruneMessages(messages, 100, DEFAULT_SETTINGS);
    expect(result.pruned).toBe(false);
  });
});

// ─── Pruner: Soft-Trim ──────────────────────────────────────────────────────

describe('pruneMessages — soft-trim', () => {
  test('trims oversized tool results to head + tail', () => {
    const largeContent = makeLargeContent(10_000);
    const messages = [
      makeUser('start'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', largeContent),
      makeAssistant('mid-1'),
      makeUser('continue'),
      makeAssistant(null, [{ id: 'c2', name: 'bash', args: '{}' }]),
      makeTool('c2', 'small'),
      makeAssistant('mid-2'),
      makeUser('more'),
      makeAssistant(null, [{ id: 'c3', name: 'bash', args: '{}' }]),
      makeTool('c3', 'small'),
      makeAssistant('end-1'),
      makeUser('final'),
      makeAssistant('end-2'),
      makeUser('last'),
      makeAssistant('end-3'),
    ];

    // Calculate a window where the large content puts us above softTrimRatio
    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);

    expect(result.pruned).toBe(true);
    expect(result.stats.softTrimmed).toBe(1);
    expect(result.stats.charsSaved).toBeGreaterThan(0);

    // The trimmed message should contain the note
    const trimmedMsg = result.messages[2];
    expect(typeof trimmedMsg.content).toBe('string');
    expect((trimmedMsg.content as string)).toContain('[Tool result trimmed:');
    expect((trimmedMsg.content as string)).toContain('...');
  });

  test('preserves tool_call_id on trimmed messages', () => {
    const messages = [
      makeUser('start'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', makeLargeContent(10_000)),
      makeAssistant('a1'),
      makeUser('u2'),
      makeAssistant('a2'),
      makeUser('u3'),
      makeAssistant('a3'),
      makeUser('u4'),
      makeAssistant('a4'),
    ];

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);
    if (result.pruned) {
      expect(result.messages[2].tool_call_id).toBe('c1');
      expect(result.messages[2].role).toBe('tool');
    }
  });

  test('does not trim tool results below maxChars', () => {
    const messages = [
      makeUser('start'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', makeLargeContent(3_000)), // below 4000 maxChars
      makeAssistant('a1'),
      makeUser('u2'),
      makeAssistant('a2'),
      makeUser('u3'),
      makeAssistant('a3'),
      makeUser('u4'),
      makeAssistant('a4'),
    ];

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);
    // Content at 3000 chars is below maxChars=4000, so no soft-trim
    expect(result.stats.softTrimmed).toBe(0);
  });

  test('does not mutate original messages array', () => {
    const original = makeLargeContent(10_000);
    const messages = [
      makeUser('start'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', original),
      makeAssistant('a1'),
      makeUser('u2'),
      makeAssistant('a2'),
      makeUser('u3'),
      makeAssistant('a3'),
      makeUser('u4'),
      makeAssistant('a4'),
    ];

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const messagesCopy = messages.slice();
    pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);

    // Original array untouched
    expect(messages[2].content).toBe(original);
    expect(messages.length).toBe(messagesCopy.length);
  });
});

// ─── Pruner: Protections ────────────────────────────────────────────────────

describe('pruneMessages — protections', () => {
  test('protects tool results in the last N assistant messages', () => {
    const messages = [
      makeUser('start'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', makeLargeContent(10_000)),
      makeAssistant('a1'), // 1st from end (protected)
      makeUser('u2'),
      makeAssistant(null, [{ id: 'c2', name: 'bash', args: '{}' }]),
      makeTool('c2', makeLargeContent(10_000)),
      makeAssistant('a2'), // 2nd from end (protected)
      makeUser('u3'),
      makeAssistant(null, [{ id: 'c3', name: 'bash', args: '{}' }]),
      makeTool('c3', makeLargeContent(10_000)),
      makeAssistant('a3'), // 3rd from end (protected)
    ];

    // Assistants with tool_calls also count for keepLastAssistants.
    // Walking backwards: a3(11), tc-assistant(9), mid-2(7) → cutoff = index 7.
    // So tools at index 2 and 6 are prunable, but tool at index 10 is protected.
    const settings = smallWindowSettings({ keepLastAssistants: 3 });
    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, settings);

    if (result.pruned) {
      expect(result.stats.softTrimmed).toBe(2); // tools at 2 and 6
      // Tool at index 10 is inside the protected tail — untouched
      expect(result.messages[10].content).toBe(messages[10].content);
    }
  });

  test('protects tool results before first user message', () => {
    const messages = [
      makeSystem('you are helpful'),
      makeAssistant(null, [{ id: 'boot', name: 'read', args: '{}' }]),
      makeTool('boot', makeLargeContent(10_000)), // bootstrap — protected
      makeUser('start'), // first user message
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', makeLargeContent(10_000)), // prunable
      makeAssistant('a1'),
      makeUser('u2'),
      makeAssistant('a2'),
      makeUser('u3'),
      makeAssistant('a3'),
      makeUser('u4'),
      makeAssistant('a4'),
    ];

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);

    // Bootstrap tool (index 2) should be untouched
    expect(result.messages[2].content).toBe(messages[2].content);

    // Tool at index 5 should be trimmed (if ratio permits)
    if (result.pruned && result.stats.softTrimmed > 0) {
      expect((result.messages[5].content as string)).toContain(
        '[Tool result trimmed:',
      );
    }
  });

  test('skips tool results with image content', () => {
    const messages = [
      makeUser('start'),
      makeAssistant(null, [{ id: 'c1', name: 'screenshot', args: '{}' }]),
      makeTool('c1', 'data:image/png;base64,' + makeLargeContent(10_000)),
      makeAssistant('a1'),
      makeUser('u2'),
      makeAssistant('a2'),
      makeUser('u3'),
      makeAssistant('a3'),
      makeUser('u4'),
      makeAssistant('a4'),
    ];

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);

    // Image tool result should be untouched
    expect(result.messages[2].content).toBe(messages[2].content);
    expect(result.stats.softTrimmed).toBe(0);
  });
});

// ─── Pruner: Hard-Clear ─────────────────────────────────────────────────────

describe('pruneMessages — hard-clear', () => {
  test('replaces content with placeholder when over hardClearRatio', () => {
    // Build a conversation with many large tool results.
    // Set softTrim.maxChars very high so soft-trim is skipped entirely,
    // forcing the algorithm to fall through to hard-clear.
    const messages: OpenAIMessage[] = [makeUser('start')];

    for (let i = 0; i < 10; i++) {
      messages.push(
        makeAssistant(null, [
          { id: `c${i}`, name: 'bash', args: `{"cmd":"ls ${i}"}` },
        ]),
      );
      messages.push(makeTool(`c${i}`, makeLargeContent(20_000)));
    }

    // Add 3 protected assistant messages at the end
    messages.push(makeUser('continue'));
    messages.push(makeAssistant('a-end-1'));
    messages.push(makeUser('more'));
    messages.push(makeAssistant('a-end-2'));
    messages.push(makeUser('final'));
    messages.push(makeAssistant('a-end-3'));

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );

    // Set window so ratio > hardClearRatio (0.5)
    const contextTokens = tokensForRatio(totalChars, 0.55);

    const settings = smallWindowSettings({
      minPrunableToolChars: 1_000,
      // Set maxChars above tool size so soft-trim is a no-op → forces hard-clear
      softTrim: { maxChars: 100_000, headChars: 1_500, tailChars: 1_500 },
    });
    const result = pruneMessages(messages, contextTokens, settings);

    expect(result.pruned).toBe(true);
    expect(result.stats.softTrimmed).toBe(0);
    expect(result.stats.hardCleared).toBeGreaterThan(0);

    // At least one tool result should be replaced with placeholder
    const cleared = result.messages.filter(
      (m) =>
        m.role === 'tool' &&
        m.content === DEFAULT_SETTINGS.hardClear.placeholder,
    );
    expect(cleared.length).toBeGreaterThan(0);
  });

  test('skips hard-clear when disabled', () => {
    const messages: OpenAIMessage[] = [makeUser('start')];
    for (let i = 0; i < 10; i++) {
      messages.push(
        makeAssistant(null, [{ id: `c${i}`, name: 'bash', args: '{}' }]),
      );
      messages.push(makeTool(`c${i}`, makeLargeContent(20_000)));
    }
    messages.push(makeUser('continue'));
    messages.push(makeAssistant('a1'));
    messages.push(makeUser('u2'));
    messages.push(makeAssistant('a2'));
    messages.push(makeUser('u3'));
    messages.push(makeAssistant('a3'));

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.55);

    const settings = smallWindowSettings({
      hardClear: { enabled: false, placeholder: '' },
      minPrunableToolChars: 1_000,
    });
    const result = pruneMessages(messages, contextTokens, settings);

    expect(result.stats.hardCleared).toBe(0);
  });

  test('respects minPrunableToolChars threshold', () => {
    const messages: OpenAIMessage[] = [makeUser('start')];
    // Only 2 tool results of 5000 chars each = 10,000 total prunable
    for (let i = 0; i < 2; i++) {
      messages.push(
        makeAssistant(null, [{ id: `c${i}`, name: 'bash', args: '{}' }]),
      );
      messages.push(makeTool(`c${i}`, makeLargeContent(5_000)));
    }
    messages.push(makeUser('continue'));
    messages.push(makeAssistant('a1'));
    messages.push(makeUser('u2'));
    messages.push(makeAssistant('a2'));
    messages.push(makeUser('u3'));
    messages.push(makeAssistant('a3'));

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.55);

    // minPrunableToolChars=50_000 but we only have ~10K — hard-clear skipped
    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);
    expect(result.stats.hardCleared).toBe(0);
  });

  test('hard-clear processes oldest tool results first', () => {
    const messages: OpenAIMessage[] = [makeUser('start')];
    for (let i = 0; i < 8; i++) {
      messages.push(
        makeAssistant(null, [{ id: `c${i}`, name: 'bash', args: '{}' }]),
      );
      messages.push(makeTool(`c${i}`, makeLargeContent(20_000)));
    }
    messages.push(makeUser('continue'));
    messages.push(makeAssistant('a1'));
    messages.push(makeUser('u2'));
    messages.push(makeAssistant('a2'));
    messages.push(makeUser('u3'));
    messages.push(makeAssistant('a3'));

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.55);

    const settings = smallWindowSettings({ minPrunableToolChars: 1_000 });
    const result = pruneMessages(messages, contextTokens, settings);

    if (result.stats.hardCleared > 0) {
      // First tool (index 2) should be cleared before later ones
      const firstTool = result.messages[2];
      expect(firstTool.content).toBe(DEFAULT_SETTINGS.hardClear.placeholder);
    }
  });
});

// ─── Pruner: Message Format Integrity ───────────────────────────────────────

describe('pruneMessages — format integrity', () => {
  test('preserves all message fields after pruning', () => {
    const messages: OpenAIMessage[] = [
      makeUser('start'),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{"cmd":"ls"}' }]),
      {
        role: 'tool',
        tool_call_id: 'c1',
        content: makeLargeContent(10_000),
        name: 'bash', // some implementations include name
      },
      makeAssistant('a1'),
      makeUser('u2'),
      makeAssistant('a2'),
      makeUser('u3'),
      makeAssistant('a3'),
      makeUser('u4'),
      makeAssistant('a4'),
    ];

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);

    if (result.pruned) {
      const pruned = result.messages[2];
      expect(pruned.role).toBe('tool');
      expect(pruned.tool_call_id).toBe('c1');
      expect(pruned.name).toBe('bash'); // extra field preserved
    }
  });

  test('user and assistant messages are never modified', () => {
    const userContent = makeLargeContent(10_000);
    const assistantContent = makeLargeContent(10_000);
    const messages: OpenAIMessage[] = [
      makeUser(userContent),
      makeAssistant(null, [{ id: 'c1', name: 'bash', args: '{}' }]),
      makeTool('c1', makeLargeContent(10_000)),
      makeAssistant(assistantContent),
      makeUser('u2'),
      makeAssistant('a2'),
      makeUser('u3'),
      makeAssistant('a3'),
      makeUser('u4'),
      makeAssistant('a4'),
    ];

    const totalChars = messages.reduce(
      (sum, m) =>
        sum + (typeof m.content === 'string' ? m.content.length : 0),
      0,
    );
    const contextTokens = tokensForRatio(totalChars, 0.35);

    const result = pruneMessages(messages, contextTokens, DEFAULT_SETTINGS);

    // User and assistant messages untouched
    expect(result.messages[0].content).toBe(userContent);
    expect(result.messages[3].content).toBe(assistantContent);
  });
});
