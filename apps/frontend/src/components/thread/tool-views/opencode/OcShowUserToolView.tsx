'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  MonitorPlay,
  RefreshCw,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { useAuthenticatedPreviewUrl } from '@/hooks/use-authenticated-preview-url';
import {
  isProxiableLocalhostUrl,
  parseLocalhostUrl,
  proxyLocalhostUrl,
} from '@/lib/utils/sandbox-url';
import { useServerStore } from '@/stores/server-store';
import { openTabAndNavigate } from '@/stores/tab-store';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Embedded iframe preview for localhost URLs in the side-panel
// ---------------------------------------------------------------------------

function SidePanelIframePreview({ url, title }: { url: string; title?: string }) {
  const activeServer = useServerStore((s) => {
    return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
  });
  const serverUrl = activeServer?.url || 'http://localhost:4096';
  const mappedPorts = activeServer?.mappedPorts;

  const proxy = useMemo(() => {
    if (!url) return null;
    if (!isProxiableLocalhostUrl(url)) return null;
    const parsed = parseLocalhostUrl(url);
    if (!parsed) return null;
    const proxyUrl = proxyLocalhostUrl(url, serverUrl, mappedPorts);
    if (!proxyUrl) return null;
    return {
      proxyUrl,
      port: parsed.port,
    };
  }, [url, serverUrl, mappedPorts]);

  const authenticatedUrl = useAuthenticatedPreviewUrl(proxy?.proxyUrl || url);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    setRefreshKey((k) => k + 1);
  }, []);

  // Fallback: cross-origin iframes often don't fire onLoad
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setIsLoading(false), 5000);
    return () => clearTimeout(t);
  }, [isLoading, refreshKey]);

  const displayLabel = title || (proxy ? `localhost:${proxy.port}` : url);

  const navigateToPreviewTab = useCallback(() => {
    if (!proxy) return;
    openTabAndNavigate({
      id: `preview:${proxy.port}`,
      title: `localhost:${proxy.port}`,
      type: 'preview',
      href: `/preview/${proxy.port}`,
      metadata: {
        url: proxy.proxyUrl,
        port: proxy.port,
        originalUrl: url,
      },
    });
  }, [proxy, url]);

  return (
    <div className="flex flex-col h-full">
      {/* Mini browser toolbar */}
      <div className="flex items-center gap-1.5 h-9 px-3 bg-muted/30 border-b border-border/30 shrink-0">
        <Globe className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">
          {displayLabel}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Refresh</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => window.open(authenticatedUrl, '_blank', 'noopener,noreferrer')}
              className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Open in browser</TooltipContent>
        </Tooltip>
        {proxy && (
          <Button
            variant="default"
            size="sm"
            className="h-6 text-[10px] gap-1 px-2 rounded-md"
            onClick={navigateToPreviewTab}
          >
            <MonitorPlay className="h-3 w-3" />
            Open Tab
          </Button>
        )}
      </div>

      {/* Iframe fills remaining space */}
      <div className="relative flex-1 min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading preview...</span>
            </div>
          </div>
        )}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">Failed to load preview</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-xs text-primary hover:underline mt-1"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <iframe
          key={refreshKey}
          src={authenticatedUrl}
          title={displayLabel}
          className="w-full h-full border-0 bg-white"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OcShowUserToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const title = (args.title as string) || (ocState?.input?.title as string) || '';
  const description = (args.description as string) || (ocState?.input?.description as string) || '';
  const type = (args.type as string) || (ocState?.input?.type as string) || '';
  const path = (args.path as string) || (ocState?.input?.path as string) || '';
  const url = (args.url as string) || (ocState?.input?.url as string) || '';
  const content = (args.content as string) || (ocState?.input?.content as string) || '';

  const isError = toolResult?.success === false || !!toolResult?.error;
  const isImage = type === 'image' || !!path.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  const hasLocalhostUrl = !!parseLocalhostUrl(url);

  const activeServer = useServerStore((s) => {
    return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
  });
  const serverUrl = activeServer?.url || 'http://localhost:4096';
  const mappedPorts = activeServer?.mappedPorts;
  const resolvedUrl = useMemo(
    () => proxyLocalhostUrl(url, serverUrl, mappedPorts) ?? url,
    [url, serverUrl, mappedPorts],
  );

  const displayTitle = title || description || 'Output';

  // For localhost URLs — show embedded iframe preview that fills the panel
  if (hasLocalhostUrl) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle
              icon={Globe}
              title={displayTitle}
              subtitle={resolvedUrl || undefined}
            />
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-full flex-1 overflow-hidden">
          <SidePanelIframePreview url={url} title={title || description || undefined} />
        </CardContent>

        <ToolViewFooter
          assistantTimestamp={assistantTimestamp}
          toolTimestamp={toolTimestamp}
          isStreaming={isStreaming}
        >
          {!isStreaming && (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Live Preview
            </Badge>
          )}
        </ToolViewFooter>
      </Card>
    );
  }

  // Fallback — standard non-iframe output display
  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={isImage ? ImageIcon : Eye}
            title={displayTitle}
            subtitle={path || url || undefined}
          />
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-3">
            {/* Image preview */}
            {isImage && path && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={path}
                  alt={title || 'Output image'}
                  className="max-w-full max-h-[400px] rounded-lg border border-border object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}

            {/* Description */}
            {description && title && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}

            {/* Content */}
            {content && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
              </div>
            )}

            {/* URL link */}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {url}
              </a>
            )}

            {/* File path */}
            {path && !isImage && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/50">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-foreground font-mono truncate">{path}</span>
              </div>
            )}

            {/* Error */}
            {isError && (
              <div className="flex items-start gap-2.5 text-muted-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{toolResult?.error || 'Operation failed'}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && (
          <Badge variant="outline" className="h-6 py-0.5 bg-muted">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            Displayed
          </Badge>
        )}
      </ToolViewFooter>
    </Card>
  );
}
