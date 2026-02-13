'use client';

import * as React from 'react';
import { useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FolderTree,
  TerminalSquare,
  Monitor,
  Globe,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useRightSidebar,
  SIDEBAR_RIGHT_WIDTH,
  SIDEBAR_RIGHT_WIDTH_ICON,
} from '@/components/ui/sidebar-right-provider';
import { SidebarFileBrowser } from '@/components/sidebar/sidebar-explorer';
import { useFilesStore } from '@/features/files/store/files-store';
import { useServerStore } from '@/stores/server-store';
import { useCreatePty } from '@/hooks/opencode/use-opencode-pty';
import { useTabStore } from '@/stores/tab-store';
import { getProxyBaseUrl } from '@/lib/utils/sandbox-url';

// ============================================================================
// Main Right Sidebar — Explorer + action buttons
// ============================================================================

export function SidebarRight() {
  const {
    state,
    open,
    setOpen,
    toggleSidebar,
    isMobile,
  } = useRightSidebar();

  const toggleSearch = useFilesStore((s) => s.toggleSearch);

  const activeServer = useServerStore((s) => {
    return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
  });
  const serverUrl = activeServer?.url || 'http://localhost:4096';
  const mappedPorts = activeServer?.mappedPorts;

  // Create new PTY terminal → opens as a tab
  const createPty = useCreatePty();
  const handleNewTerminal = useCallback(async () => {
    try {
      const pty = await createPty.mutateAsync({
        env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      });
      // Open as a tab in the main content area
      useTabStore.getState().openTab({
        id: `terminal:${pty.id}`,
        title: pty.title || pty.command || `Terminal`,
        type: 'terminal',
        href: `/terminal/${pty.id}`,
      });
    } catch (e) {
      console.error('[SidebarRight] Failed to create PTY:', e);
    }
  }, [createPty]);

  /** Open a sandbox port as a preview tab using the proxy system. */
  const openPreviewTab = useCallback(
    (port: number, title: string) => {
      const proxyUrl = getProxyBaseUrl(port, serverUrl, mappedPorts);
      const tabId = `preview:${port}`;
      const tabHref = `/preview/${port}`;

      useTabStore.getState().openTab({
        id: tabId,
        title,
        type: 'preview',
        href: tabHref,
        metadata: {
          url: proxyUrl,
          port,
          originalUrl: `http://localhost:${port}/`,
        },
      });
      window.history.pushState(null, '', tabHref);
    },
    [serverUrl, mappedPorts],
  );

  const handleOpenDesktop = useCallback(() => {
    openPreviewTab(6080, 'Desktop');
  }, [openPreviewTab]);

  const handleOpenAgentBrowser = useCallback(() => {
    openPreviewTab(9224, 'Agent Browser');
  }, [openPreviewTab]);

  if (isMobile) return null;

  return (
    <>
      {/* Gap element — takes space in flex layout so content area shrinks */}
      <div
        className="relative shrink-0 bg-transparent transition-[width] duration-300 ease-out will-change-[width] transform-gpu"
        style={{
          width: open ? SIDEBAR_RIGHT_WIDTH : SIDEBAR_RIGHT_WIDTH_ICON,
        }}
      >
        {/* Rail — thin hoverable strip on the left edge to toggle */}
        <button
          aria-label="Toggle Sidebar"
          tabIndex={-1}
          onClick={toggleSidebar}
          title="Toggle Sidebar"
          className={cn(
            'hover:after:bg-sidebar-border absolute inset-y-0 left-0 z-20 hidden w-4 -translate-x-1/2 transition-all duration-300 ease-out after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex',
            state === 'expanded' ? 'cursor-w-resize' : 'cursor-e-resize',
          )}
        />
      </div>

      {/* Fixed sidebar panel */}
      <div
        className="fixed inset-y-0 right-0 z-10 h-svh transition-[right,width] duration-300 ease-out will-change-[width,transform] transform-gpu backface-visibility-hidden flex overflow-visible"
        style={{
          width: open ? SIDEBAR_RIGHT_WIDTH : SIDEBAR_RIGHT_WIDTH_ICON,
        }}
      >
        <div className="bg-sidebar text-sidebar-foreground flex h-full w-full flex-col">

          {/* ====== HEADER ====== */}
          <div className="flex flex-col pt-4 pb-0 transition-[padding] duration-300 ease-out transform-gpu overflow-visible">
            <div className="relative flex h-[32px] items-center px-3 justify-between">
              {/* Collapsed: centered chevron to expand */}
              {state === 'collapsed' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    className="flex items-center justify-center h-8 w-8 rounded-lg cursor-pointer text-muted-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-150 ease-out"
                    onClick={() => setOpen(true)}
                    aria-label="Expand sidebar"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Expanded: "Explorer" label + collapse chevron */}
              <div className={cn(
                'flex items-center justify-between w-full transition-opacity duration-200',
                state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}>
                <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider select-none px-1">
                  Explorer
                </span>
                <button
                  className="flex items-center justify-center h-7 w-7 rounded-md transition-all duration-150 ease-out cursor-pointer text-muted-foreground/40 hover:text-muted-foreground hover:bg-sidebar-accent/30"
                  onClick={() => setOpen(false)}
                  aria-label="Collapse sidebar"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ====== CONTENT ====== */}
          <div className={cn(
            'flex min-h-0 flex-1 flex-col transition-[opacity] duration-300 ease-out transform-gpu relative',
            state === 'collapsed' ? 'overflow-visible' : 'overflow-hidden',
          )}>
            {/* --- Collapsed: icon buttons --- */}
            <div className={cn(
              'absolute inset-0 px-1 pt-3 space-y-0.5 flex flex-col items-center transition-opacity duration-150 ease-out overflow-visible',
              state === 'collapsed' ? 'opacity-100 pointer-events-auto delay-100' : 'opacity-0 pointer-events-none delay-0',
            )}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpen(true)}
                    className={cn(
                      'flex items-center justify-center h-9 w-9 rounded-xl cursor-pointer',
                      'transition-all duration-150 ease-out',
                      'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    )}
                  >
                    <FolderTree className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Explorer
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleNewTerminal}
                    disabled={createPty.isPending}
                    className={cn(
                      'flex items-center justify-center h-9 w-9 rounded-xl cursor-pointer',
                      'transition-all duration-150 ease-out',
                      'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    <TerminalSquare className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  New terminal
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setOpen(true); setTimeout(() => toggleSearch(), 100); }}
                    className={cn(
                      'flex items-center justify-center h-9 w-9 rounded-xl cursor-pointer',
                      'transition-all duration-150 ease-out',
                      'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    )}
                  >
                    <Search className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Search files
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenDesktop}
                    className={cn(
                      'flex items-center justify-center h-9 w-9 rounded-xl cursor-pointer',
                      'transition-all duration-150 ease-out',
                      'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    )}
                  >
                    <Monitor className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Desktop
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenAgentBrowser}
                    className={cn(
                      'flex items-center justify-center h-9 w-9 rounded-xl cursor-pointer',
                      'transition-all duration-150 ease-out',
                      'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    )}
                  >
                    <Globe className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Agent Browser
                </TooltipContent>
              </Tooltip>
            </div>

            {/* --- Expanded content --- */}
            <div className={cn(
              'flex flex-col h-full transition-opacity duration-150 ease-out',
              state === 'collapsed' ? 'opacity-0 pointer-events-none delay-0' : 'opacity-100 pointer-events-auto delay-100',
            )}>
              {/* File explorer — the main content */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <SidebarFileBrowser openFileAsTab />
              </div>

              {/* Bottom action buttons */}
              <div className="flex-shrink-0 p-2.5 border-t border-sidebar-border/50 space-y-1.5">
                <button
                  onClick={handleNewTerminal}
                  disabled={createPty.isPending}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg',
                    'text-xs font-medium transition-all duration-150 ease-out cursor-pointer',
                    'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <TerminalSquare className="w-3.5 h-3.5" />
                  <span>{createPty.isPending ? 'Creating...' : 'New Terminal'}</span>
                </button>
                <button
                  onClick={handleOpenDesktop}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg',
                    'text-xs font-medium transition-all duration-150 ease-out cursor-pointer',
                    'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40',
                  )}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={handleOpenAgentBrowser}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg',
                    'text-xs font-medium transition-all duration-150 ease-out cursor-pointer',
                    'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40',
                  )}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Agent Browser</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
