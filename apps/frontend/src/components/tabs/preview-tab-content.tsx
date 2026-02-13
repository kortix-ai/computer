'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  Globe,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTabStore } from '@/stores/tab-store';

interface PreviewTabContentProps {
  tabId: string;
}

/**
 * Preview tab content — renders a proxied sandbox URL in an iframe
 * with a toolbar (address bar, refresh, open externally).
 */
export function PreviewTabContent({ tabId }: PreviewTabContentProps) {
  const tab = useTabStore((s) => s.tabs[tabId]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract metadata from tab
  const previewUrl = (tab?.metadata?.url as string) || '';
  const port = (tab?.metadata?.port as number) || 0;

  /** Clear any pending load timeout. */
  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    setRefreshKey((k) => k + 1);
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

  const handleOpenExternal = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  }, [previewUrl]);

  // Fallback: if onLoad doesn't fire within 5s, dismiss the loading state.
  // Cross-origin iframes frequently fail to fire onLoad events.
  useEffect(() => {
    if (!isLoading) return;
    clearLoadTimeout();
    loadTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
    }, 5000);
    return clearLoadTimeout;
  }, [isLoading, refreshKey, clearLoadTimeout]);

  // Display URL (strip protocol for cleaner look)
  const displayUrl = useMemo(() => {
    try {
      const u = new URL(previewUrl);
      return `${u.host}${u.pathname}${u.search}`;
    } catch {
      return previewUrl;
    }
  }, [previewUrl]);

  if (!tab || !previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
        <Globe className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">No preview URL available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 h-10 px-3 border-b bg-muted/30 shrink-0">
        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRefresh}
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>

        {/* Address bar */}
        <div className="flex-1 flex items-center h-7 px-3 bg-background border rounded-md text-xs text-muted-foreground font-mono truncate select-all">
          <Globe className="h-3 w-3 mr-2 shrink-0 opacity-50" />
          <span className="truncate">{displayUrl}</span>
          {port > 0 && (
            <span className="ml-2 shrink-0 px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">
              :{port}
            </span>
          )}
        </div>

        {/* Open external */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleOpenExternal}
          title="Open in browser"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Iframe container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-xs">Loading preview...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-sm text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Failed to load preview</p>
                <p className="text-xs mt-1">
                  The service on port {port} may not be running yet.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          </div>
        )}

        <iframe
          key={refreshKey}
          ref={iframeRef}
          src={previewUrl}
          title={`Preview :${port}`}
          className="w-full h-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  );
}
