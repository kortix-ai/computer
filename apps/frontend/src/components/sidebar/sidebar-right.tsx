'use client';

import * as React from 'react';
import { useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FolderTree,
  TerminalSquare,
  Monitor,
  Globe,
  Search,
  KeyRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { openTabAndNavigate } from '@/stores/tab-store';
import { getProxyBaseUrl } from '@/lib/utils/sandbox-url';
import { getDirectPortUrl, SANDBOX_PORTS } from '@/lib/platform-client';

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

  const router = useRouter();
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
      openTabAndNavigate({
        id: `terminal:${pty.id}`,
        title: pty.title || pty.command || `Terminal`,
        type: 'terminal',
        href: `/terminal/${pty.id}`,
      });
    } catch (e) {
      console.error('[SidebarRight] Failed to create PTY:', e);
    }
  }, [createPty]);

  /**
   * Open a well-known sandbox service as a preview tab using a DIRECT URL.
   * Resolves the random Docker host port (or Daytona path) from the active server's mappedPorts.
   * Falls back to the proxy if no direct URL can be resolved.
   */
  const openSandboxServiceTab = useCallback(
    (containerPort: string, title: string) => {
      // Try direct URL first (bypasses proxy, works for WebSocket services like noVNC)
      const directUrl = activeServer
        ? getDirectPortUrl(activeServer, containerPort)
        : null;
      // Fall back to proxy-based URL if direct resolution fails
      const url = directUrl || getProxyBaseUrl(parseInt(containerPort, 10), serverUrl, mappedPorts);

      const tabId = `preview:${containerPort}`;
      const tabHref = `/preview/${containerPort}`;

      openTabAndNavigate({
        id: tabId,
        title,
        type: 'preview',
        href: tabHref,
        metadata: {
          url,
          port: parseInt(containerPort, 10),
          originalUrl: `http://localhost:${containerPort}/`,
        },
      });
    },
    [activeServer, serverUrl, mappedPorts],
  );

  const handleOpenDesktop = useCallback(() => {
    openSandboxServiceTab(SANDBOX_PORTS.DESKTOP, 'Desktop');
  }, [openSandboxServiceTab]);

  const handleOpenAgentBrowser = useCallback(() => {
    openSandboxServiceTab(SANDBOX_PORTS.BROWSER_VIEWER, 'Agent Browser');
  }, [openSandboxServiceTab]);

  const handleOpenSecrets = useCallback(() => {
    openTabAndNavigate(
      {
        id: 'settings:secrets',
        title: 'Secrets Manager',
        type: 'settings',
        href: '/settings/credentials',
      },
      router,
    );
  }, [router]);

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
          <div className="flex flex-col pt-4 pb-0 overflow-visible">
            <div className="relative flex h-[32px] items-center px-3 justify-between">
              {/* Collapsed: centered chevron to expand */}
              {state === 'collapsed' && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <button
                    className="flex items-center justify-center h-7 w-7 rounded-lg cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                    onClick={() => setOpen(true)}
                    aria-label="Expand sidebar"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Expanded: "Explorer" label + collapse chevron */}
              <div className={cn(
                'flex items-center justify-between w-full',
                state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider select-none px-1">
                  Explorer
                </span>
                <button
                  className="flex items-center justify-center h-7 w-7 rounded-lg transition-colors duration-150 cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent"
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
            'flex min-h-0 flex-1 flex-col relative',
            state === 'collapsed' ? 'overflow-visible' : 'overflow-hidden',
          )}>
            {/* --- Collapsed: icon buttons --- */}
            <div className={cn(
              'absolute inset-0 px-3 pt-3 space-y-0.5 flex flex-col items-center overflow-visible',
              state === 'collapsed' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
            )}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpen(true)}
                    className="flex items-center justify-center w-full py-2 rounded-xl cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <FolderTree className="h-[16px] w-[16px]" />
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
                      'flex items-center justify-center w-full py-2 rounded-xl cursor-pointer',
                      'text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    <TerminalSquare className="h-[16px] w-[16px]" />
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
                    className="flex items-center justify-center w-full py-2 rounded-xl cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <Search className="h-[16px] w-[16px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Search files
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenSecrets}
                    className="flex items-center justify-center w-full py-2 rounded-xl cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <KeyRound className="h-[16px] w-[16px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Secrets Manager
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenDesktop}
                    className="flex items-center justify-center w-full py-2 rounded-xl cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <Monitor className="h-[16px] w-[16px]" />
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
                    className="flex items-center justify-center w-full py-2 rounded-xl cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <Globe className="h-[16px] w-[16px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Agent Browser
                </TooltipContent>
              </Tooltip>
            </div>

            {/* --- Expanded content --- */}
            <div className={cn(
              'flex flex-col h-full',
              state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto',
            )}>
              {/* File explorer — the main content */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <SidebarFileBrowser openFileAsTab />
              </div>

              {/* Bottom action nav */}
              <nav className="flex-shrink-0 px-3 py-2 space-y-0.5">
                <button
                  onClick={handleNewTerminal}
                  disabled={createPty.isPending}
                  className={cn(
                    'flex items-center gap-3.5 w-full px-3 py-2 rounded-xl text-sm cursor-pointer',
                    'text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <TerminalSquare className="h-[16px] w-[16px] flex-shrink-0" />
                  <span>{createPty.isPending ? 'Creating...' : 'New Terminal'}</span>
                </button>
                <button
                  onClick={handleOpenSecrets}
                  className="flex items-center gap-3.5 w-full px-3 py-2 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <KeyRound className="h-[16px] w-[16px] flex-shrink-0" />
                  <span>Secrets Manager</span>
                </button>
                <button
                  onClick={handleOpenDesktop}
                  className="flex items-center gap-3.5 w-full px-3 py-2 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <Monitor className="h-[16px] w-[16px] flex-shrink-0" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={handleOpenAgentBrowser}
                  className="flex items-center gap-3.5 w-full px-3 py-2 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <Globe className="h-[16px] w-[16px] flex-shrink-0" />
                  <span>Agent Browser</span>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
