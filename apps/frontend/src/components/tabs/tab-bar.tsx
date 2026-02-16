'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  MessageCircle,
  FolderOpen,
  Home,
  Settings,
  Pin,
  PinOff,
  ArrowRightToLine,
  XCircle,
  ChevronsUpDown,
  PanelTop,
  Plus,
  Globe,
  TerminalSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabStore, type Tab, type TabType, DASHBOARD_TAB_ID } from '@/stores/tab-store';
import { useUserPreferencesStore } from '@/stores/user-preferences-store';
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
  dashboard: Home,
  settings: Settings,
  project: FolderOpen,
  page: PanelTop,
  preview: Globe,
  terminal: TerminalSquare,
};

/** Map a pathname to a tab config. Returns null for routes that shouldn't auto-open tabs (e.g. /auth). */
function resolveRouteTab(pathname: string): Omit<Tab, 'openedAt'> | null {
  // Sessions are handled separately (they need session data for title/parentID)
  if (pathname.match(/^\/sessions\/[^/]+$/)) return null;

  // Dashboard is handled by the permanent tab — don't create a duplicate
  if (pathname === '/dashboard') {
    return {
      id: DASHBOARD_TAB_ID,
      title: '',
      type: 'dashboard' as TabType,
      href: '/dashboard',
      pinned: true,
    };
  }

  // Static page routes
  const ROUTE_MAP: Record<string, { title: string; type: TabType }> = {
    '/agents': { title: 'Agents', type: 'page' },
    '/skills': { title: 'Skills Browser', type: 'page' },
    '/tools': { title: 'Tools', type: 'page' },
    '/commands': { title: 'Commands', type: 'page' },
    '/files': { title: 'Files', type: 'file' },
    '/configuration': { title: 'Configuration', type: 'settings' },
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

  const item = (label: string, action: string, icon: React.ReactNode, shortcut?: string, destructive?: boolean) => (
    <button
      className={cn(
        'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md transition-colors text-left cursor-pointer',
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-accent'
      )}
      onClick={() => { onAction(action, tab.id); onClose(); }}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-muted-foreground/60 ml-4">{shortcut}</span>
      )}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-lg border border-border/80 bg-popover/95 backdrop-blur-sm p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150"
      style={{ left: position.x, top: position.y }}
    >
      {tab.pinned
        ? item('Unpin tab', 'unpin', <PinOff className="h-3.5 w-3.5 text-muted-foreground" />)
        : item('Pin tab', 'pin', <Pin className="h-3.5 w-3.5 text-muted-foreground" />)
      }
      <div className="my-1 h-px bg-border/60" />
      {!tab.pinned && item('Close', 'close', <X className="h-3.5 w-3.5 text-muted-foreground" />, `${useUserPreferencesStore.getState().getModifierLabel()}+W`)}
      {item('Close others', 'closeOthers', <XCircle className="h-3.5 w-3.5 text-muted-foreground" />)}
      {item('Close to the right', 'closeRight', <ArrowRightToLine className="h-3.5 w-3.5 text-muted-foreground" />)}
      <div className="my-1 h-px bg-border/60" />
      {item('Close all', 'closeAll', <XCircle className="h-3.5 w-3.5 text-muted-foreground" />, undefined, true)}
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Auto-focus the search input
  useEffect(() => {
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [anchorRef]);

  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return tabs;
    const q = searchQuery.toLowerCase();
    return tabs.filter((tab) => tab.title?.toLowerCase().includes(q));
  }, [tabs, searchQuery]);

  // Group tabs by type for visual clarity
  const sessionTabs = filteredTabs.filter((t) => t.type === 'session');
  const otherTabs = filteredTabs.filter((t) => t.type !== 'session');

  const renderTabRow = (tab: Tab) => {
    const Icon = TAB_ICONS[tab.type];
    const isActive = tab.id === activeTabId;
    const { isBusy, pendingCount } = tab.type === 'session' ? getStatus(tab.id) : { isBusy: false, pendingCount: 0 };
    return (
      <button
        key={tab.id}
        className={cn(
          'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md transition-colors text-left cursor-pointer',
          isActive
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-foreground hover:bg-accent/50'
        )}
        onClick={() => { onActivate(tab.id, tab.href); onClose(); }}
      >
        {tab.type === 'session' && (isBusy || pendingCount > 0) ? (
          <div className="relative flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
            {isBusy && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
            {pendingCount > 0 && !isBusy && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
          </div>
        ) : (
          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate">{tab.title || 'Untitled'}</span>
        {tab.pinned && <Pin className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/50 -rotate-[20deg]" />}
        {tab.dirty && <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-amber-500" />}
        {pendingCount > 0 && (
          <span className="flex-shrink-0 h-4 min-w-4 px-1 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-medium flex items-center justify-center">
            {pendingCount}
          </span>
        )}
        {isActive && (
          <div className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>
    );
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[240px] max-w-[340px] max-h-[460px] rounded-lg border border-border/80 bg-popover/95 backdrop-blur-sm shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 flex flex-col"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* Search input */}
      {tabs.length > 3 && (
        <div className="px-2 pt-2 pb-1">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tabs..."
            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-muted/50 border border-border/50 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      )}

      <div className="overflow-y-auto p-1.5 flex-1">
        {sessionTabs.length > 0 && (
          <>
            {otherTabs.length > 0 && (
              <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                Sessions
              </div>
            )}
            {sessionTabs.map(renderTabRow)}
          </>
        )}
        {otherTabs.length > 0 && (
          <>
            {sessionTabs.length > 0 && (
              <div className="px-2 pt-2 py-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                Pages
              </div>
            )}
            {otherTabs.map(renderTabRow)}
          </>
        )}
        {filteredTabs.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground text-center">
            No matching tabs
          </div>
        )}
      </div>

      {/* Tab count footer */}
      <div className="px-2.5 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60">
        {tabs.length} tab{tabs.length !== 1 ? 's' : ''} open
      </div>
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
  const isDashboard = tab.id === DASHBOARD_TAB_ID;
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
        'group relative flex items-center h-8 md:h-9 text-xs select-none cursor-pointer',
        'transition-colors duration-150 ease-out',
        isDashboard
          ? 'w-9 md:w-10 justify-center px-0'
          : 'gap-1.5 px-3 max-w-[200px] min-w-[110px]',
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
      )}
    >
      {/* Drag-over indicator */}
      {isDragOver && dragSide === 'left' && (
        <div className="absolute left-0 top-2 bottom-2 w-[2px] bg-primary rounded-full z-10 animate-in fade-in-0 duration-150" />
      )}
      {isDragOver && dragSide === 'right' && (
        <div className="absolute right-0 top-2 bottom-2 w-[2px] bg-primary rounded-full z-10 animate-in fade-in-0 duration-150" />
      )}

      {/* Icon with status */}
      {tab.type === 'session' && (isBusy || pendingCount > 0) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
              {isBusy && (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {pendingCount > 0 && !isBusy && (
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? 'question' : 'questions'} waiting for your input`
              : 'Working on it\u2026'}
          </TooltipContent>
        </Tooltip>
      ) : isDashboard ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Icon className={cn('h-3.5 w-3.5 flex-shrink-0 transition-colors', isActive ? 'text-foreground/80' : 'text-muted-foreground')} />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Home</TooltipContent>
        </Tooltip>
      ) : (
        <Icon className={cn('h-3.5 w-3.5 flex-shrink-0 transition-colors', isActive ? 'text-foreground/60' : 'text-muted-foreground')} />
      )}

      {/* Title — hidden for dashboard tab */}
      {!isDashboard && (
        <span className="flex-1 truncate">
          {tab.title || 'Untitled'}
        </span>
      )}

      {/* Dirty indicator */}
      {tab.dirty && (
        <span className="flex-shrink-0 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-amber-500/20" />
      )}

      {/* Pin indicator — hidden for dashboard (it's always pinned but we don't show the icon) */}
      {tab.pinned && !isDashboard && (
        <Pin className="flex-shrink-0 h-2.5 w-2.5 text-muted-foreground/60 -rotate-[20deg]" />
      )}

      {/* Close button — never shown for dashboard */}
      {!tab.pinned && !isDashboard && (
        <button
          onClick={handleCloseClick}
          className={cn(
            'flex-shrink-0 p-0.5 rounded-md transition-all duration-100 cursor-pointer',
            'hover:bg-foreground/10 active:bg-foreground/15',
            isActive
              ? 'opacity-60 hover:opacity-100'
              : 'opacity-0 group-hover:opacity-100',
          )}
          aria-label={`Close ${tab.title}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Active indicator — subtle bottom line */}
      {isActive && (
        <div className="absolute bottom-0 inset-x-0 h-[2px] bg-foreground/80" />
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (tab?.type === 'session' || tab?.type === 'file' || tab?.type === 'preview' || tab?.type === 'terminal') {
        // pushState changes the URL without triggering a Next.js navigation,
        // so the pre-mounted session/file/preview/terminal component just becomes visible instantly.
        window.history.pushState(null, '', href);
      } else {
        router.push(href);
      }
      // Focus the textarea in the activated tab (session or dashboard)
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('focus-session-textarea'));
      });
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
          if (nextTab.type === 'session' || nextTab.type === 'file' || nextTab.type === 'preview' || nextTab.type === 'terminal') {
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

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts — full browser-style tab keybinds
  // Respects user preference for modifier key (Cmd vs Ctrl)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    /** Navigate to a tab, updating URL appropriately based on tab type */
    const navigateToTab = (tab: Tab) => {
      setActiveTab(tab.id);
      if (tab.type === 'session' || tab.type === 'file' || tab.type === 'preview' || tab.type === 'terminal') {
        window.history.pushState(null, '', tab.href);
      } else {
        router.push(tab.href);
      }
    };

    /** Switch to the tab at the given offset from the active tab (+1 = next, -1 = prev) */
    const cycleTab = (direction: 1 | -1) => {
      const { tabOrder: order, tabs: allTabs, activeTabId: active } = useTabStore.getState();
      if (order.length === 0) return;
      const currentIdx = active ? order.indexOf(active) : -1;
      // Wrap around: last → first, first → last
      const nextIdx = (currentIdx + direction + order.length) % order.length;
      const targetTab = allTabs[order[nextIdx]];
      if (targetTab) navigateToTab(targetTab);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const { keyboard } = useUserPreferencesStore.getState().preferences;
      const tabMod = keyboard.tabSwitchModifier;
      const closeMod = keyboard.closeTabModifier;

      // Resolve which modifier the user chose
      const modHeld = tabMod === 'meta' ? e.metaKey : e.ctrlKey;
      const modOther = tabMod === 'meta' ? e.ctrlKey : e.metaKey;
      const closeModHeld = closeMod === 'meta' ? e.metaKey : e.ctrlKey;
      const closeModOther = closeMod === 'meta' ? e.ctrlKey : e.metaKey;

      // ── New tab: Modifier + T ────────────────────────────────────────
      if (modHeld && !modOther && !e.shiftKey && !e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        router.push('/dashboard');
        return;
      }

      // ── Reopen closed tab: Modifier + Shift + T ─────────────────────
      if (modHeld && !modOther && e.shiftKey && !e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        const reopened = useTabStore.getState().reopenLastClosedTab();
        if (reopened) navigateToTab(reopened);
        return;
      }

      // ── Close tab: Modifier + W ─────────────────────────────────────
      if (closeModHeld && !closeModOther && !e.shiftKey && !e.altKey && e.code === 'KeyW') {
        e.preventDefault();
        const { activeTabId: active, tabs: allTabs } = useTabStore.getState();
        if (active && allTabs[active] && !allTabs[active].pinned) {
          handleClose(active);
        }
        return;
      }

      // Skip remaining shortcuts if alt is held (except Option+Arrow which needs alt)
      // ── Next tab: Modifier + Option + → (ArrowRight) ────────────────
      if (modHeld && !modOther && !e.shiftKey && e.altKey && e.code === 'ArrowRight') {
        e.preventDefault();
        cycleTab(1);
        return;
      }

      // ── Prev tab: Modifier + Option + ← (ArrowLeft) ────────────────
      if (modHeld && !modOther && !e.shiftKey && e.altKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        cycleTab(-1);
        return;
      }

      // All remaining shortcuts reject alt
      if (e.altKey) return;

      // ── Next tab: Modifier + Shift + ] (BracketRight) ───────────────
      if (modHeld && !modOther && e.shiftKey && e.code === 'BracketRight') {
        e.preventDefault();
        cycleTab(1);
        return;
      }

      // ── Prev tab: Modifier + Shift + [ (BracketLeft) ────────────────
      if (modHeld && !modOther && e.shiftKey && e.code === 'BracketLeft') {
        e.preventDefault();
        cycleTab(-1);
        return;
      }

      // ── Tab switching: Modifier + 1-9 ───────────────────────────────
      if (modHeld && !modOther && !e.shiftKey) {
        const digitMatch = e.code.match(/^Digit(\d)$/);
        if (digitMatch) {
          const num = parseInt(digitMatch[1], 10);
          if (num >= 1 && num <= 9) {
            e.preventDefault();
            const { tabOrder: order, tabs: allTabs } = useTabStore.getState();
            const idx = num === 9 ? order.length - 1 : num - 1;
            if (idx >= 0 && idx < order.length) {
              const targetTab = allTabs[order[idx]];
              if (targetTab) navigateToTab(targetTab);
            }
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, router, handleClose]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return;
    const container = scrollRef.current;
    const activeEl = container.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement | null;
    if (activeEl) {
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeEl.getBoundingClientRect();
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeTabId]);

  const handleNewTab = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  // Always render the bar so the bg-sidebar strip above the content curve is consistent
  if (orderedTabs.length === 0) {
    return <div className="flex-shrink-0 bg-sidebar h-9 md:h-10" />;
  }

  return (
    <>
      <div
        className="flex-shrink-0 flex items-end bg-sidebar h-9 md:h-10 overflow-hidden"
        role="tablist"
      >
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex-1 flex items-end overflow-x-auto md:pl-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
        >
          {orderedTabs.map((tab, index) => {
            const pending = tab.type === 'session' ? getPendingCount(tab.id) : 0;
            const busy = tab.type === 'session' && pending === 0 && statuses[tab.id]?.type === 'busy';
            return (
              <div key={tab.id} data-tab-id={tab.id} className="flex items-end">
                <TabItem
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
              </div>
            );
          })}
        </div>

        {/* Action buttons group */}
        <div className="flex-shrink-0 flex items-center gap-px pr-1">
          {/* New tab button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleNewTab}
                className={cn(
                  'flex items-center justify-center w-8 h-9 cursor-pointer',
                  'text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
                )}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">New tab</TooltipContent>
          </Tooltip>

          {/* Tab list button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={tabListBtnRef}
                onClick={() => setShowTabList((v) => !v)}
                className={cn(
                  'flex items-center justify-center w-8 h-9 cursor-pointer',
                  'text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
                  showTabList && 'bg-muted/50 text-foreground',
                )}
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Open tab list</TooltipContent>
          </Tooltip>
        </div>
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
