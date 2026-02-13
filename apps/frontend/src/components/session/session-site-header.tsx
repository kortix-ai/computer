'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/utils';
import { toast } from '@/lib/toast';
import { Menu, PanelRightClose, PanelRightOpen, Upload, Check, Layers, Loader2 } from 'lucide-react';
import { CompactDialog } from '@/components/session/compact-dialog';

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
  const [copied, setCopied] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const isMobile = useIsMobile() || isMobileView;
  const { setOpen: setSidebarOpen, setOpenMobile } = useSidebar();

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Share link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleOpenMenu = () => {
    setSidebarOpen(true);
    setOpenMobile(true);
  };

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
            </div>
          </div>

          {/* Right: compact + share + panel toggle */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCompactOpen(true)}
                    disabled={isCompacting}
                    className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    {isCompacting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Layers className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <p>{isCompacting ? 'Compacting...' : 'Compact session'}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={copyShareLink}
                    size="sm"
                    className="h-8 px-2.5 cursor-pointer gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline text-xs">{copied ? 'Copied!' : 'Share'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <p>Copy share link</p>
                </TooltipContent>
              </Tooltip>

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
    </>
  );
}
