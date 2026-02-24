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
  FileDown,
  MoreHorizontal,
  GitCompareArrows,
  Sparkles,
} from 'lucide-react';
import { ExportTranscriptDialog } from '@/components/session/export-transcript-dialog';
import { DiffDialog } from '@/components/session/diff-dialog';
import { InitProjectDialog } from '@/components/session/init-project-dialog';

import { DiagnosticsBadge } from '@/components/session/diagnostics-panel';
// Worktree indicator — disabled for now
// import { useOpenCodeSession, useOpenCodeCurrentProject } from '@/hooks/opencode/use-opencode-sessions';

interface SessionSiteHeaderProps {
  sessionId: string;
  sessionTitle: string;
  onToggleSidePanel: () => void;
  isSidePanelOpen?: boolean;
  isMobileView?: boolean;
  canOpenSidePanel?: boolean;
  /** Optional element rendered at the leading (left) edge of the header */
  leadingAction?: React.ReactNode;
}

export function SessionSiteHeader({
  sessionId,
  sessionTitle,
  onToggleSidePanel,
  isSidePanelOpen = false,
  isMobileView,
  canOpenSidePanel = true,
  leadingAction,
}: SessionSiteHeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);

  const isMobile = useIsMobile() || isMobileView;
  const { setOpen: setSidebarOpen, setOpenMobile } = useSidebar();

  // Worktree detection — disabled for now
  const worktreeInfo = null;

  const handleOpenMenu = () => {
    setSidebarOpen(true);
    setOpenMobile(true);
  };

  return (
    <>
      {/* Floating actions in top-right corner */}
      <div className="absolute top-0 right-0 left-0 z-20 pointer-events-none">
        <div className="flex items-center justify-between px-3 sm:px-4 pt-2">
          {/* Left: leading action + mobile menu */}
          <div className="flex items-center gap-1 pointer-events-auto">
            {leadingAction}
            {isMobile && (
              <button
                onClick={handleOpenMenu}
                className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent transition-colors touch-manipulation"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-0.5 pointer-events-auto">
            <TooltipProvider delayDuration={300}>
              {/* LSP Diagnostics badge */}
              <DiagnosticsBadge />

              {/* Worktree indicator — disabled for now */}

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
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>
                    <p>More actions</p>
                  </TooltipContent>
                </Tooltip>

                <DropdownMenuContent align="end" className="w-52">
                  {/* View Changes */}
                  <DropdownMenuItem onClick={() => setDiffOpen(true)}>
                    <GitCompareArrows className="mr-2 h-4 w-4" />
                    View changes
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* Export transcript */}
                  <DropdownMenuItem onClick={() => setExportOpen(true)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export transcript
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* Initialize project */}
                  <DropdownMenuItem onClick={() => setInitOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Initialize project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Share button — temporarily hidden until share architecture is resolved */}
              {/* <SharePopover sessionId={sessionId}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2.5 cursor-pointer gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Share</span>
                </Button>
              </SharePopover> */}

              {/* Panel toggle */}
              {canOpenSidePanel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onToggleSidePanel}
                      className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      {isSidePanelOpen ? (
                        <PanelRightClose className="h-4 w-4" />
                      ) : (
                        <PanelRightOpen className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>
                    <p>{isSidePanelOpen ? 'Close' : 'Open'} Actions</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ExportTranscriptDialog
        sessionId={sessionId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <DiffDialog
        sessionId={sessionId}
        open={diffOpen}
        onOpenChange={setDiffOpen}
      />
      <InitProjectDialog
        sessionId={sessionId}
        open={initOpen}
        onOpenChange={setInitOpen}
      />
    </>
  );
}
