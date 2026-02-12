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
  FileText,
  BookOpen,
  CalendarDays,
  Clock,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { cleanUrl } from '../utils';
import { truncateString } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { WebSearchLoadingState } from '../web-search-tool/WebSearchLoadingState';

// ============================================================================
// Parsing: websearch text output → structured results
// ============================================================================

interface WebSearchResult {
  title: string;
  url: string;
  author?: string;
  publishedDate?: string;
  text: string;
}

function parseWebSearchOutput(output: string): WebSearchResult[] {
  if (!output) return [];
  const blocks = output.split(/(?=^Title: )/m).filter(Boolean);
  const results: WebSearchResult[] = [];

  for (const block of blocks) {
    const titleMatch = block.match(/^Title:\s*(.+)/m);
    const urlMatch = block.match(/^URL:\s*(.+)/m);
    const authorMatch = block.match(/^Author:\s*(.+)/m);
    const dateMatch = block.match(/^Published Date:\s*(.+)/m);
    const textMatch = block.match(/^Text:\s*([\s\S]*?)$/m);
    if (titleMatch && urlMatch) {
      results.push({
        title: titleMatch[1].trim(),
        url: urlMatch[1].trim(),
        author: authorMatch?.[1]?.trim() || undefined,
        publishedDate: dateMatch?.[1]?.trim() || undefined,
        text: textMatch?.[1]?.trim() || '',
      });
    }
  }
  return results;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string | null {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return null;
  }
}

function getResultType(result: { url?: string; title?: string }) {
  const url = result.url || '';
  const title = result.title || '';
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();

  if (urlLower.includes('news') || urlLower.includes('article') || titleLower.includes('news')) {
    return { icon: FileText, label: 'Article' };
  } else if (urlLower.includes('wiki')) {
    return { icon: BookOpen, label: 'Wiki' };
  } else if (urlLower.includes('blog')) {
    return { icon: CalendarDays, label: 'Blog' };
  } else {
    return { icon: Globe, label: 'Website' };
  }
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
  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);

  const isError = toolResult?.success === false || !!toolResult?.error;
  const results = useMemo(() => parseWebSearchOutput(output), [output]);

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // --- Loading state: rich animated WebSearchLoadingState ---
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
          {results.length > 0 && (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0 ml-2">
              <Globe className="h-3 w-3 mr-1 opacity-70" />
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        {results.length > 0 ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 py-0 my-4">
              {/* Results header */}
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-4 flex items-center justify-between">
                <span>Search Results ({results.length})</span>
                <Badge variant="outline" className="text-xs font-normal">
                  <Clock className="h-3 w-3 mr-1.5 opacity-70" />
                  {new Date().toLocaleDateString()}
                </Badge>
              </div>

              {/* Result cards */}
              <div className="space-y-2.5">
                {results.map((result, i) => {
                  const favicon = getFaviconUrl(result.url);
                  const domain = getDomain(result.url);
                  const isExpanded = expandedIdx === i;
                  const { icon: ResultTypeIcon, label: resultTypeLabel } = getResultType(result);

                  return (
                    <div
                      key={i}
                      className="bg-card border border-border rounded-lg hover:border-border/80 hover:shadow-sm transition-all"
                    >
                      <div className="p-3.5">
                        <div className="flex items-start gap-2.5">
                          {/* Favicon */}
                          {favicon ? (
                            <img
                              src={favicon}
                              alt=""
                              className="w-5 h-5 mt-0.5 rounded flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Globe className="w-5 h-5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                          )}

                          <div className="flex-1 min-w-0">
                            {/* Type badge */}
                            <div className="flex items-center gap-1.5 mb-1">
                              <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-normal">
                                <ResultTypeIcon className="h-2.5 w-2.5 mr-1 opacity-70" />
                                {resultTypeLabel}
                              </Badge>
                              {result.publishedDate && (
                                <span className="text-[10px] text-muted-foreground/50">
                                  {result.publishedDate.split('T')[0]}
                                </span>
                              )}
                            </div>

                            {/* Title */}
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary hover:underline line-clamp-1 mb-1 block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {truncateString(cleanUrl(result.title), 60)}
                            </a>

                            {/* URL + author */}
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <div className="flex items-center">
                                <Globe className="h-3 w-3 mr-1 flex-shrink-0 opacity-60" />
                                <span className="truncate">{truncateString(domain, 40)}</span>
                              </div>
                              {result.author && (
                                <span className="text-muted-foreground/50 truncate">
                                  {result.author}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {result.text && (
                              <button
                                className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                              >
                                {isExpanded
                                  ? <ChevronDown className="w-3.5 h-3.5" />
                                  : <ChevronRight className="w-3.5 h-3.5" />
                                }
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded text preview */}
                      {isExpanded && result.text && (
                        <div className="border-t border-border/50 bg-muted/20 px-4 py-3 pl-12">
                          <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-6">
                            {result.text.slice(0, 800)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-zinc-100 to-zinc-50 shadow-inner dark:from-zinc-800/40 dark:to-zinc-900/60">
              <Search className="h-10 w-10 text-zinc-400 dark:text-zinc-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              No Results Found
            </h3>
            {query && (
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full max-w-md text-center mb-4 shadow-sm">
                <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">
                  {query}
                </code>
              </div>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Try refining your search query for better results
            </p>
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
          ) : results.length > 0 ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
              <CheckCircle className="h-3 w-3 text-zinc-600 dark:text-zinc-400" />
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </Badge>
          ) : null
        )}
      </ToolViewFooter>
    </Card>
  );
}
