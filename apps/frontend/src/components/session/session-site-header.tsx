'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/utils';
import {
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  Loader2,
  Share2,
  FileDown,
  Link2,
  Link2Off,
  Check,
  Copy,
  MoreHorizontal,
} from 'lucide-react';
import { CompactDialog } from '@/components/session/compact-dialog';
import { ExportTranscriptDialog } from '@/components/session/export-transcript-dialog';
import {
  useOpenCodeSession,
  useShareSession,
  useUnshareSession,
} from '@/hooks/opencode/use-opencode-sessions';
import { toast } from '@/lib/toast';

/**
 * Rewrite the share URL returned by the OpenCode server (e.g. https://opncd.ai/share/XYZ)
 * to use our own domain so that the public link points to our app.
 */
function toOurShareUrl(serverUrl: string): string {
  try {
    const parsed = new URL(serverUrl);
    // Extract the share ID from the path (last segment of /share/{id})
    const segments = parsed.pathname.split('/').filter(Boolean);
    const shareIdx = segments.indexOf('share');
    const shareId = shareIdx !== -1 && segments[shareIdx + 1]
      ? segments[shareIdx + 1]
      : segments[segments.length - 1];
    const appBase = (typeof window !== 'undefined' ? window.location.origin : '')
      || process.env.NEXT_PUBLIC_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || 'https://www.kortix.com';
    return `${appBase}/share/${shareId}`;
  } catch {
    // If the URL can't be parsed, return as-is
    return serverUrl;
  }
}

interface SessionSiteHeaderProps {
  sessionId: string;
  sessionTitle: string;
  onToggleSidePanel: () => void;
  isSidePanelOpen?: boolean;
  isMobileView?: boolean;
  canOpenSidePanel?: boolean;
  isCompacting?: boolean;
}

export function SessionSiteHeader({
  sessionId,
  sessionTitle,
  onToggleSidePanel,
  isSidePanelOpen = false,
  isMobileView,
  canOpenSidePanel = true,
  isCompacting = false,
}: SessionSiteHeaderProps) {
  const [compactOpen, setCompactOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const isMobile = useIsMobile() || isMobileView;
  const { setOpen: setSidebarOpen, setOpenMobile } = useSidebar();

  const { data: session } = useOpenCodeSession(sessionId);
  const shareSession = useShareSession();
  const unshareSession = useUnshareSession();

  const isShared = !!session?.share?.url;
  const isSharePending = shareSession.isPending || unshareSession.isPending;

  const handleOpenMenu = () => {
    setSidebarOpen(true);
    setOpenMobile(true);
  };

  const handleShare = useCallback(async () => {
    try {
      const updated = await shareSession.mutateAsync(sessionId);
      if (updated.share?.url) {
        const ourUrl = toOurShareUrl(updated.share.url);
        await navigator.clipboard.writeText(ourUrl);
        toast.success('Share link copied to clipboard');
      } else {
        toast.success('Session shared');
      }
    } catch {
      toast.error('Failed to share session');
    }
  }, [sessionId, shareSession]);

  const handleUnshare = useCallback(async () => {
    try {
      await unshareSession.mutateAsync(sessionId);
      toast.success('Share link removed');
    } catch {
      toast.error('Failed to unshare session');
    }
  }, [sessionId, unshareSession]);

  const handleCopyShareLink = useCallback(async () => {
    if (!session?.share?.url) return;
    try {
      const ourUrl = toOurShareUrl(session.share.url);
      await navigator.clipboard.writeText(ourUrl);
      setLinkCopied(true);
      toast.success('Share link copied');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [session?.share?.url]);

  return (
    <>
      <header className="bg-background sticky top-0 z-20 w-full flex-shrink-0 border-b border-border/40">
        <div className="h-12 sm:h-14 flex items-center justify-between px-3 sm:px-4 gap-2">
          {/* Left: menu + title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isMobile && (
              <button
                onClick={handleOpenMenu}
                className="flex items-center justify-center h-9 w-9 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent transition-colors touch-manipulation"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            <div className="min-w-0 flex items-center gap-2">
              <span className="text-sm font-medium truncate">{sessionTitle}</span>
              {isShared && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                  <Link2 className="h-2.5 w-2.5" />
                  Shared
                </span>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <TooltipProvider delayDuration={300}>
              {/* More actions dropdown */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>
                    <p>Session actions</p>
                  </TooltipContent>
                </Tooltip>

                <DropdownMenuContent align="end" className="w-52">
                  {/* Export transcript */}
                  <DropdownMenuItem onClick={() => setExportOpen(true)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export transcript
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* Share / Unshare */}
                  {isShared ? (
                    <>
                      <DropdownMenuItem onClick={handleCopyShareLink}>
                        {linkCopied ? (
                          <Check className="mr-2 h-4 w-4" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        {linkCopied ? 'Copied!' : 'Copy share link'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleUnshare}
                        disabled={isSharePending}
                        className="text-destructive focus:text-destructive"
                      >
                        {isSharePending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Link2Off className="mr-2 h-4 w-4" />
                        )}
                        Remove share link
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem
                      onClick={handleShare}
                      disabled={isSharePending}
                    >
                      {isSharePending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Share2 className="mr-2 h-4 w-4" />
                      )}
                      Share session
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {/* Compact */}
                  <DropdownMenuItem
                    onClick={() => setCompactOpen(true)}
                    disabled={isCompacting}
                  >
                    {isCompacting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Layers className="mr-2 h-4 w-4" />
                    )}
                    {isCompacting ? 'Compacting...' : 'Compact session'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Panel toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleSidePanel}
                    disabled={!canOpenSidePanel}
                    className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    {isSidePanelOpen ? (
                      <PanelRightClose className="h-3.5 w-3.5" />
                    ) : (
                      <PanelRightOpen className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <p>
                    {!canOpenSidePanel
                      ? 'No tools yet'
                      : `${isSidePanelOpen ? 'Close' : 'Open'} Kortix Computer`}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      <CompactDialog
        sessionId={sessionId}
        open={compactOpen}
        onOpenChange={setCompactOpen}
      />

      <ExportTranscriptDialog
        sessionId={sessionId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </>
  );
}
