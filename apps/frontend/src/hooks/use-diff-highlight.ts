'use client';

import { useState, useEffect, useMemo } from 'react';
import { codeToTokens, type BundledLanguage } from 'shiki';
import { useTheme } from 'next-themes';

// ---------------------------------------------------------------------------
// Language detection from file extension
// ---------------------------------------------------------------------------

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  php: 'php',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  md: 'markdown',
  mdx: 'mdx',
  vue: 'vue',
  svelte: 'svelte',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  tf: 'hcl',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  proto: 'proto',
};

function getLanguageFromFilename(filename: string): string {
  const name = filename.toLowerCase();

  // Handle dotfiles and special names
  if (name === 'dockerfile' || name.endsWith('.dockerfile')) return 'dockerfile';
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
  if (name === '.env' || name.startsWith('.env.')) return 'bash';
  if (name === '.gitignore' || name === '.dockerignore') return 'bash';

  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  return EXT_TO_LANG[ext] || 'text';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HighlightedToken {
  content: string;
  color?: string;
}

/** A single line of highlighted tokens */
type HighlightedLine = HighlightedToken[];

// ---------------------------------------------------------------------------
// Max length guard — skip highlighting for very large diffs
// ---------------------------------------------------------------------------

const MAX_CODE_LENGTH = 50_000;

// ---------------------------------------------------------------------------
// Hook: useDiffHighlight
// ---------------------------------------------------------------------------

/**
 * Takes an array of raw code lines (without +/-/space prefixes) and a filename,
 * and returns syntax-highlighted token arrays for each line.
 *
 * Returns `null` while loading or if highlighting fails (callers should fall
 * back to plain text).
 */
export function useDiffHighlight(
  lines: string[],
  filename: string,
): HighlightedLine[] | null {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'github-dark' : 'github-light';
  const lang = useMemo(() => getLanguageFromFilename(filename), [filename]);

  const code = useMemo(() => lines.join('\n'), [lines]);

  const [highlighted, setHighlighted] = useState<HighlightedLine[] | null>(null);

  useEffect(() => {
    // Skip highlighting for very large diffs or plaintext
    if (!code || lang === 'text' || code.length > MAX_CODE_LENGTH) {
      setHighlighted(null);
      return;
    }

    let cancelled = false;

    codeToTokens(code, { lang: lang as BundledLanguage, theme })
      .then((result) => {
        if (cancelled) return;

        const tokenLines: HighlightedLine[] = result.tokens.map((lineTokens) =>
          lineTokens.map((token) => ({
            content: token.content,
            color: token.color,
          })),
        );

        setHighlighted(tokenLines);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn(`[useDiffHighlight] shiki failed for lang="${lang}":`, err?.message || err);
          setHighlighted(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, lang, theme]);

  return highlighted;
}

// ---------------------------------------------------------------------------
// Helper: render highlighted tokens as inline spans (for dangerouslySetInnerHTML)
// ---------------------------------------------------------------------------

/**
 * Renders a single highlighted line as a safe HTML string.
 * If `tokens` is undefined/null, returns the raw text escaped.
 */
export function renderHighlightedLine(
  tokens: HighlightedLine | undefined | null,
  fallbackText: string,
): string {
  if (!tokens || tokens.length === 0) {
    return escapeHtml(fallbackText);
  }

  return tokens
    .map((t) =>
      t.color
        ? `<span style="color:${t.color}">${escapeHtml(t.content)}</span>`
        : escapeHtml(t.content),
    )
    .join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

