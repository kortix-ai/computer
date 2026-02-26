'use client';

import * as React from 'react';
import { useCallback, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Compass,
  FolderOpen,
  TerminalSquare,
  Globe,
  Search,
  KeyRound,
  Key,
  Blocks,
  Brain,
  Plug,
  MessageSquare,
  Calendar,
  Cable,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
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
import { useServerStore, getActiveOpenCodeUrl, getSubdomainOpts } from '@/stores/server-store';
import { useCreatePty } from '@/hooks/opencode/use-opencode-pty';
import { openTabAndNavigate } from '@/stores/tab-store';
import { getProxyBaseUrl } from '@/lib/utils/sandbox-url';
import { getDirectPortUrl, SANDBOX_PORTS } from '@/lib/platform-client';
import { SSHKeyDialog } from '@/components/sidebar/ssh-key-dialog';

// ============================================================================
// Main Right Sidebar — Quick actions (no file explorer — that's /files now)
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
  const pathname = usePathname();

  const activeServer = useServerStore((s) => {
    return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
  });
  const serverUrl = activeServer?.url || getActiveOpenCodeUrl();

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
   * Open a well-known sandbox service as a preview tab.
   * All modes route through the backend proxy — no direct localhost access.
   */
  const openSandboxServiceTab = useCallback(
    (containerPort: string, title: string) => {
      const subdomainOpts = getSubdomainOpts();
      const url = activeServer
        ? (getDirectPortUrl(activeServer, containerPort) || getProxyBaseUrl(parseInt(containerPort, 10), serverUrl, subdomainOpts))
        : getProxyBaseUrl(parseInt(containerPort, 10), serverUrl, subdomainOpts);

      const tabId = `preview:${containerPort}`;
      const tabHref = `/p/${containerPort}`;

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
    [activeServer, serverUrl],
  );

  const handleOpenFiles = useCallback(() => {
    openTabAndNavigate(
      {
        id: 'page:/files',
        title: 'Files',
        type: 'page',
        href: '/files',
      },
      router,
    );
  }, [router]);

  const handleOpenAgentBrowser = useCallback(() => {
    openSandboxServiceTab(SANDBOX_PORTS.BROWSER_VIEWER, 'Agent Browser');
  }, [openSandboxServiceTab]);

  const handleOpenInternalBrowser = useCallback(() => {
    openTabAndNavigate({
      id: 'preview:browser',
      title: 'Browser',
      type: 'preview',
      href: '/p/browser',
      metadata: { url: '', port: 0, originalUrl: '', path: '/' },
    });
  }, []);

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

  /** Open the Running Services panel as a tab. */
  const handleOpenRunningServices = useCallback(() => {
    openTabAndNavigate({
      id: 'services:running',
      title: 'Running Services',
      type: 'services',
      href: '/services/running',
    });
  }, []);
  const [sshDialogOpen, setSSHDialogOpen] = useState(false);

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
          <div className="flex flex-col pt-3 pb-0 overflow-visible">
            <div className="relative flex h-[32px] items-center px-3 justify-between">
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

              <div className={cn(
                'flex items-center justify-between w-full',
                state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider select-none px-1">
                  Quick Actions
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
              'absolute inset-0 px-2 pt-2 space-y-0.5 flex flex-col items-center overflow-visible',
              state === 'collapsed' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
            )}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenFiles}
                    className="flex items-center justify-center w-full py-2 rounded-lg cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Files
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleNewTerminal}
                    disabled={createPty.isPending}
                    className={cn(
                      'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer',
                      'text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    <TerminalSquare className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  New terminal
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenSecrets}
                    className="flex items-center justify-center w-full py-2 rounded-lg cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Secrets Manager
                </TooltipContent>
              </Tooltip>

              {/* ── Navigation pages ── */}
              <div className="w-full border-t border-sidebar-border/40 my-1.5" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openTabAndNavigate({ id: 'page:/workspace', title: 'Workspace', type: 'page', href: '/workspace' }, router)}
                    className={cn(
                      'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer transition-colors duration-150',
                      (pathname === '/workspace' || pathname?.startsWith('/projects') || pathname?.startsWith('/agents') || pathname?.startsWith('/skills') || pathname?.startsWith('/commands') || pathname?.startsWith('/tools'))
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                    )}
                  >
                    <Blocks className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Workspace
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openTabAndNavigate({ id: 'page:/memory', title: 'Memory', type: 'page', href: '/memory' }, router)}
                    className={cn(
                      'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer transition-colors duration-150',
                      pathname === '/memory'
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                    )}
                  >
                    <Brain className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Memory
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openTabAndNavigate({ id: 'page:/integrations', title: 'Integrations', type: 'page', href: '/integrations' }, router)}
                    className={cn(
                      'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer transition-colors duration-150',
                      pathname === '/integrations'
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                    )}
                  >
                    <Plug className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Integrations
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openTabAndNavigate({ id: 'page:/channels', title: 'Channels', type: 'page', href: '/channels' }, router)}
                    className={cn(
                      'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer transition-colors duration-150',
                      pathname === '/channels'
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                    )}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Channels
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openTabAndNavigate({ id: 'page:/scheduled-tasks', title: 'Scheduled Tasks', type: 'page', href: '/scheduled-tasks' }, router)}
                    className={cn(
                      'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer transition-colors duration-150',
                      pathname === '/scheduled-tasks'
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                    )}
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Scheduled Tasks
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openTabAndNavigate({ id: 'page:/tunnel', title: 'Tunnel', type: 'page', href: '/tunnel' }, router)}
                    className={cn(
                      'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer transition-colors duration-150',
                      pathname === '/tunnel'
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                    )}
                  >
                    <Cable className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Tunnel
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenAgentBrowser}
                    className="flex items-center justify-center w-full py-2 rounded-lg cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <Globe className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Agent Browser
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenInternalBrowser}
                    className="flex items-center justify-center w-full py-2 rounded-lg cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <Compass className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Browser
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenRunningServices}
                    className="flex items-center justify-center w-full py-2 rounded-xl cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                  >
                    <Activity className="h-[16px] w-[16px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={12} className="text-xs">
                  Running Services
                </TooltipContent>
              </Tooltip>

              {/* SSH — pinned to bottom */}
              <div className="mt-auto pb-3 w-full">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSSHDialogOpen(true)}
                      className="flex items-center justify-center w-full py-2 rounded-lg cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150"
                    >
                      <Key className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={12} className="text-xs">
                    Generate SSH Key
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* --- Expanded: action list --- */}
            <div className={cn(
              'flex flex-col h-full',
              state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto',
            )}>
              <nav className="flex-1 px-3 pt-2 space-y-0.5">
                <button
                  onClick={handleOpenFiles}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  <span>Files</span>
                </button>
                <button
                  onClick={handleNewTerminal}
                  disabled={createPty.isPending}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] cursor-pointer',
                    'text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <TerminalSquare className="h-4 w-4 flex-shrink-0" />
                  <span>{createPty.isPending ? 'Creating...' : 'New Terminal'}</span>
                </button>
                <button
                  onClick={handleOpenSecrets}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <KeyRound className="h-4 w-4 flex-shrink-0" />
                  <span>Secrets Manager</span>
                </button>

                {/* ── Navigation pages ── */}
                <div className="w-full border-t border-sidebar-border/40 my-1.5" />
                <button
                  onClick={() => openTabAndNavigate({ id: 'page:/workspace', title: 'Workspace', type: 'page', href: '/workspace' }, router)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer',
                    (pathname === '/workspace' || pathname?.startsWith('/projects') || pathname?.startsWith('/agents') || pathname?.startsWith('/skills') || pathname?.startsWith('/commands') || pathname?.startsWith('/tools'))
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent',
                  )}
                >
                  <Blocks className="h-4 w-4 flex-shrink-0" />
                  <span>Workspace</span>
                </button>
                <button
                  onClick={() => openTabAndNavigate({ id: 'page:/memory', title: 'Memory', type: 'page', href: '/memory' }, router)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer',
                    pathname === '/memory'
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent',
                  )}
                >
                  <Brain className="h-4 w-4 flex-shrink-0" />
                  <span>Memory</span>
                </button>
                <button
                  onClick={() => openTabAndNavigate({ id: 'page:/integrations', title: 'Integrations', type: 'page', href: '/integrations' }, router)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer',
                    pathname === '/integrations'
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent',
                  )}
                >
                  <Plug className="h-4 w-4 flex-shrink-0" />
                  <span>Integrations</span>
                </button>
                <button
                  onClick={() => openTabAndNavigate({ id: 'page:/channels', title: 'Channels', type: 'page', href: '/channels' }, router)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer',
                    pathname === '/channels'
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent',
                  )}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <span>Channels</span>
                </button>
                <button
                  onClick={() => openTabAndNavigate({ id: 'page:/scheduled-tasks', title: 'Scheduled Tasks', type: 'page', href: '/scheduled-tasks' }, router)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer',
                    pathname === '/scheduled-tasks'
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent',
                  )}
                >
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span>Scheduled Tasks</span>
                </button>
                <button
                  onClick={() => openTabAndNavigate({ id: 'page:/tunnel', title: 'Tunnel', type: 'page', href: '/tunnel' }, router)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer',
                    pathname === '/tunnel'
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent',
                  )}
                >
                  <Cable className="h-4 w-4 flex-shrink-0" />
                  <span>Tunnel</span>
                </button>

                <button
                  onClick={handleOpenAgentBrowser}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <Globe className="h-4 w-4 flex-shrink-0" />
                  <span>Agent Browser</span>
                </button>
                <button
                  onClick={handleOpenInternalBrowser}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <Compass className="h-4 w-4 flex-shrink-0" />
                  <span>Browser</span>
                </button>
                <button
                  onClick={handleOpenRunningServices}
                  className="flex items-center gap-3.5 w-full px-3 py-2 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <Activity className="h-[16px] w-[16px] flex-shrink-0" />
                  <span>Running Services</span>
                </button>
              </nav>

              {/* SSH — pinned to bottom */}
              <div className="px-3 pb-3 mt-auto">
                <button
                  onClick={() => setSSHDialogOpen(true)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
                >
                  <Key className="h-4 w-4 flex-shrink-0" />
                  <span>Generate SSH Key</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SSHKeyDialog open={sshDialogOpen} onOpenChange={setSSHDialogOpen} />
    </>
  );
}
