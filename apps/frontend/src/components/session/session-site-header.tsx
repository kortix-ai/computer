'use client';

import { useState } from 'react';
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
  Upload,
  FileDown,
  MoreHorizontal,
} from 'lucide-react';
import { CompactDialog } from '@/components/session/compact-dialog';
import { ExportTranscriptDialog } from '@/components/session/export-transcript-dialog';
import { SharePopover } from '@/components/session/share-popover';

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
  const isMobile = useIsMobile() || isMobileView;
  const { setOpen: setSidebarOpen, setOpenMobile } = useSidebar();

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

          {/* Right: actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <TooltipProvider delayDuration={300}>
              {/* More actions dropdown (Export + Compact) */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>
                    <p>More actions</p>
                  </TooltipContent>
                </Tooltip>

                <DropdownMenuContent align="end" className="w-48">
                  {/* Export transcript */}
                  <DropdownMenuItem onClick={() => setExportOpen(true)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export transcript
                  </DropdownMenuItem>

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

              {/* Share button with popover (matches Suna) */}
              <SharePopover sessionId={sessionId}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2.5 cursor-pointer gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Share</span>
                </Button>
              </SharePopover>

              {/* Panel toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleSidePanel}
                    disabled={!canOpenSidePanel}
                    className="h-9 w-9 cursor-pointer"
                  >
                    {isSidePanelOpen ? (
                      <PanelRightClose className="h-4 w-4" />
                    ) : (
                      <PanelRightOpen className="h-4 w-4" />
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
