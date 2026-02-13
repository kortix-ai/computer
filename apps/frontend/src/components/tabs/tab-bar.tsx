'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  MessageCircle,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Pin,
  PinOff,
  ArrowRightToLine,
  XCircle,
  ChevronsUpDown,
  PanelTop,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabStore, type Tab, type TabType } from '@/stores/tab-store';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useOpenCodeSessions, opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';
import { useServerStore } from '@/stores/server-store';
import { childMapByParent } from '@/ui';
import { getClient } from '@/lib/opencode-sdk';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';


// ============================================================================
// Helpers
// ============================================================================

const TAB_ICONS: Record<TabType, typeof MessageCircle> = {
  session: MessageCircle,
  file: FolderOpen,
  dashboard: LayoutDashboard,
  settings: Settings,
  project: FolderOpen,
  page: PanelTop,
};

/** Map a pathname to a tab config. Returns null for routes that shouldn't auto-open tabs (e.g. /auth). */
function resolveRouteTab(pathname: string): Omit<Tab, 'openedAt'> | null {
  // Sessions are handled separately (they need session data for title/parentID)
  if (pathname.match(/^\/sessions\/[^/]+$/)) return null;

  // Static page routes
  const ROUTE_MAP: Record<string, { title: string; type: TabType }> = {
    '/dashboard': { title: 'Dashboard', type: 'dashboard' },
    '/agents': { title: 'Agents', type: 'page' },
    '/skills': { title: 'Skills Browser', type: 'page' },
    '/tools': { title: 'Tools', type: 'page' },
    '/commands': { title: 'Commands', type: 'page' },
    '/files': { title: 'Files', type: 'file' },
    '/triggers': { title: 'Triggers', type: 'page' },
    '/settings/credentials': { title: 'Integrations', type: 'settings' },
    '/settings/api-keys': { title: 'API Keys', type: 'settings' },
    '/credits-explained': { title: 'Credits', type: 'page' },
    '/support': { title: 'Support', type: 'page' },
    '/admin/analytics': { title: 'Analytics', type: 'page' },
    '/admin/feedback': { title: 'Feedback', type: 'page' },
    '/admin/notifications': { title: 'Notifications', type: 'page' },
    '/admin/utils': { title: 'Admin Utils', type: 'page' },
    '/admin/sandbox-pool': { title: 'Sandbox Pool', type: 'page' },
    '/admin/stateless': { title: 'Stateless', type: 'page' },
    '/admin/stress-test': { title: 'Stress Test', type: 'page' },
  };

  const staticMatch = ROUTE_MAP[pathname];
  if (staticMatch) {
    return {
      id: `page:${pathname}`,
      title: staticMatch.title,
      type: staticMatch.type,
      href: pathname,
    };
  }

  // Dynamic routes
  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    return {
      id: `page:${pathname}`,
      title: 'Project',
      type: 'project',
      href: pathname,
    };
  }

  const agentConfigMatch = pathname.match(/^\/agents\/config\/([^/]+)$/);
  if (agentConfigMatch) {
    return {
      id: `page:${pathname}`,
      title: 'Agent Config',
      type: 'page',
      href: pathname,
    };
  }

  const agentThreadMatch = pathname.match(/^\/agents\/([^/]+)$/);
  if (agentThreadMatch) {
    return {
      id: `page:${pathname}`,
      title: 'Agent',
      type: 'page',
      href: pathname,
    };
  }

  return null;
}

// ============================================================================
// Context Menu (positioned absolutely, triggered by right-click)
// ============================================================================

interface ContextMenuProps {
  tab: Tab;
  position: { x: number; y: number };
  onAction: (action: string, tabId: string) => void;
  onClose: () => void;
}

function TabContextMenu({ tab, position, onAction, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${position.x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${position.y - rect.height}px`;
    }
  }, [position]);

  const item = (label: string, action: string, icon: React.ReactNode, destructive?: boolean) => (
    <button
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors text-left cursor-pointer',
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-accent'
      )}
      onClick={() => { onAction(action, tab.id); onClose(); }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: position.x, top: position.y }}
    >
      {tab.pinned
        ? item('Unpin tab', 'unpin', <PinOff className="h-3.5 w-3.5" />)
        : item('Pin tab', 'pin', <Pin className="h-3.5 w-3.5" />)
      }
      <div className="my-1 h-px bg-border" />
      {!tab.pinned && item('Close', 'close', <X className="h-3.5 w-3.5" />)}
      {item('Close others', 'closeOthers', <XCircle className="h-3.5 w-3.5" />)}
      {item('Close to the right', 'closeRight', <ArrowRightToLine className="h-3.5 w-3.5" />)}
      <div className="my-1 h-px bg-border" />
      {item('Close all', 'closeAll', <XCircle className="h-3.5 w-3.5" />)}
    </div>
  );
}

// ============================================================================
// Tab List Dropdown (VS Code-style "Open Tabs" list)
// ============================================================================

interface TabListDropdownProps {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate: (tabId: string, href: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  getStatus: (sessionId: string) => { isBusy: boolean; pendingCount: number };
}

function TabListDropdown({ tabs, activeTabId, onActivate, onClose, anchorRef, getStatus }: TabListDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, anchorRef]);

  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
    }
  }, [anchorRef]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] max-w-[320px] max-h-[400px] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ top: pos.top, right: pos.right }}
    >
      <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Open tabs
      </div>
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.type];
        const isActive = tab.id === activeTabId;
        const { isBusy, pendingCount } = tab.type === 'session' ? getStatus(tab.id) : { isBusy: false, pendingCount: 0 };
        return (
          <button
            key={tab.id}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-sm transition-colors text-left cursor-pointer',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            )}
            onClick={() => { onActivate(tab.id, tab.href); onClose(); }}
          >
            {tab.type === 'session' && (isBusy || pendingCount > 0) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                    {isBusy && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                    {pendingCount > 0 && !isBusy && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {pendingCount > 0
                    ? `${pendingCount} ${pendingCount === 1 ? 'question' : 'questions'} waiting for your input`
                    : 'Working on it…'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 truncate">{tab.title || 'Untitled'}</span>
            {tab.pinned && <Pin className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/50" />}
            {pendingCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-shrink-0 h-4 min-w-4 px-1 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-medium flex items-center justify-center">
                    {pendingCount}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {pendingCount} {pendingCount === 1 ? 'question' : 'questions'} waiting for your input
                </TooltipContent>
              </Tooltip>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Single Tab
// ============================================================================

interface TabItemProps {
  tab: Tab;
  index: number;
  isActive: boolean;
  isBusy: boolean;
  pendingCount: number;
  onActivate: (tabId: string, href: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tab: Tab) => void;
  onDragStart: (e: React.DragEvent, tabId: string) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  dragSide: 'left' | 'right' | null;
}

function TabItem({
  tab,
  index,
  isActive,
  isBusy,
  pendingCount,
  onActivate,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  dragSide,
}: TabItemProps) {
  const Icon = TAB_ICONS[tab.type];
  const didDragRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click to close — only preventDefault for middle-click
      if (e.button === 1) {
        e.preventDefault();
        if (!tab.pinned) onClose(tab.id);
      }
    },
    [tab, onClose]
  );

  // Use onClick for activation (fires after mouseup, doesn't block drag)
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Skip activation if we just finished a drag
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      e.preventDefault();
      onActivate(tab.id, tab.href);
    },
    [tab, onActivate]
  );

  const handleCloseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClose(tab.id);
    },
    [tab.id, onClose]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(e, tab);
    },
    [tab, onContextMenu]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      didDragRef.current = true;
      onDragStart(e, tab.id);
    },
    [tab.id, onDragStart]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDragOver(e, index);
    },
    [index, onDragOver]
  );

  return (
    <div
      role="tab"
      aria-selected={isActive}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative flex items-center gap-1.5 h-9 px-3 text-xs select-none cursor-pointer',
        'transition-colors',
        'max-w-[180px] min-w-[100px]',
        isActive
          ? 'bg-background text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent',
      )}
    >
      {/* Drag-over indicator */}
      {isDragOver && dragSide === 'left' && (
        <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary rounded-full z-10" />
      )}
      {isDragOver && dragSide === 'right' && (
        <div className="absolute right-0 top-1 bottom-1 w-[2px] bg-primary rounded-full z-10" />
      )}

      {/* Icon with status */}
      {tab.type !== 'session' ? (
        <div className="relative flex-shrink-0 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
      ) : (isBusy || pendingCount > 0) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative flex-shrink-0 w-2 h-2">
              {isBusy && (
                <span className="absolute inset-0 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {pendingCount > 0 && !isBusy && (
                <span className="absolute inset-0 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? 'question' : 'questions'} waiting for your input`
              : 'Working on it…'}
          </TooltipContent>
        </Tooltip>
      ) : null}

      {/* Title */}
      <span className="flex-1 truncate">
        {tab.title || 'Untitled'}
      </span>

      {/* Dirty indicator */}
      {tab.dirty && (
        <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}

      {/* Pin indicator */}
      {tab.pinned && (
        <Pin className="flex-shrink-0 h-2.5 w-2.5 text-muted-foreground/50" />
      )}

      {/* Close button */}
      {!tab.pinned && (
        <button
          onClick={handleCloseClick}
          className={cn(
            'flex-shrink-0 p-0.5 rounded-sm transition-colors cursor-pointer',
            'opacity-0 group-hover:opacity-100',
            'hover:bg-muted-foreground/20'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Active tab indicator — bottom line */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
      )}
    </div>
  );
}

// ============================================================================
// Tab Bar
// ============================================================================

export function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    position: { x: number; y: number };
  } | null>(null);

  // Tab list dropdown state
  const [showTabList, setShowTabList] = useState(false);
  const tabListBtnRef = useRef<HTMLButtonElement>(null);

  // Drag-and-drop state
  const dragTabIdRef = useRef<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragSide, setDragSide] = useState<'left' | 'right' | null>(null);
  const [dragTabId, setDragTabId] = useState<string | null>(null);

  // Track recently closed tab IDs so the route-sync effect doesn't reopen them
  const closingTabIds = useRef<Set<string>>(new Set());

  // Tab store
  const tabs = useTabStore((s) => s.tabs);
  const tabOrder = useTabStore((s) => s.tabOrder);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const openTab = useTabStore((s) => s.openTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const moveTab = useTabStore((s) => s.moveTab);
  const pinTab = useTabStore((s) => s.pinTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useTabStore((s) => s.closeTabsToRight);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);

  // Status stores
  const statuses = useOpenCodeSessionStatusStore((s) => s.statuses);
  const permissions = useOpenCodePendingStore((s) => s.permissions);
  const questions = useOpenCodePendingStore((s) => s.questions);

  // Sessions data
  const { data: sessions, isLoading: sessionsLoading } = useOpenCodeSessions();
  const updateTabTitle = useTabStore((s) => s.updateTabTitle);
  const activeServerId = useServerStore((s) => s.activeServerId);

  // Sync session titles to tab titles
  useEffect(() => {
    if (!sessions) return;
    for (const session of sessions) {
      const tab = tabs[session.id];
      if (tab && tab.type === 'session' && session.title && tab.title !== session.title) {
        updateTabTitle(session.id, session.title);
      }
    }
  }, [sessions, tabs, updateTabTitle]);

  // Track which server the sessions data was last fetched for.
  // After a server switch, sessions briefly contains stale data from the OLD server.
  // We must not prune until sessions has been refetched for the CURRENT server.
  const lastPrunedServerRef = useRef(activeServerId);
  const sessionsReadyForServer = useRef(false);

  // When activeServerId changes, mark sessions as not-yet-ready for the new server.
  // When sessions subsequently reloads (goes through loading → loaded), mark as ready.
  useEffect(() => {
    if (lastPrunedServerRef.current !== activeServerId) {
      // Server just switched — sessions data is stale, don't prune yet
      sessionsReadyForServer.current = false;
      lastPrunedServerRef.current = activeServerId;
    } else if (!sessionsLoading && sessions) {
      // Same server, sessions finished loading — safe to prune
      sessionsReadyForServer.current = true;
    }
  }, [activeServerId, sessions, sessionsLoading]);

  // Prune tabs for sessions that no longer exist on the server.
  // Only runs once sessions data is confirmed fresh for the current server.
  useEffect(() => {
    if (!sessions || sessionsLoading || !sessionsReadyForServer.current) return;
    const sessionIds = new Set(sessions.map(s => s.id));
    const { tabs: currentTabs, tabOrder: currentOrder } = useTabStore.getState();
    const staleTabIds = currentOrder.filter(id => {
      const tab = currentTabs[id];
      if (tab?.type !== 'session') return false;
      if (tab.serverId && tab.serverId !== activeServerId) return false;
      return !sessionIds.has(id);
    });
    for (const id of staleTabIds) {
      useTabStore.getState().closeTab(id);
    }
  }, [sessions, sessionsLoading, activeServerId]);

  // Prefetch session + messages data for all open tabs so switching is instant
  useEffect(() => {
    for (const id of tabOrder) {
      const tab = tabs[id];
      if (tab?.type !== 'session' || id === activeTabId) continue;
      queryClient.prefetchQuery({
        queryKey: opencodeKeys.session(id),
        queryFn: async () => {
          const client = getClient();
          const result = await client.session.get({ sessionID: id });
          if (result.error) throw new Error('prefetch failed');
          return result.data;
        },
        staleTime: 30 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: opencodeKeys.messages(id),
        queryFn: async () => {
          const client = getClient();
          const result = await client.session.messages({ sessionID: id });
          if (result.error) throw new Error('prefetch failed');
          return result.data;
        },
        staleTime: 5 * 1000,
      });
    }
  }, [tabOrder, tabs, activeTabId, queryClient]);

  const orderedTabs = useMemo(
    () => tabOrder.map((id) => tabs[id]).filter(Boolean),
    [tabs, tabOrder]
  );

  // Sync active tab with current route
  useEffect(() => {
    if (!pathname) return;

    closingTabIds.current.forEach((id) => {
      // For session tabs, id is the sessionId; for page tabs, id is "page:/path"
      const closedHref = id.startsWith('page:') ? id.slice(5) : `/sessions/${id}`;
      if (pathname !== closedHref) {
        closingTabIds.current.delete(id);
      }
    });

    // If the current URL matches an existing tab, activate it
    const matchingTab = orderedTabs.find((t) => t.href === pathname);
    if (matchingTab && matchingTab.id !== activeTabId) {
      setActiveTab(matchingTab.id);
      return;
    }

    // Auto-open session tabs (need session data for title/parent)
    const sessionMatch = pathname.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      if (closingTabIds.current.has(sessionId)) return;
      if (!tabs[sessionId]) {
        // Only open a tab if the session still exists on the server to avoid
        // re-opening a tab for a just-deleted session (which causes an
        // infinite setState loop with the prune effect).
        const session = sessions?.find(s => s.id === sessionId);
        if (!session && sessions) return;
        openTab({
          id: sessionId,
          title: session?.title || 'Session',
          type: 'session',
          href: `/sessions/${sessionId}`,
          parentSessionId: session?.parentID,
          serverId: activeServerId,
        });
      } else {
        setActiveTab(sessionId);
      }
      return;
    }

    // Auto-open tabs for all other dashboard routes
    if (!matchingTab) {
      const routeTab = resolveRouteTab(pathname);
      if (routeTab && !closingTabIds.current.has(routeTab.id)) {
        openTab(routeTab);
      }
    }
  }, [pathname, orderedTabs, activeTabId, tabs, openTab, setActiveTab, sessions]);

  // Build child map for permission aggregation across sub-sessions
  const childMap = useMemo(
    () => (sessions ? childMapByParent(sessions) : new Map<string, string[]>()),
    [sessions],
  );

  const getPendingCount = useCallback(
    (sessionId: string) => {
      const countForSession = (sid: string) => {
        const permCount = Object.values(permissions).filter(
          (p) => p.sessionID === sid
        ).length;
        const qCount = Object.values(questions)
          .filter((q) => q.sessionID === sid)
          .reduce((sum, q) => sum + (q.questions?.length || 1), 0);
        return permCount + qCount;
      };
      let total = countForSession(sessionId);
      const children = childMap.get(sessionId);
      if (children) {
        for (const childId of children) {
          total += countForSession(childId);
        }
      }
      return total;
    },
    [permissions, questions, childMap],
  );

  const getStatus = useCallback(
    (sessionId: string) => {
      const pendingCount = getPendingCount(sessionId);
      const isBusy = pendingCount === 0 && statuses[sessionId]?.type === 'busy';
      return { isBusy: !!isBusy, pendingCount };
    },
    [getPendingCount, statuses],
  );

  // Tab switching: update URL via history.pushState for session/file tabs (no re-mount),
  // fall back to router.push for non-session tabs.
  const handleActivate = useCallback(
    (tabId: string, href: string) => {
      const tab = useTabStore.getState().tabs[tabId];
      setActiveTab(tabId);
      if (tab?.type === 'session' || tab?.type === 'file') {
        // pushState changes the URL without triggering a Next.js navigation,
        // so the pre-mounted session/file component just becomes visible instantly.
        window.history.pushState(null, '', href);
      } else {
        router.push(href);
      }
    },
    [setActiveTab, router]
  );

  const handleClose = useCallback(
    (tabId: string) => {
      closingTabIds.current.add(tabId);
      const state = useTabStore.getState();
      const nextTabId = state.closeTab(tabId);
      if (nextTabId) {
        const nextTab = useTabStore.getState().tabs[nextTabId];
        if (nextTab) {
          if (nextTab.type === 'session') {
            window.history.pushState(null, '', nextTab.href);
          } else {
            router.push(nextTab.href);
          }
        }
      } else {
        router.push('/dashboard');
      }
    },
    [router]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      setContextMenu({ tab, position: { x: e.clientX, y: e.clientY } });
    },
    []
  );

  const handleContextAction = useCallback(
    (action: string, tabId: string) => {
      switch (action) {
        case 'pin':
          pinTab(tabId, true);
          break;
        case 'unpin':
          pinTab(tabId, false);
          break;
        case 'close':
          handleClose(tabId);
          break;
        case 'closeOthers':
          closeOtherTabs(tabId);
          break;
        case 'closeRight':
          closeTabsToRight(tabId);
          break;
        case 'closeAll':
          closeAllTabs();
          router.push('/dashboard');
          break;
      }
    },
    [pinTab, handleClose, closeOtherTabs, closeTabsToRight, closeAllTabs, router]
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // --- Drag and drop ---
  const handleDragStart = useCallback(
    (e: React.DragEvent, tabId: string) => {
      dragTabIdRef.current = tabId;
      setDragTabId(tabId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tabId);
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      setDragOverIndex(index);
      setDragSide(e.clientX < midX ? 'left' : 'right');
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const srcId = dragTabIdRef.current;
      if (srcId !== null && dragOverIndex !== null && dragSide !== null) {
        const currentOrder = useTabStore.getState().tabOrder;
        const fromIndex = currentOrder.indexOf(srcId);
        if (fromIndex !== -1) {
          let toIndex = dragSide === 'right' ? dragOverIndex + 1 : dragOverIndex;
          if (fromIndex < toIndex) toIndex -= 1;
          if (fromIndex !== toIndex) {
            moveTab(srcId, toIndex);
          }
        }
      }
      dragTabIdRef.current = null;
      setDragTabId(null);
      setDragOverIndex(null);
      setDragSide(null);
    },
    [dragOverIndex, dragSide, moveTab]
  );

  const handleDragEnd = useCallback(() => {
    dragTabIdRef.current = null;
    setDragTabId(null);
    setDragOverIndex(null);
    setDragSide(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.altKey) return;

      const digitMatch = e.code.match(/^Digit(\d)$/);
      if (digitMatch) {
        const num = parseInt(digitMatch[1], 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          const { tabOrder: order, tabs: allTabs } = useTabStore.getState();
          const idx = num === 9 ? order.length - 1 : num - 1;
          if (idx >= 0 && idx < order.length) {
            const targetTab = allTabs[order[idx]];
            if (targetTab) {
              setActiveTab(targetTab.id);
              if (targetTab.type === 'session') {
                window.history.pushState(null, '', targetTab.href);
              } else {
                router.push(targetTab.href);
              }
            }
          }
          return;
        }
      }

      if (e.code === 'KeyW') {
        e.preventDefault();
        const { activeTabId: active, tabs: allTabs } = useTabStore.getState();
        if (active && allTabs[active] && !allTabs[active].pinned) {
          handleClose(active);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, router, handleClose]);

  // Always render the bar so the bg-sidebar strip above the content curve is consistent
  if (orderedTabs.length === 0) {
    return <div className="flex-shrink-0 bg-sidebar h-9 md:h-12" />;
  }

  return (
    <>
      <div
        className="flex-shrink-0 flex items-end bg-sidebar h-9 md:h-12 overflow-hidden"
        role="tablist"
      >
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex-1 flex items-stretch overflow-x-auto md:pl-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
        >
          {orderedTabs.map((tab, index) => {
            const pending = tab.type === 'session' ? getPendingCount(tab.id) : 0;
            const busy = tab.type === 'session' && pending === 0 && statuses[tab.id]?.type === 'busy';
            return (
              <TabItem
                key={tab.id}
                tab={tab}
                index={index}
                isActive={tab.id === activeTabId}
                isBusy={!!busy}
                pendingCount={pending}
                onActivate={handleActivate}
                onClose={handleClose}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragOver={dragOverIndex === index && dragTabId !== tab.id}
                dragSide={dragOverIndex === index && dragTabId !== tab.id ? dragSide : null}
              />
            );
          })}
        </div>

        {/* Tab list button (VS Code-style) */}
        <button
          ref={tabListBtnRef}
          onClick={() => setShowTabList((v) => !v)}
          className={cn(
            'flex-shrink-0 flex items-center justify-center w-9 h-9 cursor-pointer',
            'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors',
          )}
          title="Open tab list"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab list dropdown */}
      {showTabList && (
        <TabListDropdown
          tabs={orderedTabs}
          activeTabId={activeTabId}
          onActivate={handleActivate}
          onClose={() => setShowTabList(false)}
          anchorRef={tabListBtnRef}
          getStatus={getStatus}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={contextMenu.position}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
