import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Globe,
  Maximize2,
  Type,
  Sparkles,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { cleanUrl, getToolTitle } from '../utils';
import { truncateString } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { WebSearchLoadingState } from './WebSearchLoadingState';
import { extractWebSearchData, EnrichedImage } from './_utils';
import { useSmoothToolField } from '@/hooks/messages';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// --- Helpers ---

function getFavicon(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return null;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// --- Sub-components ---

/** Single source row */
function SourceRow({ result }: { result: { title: string; url: string; snippet?: string } }) {
  const favicon = getFavicon(result.url);
  const domain = getDomain(result.url);

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors"
    >
      <div className="size-7 rounded-md bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden border border-border/30">
        {favicon ? (
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
          {result.title}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-muted-foreground/60 font-mono truncate">
            {domain}
          </span>
        </div>
        {result.snippet && (
          <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2 mt-1.5">
            {result.snippet.slice(0, 300)}
          </p>
        )}
      </div>
      <ExternalLink className="size-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/50 flex-shrink-0 mt-1.5 transition-colors" />
    </a>
  );
}

/** Answer card */
function AnswerBlock({ answer }: { answer: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="size-5 rounded-md bg-primary/10 flex items-center justify-center">
          <Sparkles className="size-3 text-primary" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          AI Answer
        </span>
      </div>
      <p className="text-sm leading-relaxed text-foreground/85">
        {answer}
      </p>
    </div>
  );
}

/** Image grid for image search results */
function ImageGrid({
  images,
  compact = false,
}: {
  images: EnrichedImage[];
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-2.5 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
      {images.map((image, idx) => {
        const imageUrl = image.url || image.imageUrl || '';
        const hasDescription = image.description && image.description.trim().length > 0;
        const hasDimensions = image.width && image.height && image.width > 0 && image.height > 0;
        const orientation = hasDimensions
          ? (image.width! > image.height! ? 'landscape' : image.width! < image.height! ? 'portrait' : 'square')
          : null;

        return (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded-lg border border-border/40 bg-muted/30 hover:border-primary/30 transition-all shadow-sm hover:shadow-md"
                >
                  <img
                    src={imageUrl}
                    alt={image.title || `Search result ${idx + 1}`}
                    className="object-cover w-full h-28 group-hover:opacity-90 transition-opacity"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
                      target.classList.add("p-4");
                    }}
                  />
                  <div className="absolute top-0 left-0 right-0 p-1 flex justify-between items-start">
                    <div className="flex gap-1">
                      {hasDimensions && (
                        <Badge variant="secondary" className="bg-black/60 hover:bg-black/70 text-white border-none shadow-md text-[10px] px-1.5 py-0">
                          <Maximize2 className="h-2.5 w-2.5 mr-0.5" />
                          {image.width}&times;{image.height}
                        </Badge>
                      )}
                      {hasDescription && (
                        <Badge variant="secondary" className="bg-emerald-600/80 hover:bg-emerald-600/90 text-white border-none shadow-md text-[10px] px-1.5 py-0">
                          <Type className="h-2.5 w-2.5" />
                        </Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="bg-black/60 hover:bg-black/70 text-white border-none shadow-md">
                      <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </div>
                  {(image.title || image.source) && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-4">
                      <p className="text-[10px] text-white/90 truncate leading-tight">
                        {image.title || image.source}
                      </p>
                    </div>
                  )}
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1.5">
                  {image.title && <p className="font-medium text-sm">{truncateString(image.title, 60)}</p>}
                  {hasDimensions && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Maximize2 className="h-3 w-3" />
                      {image.width} &times; {image.height}px
                      {orientation && <span className="text-xs">({orientation})</span>}
                    </p>
                  )}
                  {hasDescription && (
                    <div className="text-xs">
                      <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
                        <Type className="h-3 w-3" /> Description:
                      </p>
                      <p className="text-foreground bg-muted/50 rounded px-1.5 py-1 font-mono text-[10px] max-h-20 overflow-auto">
                        {truncateString(image.description || '', 150)}
                      </p>
                    </div>
                  )}
                  {image.source && (
                    <p className="text-xs text-muted-foreground">Source: {image.source}</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// --- Main Component ---

export function WebSearchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const [currentQueryIndex, setCurrentQueryIndex] = useState(0);

  // Smooth text streaming for query field
  const rawArguments = toolCall?.rawArguments || toolCall?.arguments;
  const smoothFields = useSmoothToolField(
    typeof rawArguments === 'object' && rawArguments ? rawArguments : {},
    { interval: 50 }
  );
  const smoothQuery = (smoothFields as any).query || (typeof rawArguments === 'object' ? rawArguments?.query : '') || '';

  const {
    query,
    searchResults,
    answer,
    images,
    actualIsSuccess,
    actualToolTimestamp,
    actualAssistantTimestamp,
    isBatch,
    batchResults
  } = extractWebSearchData(toolCall, toolResult, isSuccess, toolTimestamp, assistantTimestamp);

  const displayQuery = isStreaming && smoothQuery ? smoothQuery : query;

  // Reset to first query when batch results change
  useEffect(() => {
    if (isBatch && batchResults && batchResults.length > 0) {
      setCurrentQueryIndex(0);
    }
  }, [isBatch, batchResults?.length]);

  const safeQueryIndex = batchResults && batchResults.length > 0
    ? Math.min(currentQueryIndex, batchResults.length - 1)
    : 0;

  const currentBatchItem = batchResults?.[safeQueryIndex];

  const name = toolCall.function_name.replace(/_/g, '-').toLowerCase();
  const toolTitle = getToolTitle(name);
  const isImageSearch = name === 'image-search';

  // Compute subtitle for header
  const headerSubtitle = isBatch && batchResults
    ? `${batchResults.length} queries`
    : typeof displayQuery === 'string'
      ? displayQuery
      : Array.isArray(displayQuery)
        ? (displayQuery as string[]).join(' | ')
        : '';

  // --- Build total stats ---
  const totalResults = isBatch && batchResults
    ? batchResults.reduce((n, br) => n + (br.results?.length || 0), 0)
    : searchResults.length;
  const totalImages = isBatch && batchResults
    ? batchResults.reduce((n, br) => n + (br.images?.length || 0), 0)
    : images.length;

  // Currently visible data
  const currentResults = isBatch && currentBatchItem ? currentBatchItem.results || [] : searchResults;
  const currentAnswer = isBatch && currentBatchItem ? currentBatchItem.answer : answer;
  const currentImages = isBatch && currentBatchItem ? currentBatchItem.images || [] : images;
  const hasContent = currentResults.length > 0 || currentAnswer || currentImages.length > 0;
  const hasAnyContent = searchResults.length > 0 || answer || images.length > 0 ||
    (batchResults && batchResults.some(br => br.results?.length > 0 || br.answer || br.images?.length > 0));

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      {/* Header */}
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={isImageSearch ? ImageIcon : Search}
            title={toolTitle}
            subtitle={headerSubtitle}
          />
          {!isStreaming && hasAnyContent && (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0 ml-2">
              <Globe className="h-3 w-3 mr-1 opacity-70" />
              {isImageSearch
                ? `${totalImages} image${totalImages !== 1 ? 's' : ''}`
                : isBatch && batchResults
                  ? `${batchResults.length} queries`
                  : `${totalResults} source${totalResults !== 1 ? 's' : ''}`
              }
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Body */}
      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {/* Loading state */}
        {isStreaming && !hasAnyContent ? (
          <WebSearchLoadingState
            queries={(() => {
              const args = toolCall?.arguments || {};
              const rawQuery = args.query || args.queries;
              if (Array.isArray(rawQuery)) return rawQuery.filter((q): q is string => typeof q === 'string');
              if (typeof rawQuery === 'string') {
                try {
                  const parsed = JSON.parse(rawQuery);
                  if (Array.isArray(parsed)) return parsed.filter((q): q is string => typeof q === 'string');
                } catch { /* single query */ }
                return [rawQuery];
              }
              return query ? [typeof query === 'string' ? query : 'Searching...'] : ['Searching...'];
            })()}
            title={isImageSearch ? "Searching for images" : "Searching the web"}
          />
        ) : hasAnyContent ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 space-y-4">

              {/* Batch query tabs */}
              {isBatch && batchResults && batchResults.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {batchResults.map((br, idx) => {
                    const isActive = idx === safeQueryIndex;
                    const count = isImageSearch ? (br.images?.length || 0) : (br.results?.length || 0);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCurrentQueryIndex(idx)}
                        className={`
                          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                          ${isActive
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 border border-transparent'
                          }
                        `}
                      >
                        <Search className="size-3 flex-shrink-0" />
                        <span className="truncate max-w-[180px]">{br.query}</span>
                        {count > 0 && (
                          <span className={`
                            text-[10px] px-1.5 py-0.5 rounded-full font-medium
                            ${isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}
                          `}>
                            {count}
                          </span>
                        )}
                        {br.success ? (
                          <CheckCircle className="size-3 text-emerald-500/70" />
                        ) : (
                          <AlertTriangle className="size-3 text-amber-500/70" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Single batch header */}
              {isBatch && batchResults && batchResults.length === 1 && currentBatchItem && (
                <div className="flex items-center gap-2">
                  <Search className="size-3.5 text-muted-foreground/60" />
                  <span className="text-sm font-medium text-foreground">{currentBatchItem.query}</span>
                  {currentBatchItem.success ? (
                    <CheckCircle className="size-3.5 text-emerald-500/70" />
                  ) : (
                    <AlertTriangle className="size-3.5 text-amber-500/70" />
                  )}
                </div>
              )}

              {/* Images (for image search) */}
              {currentImages.length > 0 && (
                <div>
                  {!isImageSearch && (
                    <div className="flex items-center gap-2 mb-3">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Images ({currentImages.length})
                      </span>
                    </div>
                  )}
                  <ImageGrid images={isImageSearch ? currentImages : currentImages.slice(0, 6)} compact={!isImageSearch} />
                  {!isImageSearch && currentImages.length > 6 && (
                    <p className="text-xs text-muted-foreground/50 mt-2 text-center">
                      +{currentImages.length - 6} more images
                    </p>
                  )}
                </div>
              )}

              {/* Answer */}
              {currentAnswer && !isImageSearch && (
                <AnswerBlock answer={currentAnswer} />
              )}

              {/* Sources */}
              {currentResults.length > 0 && !isImageSearch && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Sources ({currentResults.length})
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {currentResults.map((result, idx) => {
                      if (!result?.url || !result?.title) return null;
                      return <SourceRow key={idx} result={result} />;
                    })}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full py-12 px-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-muted/40 border border-border/30">
              {isImageSearch ? (
                <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
              ) : (
                <Search className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>
            <h3 className="text-base font-semibold mb-1 text-foreground">
              {isImageSearch ? 'No Images Found' : 'No Results Found'}
            </h3>
            {displayQuery && (
              <p className="text-sm text-muted-foreground mb-2 text-center max-w-md">
                <code className="font-mono text-xs bg-muted/50 px-1.5 py-0.5 rounded">
                  {typeof displayQuery === 'string' ? displayQuery : Array.isArray(displayQuery) ? (displayQuery as string[]).join(', ') : 'Unknown query'}
                </code>
              </p>
            )}
            <p className="text-xs text-muted-foreground/60">
              Try refining your search query for better results
            </p>
          </div>
        )}
      </CardContent>

      {/* Footer */}
      <ToolViewFooter
        assistantTimestamp={actualAssistantTimestamp}
        toolTimestamp={actualToolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && (
          isImageSearch ? (
            totalImages > 0 ? (
              <Badge variant="outline" className="h-6 py-0.5">
                <CheckCircle className="h-3 w-3 text-emerald-500/70" />
                {isBatch && batchResults
                  ? `${batchResults.length} queries, ${totalImages} images`
                  : `${totalImages} image${totalImages !== 1 ? 's' : ''}`
                }
              </Badge>
            ) : null
          ) : (
            totalResults > 0 ? (
              <Badge variant="outline" className="h-6 py-0.5">
                <CheckCircle className="h-3 w-3 text-emerald-500/70" />
                {isBatch && batchResults
                  ? `${batchResults.length} queries, ${totalResults} sources`
                  : `${totalResults} source${totalResults !== 1 ? 's' : ''}`
                }
              </Badge>
            ) : null
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
