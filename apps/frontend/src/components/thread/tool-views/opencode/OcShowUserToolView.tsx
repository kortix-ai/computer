'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Code2,
  ExternalLink,
  FileIcon,
  FileText,
  Globe,
  Image as ImageIcon,
  MonitorPlay,
  Music,
  RefreshCw,
  Type,
  Video,
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
import { useServerStore, getActiveOpenCodeUrl, deriveSubdomainOpts } from '@/stores/server-store';
import { openTabAndNavigate } from '@/stores/tab-store';
import { enrichPreviewMetadata } from '@/lib/utils/session-context';
import { cn } from '@/lib/utils';
import { ShowContentRenderer, ShowCarousel } from '@/components/file-renderers/show-content-renderer';
import type { ShowCarouselItem } from '@/components/file-renderers/show-content-renderer';

// ── Theme border styles — theme ONLY affects the card border color ──────────
const THEME_BORDER: Record<string, string> = {
  default: 'border-border',
  success: 'border-emerald-500/20',
  warning: 'border-amber-500/20',
  info:    'border-blue-500/20',
  danger:  'border-red-500/20',
};

function typeIcon(type: string) {
  switch (type) {
    case 'image':    return ImageIcon;
    case 'video':    return Video;
    case 'audio':    return Music;
    case 'code':     return Code2;
    case 'markdown': return Type;
    case 'html':     return Globe;
    case 'pdf':      return FileText;
    case 'url':      return Globe;
    case 'error':    return AlertTriangle;
    case 'file':     return FileIcon;
    default:         return FileIcon;
  }
}

// ---------------------------------------------------------------------------
// Embedded iframe preview for localhost URLs in the side-panel
// ---------------------------------------------------------------------------

function SidePanelIframePreview({ url, title }: { url: string; title?: string }) {
  const activeServer = useServerStore((s) => {
    return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
  });
  const serverUrl = activeServer?.url || getActiveOpenCodeUrl();
  const mappedPorts = activeServer?.mappedPorts;
  const subdomainOpts = useMemo(() => deriveSubdomainOpts(activeServer), [activeServer]);

  const proxy = useMemo(() => {
    if (!url) return null;
    if (!isProxiableLocalhostUrl(url)) return null;
    const parsed = parseLocalhostUrl(url);
    if (!parsed) return null;
    const proxyUrl = proxyLocalhostUrl(url, serverUrl, mappedPorts, subdomainOpts);
    if (!proxyUrl) return null;
    return { proxyUrl, port: parsed.port };
  }, [url, serverUrl, mappedPorts, subdomainOpts]);

  const authenticatedUrl = useAuthenticatedPreviewUrl(proxy?.proxyUrl || url);
  const isAuthReady = authenticatedUrl !== null;
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Scaled 1920x1080 viewport ──
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vpScale, setVpScale] = useState(0);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setVpScale(Math.min(w / 1920, h / 1080));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    setRefreshKey((k) => k + 1);
  }, []);

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
      metadata: enrichPreviewMetadata({
        url: proxy.proxyUrl,
        port: proxy.port,
        originalUrl: url,
      }),
    });
  }, [proxy, url]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 h-9 px-3 bg-muted/30 border-b border-border/30 shrink-0">
        <Globe className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">{displayLabel}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={handleRefresh} className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Refresh</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => authenticatedUrl && window.open(authenticatedUrl, '_blank', 'noopener,noreferrer')} disabled={!isAuthReady} className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-30">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Open in browser</TooltipContent>
        </Tooltip>
        {proxy && (
          <Button variant="default" size="sm" className="h-6 text-[10px] gap-1 px-2 rounded-md" onClick={navigateToPreviewTab}>
            <MonitorPlay className="h-3 w-3" />
            Open Tab
          </Button>
        )}
      </div>
      {/* Scaled 1920x1080 viewport — fits within available panel space */}
      <div ref={viewportRef} className="relative flex-1 min-h-0 overflow-hidden bg-white">
        {(isLoading || !isAuthReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-xs">{!isAuthReady ? 'Authenticating...' : 'Loading preview...'}</span>
            </div>
          </div>
        )}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">Failed to load preview</p>
              <button type="button" onClick={handleRefresh} className="text-xs text-primary hover:underline mt-1">Retry</button>
            </div>
          </div>
        )}
        {isAuthReady && vpScale > 0 && (
          <iframe
            key={refreshKey}
            src={authenticatedUrl}
            title={displayLabel}
            className="border-0 bg-white"
            style={{
              width: '1920px',
              height: '1080px',
              transform: `scale(${vpScale})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
            onLoad={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setHasError(true); }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scaled external URL iframe for the side-panel
// ---------------------------------------------------------------------------

function ScaledExternalIframe({ url, title }: { url: string; title?: string }) {
  const vpRef = useRef<HTMLDivElement>(null);
  const [vpScale, setVpScale] = useState(0);
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setVpScale(Math.min(w / 1920, h / 1080));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 h-9 px-3 bg-muted/30 border-b border-border/30 shrink-0">
        <Globe className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">{url}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div ref={vpRef} className="relative flex-1 min-h-0 overflow-hidden bg-white">
        {vpScale > 0 && (
          <iframe
            src={url}
            title={title || url}
            className="border-0 bg-white"
            style={{
              width: '1920px',
              height: '1080px',
              transform: `scale(${vpScale})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — side-panel renderer
// Uses ShowContentRenderer as single source of truth for content rendering.
// This component only handles the card chrome (header, footer, tabs).
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

  // ── Extract fields ──
  const title       = (args.title as string)       || (ocState?.input?.title as string)       || '';
  const description = (args.description as string) || (ocState?.input?.description as string) || '';
  const type        = (args.type as string)        || (ocState?.input?.type as string)        || '';
  const path        = (args.path as string)        || (ocState?.input?.path as string)        || '';
  const url         = (args.url as string)         || (ocState?.input?.url as string)         || '';
  const content     = (args.content as string)     || (ocState?.input?.content as string)     || '';
  const aspectRatio = (args.aspect_ratio as string) || (ocState?.input?.aspect_ratio as string) || '';
  const theme       = (args.theme as string)       || (ocState?.input?.theme as string)       || 'default';
  const language    = (args.language as string)    || (ocState?.input?.language as string)    || '';

  // ── Parse items[] for multi-item carousel mode ──
  const rawItems = args.items || (ocState?.input?.items);
  const items = useMemo<ShowCarouselItem[] | null>(() => {
    if (!rawItems) return null;
    try {
      const parsed = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* ignore */ }
    return null;
  }, [rawItems]);

  const isCarousel = !!items && items.length > 0;

  const borderStyle = THEME_BORDER[theme] || THEME_BORDER.default;
  const Icon = isCarousel ? typeIcon(items![0].type || '') : typeIcon(type);

  const isError = type === 'error' || toolResult?.success === false || !!toolResult?.error;
  const hasLocalhostUrl = !!parseLocalhostUrl(url);

  // ── Server/proxy state (for header subtitle) ──
  const activeServer = useServerStore((s) => {
    return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
  });
  const serverUrl = activeServer?.url || getActiveOpenCodeUrl();
  const mappedPorts = activeServer?.mappedPorts;
  const subdomainOpts2 = useMemo(() => deriveSubdomainOpts(activeServer), [activeServer]);
  const resolvedUrl = useMemo(
    () => proxyLocalhostUrl(url, serverUrl, mappedPorts, subdomainOpts2) ?? url,
    [url, serverUrl, mappedPorts, subdomainOpts2],
  );

  const displayTitle = isCarousel
    ? (title || `${items!.length} items`)
    : (title || description || 'Output');

  // ── Footer badge — always neutral colors, NEVER themed ──
  const footerBadge = useMemo(() => {
    if (isStreaming) return null;
    if (isError && type === 'error') {
      return (
        <Badge variant="outline" className="h-6 py-0.5 bg-muted">
          <AlertTriangle className="h-3 w-3 text-red-500" />
          Error
        </Badge>
      );
    }
    if (hasLocalhostUrl) {
      return (
        <Badge variant="outline" className="h-6 py-0.5 bg-muted">
          <CheckCircle className="h-3 w-3 text-muted-foreground" />
          Live Preview
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="h-6 py-0.5 bg-muted">
        <CheckCircle className="h-3 w-3 text-muted-foreground" />
        Displayed
      </Badge>
    );
  }, [isStreaming, isError, type, hasLocalhostUrl]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCALHOST URL → full iframe preview
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasLocalhostUrl) {
    return (
      <Card className={cn("gap-0 flex shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card border-0", borderStyle)}>
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Globe} title={displayTitle} subtitle={resolvedUrl || undefined} />
            <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden">
          <SidePanelIframePreview url={url} title={title || description || undefined} />
        </CardContent>
        <ToolViewFooter assistantTimestamp={assistantTimestamp} toolTimestamp={toolTimestamp} isStreaming={isStreaming}>
          {footerBadge}
        </ToolViewFooter>
      </Card>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTERNAL URL → full iframe preview
  // ═══════════════════════════════════════════════════════════════════════════
  if (type === 'url' && url && !hasLocalhostUrl) {
    return (
      <Card className={cn("gap-0 flex shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card border-0", borderStyle)}>
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Globe} title={displayTitle} subtitle={url} />
            <a href={url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden">
          <ScaledExternalIframe url={url} title={title || undefined} />
        </CardContent>
        <ToolViewFooter assistantTimestamp={assistantTimestamp} toolTimestamp={toolTimestamp} isStreaming={isStreaming}>
          {footerBadge}
        </ToolViewFooter>
      </Card>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAROUSEL — multiple items in a single show call
  // ═══════════════════════════════════════════════════════════════════════════
  if (isCarousel) {
    return (
      <Card className={cn("gap-0 flex shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card border-0", borderStyle)}>
        <CardHeader className="h-14 backdrop-blur-sm border-b p-2 px-4 space-y-2 bg-muted/50">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Icon} title={displayTitle} subtitle={description || undefined} />
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground/60 font-medium flex-shrink-0">
              {items!.length} items
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <ShowCarousel items={items!} />
          </ScrollArea>
        </CardContent>
        <ToolViewFooter assistantTimestamp={assistantTimestamp} toolTimestamp={toolTimestamp} isStreaming={isStreaming}>
          {footerBadge}
        </ToolViewFooter>
      </Card>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Everything else — ShowContentRenderer handles all content types
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Card className={cn("gap-0 flex shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card border-0", borderStyle)}>
      <CardHeader className="h-14 backdrop-blur-sm border-b p-2 px-4 space-y-2 bg-muted/50">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Icon} title={displayTitle} subtitle={path || url || language || undefined} />
          <div className="flex items-center gap-2 flex-shrink-0">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {type && (
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider',
                type === 'error'
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-muted/40 text-muted-foreground/60',
              )}>
                {type}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <ShowContentRenderer
            type={type}
            title={title}
            description={description}
            path={path}
            url={url}
            content={content}
            language={language}
            aspectRatio={aspectRatio}
          />

          {/* ── Description below content (when title exists) ── */}
          {description && title && type !== 'code' && type !== 'markdown' && (
            <div className="px-4 py-3 border-t border-border/20">
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          )}

          {/* ── Generic error from toolResult ── */}
          {isError && type !== 'error' && (
            <div className="flex items-start gap-2.5 p-4 text-muted-foreground border-t border-border/20">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{toolResult?.error || 'Operation failed'}</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <ToolViewFooter assistantTimestamp={assistantTimestamp} toolTimestamp={toolTimestamp} isStreaming={isStreaming}>
        {footerBadge}
      </ToolViewFooter>
    </Card>
  );
}
