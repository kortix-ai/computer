'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle,
  AlertCircle,
  Globe,
  ChevronRight,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { WebSearchLoadingState } from '../web-search-tool/WebSearchLoadingState';

// ============================================================================
// Types & Parsing
// ============================================================================

interface WebSearchSource {
  title: string;
  url: string;
  snippet?: string;
  author?: string;
  publishedDate?: string;
}

interface WebSearchQueryResult {
  query: string;
  answer?: string;
  sources: WebSearchSource[];
}

function parseWebSearchOutput(output: string | any): WebSearchQueryResult[] {
  if (!output) return [];

  // Handle both string and already-parsed object (+ double-encoded)
  let parsed: any = null;
  if (typeof output === 'object' && output !== null) {
    parsed = output;
  } else if (typeof output === 'string') {
    try {
      let result = JSON.parse(output);
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch { /* keep as-is */ }
      }
      parsed = typeof result === 'object' ? result : null;
    } catch {
      const trimmed = output.trim().replace(/^\uFEFF/, '');
      if (trimmed !== output) {
        try { parsed = JSON.parse(trimmed); } catch { /* not JSON */ }
      }
    }
  }

  if (parsed) {
    // Batch: { results: [{ query, answer, results: [...] }] }
    if (parsed.results && Array.isArray(parsed.results) && parsed.results.length > 0) {
      const firstItem = parsed.results[0];
      if (firstItem && typeof firstItem.query === 'string') {
        // Batch query results
        const qrs: WebSearchQueryResult[] = [];
        for (const r of parsed.results) {
          if (typeof r.query !== 'string') continue;
          const sources: WebSearchSource[] = [];
          if (Array.isArray(r.results)) {
            for (const s of r.results) {
              if (s.title && s.url) {
                sources.push({
                  title: s.title,
                  url: s.url,
                  snippet: s.snippet || s.content || s.text || undefined,
                  author: s.author || undefined,
                  publishedDate: s.publishedDate || s.published_date || undefined,
                });
              }
            }
          }
          qrs.push({ query: r.query, answer: r.answer || undefined, sources });
        }
        if (qrs.length > 0) return qrs;
      } else if (firstItem && (firstItem.title || firstItem.url)) {
        // Direct results array: { results: [{title, url, content}, ...] }
        const sources: WebSearchSource[] = [];
        for (const s of parsed.results) {
          if (s.title && s.url) {
            sources.push({
              title: s.title,
              url: s.url,
              snippet: s.snippet || s.content || s.text || undefined,
              author: s.author || undefined,
              publishedDate: s.publishedDate || s.published_date || undefined,
            });
          }
        }
        if (sources.length > 0) {
          return [{ query: parsed.query || '', answer: parsed.answer || undefined, sources }];
        }
      }
    }

    // Single: { query, answer, results: [...] }
    if (parsed.query && typeof parsed.query === 'string') {
      const sources: WebSearchSource[] = [];
      if (Array.isArray(parsed.results)) {
        for (const s of parsed.results) {
          if (s.title && s.url) {
            sources.push({
              title: s.title,
              url: s.url,
              snippet: s.snippet || s.content || s.text || undefined,
            });
          }
        }
      }
      return [{ query: parsed.query, answer: parsed.answer || undefined, sources }];
    }

    // Flat array: [{title, url, content}, ...]
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && (parsed[0].title || parsed[0].url)) {
      const sources: WebSearchSource[] = [];
      for (const s of parsed) {
        if (s.title && s.url) {
          sources.push({
            title: s.title,
            url: s.url,
            snippet: s.snippet || s.content || s.text || undefined,
            author: s.author || undefined,
            publishedDate: s.publishedDate || s.published_date || undefined,
          });
        }
      }
      if (sources.length > 0) return [{ query: '', sources }];
    }
  }

  // --- Plain text ---
  if (typeof output === 'string') {
    const blocks = output.split(/(?=^Title: )/m).filter(Boolean);
    const sources: WebSearchSource[] = [];
    for (const block of blocks) {
      const titleMatch = block.match(/^Title:\s*(.+)/m);
      const urlMatch = block.match(/^URL:\s*(.+)/m);
      const authorMatch = block.match(/^Author:\s*(.+)/m);
      const dateMatch = block.match(/^Published Date:\s*(.+)/m);
      const textMatch = block.match(/^Text:\s*([\s\S]*?)$/m);
      if (titleMatch && urlMatch) {
        sources.push({
          title: titleMatch[1].trim(),
          url: urlMatch[1].trim(),
          author: authorMatch?.[1]?.trim() || undefined,
          publishedDate: dateMatch?.[1]?.trim() || undefined,
          snippet: textMatch?.[1]?.trim() || undefined,
        });
      }
    }
    if (sources.length > 0) return [{ query: '', sources }];
  }
  return [];
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function getFaviconUrl(url: string): string | null {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`; } catch { return null; }
}

// ============================================================================
// Component
// ============================================================================

export function OcWebSearchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const query = (args.query as string) || (ocState?.input?.query as string) || '';
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : (typeof rawOutput === 'object' ? JSON.stringify(rawOutput, null, 2) : String(rawOutput));

  const isError = toolResult?.success === false || !!toolResult?.error;
  // Pass raw value to parser so it handles objects directly
  const queryResults = useMemo(() => parseWebSearchOutput(rawOutput), [rawOutput]);
  const totalSources = useMemo(() => queryResults.reduce((n, q) => n + q.sources.length, 0), [queryResults]);

  const [expandedQuery, setExpandedQuery] = useState<number | null>(
    queryResults.length === 1 ? 0 : null,
  );

  // --- Loading ---
  if (isStreaming && !toolResult) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Search} title="Web Search" subtitle={query} />
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
          <WebSearchLoadingState
            queries={query ? [query] : ['Searching...']}
            title="Searching the web"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Search} title="Web Search" subtitle={query} />
          {queryResults.length > 0 && (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0 ml-2">
              <Globe className="h-3 w-3 mr-1 opacity-70" />
              {queryResults.length > 1
                ? `${queryResults.length} queries`
                : `${totalSources} ${totalSources === 1 ? 'source' : 'sources'}`}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        {queryResults.length > 0 ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 space-y-3">
              {queryResults.map((qr, qi) => {
                const isMulti = queryResults.length > 1;
                const isExpanded = expandedQuery === qi;

                return (
                  <div
                    key={qi}
                    className="rounded-lg border border-border/60 bg-card overflow-hidden"
                  >
                    {/* Query header */}
                    {isMulti && (
                      <button
                        type="button"
                        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer text-left border-b border-border/30"
                        onClick={() => setExpandedQuery(isExpanded ? null : qi)}
                      >
                        <Search className="size-3.5 text-primary/60 flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate flex-1">
                          {qr.query}
                        </span>
                        {qr.sources.length > 0 && (
                          <Badge variant="outline" className="h-5 text-[10px] px-1.5 font-normal flex-shrink-0">
                            {qr.sources.length} {qr.sources.length === 1 ? 'source' : 'sources'}
                          </Badge>
                        )}
                        {isExpanded
                          ? <ChevronDown className="size-3.5 text-muted-foreground/50 flex-shrink-0" />
                          : <ChevronRight className="size-3.5 text-muted-foreground/50 flex-shrink-0" />
                        }
                      </button>
                    )}

                    {/* Answer + Sources */}
                    {(!isMulti || isExpanded) && (
                      <div className="p-4">
                        {/* AI Answer */}
                        {qr.answer && (
                          <div className="mb-4">
                            <p className="text-sm leading-relaxed text-foreground/85">
                              {qr.answer}
                            </p>
                          </div>
                        )}

                        {/* Sources */}
                        {qr.sources.length > 0 && (
                          <div className="space-y-1.5">
                            {qr.answer && (
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
                                Sources
                              </div>
                            )}
                            {qr.sources.map((src, si) => {
                              const favicon = getFaviconUrl(src.url);
                              const domain = getDomain(src.url);
                              return (
                                <a
                                  key={si}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group flex items-start gap-3 p-3 -mx-1 rounded-lg hover:bg-muted/40 transition-colors"
                                >
                                  <div className="size-6 rounded-md bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                                    {favicon ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={favicon}
                                        alt=""
                                        className="size-4 rounded"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    ) : (
                                      <Globe className="size-3.5 text-muted-foreground/50" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                      {src.title}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs text-muted-foreground/50 font-mono truncate">
                                        {domain}
                                      </span>
                                      {src.author && (
                                        <span className="text-xs text-muted-foreground/40 truncate">
                                          {src.author}
                                        </span>
                                      )}
                                      {src.publishedDate && (
                                        <span className="text-[10px] text-muted-foreground/40">
                                          {src.publishedDate.split('T')[0]}
                                        </span>
                                      )}
                                    </div>
                                    {src.snippet && (
                                      <p className="text-xs text-muted-foreground/60 leading-relaxed line-clamp-2 mt-1.5">
                                        {src.snippet.slice(0, 300)}
                                      </p>
                                    )}
                                  </div>
                                  <ExternalLink className="size-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/50 flex-shrink-0 mt-1 transition-colors" />
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : output && !isError ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 text-sm text-muted-foreground whitespace-pre-wrap">
              {output.slice(0, 2000)}
            </div>
          </ScrollArea>
        ) : isError ? (
          <div className="flex items-start gap-2.5 px-4 py-6 text-muted-foreground">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{output || 'Search failed'}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No results found</p>
          </div>
        )}
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && (
          isError ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900 text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : totalSources > 0 ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
              <CheckCircle className="h-3 w-3 text-zinc-600 dark:text-zinc-400" />
              {totalSources} {totalSources === 1 ? 'source' : 'sources'}
            </Badge>
          ) : null
        )}
      </ToolViewFooter>
    </Card>
  );
}
