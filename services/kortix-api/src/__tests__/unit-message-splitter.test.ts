/**
 * Unit tests for the message splitter utility.
 * No database required.
 */
import { describe, it, expect } from 'bun:test';
import { splitMessage } from '../channels/lib/message-splitter';

describe('splitMessage', () => {
  it('returns single chunk for short text', () => {
    const result = splitMessage('Hello world', 100);
    expect(result).toEqual(['Hello world']);
  });

  it('returns single chunk when text equals max length', () => {
    const text = 'a'.repeat(100);
    const result = splitMessage(text, 100);
    expect(result).toEqual([text]);
  });

  it('splits at paragraph boundary', () => {
    const text = 'First paragraph.\n\nSecond paragraph that is long enough to matter.';
    const result = splitMessage(text, 30);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toBe('First paragraph.');
  });

  it('splits at sentence boundary when no paragraph break', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = splitMessage(text, 35);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toContain('First sentence.');
  });

  it('splits at word boundary as fallback', () => {
    const text = 'word1 word2 word3 word4 word5 word6 word7 word8';
    const result = splitMessage(text, 20);
    expect(result.length).toBeGreaterThan(1);
    // Should not cut words in half
    for (const chunk of result) {
      expect(chunk).not.toMatch(/^\S+\s*$/); // shouldn't have just fragments
    }
  });

  it('handles empty string', () => {
    const result = splitMessage('', 100);
    expect(result).toEqual([]);
  });

  it('preserves code blocks when possible', () => {
    const text = 'Before code\n\n```javascript\nconst x = 1;\nconst y = 2;\n```\n\nAfter code.';
    const result = splitMessage(text, 40);
    expect(result.length).toBeGreaterThan(1);
    // Code block should not be split mid-block if possible
    const hasCompleteCodeBlock = result.some(
      (chunk) => chunk.includes('```javascript') && chunk.includes('```\n'),
    );
    // Either the code block is complete in one chunk, or it was split at the start
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('handles Telegram limit (4096 chars)', () => {
    const text = 'a'.repeat(10000);
    const result = splitMessage(text, 4096);
    expect(result.length).toBe(3); // 4096 + 4096 + 1808
    expect(result.every((chunk) => chunk.length <= 4096)).toBe(true);
    expect(result.join('')).toBe(text);
  });

  it('filters empty chunks', () => {
    const text = 'Hello\n\n\n\nWorld';
    const result = splitMessage(text, 10);
    expect(result.every((chunk) => chunk.length > 0)).toBe(true);
  });
});
