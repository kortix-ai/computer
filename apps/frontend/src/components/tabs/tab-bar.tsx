'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useSpring, useTransform } from 'framer-motion';
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
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabStore, type Tab, type TabType, DASHBOARD_TAB_ID } from '@/stores/tab-store';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useDebouncedBusySessions } from '@/hooks/use-debounced-busy-sessions';
import { useOpenCodeSessions, opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';
import { useServerStore } from '@/stores/server-store';
import { childMapByParent } from '@/ui';
import { getClient } from '@/lib/opencode-sdk';
import { getFileIcon } from '@/features/files/components/file-icon';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const DEPLOYMENTS_ENABLED = process.env.NEXT_PUBLIC_KORTIX_DEPLOYMENTS_ENABLED === 'true';


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
  services: Activity,
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
    '/projects': { title: 'Workspace', type: 'page' },
    '/files': { title: 'Files', type: 'page' },
    '/configuration': { title: 'Workspace', type: 'page' },
    '/settings/credentials': { title: 'Secrets Manager', type: 'settings' },
    '/settings/api-keys': { title: 'API Keys', type: 'settings' },
    '/settings/providers': { title: 'LLM Providers', type: 'settings' },
    '/credits-explained': { title: 'Credits', type: 'page' },
    '/support': { title: 'Support', type: 'page' },
    '/admin/analytics': { title: 'Analytics', type: 'page' },
    '/admin/feedback': { title: 'Feedback', type: 'page' },
    '/admin/notifications': { title: 'Notifications', type: 'page' },
    '/admin/utils': { title: 'Admin Utils', type: 'page' },
    '/admin/sandbox-pool': { title: 'Sandbox Pool', type: 'page' },
    '/admin/stateless': { title: 'Stateless', type: 'page' },
    '/admin/stress-test': { title: 'Stress Test', type: 'page' },
    '/changelog': { title: 'Changelog', type: 'page' },
  };

  if (DEPLOYMENTS_ENABLED) {
    ROUTE_MAP['/deployments'] = { title: 'Deployments', type: 'page' };
  }

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
  const agentThreadMatch = pathname.match(/^\/agents\/([^/]+)$/);
  if (agentThreadMatch) {
    return {
      id: `page:${pathname}`,
      title: 'Agent',
      type: 'page',
      href: pathname,
    };
  }

  // File viewer routes (/files/<path>) and terminal routes (/terminal/<ptyId>)
  // are NOT auto-opened here. They are opened explicitly by the sidebar or
  // their respective catch-all route pages. Auto-opening from the sync effect
  // would re-create a tab immediately after closing it, because pushState
  // doesn't update usePathname() and the old URL lingers.

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
      {!tab.pinned && item('Close', 'close', <X className="h-3.5 w-3.5 text-muted-foreground" />, 'Ctrl+W')}
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
        <div className="relative flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          {tab.type === 'session' && isBusy && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          {tab.type === 'session' && pendingCount > 0 && !isBusy && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          )}
        </div>
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
        'group p-2 relative flex items-center text-xs select-none cursor-pointer',
        'transition-[height,color] duration-200 ease-out',
        isDashboard
          ? 'w-9 md:w-10 justify-center px-0'
          : 'gap-2 pl-3 pr-2 max-w-[200px] min-w-[100px]',
        isActive
          ? 'h-[36px] md:h-[40px] text-foreground'
          : 'h-[28px] md:h-[32px] mb-[4px] rounded-[8px] text-muted-foreground hover:text-foreground',
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
              <Icon className={cn('h-3 w-3 flex-shrink-0 transition-colors', isActive ? 'text-foreground/50' : 'text-muted-foreground/40')} />
              {isBusy && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {pendingCount > 0 && !isBusy && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
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
            <Icon className={cn('h-3.5 w-3.5 flex-shrink-0 transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground/50')} />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Home</TooltipContent>
        </Tooltip>
      ) : tab.type === 'file' ? (
        getFileIcon(tab.title || 'file', { className: 'h-3 w-3 flex-shrink-0' })
      ) : (
        <Icon className={cn('h-3 w-3 flex-shrink-0 transition-colors', isActive ? 'text-foreground/50' : 'text-muted-foreground/40')} />
      )}

      {/* Title — hidden for dashboard tab */}
      {!isDashboard && (
        <span className={cn('flex-1 truncate', isActive && 'font-medium')}>
          {tab.title || 'Untitled'}
        </span>
      )}

      {/* Dirty indicator */}
      {tab.dirty && (
        <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}

      {/* Pin indicator — hidden for dashboard (it's always pinned but we don't show the icon) */}
      {tab.pinned && !isDashboard && (
        <Pin className="flex-shrink-0 h-2 w-2 text-muted-foreground/40 -rotate-[20deg]" />
      )}

      {/* Close button — never shown for dashboard */}
      {!tab.pinned && !isDashboard && (
        <button
          onClick={handleCloseClick}
          className={cn(
            'flex-shrink-0 p-0.5 rounded transition-all duration-100 cursor-pointer',
            'hover:bg-foreground/8 active:bg-foreground/12',
            isActive
              ? 'opacity-50 hover:opacity-100'
              : 'opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100',
          )}
          aria-label={`Close ${tab.title}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Tab Bar
// ============================================================================

export function TabBar() {
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

  // Refs for the tab bar container, chrome-style curve elements, and scroll fade
  const tabBarRef = useRef<HTMLDivElement>(null);
  const scrollFadeRef = useRef<HTMLDivElement>(null);

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

  // Debounced busy state — prevents green dot from flickering during reasoning
  const debouncedBusy = useDebouncedBusySessions(statuses);

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
  // We must not prune until sessions data is confirmed fresh for the current server.
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

  // Prefetch session metadata for all open tabs so switching is instant.
  // NOTE: Message prefetching was removed — messages are now served from
  // the Zustand sync store (populated by useSessionSync on mount and kept
  // live by SSE events). The old message prefetch caused duplicate
  // /session/{id}/message requests every time tabs changed.
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
      // Derive the href that corresponds to this tab's ID so we can tell
      // whether the browser is still on the closed tab's route.
      let closedHref: string;
      if (id.startsWith('page:')) {
        closedHref = id.slice(5);
      } else if (id.startsWith('file:')) {
        closedHref = `/files/${encodeURIComponent(id.slice(5))}`;
      } else if (id.startsWith('terminal:')) {
        closedHref = `/terminal/${id.slice(9)}`;
      } else {
        closedHref = `/sessions/${id}`;
      }
      // Only remove from the set once we've navigated away.
      // Compare decoded to handle %2F vs / mismatches from Next.js.
      if (pathname !== closedHref && decodeURIComponent(closedHref) !== pathname) {
        closingTabIds.current.delete(id);
      }
    });

    // If the current URL matches an existing tab, activate it.
    // Compare both raw and decoded hrefs since Next.js decodes %2F in pathnames.
    const matchingTab = orderedTabs.find((t) => t.href === pathname || decodeURIComponent(t.href) === pathname);
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
      const isBusy =
        pendingCount === 0 &&
        (debouncedBusy[sessionId] ||
          statuses[sessionId]?.type === 'busy' ||
          statuses[sessionId]?.type === 'retry');
      return { isBusy: !!isBusy, pendingCount };
    },
    [getPendingCount, debouncedBusy, statuses],
  );

  // Tab switching: all types are pre-mounted, so always use pushState (no re-mount).
  const handleActivate = useCallback(
    (tabId: string, href: string) => {
      setActiveTab(tabId);
      // All tab types are pre-mounted — use pushState to avoid Next.js unmount/remount.
      window.history.pushState(null, '', href);
      // Focus the textarea in the activated tab (session or dashboard)
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('focus-session-textarea'));
      });
    },
    [setActiveTab]
  );

  const handleClose = useCallback(
    (tabId: string) => {
      closingTabIds.current.add(tabId);
      const state = useTabStore.getState();
      const nextTabId = state.closeTab(tabId);
      if (nextTabId) {
        const nextTab = useTabStore.getState().tabs[nextTabId];
        if (nextTab) {
          // All tab types are pre-mounted — use pushState to switch without unmounting.
          window.history.pushState(null, '', nextTab.href);
        }
      } else {
        window.history.pushState(null, '', '/dashboard');
      }
    },
    []
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
          window.history.pushState(null, '', '/dashboard');
          break;
      }
    },
    [pinTab, handleClose, closeOtherTabs, closeTabsToRight, closeAllTabs]
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
  // Uses Ctrl-based tab keybinds
  // ---------------------------------------------------------------------------
  useEffect(() => {
    /** Navigate to a tab — all types are pre-mounted, so always use pushState */
    const navigateToTab = (tab: Tab) => {
      setActiveTab(tab.id);
      window.history.pushState(null, '', tab.href);
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
      const modHeld = e.ctrlKey;
      const modOther = e.metaKey;

      // ── New tab: Modifier + T ────────────────────────────────────────
      if (modHeld && !modOther && !e.shiftKey && !e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        setActiveTab('page:/dashboard');
        window.history.pushState(null, '', '/dashboard');
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
      if (modHeld && !modOther && !e.shiftKey && !e.altKey && e.code === 'KeyW') {
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
  }, [setActiveTab, handleClose]);

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

  // ---------------------------------------------------------------------------
  // Scroll fade: hide the gradient when scrolled fully right (or no overflow).
  // ---------------------------------------------------------------------------
  useLayoutEffect(() => {
    const updateFade = () => {
      const sc = scrollRef.current;
      if (scrollFadeRef.current && sc) {
        const atEnd = sc.scrollWidth - sc.scrollLeft - sc.clientWidth < 2;
        scrollFadeRef.current.style.opacity = atEnd ? '0' : '1';
      }
    };

    updateFade();

    const el = scrollRef.current;
    el?.addEventListener('scroll', updateFade, { passive: true });
    window.addEventListener('resize', updateFade);

    return () => {
      el?.removeEventListener('scroll', updateFade);
      window.removeEventListener('resize', updateFade);
    };
  }, [orderedTabs]);

  const handleNewTab = useCallback(() => {
    setActiveTab(DASHBOARD_TAB_ID);
    window.history.pushState(null, '', '/dashboard');
  }, [setActiveTab]);

  // ─── Morph border: measure active tab position ─────────────────────────
  const springConfig = { stiffness: 500, damping: 40, mass: 0.8 };
  const morphLeft = useSpring(0, springConfig);
  const morphWidth = useSpring(0, springConfig);

  useLayoutEffect(() => {
    if (!activeTabId || !scrollRef.current || !tabBarRef.current) return;
    const el = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement | null;
    if (!el) return;
    const barRect = tabBarRef.current.getBoundingClientRect();
    const tRect = el.getBoundingClientRect();
    morphLeft.set(tRect.left - barRect.left);
    morphWidth.set(tRect.width);
  }, [activeTabId, orderedTabs, morphLeft, morphWidth]);

  const R = 12; // top corner radius — matches content area's rounded-tl-xl (12px)
  const ER = 10; // ear radius
  const SVG_H = 46;

  // Single continuous path: floor → left ear (concave) → tab walls → top corners → right ear (concave) → floor
  // The concave ears are achieved by drawing the FILL path with cubic beziers that curve OUTWARD
  const morphPath = useTransform(
    [morphLeft, morphWidth],
    ([l, w]: number[]) => {
      const barW = (tabBarRef.current?.offsetWidth ?? 2000);
      const tabL = l as number;
      const tabR = tabL + (w as number);
      const f = SVG_H; // floor y
      const t = 8;     // top y — enough room so the border stroke isn't clipped by overflow-hidden
      // Clamp the left ear so it doesn't go off-screen
      const leftEarStart = Math.max(0, tabL - ER);
      const hasLeftEar = tabL > ER;
      const hasRightEar = tabR + ER < barW;
      const rightEarEnd = Math.min(barW, tabR + ER);

      const parts: string[] = [];

      // Floor line from left edge to left ear
      parts.push(`M -1,${f + 1}`); // start below floor to avoid gap
      parts.push(`L -1,${f}`);
      parts.push(`L ${leftEarStart},${f}`);

      if (hasLeftEar) {
        // Left concave ear
        parts.push(`C ${tabL},${f} ${tabL},${f} ${tabL},${f - ER}`);
      } else {
        // No room for ear — go straight up
        parts.push(`L ${tabL},${f}`);
        parts.push(`L ${tabL},${f - ER}`);
      }

      // Left wall up → top-left corner → top edge → top-right corner → right wall down
      parts.push(`L ${tabL},${t + R}`);
      parts.push(`Q ${tabL},${t} ${tabL + R},${t}`);
      parts.push(`L ${tabR - R},${t}`);
      parts.push(`Q ${tabR},${t} ${tabR},${t + R}`);
      parts.push(`L ${tabR},${f - ER}`);

      if (hasRightEar) {
        // Right concave ear
        parts.push(`C ${tabR},${f} ${tabR},${f} ${rightEarEnd},${f}`);
      } else {
        parts.push(`L ${tabR},${f}`);
        parts.push(`L ${rightEarEnd},${f}`);
      }

      // Floor line to right edge
      parts.push(`L ${barW + 1},${f}`);
      parts.push(`L ${barW + 1},${f + 1}`); // below floor to avoid gap

      return parts.join(' ');
    },
  );

  // Always render the bar so the bg-sidebar strip above the content curve is consistent
  if (orderedTabs.length === 0) {
    return <div className="flex-shrink-0 bg-sidebar h-[42px] md:h-[46px]" />;
  }

  return (
    <>
      <div
        ref={tabBarRef}
        className="flex-shrink-0 flex items-end bg-sidebar h-[42px] md:h-[46px] relative"
        role="tablist"
      >
        {/* Morphing border SVG — positioned over the full tab bar width, overflow visible so floor stroke isn't clipped */}
        {activeTabId && (
          <svg
            className="absolute bottom-0 left-0 w-full pointer-events-none z-30"
            style={{ height: SVG_H }}
            overflow="visible"
            preserveAspectRatio="none"
          >
            <motion.path
              d={morphPath}
              className="fill-background stroke-border/50"
              strokeWidth={1}
            />
          </svg>
        )}

        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex-1 flex items-end overflow-x-auto px-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] relative z-40"
        >
          {orderedTabs.map((tab, index) => {
            const pending = tab.type === 'session' ? getPendingCount(tab.id) : 0;
            const busy = tab.type === 'session' && pending === 0 && (debouncedBusy[tab.id] || statuses[tab.id]?.type === 'busy' || statuses[tab.id]?.type === 'retry');
            return (
              <div key={tab.id} data-tab-id={tab.id} className={cn("flex items-end relative", tab.id === activeTabId ? "z-20" : "z-0")}>
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

        {/* Action buttons group — solid bg so tabs don't scroll behind */}
        <div className="flex-shrink-0 flex items-center gap-px pr-1 relative z-20 bg-sidebar pl-2 h-full">
          {/* Fade edge — hidden when scrolled fully right */}
          <div ref={scrollFadeRef} className="absolute right-full top-0 bottom-0 w-3 bg-gradient-to-r from-transparent to-sidebar pointer-events-none transition-opacity duration-150" />
          {/* New tab button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleNewTab}
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-md cursor-pointer',
                  'text-muted-foreground/50 hover:text-muted-foreground transition-colors',
                )}
              >
                <Plus className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">New tab</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={tabListBtnRef}
                onClick={() => setShowTabList((v) => !v)}
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-md cursor-pointer',
                  'text-muted-foreground/50 hover:text-muted-foreground transition-colors',
                  showTabList && 'text-muted-foreground',
                )}
              >
                <ChevronsUpDown className="h-3 w-3" />
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
