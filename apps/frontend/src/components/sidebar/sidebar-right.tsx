'use client';

import * as React from 'react';
import { useCallback, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Key,
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
import {
  getItemsByGroup,
  getNavItemsClustered,
  isItemActive,
  navSubGroupLabels,
  type MenuItemDef,
  type NavSubGroup,
} from '@/lib/menu-registry';

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

  /** Generic handler for any registry item in the right sidebar */
  const handleItemAction = useCallback((item: MenuItemDef) => {
    switch (item.kind) {
      case 'navigate': {
        const tabType = (item.tabType || 'page') as any;
        const tabId = item.tabId || `page:${item.href}`;
        openTabAndNavigate(
          {
            id: tabId,
            title: item.label,
            type: tabType,
            href: item.href!,
            ...(item.tabType === 'preview' ? { metadata: { url: '', port: 0, originalUrl: '', path: '/' } } : {}),
          },
          router,
        );
        break;
      }
      case 'sandboxService':
        if (item.actionId === 'openAgentBrowser') {
          openSandboxServiceTab(SANDBOX_PORTS.BROWSER_VIEWER, item.label);
        }
        break;
      case 'action':
        if (item.actionId === 'newTerminal') {
          handleNewTerminal();
        }
        break;
    }
  }, [router, openSandboxServiceTab, handleNewTerminal]);

  const [sshDialogOpen, setSSHDialogOpen] = useState(false);

  // Get registry items for the right sidebar
  const quickActionItems = getItemsByGroup('rightSidebar', 'quickActions');
  const navClusters = getNavItemsClustered('rightSidebar', 'navigation');

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
            {/* --- Collapsed: icon buttons (registry-driven, clustered) --- */}
            <div className={cn(
              'absolute inset-0 px-2 pt-2 flex flex-col items-center overflow-visible',
              state === 'collapsed' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
            )}>
              {/* Quick actions cluster */}
              <div className="w-full space-y-0.5">
                {quickActionItems.map((item) => {
                  const Icon = item.icon;
                  const isTerminal = item.actionId === 'newTerminal';
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleItemAction(item)}
                          disabled={isTerminal && createPty.isPending}
                          className={cn(
                            'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer',
                            'text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={12} className="text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Navigation clusters with separators */}
              {navClusters.map((cluster, clusterIdx) => (
                <div key={cluster[0]?.subGroup ?? clusterIdx} className="w-full">
                  {/* Separator between clusters */}
                  <div className="mx-auto my-2 h-px w-6 bg-sidebar-border/60" />
                  <div className="space-y-0.5">
                    {cluster.map((item) => {
                      const Icon = item.icon;
                      const active = isItemActive(item, pathname);
                      return (
                        <Tooltip key={item.id}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleItemAction(item)}
                              className={cn(
                                'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer transition-colors duration-150',
                                active
                                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                  : 'text-sidebar-foreground hover:bg-sidebar-accent',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" sideOffset={12} className="text-xs">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              ))}

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

            {/* --- Expanded: action list (registry-driven, clustered) --- */}
            <div className={cn(
              'flex flex-col h-full',
              state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto',
            )}>
              <nav className="flex-1 px-3 pt-2 overflow-y-auto">
                {/* Quick actions */}
                <div className="space-y-0.5">
                  {quickActionItems.map((item) => {
                    const Icon = item.icon;
                    const isTerminal = item.actionId === 'newTerminal';
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemAction(item)}
                        disabled={isTerminal && createPty.isPending}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] cursor-pointer',
                          'text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span>{isTerminal && createPty.isPending ? 'Creating...' : item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Navigation clusters with section labels */}
                {navClusters.map((cluster, clusterIdx) => {
                  const subGroup = cluster[0]?.subGroup as NavSubGroup | undefined;
                  const label = subGroup ? navSubGroupLabels[subGroup] : undefined;
                  return (
                    <div key={subGroup ?? clusterIdx} className="mt-3">
                      {label && (
                        <div className="px-3 pb-1.5 pt-1">
                          <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider select-none">
                            {label}
                          </span>
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {cluster.map((item) => {
                          const Icon = item.icon;
                          const active = isItemActive(item, pathname);
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleItemAction(item)}
                              className={cn(
                                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer',
                                active
                                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                                  : 'text-sidebar-foreground hover:bg-sidebar-accent',
                              )}
                            >
                              <Icon className="h-4 w-4 flex-shrink-0" />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
