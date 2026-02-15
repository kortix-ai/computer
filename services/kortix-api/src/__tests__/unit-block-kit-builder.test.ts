import { describe, it, expect } from 'bun:test';
import { buildBlockKitMessage } from '../channels/adapters/slack/block-kit-builder';

describe('Block Kit Builder', () => {
  it('converts simple text to a section block', () => {
    const blocks = buildBlockKitMessage('Hello world');
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks[0].type).toBe('section');
    expect(blocks[0].text?.text).toContain('Hello world');
  });

  it('adds session link as context footer', () => {
    const blocks = buildBlockKitMessage('Hello', 'https://example.com/session/123');
    const last = blocks[blocks.length - 1];
    expect(last.type).toBe('context');
  });

  it('converts code blocks', () => {
    const md = 'Some text\n\n```js\nconst x = 1;\n```\n\nMore text';
    const blocks = buildBlockKitMessage(md);

    const codeBlock = blocks.find(
      (b) => b.type === 'section' && b.text?.text?.includes('```'),
    );
    expect(codeBlock).toBeDefined();
  });

  it('converts horizontal rules to dividers', () => {
    const md = 'Above\n\n---\n\nBelow';
    const blocks = buildBlockKitMessage(md);

    const divider = blocks.find((b) => b.type === 'divider');
    expect(divider).toBeDefined();
  });

  it('handles multiple paragraphs as separate sections', () => {
    const md = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const blocks = buildBlockKitMessage(md);

    const sections = blocks.filter((b) => b.type === 'section');
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('respects the 50 block limit', () => {
    const paragraphs = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}`).join('\n\n');
    const blocks = buildBlockKitMessage(paragraphs, 'https://example.com');
    expect(blocks.length).toBeLessThanOrEqual(50);
  });

  it('returns fallback for empty content', () => {
    const blocks = buildBlockKitMessage('', 'https://example.com');
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });
});
