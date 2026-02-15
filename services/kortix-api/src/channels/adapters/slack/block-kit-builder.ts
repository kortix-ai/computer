import { markdownToSlack } from '../../lib/markdown-to-slack';

const MAX_BLOCKS = 50;
const MAX_TEXT_LENGTH = 3000;

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: unknown[];
  block_id?: string;
  [key: string]: unknown;
}

export function buildBlockKitMessage(markdown: string, sessionUrl?: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  const segments = splitIntoSegments(markdown);

  for (const segment of segments) {
    if (blocks.length >= MAX_BLOCKS - 2) break;

    const block = segmentToBlock(segment);
    if (block) {
      blocks.push(block);
    }
  }

  if (sessionUrl) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `<${sessionUrl}|View full session>`,
        },
      ],
    });
  }

  if (blocks.length === 0 || (blocks.length <= 2 && sessionUrl)) {
    const fallback = markdownToSlack(markdown);
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: truncateText(fallback) },
      },
      ...(sessionUrl ? [
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `<${sessionUrl}|View full session>` }],
        },
      ] : []),
    ];
  }

  return blocks;
}

interface Segment {
  type: 'text' | 'code' | 'divider';
  content: string;
  language?: string;
}

function splitIntoSegments(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const lines = markdown.split('\n');
  let current = '';
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeContent = '';

  for (const line of lines) {
    if (!inCodeBlock && line.startsWith('```')) {
      if (current.trim()) {
        segments.push({ type: 'text', content: current.trim() });
        current = '';
      }

      inCodeBlock = true;
      codeLanguage = line.slice(3).trim();
      codeContent = '';
      continue;
    }

    if (inCodeBlock && line.startsWith('```')) {
      segments.push({
        type: 'code',
        content: codeContent,
        language: codeLanguage,
      });
      inCodeBlock = false;
      codeLanguage = '';
      codeContent = '';
      continue;
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line;
      continue;
    }

    if (/^[-*_]{3,}$/.test(line.trim())) {
      if (current.trim()) {
        segments.push({ type: 'text', content: current.trim() });
        current = '';
      }
      segments.push({ type: 'divider', content: '' });
      continue;
    }

    if (line.trim() === '' && current.trim()) {
      segments.push({ type: 'text', content: current.trim() });
      current = '';
      continue;
    }

    current += (current ? '\n' : '') + line;
  }

  if (inCodeBlock && codeContent) {
    segments.push({ type: 'code', content: codeContent, language: codeLanguage });
  } else if (current.trim()) {
    segments.push({ type: 'text', content: current.trim() });
  }

  return segments;
}

function segmentToBlock(segment: Segment): SlackBlock | null {
  switch (segment.type) {
    case 'divider':
      return { type: 'divider' };

    case 'code': {
      const codeText = truncateText('```\n' + segment.content + '\n```');
      return {
        type: 'section',
        text: { type: 'mrkdwn', text: codeText },
      };
    }

    case 'text': {
      const slackText = markdownToSlack(segment.content);
      if (!slackText.trim()) return null;
      return {
        type: 'section',
        text: { type: 'mrkdwn', text: truncateText(slackText) },
      };
    }

    default:
      return null;
  }
}

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH - 3) + '...';
}
