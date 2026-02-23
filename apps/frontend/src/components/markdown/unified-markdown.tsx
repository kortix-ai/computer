'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Streamdown } from 'streamdown';
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, Globe, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { codeToHtml } from 'shiki';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { MermaidRenderer } from '@/components/ui/mermaid-renderer';
import { isMermaidCode } from '@/lib/mermaid-utils';
import { autoLinkUrls } from '@kortix/shared';
import { useOcFileOpen } from '@/components/thread/tool-views/opencode/useOcFileOpen';
import { useServerStore, getActiveOpenCodeUrl, deriveSubdomainOpts } from '@/stores/server-store';
import { proxyLocalhostUrl, parseLocalhostUrl, toInternalUrl } from '@/lib/utils/sandbox-url';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useAuthenticatedPreviewUrl } from '@/hooks/use-authenticated-preview-url';

// Helper to check if a URL is internal (same origin)
function isInternalUrl(href: string | undefined): boolean {
  if (!href) return false;

  // External URLs (http/https/mailto/tel)
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return false;
  }

  // Protocol links (mailto, tel, etc.)
  if (href.includes('://')) {
    return false;
  }

  // Internal links (starting with / or #)
  return href.startsWith('/') || href.startsWith('#');
}

// Helper to handle hash link clicks for smooth scrolling
function handleHashClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (href.startsWith('#')) {
    e.preventDefault();
    const targetId = href.substring(1);
    const element = document.getElementById(targetId);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// ---------------------------------------------------------------------------
// InlineLocalhostPreview — mini preview card rendered inside markdown text
// ---------------------------------------------------------------------------

/**
 * A compact, inline preview widget for localhost URLs detected in markdown.
 * Shows the URL chip at the top and a small iframe preview below it.
 * Clicking the chip or the iframe overlay opens the full preview tab.
 */
function InlineLocalhostPreview({
  port,
  path,
  proxyUrl,
}: {
  port: number;
  path: string;
  proxyUrl: string;
}) {
  const authenticatedUrl = useAuthenticatedPreviewUrl(proxyUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const internalUrl = toInternalUrl(port, path);
  const tabId = `preview:${port}`;
  const tabHref = `/preview/${port}`;

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleLoad = useCallback(() => {
    clearLoadTimeout();
    setIsLoading(false);
  }, [clearLoadTimeout]);

  const handleError = useCallback(() => {
    clearLoadTimeout();
    setIsLoading(false);
    setHasError(true);
  }, [clearLoadTimeout]);

  const handleRefresh = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    setHasError(false);
    setRefreshKey((k) => k + 1);
  }, []);

  // Fallback: cross-origin iframes may not fire onLoad. Clear loading after 5s.
  useEffect(() => {
    if (!isLoading) return;
    clearLoadTimeout();
    loadTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
    }, 5000);
    return clearLoadTimeout;
  }, [isLoading, refreshKey, clearLoadTimeout]);

  const navigateToPreviewTab = useCallback(() => {
    openTabAndNavigate({
      id: tabId,
      title: `localhost:${port}`,
      type: 'preview',
      href: tabHref,
      metadata: {
        url: proxyUrl,
        port,
        originalUrl: internalUrl,
        path,
      },
    });
  }, [tabId, port, tabHref, proxyUrl, internalUrl, path]);

  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  return (
    <div className="my-3">
      <div
        className={cn(
          'group/preview relative rounded-xl border border-border/50 bg-muted/20 overflow-hidden',
          'transition-all duration-200 hover:border-border/80 hover:bg-muted/30',
        )}
      >
        {/* Header bar — clicking it collapses/expands the preview */}
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
          onClick={handleToggleCollapse}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 flex-shrink-0 text-muted-foreground/60" />
          ) : (
            <ChevronDown className="size-3.5 flex-shrink-0 text-muted-foreground/60" />
          )}
          <Globe className="size-3.5 flex-shrink-0 text-primary" />
          <span className="text-xs font-medium text-foreground tabular-nums">
            localhost:{port}
          </span>
          {path !== '/' && (
            <span className="text-xs text-muted-foreground font-mono truncate">
              {path}
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            {!collapsed && (
              <>
                <button
                  onClick={handleRefresh}
                  className="p-1 rounded cursor-pointer hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
                </button>
                <button
                  onClick={handleToggleExpand}
                  className="p-1 rounded cursor-pointer hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  title={expanded ? 'Collapse' : 'Expand'}
                >
                  {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </button>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); navigateToPreviewTab(); }}
              className="p-1 rounded cursor-pointer hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              title="Open in preview tab"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Iframe preview — hidden when collapsed */}
        {!collapsed && (
          <div
            className={cn(
              'relative border-t border-border/30 transition-all duration-200',
              expanded ? 'h-[520px]' : 'h-[300px]',
            )}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-[11px]">Loading preview...</span>
                </div>
              </div>
            )}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                <div className="text-center text-muted-foreground">
                  <p className="text-xs">Failed to load preview</p>
                  <button
                    onClick={handleRefresh}
                    className="text-xs text-primary hover:underline mt-1 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
            {/* Clickable overlay on top of iframe to open preview tab */}
            <div
              className="absolute inset-0 z-[5] cursor-pointer"
              onClick={navigateToPreviewTab}
            />
            <iframe
              key={refreshKey}
              src={authenticatedUrl}
              title={`Preview :${port}`}
              className="w-full h-full border-0 bg-white pointer-events-none"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
              onLoad={handleLoad}
              onError={handleError}
              tabIndex={-1}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Copy button component for code blocks
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [code]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "absolute top-3 right-3 p-1.5 rounded-md",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        "bg-zinc-200/80 hover:bg-zinc-300 dark:bg-zinc-700/80 dark:hover:bg-zinc-600",
        "text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
        "focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
      )}
      aria-label={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

// Maximum code length for Shiki syntax highlighting (characters).
// Very large code blocks are expensive to highlight — truncate to keep UI responsive.
const SHIKI_MAX_LENGTH = 50_000;

// Normalise language aliases that Shiki might not recognise directly
function normalizeLanguage(lang: string): string {
  const map: Record<string, string> = {
    'htm': 'html',
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'jsx',
    'tsx': 'tsx',
    'py': 'python',
    'rb': 'ruby',
    'yml': 'yaml',
    'sh': 'bash',
    'shell': 'bash',
    'zsh': 'bash',
    'md': 'markdown',
  };
  return map[lang.toLowerCase()] || lang.toLowerCase();
}

// Syntax-highlighted code using Shiki
//
// Module-level cache so highlighted HTML survives component remounts
// (streamdown unmounts/remounts code components on every token).
// Also acts as a coalescing mechanism: only one Shiki call per unique
// (code, lang, theme) triple is ever in-flight.
const shikiCache = new Map<string, string>();      // key → html
const shikiPending = new Map<string, Promise<string | null>>(); // key → in-flight promise
const SHIKI_CACHE_MAX = 64;

// Module-level: last highlighted result per language+theme.
// Survives component remounts (which happen every ~33ms during streaming
// because Streamdown unmounts/remounts code components on each token).
// Without this, every mount starts with no highlight state and the
// component-level debounce (100ms) is killed before it can fire (~33ms remount cycle).
const lastHighlightedMap = new Map<string, { html: string; code: string }>();

// Module-level throttle for Shiki calls during streaming.
// Ensures we highlight at most once per 200ms per language+theme combination,
// surviving component remounts. Without this, the component-level debounce
// is always killed by the ~33ms remount cycle, preventing any highlighting.
const hlThrottleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hlThrottleLatest = new Map<string, { code: string; language: string; theme: string }>();

function scheduleModuleHighlight(code: string, language: string, theme: string) {
  const key = `${language}:${theme}`;
  hlThrottleLatest.set(key, { code, language, theme });

  // If timer already running, just update the latest code and wait
  if (hlThrottleTimers.has(key)) return;

  hlThrottleTimers.set(key, setTimeout(() => {
    hlThrottleTimers.delete(key);
    const latest = hlThrottleLatest.get(key);
    if (!latest) return;
    hlThrottleLatest.delete(key);

    highlightAsync(latest.code, latest.language, latest.theme).then((html) => {
      if (html) {
        lastHighlightedMap.set(key, { html, code: latest.code });
      }
    });
  }, 200));
}

function shikiKey(code: string, lang: string, theme: string) {
  // Use a fast hash: first 100 + last 100 chars + length.
  // Full code only matters for very small snippets.
  const sig = code.length <= 200
    ? code
    : code.slice(0, 100) + code.slice(-100) + code.length;
  return `${lang}:${theme}:${sig}`;
}

function evictOldest() {
  if (shikiCache.size > SHIKI_CACHE_MAX) {
    const first = shikiCache.keys().next().value;
    if (first !== undefined) shikiCache.delete(first);
  }
}

function highlightAsync(code: string, language: string, theme: string): Promise<string | null> {
  const key = shikiKey(code, language, theme);
  const cached = shikiCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = shikiPending.get(key);
  if (pending) return pending;

  const normalizedLang = normalizeLanguage(language);
  const truncated = code.length > SHIKI_MAX_LENGTH
    ? code.slice(0, SHIKI_MAX_LENGTH) + '\n// ... (truncated for highlighting)'
    : code;

  const p = codeToHtml(truncated, {
    lang: normalizedLang,
    theme,
    transformers: [{
      pre(node) {
        if (node.properties.style) {
          node.properties.style = (node.properties.style as string)
            .replace(/background-color:[^;]+;?/g, '');
        }
      },
    }],
  })
    .then((html) => {
      evictOldest();
      shikiCache.set(key, html);
      shikiPending.delete(key);
      return html;
    })
    .catch((err) => {
      console.warn(`[HighlightedCode] Shiki failed for lang="${normalizedLang}":`, err?.message || err);
      shikiPending.delete(key);
      return null;
    });

  shikiPending.set(key, p);
  return p;
}

// Find the best cached HTML for the current code by checking if any
// cache entry is a prefix match (the code was shorter earlier during streaming).
function findBestCachedHtml(code: string, language: string, theme: string): string | null {
  // Exact match first
  const exact = shikiCache.get(shikiKey(code, language, theme));
  if (exact) return exact;
  // Module-level prefix match from last highlighted result
  const hlKey = `${language}:${theme}`;
  const last = lastHighlightedMap.get(hlKey);
  if (last && code.startsWith(last.code) && last.code.length > 0) return last.html;
  return null;
}

export function HighlightedCode({ code, language, children }: { code: string; language: string; children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'github-dark' : 'github-light';
  const hlKey = `${language}:${theme}`;

  // Track the latest highlighted HTML and the code it corresponds to.
  // During streaming, code changes rapidly — we keep the previous highlight
  // visible until a new one is ready (no flash to plain text).
  //
  // The initialiser checks both the Shiki cache AND the module-level
  // lastHighlightedMap for prefix matches — this is critical because
  // Streamdown remounts this component on every token during streaming,
  // destroying component state each time.
  const [highlighted, setHighlighted] = useState<{ html: string; code: string } | null>(() => {
    // Exact cache hit
    const cached = shikiCache.get(shikiKey(code, language, theme));
    if (cached) return { html: cached, code };
    // Module-level prefix match (from a previous Shiki call during streaming)
    const last = lastHighlightedMap.get(hlKey);
    if (last && code.startsWith(last.code) && last.code.length > 0) return last;
    return null;
  });
  const versionRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Exact cache hit — show immediately and update module state
    const cached = shikiCache.get(shikiKey(code, language, theme));
    if (cached) {
      const result = { html: cached, code };
      setHighlighted(result);
      lastHighlightedMap.set(hlKey, result);
      return;
    }

    // Check module-level state for a better prefix match than current
    const last = lastHighlightedMap.get(hlKey);
    if (last && code.startsWith(last.code) && last.code.length > 0) {
      setHighlighted(prev => {
        if (!prev || last.code.length > prev.code.length || !code.startsWith(prev.code)) return last;
        return prev;
      });
    }

    const version = ++versionRef.current;

    // Schedule module-level throttled highlight (survives component remounts).
    // During streaming, Streamdown remounts this component every ~33ms which
    // kills any component-level timers. The module-level throttle fires every
    // ~200ms regardless, populating shikiCache and lastHighlightedMap so the
    // next mount picks up the result via the useState initialiser above.
    scheduleModuleHighlight(code, language, theme);

    // Also schedule a component-level debounced highlight for when the component
    // is stable (after streaming ends, component is no longer remounted by Streamdown).
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      highlightAsync(code, language, theme).then((result) => {
        if (version === versionRef.current && result) {
          const r = { html: result, code };
          lastHighlightedMap.set(hlKey, r);
          setHighlighted(r);
        }
      });
    }, 100);

    return () => clearTimeout(debounceRef.current);
  }, [code, language, theme, hlKey]);

  // If we have a highlight for the EXACT current code, show it
  if (highlighted && highlighted.code === code) {
    return (
      <code
        className="text-[13px] font-mono leading-relaxed whitespace-pre [&_pre]:contents [&_code]:contents"
        dangerouslySetInnerHTML={{ __html: highlighted.html }}
      />
    );
  }

  // If we have a highlight for a PREFIX of the current code (streaming — code grew),
  // show the highlighted prefix + plain text tail
  if (highlighted && code.startsWith(highlighted.code) && highlighted.code.length > 0) {
    const tail = code.slice(highlighted.code.length);
    return (
      <code className="text-[13px] font-mono leading-relaxed whitespace-pre [&_pre]:contents [&_code]:contents">
        <span dangerouslySetInnerHTML={{ __html: highlighted.html }} />
        {tail && <span className="text-inherit">{tail}</span>}
      </code>
    );
  }

  // No matching highlight yet — show plain text
  return (
    <code className="text-[13px] font-mono leading-relaxed text-inherit whitespace-pre">
      {children}
    </code>
  );
}

// Code block component with copy functionality
function CodeBlock({ children, isStreaming }: { children: React.ReactNode; isStreaming?: boolean }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [codeText, setCodeText] = useState('');

  useEffect(() => {
    if (preRef.current) {
      const codeElement = preRef.current.querySelector('code');
      if (codeElement) {
        const text = codeElement.textContent || '';
        setCodeText(text.trim());
      }
    }
  }, [children]);

  return (
    <div className="relative group my-5">
      <pre
        ref={preRef}
        className={cn(
          "p-4 rounded-xl overflow-x-auto",
          "bg-zinc-100 dark:bg-zinc-900",
          "border border-zinc-200 dark:border-zinc-800",
          "text-[13px] font-mono leading-relaxed",
          "text-zinc-800 dark:text-zinc-200",
          "[&_code]:bg-transparent [&_code]:text-inherit [&_code]:p-0"
        )}
      >
        {children}
      </pre>
      {codeText && !isStreaming && <CopyButton code={codeText} />}
    </div>
  );
}

// File extension patterns for detecting clickable file paths in inline code
const FILE_EXTENSION_RE = /\.\w{1,10}$/;
const COMMON_NON_FILES = new Set(['e.g.', 'i.e.', 'etc.', 'vs.', 'v1.', 'v2.']);

/** Heuristic: does this inline code text look like a file path? */
function looksLikeFilePath(text: string): boolean {
  if (!text || text.length < 3 || text.length > 300) return false;
  if (text.includes(' ') || text.includes('\n')) return false;
  if (COMMON_NON_FILES.has(text.toLowerCase())) return false;
  // Must contain at least one slash and have a file extension
  if (!text.includes('/')) return false;
  return FILE_EXTENSION_RE.test(text);
}

/** Inline code that opens file in computer panel when it looks like a file path */
function ClickableInlineCode({ children }: { children: React.ReactNode }) {
  const { openFile } = useOcFileOpen();
  const text = String(children);
  const isFile = looksLikeFilePath(text);

  if (isFile) {
    return (
      <code
        className="px-1.5 py-0.5 rounded-md text-[13px] font-mono bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/50 text-foreground cursor-pointer hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:border-blue-700/50 dark:hover:text-blue-400 transition-colors"
        onClick={() => openFile(text)}
        title={`Open ${text}`}
        role="button"
      >
        {children}
      </code>
    );
  }

  return (
    <code className="px-1.5 py-0.5 rounded-md text-[13px] font-mono bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/50 text-foreground">
      {children}
    </code>
  );
}

/**
 * Standalone syntax-highlighted code block.
 *
 * Renders code directly with Shiki highlighting + copy button, bypassing the
 * markdown parser entirely. Useful for tool views that display raw file
 * content where markdown parsing could interfere with the output.
 */
export function CodeHighlight({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  return (
    <div className={cn('relative group', className)}>
      <pre
        className={cn(
          'p-4 rounded-xl overflow-x-auto',
          'bg-zinc-100 dark:bg-zinc-900',
          'border border-zinc-200 dark:border-zinc-800',
          'text-[13px] font-mono leading-relaxed',
          'text-zinc-800 dark:text-zinc-200',
          '[&_code]:bg-transparent [&_code]:text-inherit [&_code]:p-0',
        )}
      >
        <HighlightedCode code={code} language={language}>
          {code}
        </HighlightedCode>
      </pre>
      {code && <CopyButton code={code} />}
    </div>
  );
}

export interface UnifiedMarkdownProps {
  content: string;
  className?: string;
  isStreaming?: boolean; // Enable streaming animation for incomplete markdown
}

/**
 * UNIFIED MARKDOWN RENDERER
 *
 * Single source of truth for all markdown rendering across the application.
 * Optimized for Kortix brand with Vercel-level UX/UI polish.
 *
 * Design principles:
 * - Clean, minimal aesthetic
 * - Consistent spacing rhythm
 * - Excellent readability in light & dark modes
 * - Brand-aligned colors and border radius
 */
export const UnifiedMarkdown = React.memo<UnifiedMarkdownProps>(({
  content,
  className,
  isStreaming = false,
}) => {
  // Resolve the active sandbox server so we can proxy localhost URLs
  const activeServer = useServerStore((s) =>
    s.servers.find((srv) => srv.id === s.activeServerId) ?? null,
  );
  const serverUrl = activeServer?.url || getActiveOpenCodeUrl();
  const subdomainOpts = useMemo(() => deriveSubdomainOpts(activeServer), [activeServer]);

  /** Rewrite a localhost:PORT URL through the sandbox proxy, or pass through. */
  const proxy = useCallback(
    (url: string | undefined) => proxyLocalhostUrl(url, serverUrl, undefined, subdomainOpts),
    [serverUrl, subdomainOpts],
  );

  // Memoize the Streamdown components object so that Block's React.memo
  // comparator sees stable function references for unchanged blocks.
  // Without this, every content change (every ~33ms during streaming) creates
  // new inline arrow functions → Block comparator fails reference equality →
  // ALL blocks re-render → browser Selection/Range destroyed → text unselected.
  // With memoized components, only the LAST block (whose content actually changed)
  // re-renders, while completed blocks keep their DOM intact, preserving selection.
  const components = useMemo(() => ({
    // ═══════════════════════════════════════════════════════════════
    // HEADINGS - Clean hierarchy with proper weight distribution
    // ═══════════════════════════════════════════════════════════════
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-4 first:mt-0 pb-2 border-b border-border/40">
        {children}
      </h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-xl font-semibold tracking-tight text-foreground mt-8 mb-3 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-lg font-semibold text-foreground mt-6 mb-2 first:mt-0">
        {children}
      </h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="text-base font-semibold text-foreground mt-5 mb-2 first:mt-0">
        {children}
      </h4>
    ),
    h5: ({ children }: { children?: React.ReactNode }) => (
      <h5 className="text-sm font-semibold text-foreground mt-4 mb-1 first:mt-0">
        {children}
      </h5>
    ),
    h6: ({ children }: { children?: React.ReactNode }) => (
      <h6 className="text-sm font-medium text-muted-foreground mt-4 mb-1 first:mt-0 uppercase tracking-wide">
        {children}
      </h6>
    ),

    // ═══════════════════════════════════════════════════════════════
    // PARAGRAPHS - Optimal line height for readability
    // ═══════════════════════════════════════════════════════════════
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-sm text-foreground leading-relaxed my-4 first:mt-0 last:mb-0 [&:has(img)]:my-0">
        {children}
      </p>
    ),

    // ═══════════════════════════════════════════════════════════════
    // LISTS - Clean bullets with proper spacing
    // ═══════════════════════════════════════════════════════════════
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="my-4 ml-6 list-disc marker:text-muted-foreground/60 space-y-2 first:mt-0 last:mb-0 text-sm">
        {children}
      </ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="my-4 ml-6 list-decimal marker:text-muted-foreground/60 marker:font-medium space-y-2 first:mt-0 last:mb-0 text-sm">
        {children}
      </ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="text-sm text-foreground leading-relaxed pl-1">
        {children}
      </li>
    ),

    // ═══════════════════════════════════════════════════════════════
    // LINKS - Subtle, professional styling with Next.js routing
    // ═══════════════════════════════════════════════════════════════
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      // Note: localhost:PORT click interception is handled globally by
      // <LocalhostLinkInterceptor> — no per-link proxy logic needed here.
      // We still set the proxied href so the browser status bar / hover
      // tooltip shows the reachable URL.
      const resolvedHref = proxy(href) ?? href;
      const isInternal = isInternalUrl(resolvedHref);
      const isHashLink = resolvedHref?.startsWith('#');
      const localhostParsed = parseLocalhostUrl(href);
      const linkClassName = cn(
        "font-medium text-foreground",
        "underline decoration-foreground/30 underline-offset-[3px] decoration-[1px]",
        "hover:decoration-foreground/60 transition-colors duration-150"
      );

      if (isHashLink) {
        return (
          <a
            href={resolvedHref}
            onClick={(e) => handleHashClick(e, resolvedHref ?? '')}
            className={linkClassName}
          >
            {children}
          </a>
        );
      }

      // Render localhost links as inline preview cards with mini iframe
      if (localhostParsed) {
        return (
          <InlineLocalhostPreview
            port={localhostParsed.port}
            path={localhostParsed.path}
            proxyUrl={resolvedHref ?? href ?? ''}
          />
        );
      }

      if (isInternal) {
        return (
          <Link
            href={resolvedHref || '#'}
            className={linkClassName}
          >
            {children}
          </Link>
        );
      }

      return (
        <a
          href={resolvedHref}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {children}
        </a>
      );
    },

    // ═══════════════════════════════════════════════════════════════
    // CODE - Clean, readable code styling with copy button
    // ═══════════════════════════════════════════════════════════════
    code: ({ children, className: codeClassName }: { children?: React.ReactNode; className?: string }) => {
      const match = /language-(\w+)/.exec(codeClassName || '');
      const language = match ? match[1] : '';
      const code = String(children).replace(/\n$/, '');

      // Detect block code: has language class OR contains newlines (multi-line)
      const hasLanguageClass = codeClassName?.includes('language-');
      const isMultiLine = code.includes('\n');
      const isBlock = hasLanguageClass || isMultiLine;

      if (isBlock) {
        // Mermaid diagrams
        if (isMermaidCode(language, code)) {
          return <MermaidRenderer chart={code} className="my-5" />;
        }

        // Syntax-highlighted block code
        if (language) {
          return <HighlightedCode code={code} language={language}>{children}</HighlightedCode>;
        }

        // Block code without language - plain mono font
        return (
          <code className="text-[13px] font-mono leading-relaxed text-inherit whitespace-pre">
            {children}
          </code>
        );
      }

      // Inline code - subtle pill style, clickable if it looks like a file path
      return <ClickableInlineCode>{children}</ClickableInlineCode>;
    },
    pre: ({ children }: { children?: React.ReactNode }) => <CodeBlock isStreaming={isStreaming}>{children}</CodeBlock>,

    // ═══════════════════════════════════════════════════════════════
    // BLOCKQUOTES - Clean side border
    // ═══════════════════════════════════════════════════════════════
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className={cn(
        "my-5 pl-4 py-1 text-sm",
        "border-l-2 border-border",
        "text-muted-foreground",
        "[&>p]:my-2"
      )}>
        {children}
      </blockquote>
    ),

    // ═══════════════════════════════════════════════════════════════
    // HORIZONTAL RULE - Subtle divider
    // ═══════════════════════════════════════════════════════════════
    hr: () => (
      <hr className="my-8 border-0 h-px bg-border/60" />
    ),

    // ═══════════════════════════════════════════════════════════════
    // TABLES - Clean, modern table design
    // ═══════════════════════════════════════════════════════════════
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="my-5 overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-muted/50 dark:bg-muted/30 border-b border-border/60">
        {children}
      </thead>
    ),
    tbody: ({ children }: { children?: React.ReactNode }) => (
      <tbody className="divide-y divide-border/40">
        {children}
      </tbody>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className="transition-colors hover:bg-muted/30">
        {children}
      </tr>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
        {children}
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="px-4 py-3 text-foreground">
        {children}
      </td>
    ),

    // ═══════════════════════════════════════════════════════════════
    // IMAGES - Polished with proper spacing and rounded corners
    // ═══════════════════════════════════════════════════════════════
    img: ({ src, alt }: { src?: string; alt?: string }) => {
      // Don't render img with empty src to avoid browser warning
      if (!src) return null;
      // Proxy localhost:PORT image sources through the sandbox proxy
      const resolvedSrc = proxy(src) ?? src;
      return (
        <span className="block my-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedSrc}
            alt={alt || ''}
            className={cn(
              "max-w-full h-auto rounded-xl",
              "border border-border/40",
              ""
            )}
            loading="lazy"
          />
          {alt && (
            <span className="block mt-2 text-center text-sm text-muted-foreground">
              {alt}
            </span>
          )}
        </span>
      );
    },

    // ═══════════════════════════════════════════════════════════════
    // TEXT FORMATTING - Proper emphasis styling
    // ═══════════════════════════════════════════════════════════════
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-foreground">
        {children}
      </strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="italic text-foreground/90">
        {children}
      </em>
    ),
    del: ({ children }: { children?: React.ReactNode }) => (
      <del className="line-through text-muted-foreground decoration-muted-foreground/50">
        {children}
      </del>
    ),

    // ═══════════════════════════════════════════════════════════════
    // TASK LISTS - Checkbox styling (GFM)
    // ═══════════════════════════════════════════════════════════════
    input: ({ checked, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className={cn(
          "mr-2 h-4 w-4 rounded border-border",
          "accent-secondary cursor-default",
          "align-middle relative -top-[1px]"
        )}
        {...props}
      />
    ),

    // ═══════════════════════════════════════════════════════════════
    // RAW HTML SUPPORT (GFM allows raw HTML)
    // ═══════════════════════════════════════════════════════════════
    div: ({ children, style, className: divClassName, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div
        className={cn("text-sm text-foreground", divClassName)}
        style={style as React.CSSProperties}
        {...props}
      >
        {children}
      </div>
    ),
    span: ({ children, style, className: spanClassName, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span
        className={cn("text-foreground", spanClassName)}
        style={style as React.CSSProperties}
        {...props}
      >
        {children}
      </span>
    ),
  }), [isStreaming, proxy]);

  const safeContent = typeof content === 'string' ? content : (content ? String(content) : '');

  if (!safeContent) {
    return (
      <div className={cn('text-muted-foreground text-sm', className)}>
        No content
      </div>
    );
  }

  // Auto-link plain URLs before rendering
  const processedContent = autoLinkUrls(safeContent);

  return (
    <div
      className={cn('kortix-markdown', isStreaming && 'streaming-active', className)}
      data-streaming={isStreaming ? 'true' : 'false'}
    >
      <Streamdown
        isAnimating={isStreaming}
        mode="static"
        components={components}
      >
        {processedContent}
      </Streamdown>
    </div>
  );
});

UnifiedMarkdown.displayName = 'UnifiedMarkdown';
