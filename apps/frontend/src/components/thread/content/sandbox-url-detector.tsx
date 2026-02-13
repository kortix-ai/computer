'use client';

import React, { useCallback, useMemo } from 'react';
import { ExternalLink, Globe, AppWindow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UnifiedMarkdown } from '@/components/markdown';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import {
  detectLocalhostUrls,
  rewriteLocalhostUrl,
  type DetectedLocalhostUrl,
} from '@/lib/utils/sandbox-url';

interface SandboxUrlDetectorProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * Card displayed inline in chat when a localhost URL is detected.
 * Shows the port, a rewritten proxy URL, and buttons to open as
 * a preview tab or in an external browser tab.
 */
function SandboxPreviewCard({
  detected,
  proxyUrl,
}: {
  detected: DetectedLocalhostUrl;
  proxyUrl: string;
}) {
  const openTab = useTabStore((s) => s.openTab);

  const handleOpenPreviewTab = useCallback(() => {
    const tabId = `preview:${detected.port}`;
    openTab({
      id: tabId,
      title: `Preview :${detected.port}`,
      type: 'preview',
      href: `/preview/${detected.port}`,
      metadata: {
        url: proxyUrl,
        port: detected.port,
        originalUrl: detected.originalUrl,
      },
    });
  }, [detected, proxyUrl, openTab]);

  const handleOpenExternal = useCallback(() => {
    window.open(proxyUrl, '_blank', 'noopener,noreferrer');
  }, [proxyUrl]);

  return (
    <Card className="my-3 p-0 border bg-muted/30 overflow-hidden">
      <CardContent className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-primary" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                localhost:{detected.port}
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-mono shrink-0">
                {detected.path !== '/' ? detected.path : 'http'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Service detected on port {detected.port}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleOpenPreviewTab}
            >
              <AppWindow className="h-3 w-3" />
              Open Preview
            </Button>
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
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Detects localhost URLs in assistant message content and renders
 * interactive preview cards alongside the markdown content.
 *
 * Similar to ComposioUrlDetector but for sandbox service URLs.
 */
export const SandboxUrlDetector: React.FC<SandboxUrlDetectorProps> = ({
  content,
  isStreaming = false,
}) => {
  const safeContent = typeof content === 'string' ? content : content ? String(content) : '';

  // Get server URL for rewriting
  const serverUrl = useServerStore((s) => {
    const active = s.servers.find((srv) => srv.id === s.activeServerId);
    return active?.url || 'http://localhost:4096';
  });

  const detected = useMemo(() => detectLocalhostUrls(safeContent), [safeContent]);

  // Build proxy URLs for each detected localhost URL
  const proxyUrls = useMemo(
    () =>
      detected.map((d) => rewriteLocalhostUrl(d.port, d.path, serverUrl)),
    [detected, serverUrl],
  );

  // No localhost URLs found — render as normal markdown
  if (detected.length === 0) {
    return <UnifiedMarkdown content={safeContent} isStreaming={isStreaming} />;
  }

  // Split content around detected URLs and interleave preview cards
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  detected.forEach((d, i) => {
    // Text before this URL
    if (d.startIndex > lastIndex) {
      const textBefore = safeContent.substring(lastIndex, d.startIndex);
      if (textBefore.trim()) {
        parts.push(
          <UnifiedMarkdown
            key={`text-${i}`}
            content={textBefore}
            isStreaming={isStreaming}
          />,
        );
      }
    }

    // The URL itself rendered as markdown (so it's still visible in text)
    // plus the preview card
    parts.push(
      <React.Fragment key={`url-${i}`}>
        <UnifiedMarkdown
          content={safeContent.substring(d.startIndex, d.endIndex)}
          isStreaming={false}
        />
        <SandboxPreviewCard detected={d} proxyUrl={proxyUrls[i]} />
      </React.Fragment>,
    );

    lastIndex = d.endIndex;
  });

  // Remaining text after the last URL
  if (lastIndex < safeContent.length) {
    const remaining = safeContent.substring(lastIndex);
    if (remaining.trim()) {
      parts.push(
        <UnifiedMarkdown
          key="text-final"
          content={remaining}
          isStreaming={isStreaming}
        />,
      );
    }
  }

  return <>{parts}</>;
};
