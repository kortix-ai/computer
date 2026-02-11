'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabStore, type Tab, type TabType } from '@/stores/tab-store';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useOpenCodeSessions } from '@/hooks/opencode/use-opencode-sessions';
import { childMapByParent } from '@/ui';

// ============================================================================
// Helpers
// ============================================================================

const TAB_ICONS: Record<TabType, typeof MessageCircle> = {
  session: MessageCircle,
  file: FolderOpen,
  dashboard: LayoutDashboard,
  settings: Settings,
};

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

  // Close on click outside or Escape
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

  // Adjust position so menu doesn't go off screen
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
        'flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors text-left',
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
}: TabItemProps) {
  const Icon = TAB_ICONS[tab.type];

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault();
        if (!tab.pinned) onClose(tab.id);
        return;
      }
      // Left-click to activate
      if (e.button === 0) {
        e.preventDefault();
        onActivate(tab.id, tab.href);
      }
    },
    [tab, onActivate, onClose]
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

  // Show position number for first 9 tabs (Ctrl+1..9 shortcut hint)
  const shortcutHint = index < 9 ? index + 1 : null;

  return (
    <div
      role="tab"
      aria-selected={isActive}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative flex items-center gap-1.5 h-9 px-3 text-xs select-none cursor-pointer',
        'border-r border-border/40 transition-colors',
        'max-w-[180px] min-w-[100px]',
        isActive
          ? 'bg-background text-foreground'
          : 'bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {/* Icon with status (skip icon for sessions — placeholder only) */}
      {tab.type !== 'session' ? (
        <div className="relative flex-shrink-0 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
      ) : (isBusy || pendingCount > 0) ? (
        <div className="relative flex-shrink-0 w-2 h-2">
          {isBusy && (
            <span className="absolute inset-0 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
          {pendingCount > 0 && !isBusy && (
            <span className="absolute inset-0 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </div>
      ) : null}

      {/* Title */}
      <span className="flex-1 truncate">
        {tab.title || 'Untitled'}
      </span>

      {/* Dirty indicator */}
      {tab.dirty && (
        <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}

      {/* Pin indicator (when pinned) */}
      {tab.pinned && (
        <Pin className="flex-shrink-0 h-2.5 w-2.5 text-muted-foreground/50" />
      )}

      {/* Close button / shortcut hint area */}
      {!tab.pinned && (
        <button
          onClick={handleCloseClick}
          className={cn(
            'flex-shrink-0 p-0.5 rounded-sm transition-colors',
            'opacity-0 group-hover:opacity-100',
            'hover:bg-muted-foreground/20'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Active tab indicator -- bottom line */}
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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    position: { x: number; y: number };
  } | null>(null);

  // Track recently closed tab IDs so the route-sync effect doesn't reopen them
  // before the router has finished navigating away.
  const closingTabIds = useRef<Set<string>>(new Set());

  // Tab store
  const tabs = useTabStore((s) => s.tabs);
  const tabOrder = useTabStore((s) => s.tabOrder);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const openTab = useTabStore((s) => s.openTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const pinTab = useTabStore((s) => s.pinTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useTabStore((s) => s.closeTabsToRight);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);

  // Status stores
  const statuses = useOpenCodeSessionStatusStore((s) => s.statuses);
  const permissions = useOpenCodePendingStore((s) => s.permissions);
  const questions = useOpenCodePendingStore((s) => s.questions);

  // Sessions data -- used to keep tab titles in sync
  const { data: sessions } = useOpenCodeSessions();
  const updateTabTitle = useTabStore((s) => s.updateTabTitle);

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

  const orderedTabs = useMemo(
    () => tabOrder.map((id) => tabs[id]).filter(Boolean),
    [tabs, tabOrder]
  );

  // Sync active tab with current route
  useEffect(() => {
    if (!pathname) return;

    // Clear closing-tab tracking once the pathname has actually changed away.
    // This means the router finished navigating after a tab close.
    closingTabIds.current.forEach((id) => {
      const closedHref = `/sessions/${id}`;
      if (pathname !== closedHref) {
        closingTabIds.current.delete(id);
      }
    });

    // Check if current route matches an existing tab
    const matchingTab = orderedTabs.find((t) => t.href === pathname);
    if (matchingTab && matchingTab.id !== activeTabId) {
      setActiveTab(matchingTab.id);
    }

    // Auto-open a tab for the current session page if not already open
    const sessionMatch = pathname.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      // Don't reopen a tab we just closed — the router hasn't navigated away yet
      if (closingTabIds.current.has(sessionId)) return;
      if (!tabs[sessionId]) {
        openTab({
          id: sessionId,
          title: 'Session',
          type: 'session',
          href: `/sessions/${sessionId}`,
        });
      } else {
        setActiveTab(sessionId);
      }
    }
  }, [pathname, orderedTabs, activeTabId, tabs, openTab, setActiveTab]);

  // Build child map for permission aggregation across sub-sessions
  const childMap = useMemo(
    () => (sessions ? childMapByParent(sessions) : new Map<string, string[]>()),
    [sessions],
  );

  // Aggregate pending count: session's own + all child sessions' pending items
  const getPendingCount = useCallback(
    (sessionId: string) => {
      const countForSession = (sid: string) => {
        const permCount = Object.values(permissions).filter(
          (p) => p.sessionID === sid
        ).length;
        const qCount = Object.values(questions).filter(
          (q) => q.sessionID === sid
        ).length;
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

  const handleActivate = useCallback(
    (tabId: string, href: string) => {
      setActiveTab(tabId);
      router.push(href);
    },
    [setActiveTab, router]
  );

  const handleClose = useCallback(
    (tabId: string) => {
      // Mark this tab as "closing" so the route-sync effect won't reopen it
      // while the router is still navigating away from its route.
      closingTabIds.current.add(tabId);

      // Read everything from the store directly to avoid stale closures.
      // closeTab mutates state synchronously, so re-read after to get the next tab.
      const state = useTabStore.getState();
      const nextTabId = state.closeTab(tabId);
      if (nextTabId) {
        const nextTab = useTabStore.getState().tabs[nextTabId];
        if (nextTab) {
          router.push(nextTab.href);
        }
      } else {
        // No tabs left -- go to dashboard
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

  // Horizontal scroll on wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Keyboard shortcuts: Ctrl+1..9 to switch tabs, Ctrl+W to close active tab
  // Using Ctrl (not Cmd/Meta, not Option/Alt) to avoid conflicts with:
  //   - macOS Option+key producing special characters (¡, ™, £, ∑, etc.)
  //   - Browser native Cmd+W (close browser tab), Cmd+1..9 (browser tab switching)
  //   - Chat input text entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Ctrl key combos (not Cmd/Meta)
      if (!e.ctrlKey || e.metaKey || e.altKey) return;

      // Ctrl+1 through Ctrl+9: switch to tab at that position
      const digitMatch = e.code.match(/^Digit(\d)$/);
      if (digitMatch) {
        const num = parseInt(digitMatch[1], 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          const { tabOrder: order, tabs: allTabs } = useTabStore.getState();
          const targetIndex = num - 1;
          // Ctrl+9 always goes to the last tab (like browsers)
          const idx = num === 9 ? order.length - 1 : targetIndex;
          if (idx >= 0 && idx < order.length) {
            const targetTab = allTabs[order[idx]];
            if (targetTab) {
              setActiveTab(targetTab.id);
              router.push(targetTab.href);
            }
          }
          return;
        }
      }

      // Ctrl+W: close active tab
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

  // Don't render if no tabs
  if (orderedTabs.length === 0) return null;

  return (
    <>
      <div
        className="flex-shrink-0 flex items-stretch bg-muted/20 border-b border-border/60 h-9 overflow-hidden"
        role="tablist"
      >
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex items-stretch overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
        >
          {orderedTabs.map((tab, index) => {
            const pending = tab.type === 'session' ? getPendingCount(tab.id) : 0;
            // Matching SolidJS: permissions suppress busy indicator
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
              />
            );
          })}
        </div>

      </div>

      {/* Right-click context menu (portal-style, rendered at fixed position) */}
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
