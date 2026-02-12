'use client';

import { useState, useMemo, useCallback, startTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useRef } from 'react';
import {
  MoreHorizontal,
  Trash2,
  Frown,
  MessageCircle,
  Pencil,
  Archive,
  ChevronRight,
  GitFork,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import { DeleteConfirmationDialog } from '@/components/thread/DeleteConfirmationDialog';
import {
  useOpenCodeSessions,
  useDeleteOpenCodeSession,
  useUpdateOpenCodeSession,
} from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';

import { childMapByParent, sortSessions, allDescendantIds } from '@/ui';
import type { Session } from '@/hooks/opencode/use-opencode-sessions';
import Link from 'next/link';

// ============================================================================
// Session Item (supports depth for tree rendering)
// ============================================================================

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isBusy: boolean;
  pendingCount: number;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isFork: boolean;
  parentTitle?: string;
  onToggleExpand: () => void;
  onClick: (e: React.MouseEvent, sessionId: string) => void;
  onDelete: (sessionId: string, title: string) => void;
  onRename: (sessionId: string, currentTitle: string) => void;
  onArchive: (sessionId: string) => void;
}

function SessionItem({
  session,
  isActive,
  isBusy,
  pendingCount,
  depth,
  hasChildren,
  isExpanded,
  isFork,
  parentTitle,
  onToggleExpand,
  onClick,
  onDelete,
  onRename,
  onArchive,
}: SessionItemProps) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <Link
      href={`/sessions/${session.id}`}
      onClick={(e) => onClick(e, session.id)}
      className="block"
    >
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 rounded-lg text-sm cursor-pointer',
          'transition-all duration-150 ease-out',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          depth === 0 ? 'px-3' : 'pr-3',
        )}
        style={depth > 0 ? { paddingLeft: `${12 + depth * 16}px` } : undefined}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Expand/collapse chevron for parents, fork icon for forks, or a subtle connector for children */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleExpand();
            }}
            className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-sidebar-foreground transition-colors duration-150 cursor-pointer"
          >
            <ChevronRight
              className={cn(
                'h-3 w-3 transition-transform duration-150',
                isExpanded && 'rotate-90',
              )}
            />
          </button>
        ) : isFork ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-shrink-0 w-4 flex items-center justify-center">
                <GitFork className="size-3 text-muted-foreground/60" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Forked from {parentTitle || 'parent session'}
            </TooltipContent>
          </Tooltip>
        ) : depth > 0 ? (
          <span className="flex-shrink-0 w-4 flex items-center justify-center">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/20" />
          </span>
        ) : null}

        {/* Status indicator */}
        {(isBusy || pendingCount > 0) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-shrink-0">
                {pendingCount > 0 ? (
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse block" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse block" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {pendingCount > 0
                ? `${pendingCount} ${pendingCount === 1 ? 'question' : 'questions'} waiting for your input`
                : 'Working on it…'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Title */}
        <span
          className={cn(
            'flex-1 truncate',
            depth === 0
              ? isActive ? 'text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/80'
              : 'text-muted-foreground/70 text-xs',
          )}
        >
          {session.title || 'Untitled'}
        </span>

        {/* Pending badge */}
        {pendingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-shrink-0 h-4 min-w-4 px-1 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-medium flex items-center justify-center">
                {pendingCount}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {pendingCount} {pendingCount === 1 ? 'question' : 'questions'} waiting for your input
            </TooltipContent>
          </Tooltip>
        )}

        {/* Context menu on hover */}
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'p-0.5 rounded-md hover:bg-sidebar-accent transition-all duration-150 ease-out text-muted-foreground/60 hover:text-sidebar-foreground cursor-pointer',
                  isHovering ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRename(session.id, session.title || '');
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onArchive(session.id);
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(session.id, session.title || 'Untitled');
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// Session Tree Node (recursive)
// ============================================================================

interface SessionTreeNodeProps {
  session: Session;
  depth: number;
  allSessions: Session[];
  childMap: Map<string, string[]>;
  expandedNodes: Record<string, boolean>;
  forkIds: Set<string>;
  parentTitle?: string;
  onToggleExpand: (sessionId: string) => void;
  isActiveSession: (sessionId: string) => boolean;
  getStatus: (sessionId: string) => { isBusy: boolean; pendingCount: number };
  onClick: (e: React.MouseEvent, sessionId: string) => void;
  onDelete: (sessionId: string, title: string) => void;
  onRename: (sessionId: string, currentTitle: string) => void;
  onArchive: (sessionId: string) => void;
}

function SessionTreeNode({
  session,
  depth,
  allSessions,
  childMap,
  expandedNodes,
  forkIds,
  parentTitle,
  onToggleExpand,
  isActiveSession,
  getStatus,
  onClick,
  onDelete,
  onRename,
  onArchive,
}: SessionTreeNodeProps) {
  const childIds = childMap.get(session.id);
  const hasChildren = !!childIds && childIds.length > 0;
  const isExpanded = expandedNodes[session.id] ?? false;
  const { isBusy, pendingCount } = getStatus(session.id);

  // Look up child session objects
  const childSessions = useMemo(() => {
    if (!childIds) return [];
    return childIds
      .map((id) => allSessions.find((s) => s.id === id))
      .filter((s): s is Session => !!s)
      .sort((a, b) => a.time.created - b.time.created);
  }, [childIds, allSessions]);

  return (
    <>
      <SessionItem
        session={session}
        isActive={isActiveSession(session.id)}
        isBusy={isBusy}
        pendingCount={pendingCount}
        depth={depth}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        isFork={forkIds.has(session.id)}
        parentTitle={parentTitle}
        onToggleExpand={() => onToggleExpand(session.id)}
        onClick={onClick}
        onDelete={onDelete}
        onRename={onRename}
        onArchive={onArchive}
      />
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Vertical tree line */}
          {depth < 2 && (
            <div
              className="absolute top-0 bottom-0 border-l border-border/40"
              style={{ left: `${20 + depth * 16}px` }}
            />
          )}
          {childSessions.map((child) => (
            <SessionTreeNode
              key={child.id}
              session={child}
              depth={depth + 1}
              allSessions={allSessions}
              childMap={childMap}
              expandedNodes={expandedNodes}
              forkIds={forkIds}
              parentTitle={session.title || 'Untitled'}
              onToggleExpand={onToggleExpand}
              isActiveSession={isActiveSession}
              getStatus={getStatus}
              onClick={onClick}
              onDelete={onDelete}
              onRename={onRename}
              onArchive={onArchive}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================================
// Session List
// ============================================================================

interface SessionListProps {
  projectId?: string | null;
}

export function SessionList({ projectId }: SessionListProps = {}) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: sessions, isLoading, error } = useOpenCodeSessions();
  const { mutate: deleteSession, isPending: isDeleting } = useDeleteOpenCodeSession();
  const { mutate: updateSession } = useUpdateOpenCodeSession();
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [renameValue, setRenameValue] = useState('');
  const statuses = useOpenCodeSessionStatusStore((s) => s.statuses);
  const permissions = useOpenCodePendingStore((s) => s.permissions);
  const questions = useOpenCodePendingStore((s) => s.questions);

  // Track which tree nodes are manually expanded/collapsed
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});

  // Build fork origin map from localStorage: forkSessionId → parentSessionId.
  // This is the client-side source of truth for fork relationships because the
  // server may not set parentID on forked sessions.
  const forkOriginMap = useMemo(() => {
    const map = new Map<string, string>();
    if (typeof window === 'undefined' || !sessions) return map;
    for (const s of sessions) {
      const origin = localStorage.getItem(`fork_origin_${s.id}`);
      if (origin) {
        map.set(s.id, origin);
      }
    }
    return map;
  }, [sessions]);

  // Set of session IDs that are forks
  const forkIds = useMemo(() => new Set(forkOriginMap.keys()), [forkOriginMap]);

  // Build child map for tree structure.
  // Merges server-side parentID relationships with client-side fork origin data
  // so that forked sessions appear under their parent even if the server doesn't
  // populate parentID.
  const childMap = useMemo(() => {
    if (!sessions) return new Map<string, string[]>();
    const map = childMapByParent(sessions);

    // Add fork relationships from localStorage that aren't already in the map
    for (const [forkId, parentId] of forkOriginMap) {
      const session = sessions.find((s) => s.id === forkId);
      // Skip if the session already has parentID (already in the server-side map)
      if (session?.parentID) continue;
      // Skip if the parent session doesn't exist
      if (!sessions.find((s) => s.id === parentId)) continue;

      const existing = map.get(parentId);
      if (existing) {
        if (!existing.includes(forkId)) existing.push(forkId);
      } else {
        map.set(parentId, [forkId]);
      }
    }

    return map;
  }, [sessions, forkOriginMap]);

  // Count pending for a single session (not recursive)
  // For questions, count the total number of individual questions across all requests
  const countPendingForSession = useCallback(
    (sid: string) => {
      const permCount = Object.values(permissions).filter((p) => p.sessionID === sid).length;
      const qCount = Object.values(questions)
        .filter((q) => q.sessionID === sid)
        .reduce((sum, q) => sum + (q.questions?.length || 1), 0);
      return permCount + qCount;
    },
    [permissions, questions],
  );

  // Aggregate pending count: session's own + all descendants
  const getPendingCount = useCallback(
    (sessionId: string) => {
      let total = countPendingForSession(sessionId);
      const descendants = allDescendantIds(childMap, sessionId);
      for (const descId of descendants) {
        total += countPendingForSession(descId);
      }
      return total;
    },
    [countPendingForSession, childMap],
  );

  // Check if any descendant is busy or has pending items (for auto-expand)
  const hasActiveDescendant = useCallback(
    (sessionId: string) => {
      const descendants = allDescendantIds(childMap, sessionId);
      for (const descId of descendants) {
        if (statuses[descId]?.type === 'busy') return true;
        if (countPendingForSession(descId) > 0) return true;
      }
      return false;
    },
    [childMap, statuses, countPendingForSession],
  );

  // Extract the active session ID from the URL so we can auto-expand its parent
  const activeSessionId = useMemo(() => {
    const match = pathname?.match(/^\/sessions\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Compute expanded state: manual overrides take priority, otherwise auto-expand
  // when a descendant is active (busy/pending) or when the user is viewing a child session.
  const expandedNodes = useMemo(() => {
    const result: Record<string, boolean> = {};
    if (!sessions) return result;
    for (const session of sessions) {
      const childIds = childMap.get(session.id);
      if (!childIds || childIds.length === 0) continue;
      if (session.id in manualExpanded) {
        result[session.id] = manualExpanded[session.id];
      } else {
        // Auto-expand if any descendant is active (busy/pending)
        // or if the user is currently viewing a descendant session
        const descendants = allDescendantIds(childMap, session.id);
        const viewingDescendant = !!activeSessionId && descendants.includes(activeSessionId);
        result[session.id] = hasActiveDescendant(session.id) || viewingDescendant;
      }
    }
    return result;
  }, [sessions, childMap, manualExpanded, hasActiveDescendant, activeSessionId]);

  const handleToggleExpand = useCallback((sessionId: string) => {
    setManualExpanded((prev) => ({
      ...prev,
      [sessionId]: !(prev[sessionId] ?? expandedNodes[sessionId] ?? false),
    }));
  }, [expandedNodes]);

  // Get status for a session (busy + pending)
  const getStatus = useCallback(
    (sessionId: string) => {
      const pendingCount = getPendingCount(sessionId);
      // Matching SolidJS: permissions suppress busy indicator
      const isBusy = pendingCount === 0 && statuses[sessionId]?.type === 'busy';
      return { isBusy: !!isBusy, pendingCount };
    },
    [getPendingCount, statuses],
  );

  // Filter to root sessions only for the top-level list.
  // Exclude sessions that have parentID OR are forks tracked in localStorage.
  const rootSessions = useMemo(() => {
    if (!sessions) return [];
    let list = sessions.filter((s) => !s.parentID && !forkIds.has(s.id) && !(s.time as any).archived);
    if (projectId !== null && projectId !== undefined) {
      list = list.filter((s) => s.projectID === projectId);
    }
    // Base sort: stabilized (recent sessions pinned, older by updated time)
    const baseSorted = [...list].sort(sortSessions(Date.now()));
    // Priority-sort: pending first, then busy
    return baseSorted.sort((a, b) => {
      const aPending = getPendingCount(a.id);
      const bPending = getPendingCount(b.id);
      if (aPending > 0 && bPending === 0) return -1;
      if (bPending > 0 && aPending === 0) return 1;
      const aBusy = aPending === 0 && statuses[a.id]?.type === 'busy' ? 1 : 0;
      const bBusy = bPending === 0 && statuses[b.id]?.type === 'busy' ? 1 : 0;
      if (aBusy > bBusy) return -1;
      if (bBusy > aBusy) return 1;
      return 0;
    });
  }, [sessions, projectId, statuses, getPendingCount, forkIds]);

  // Filter sessions by search query
  const filteredRootSessions = useMemo(() => {
    if (!searchQuery.trim()) return rootSessions;
    const q = searchQuery.toLowerCase();
    return rootSessions.filter((s) => {
      // Match root session title
      if ((s.title || 'Untitled').toLowerCase().includes(q)) return true;
      // Also match if any child/descendant title matches (so the parent shows)
      const descendants = allDescendantIds(childMap, s.id);
      return descendants.some((descId) => {
        const desc = sessions?.find((ds) => ds.id === descId);
        return desc && (desc.title || 'Untitled').toLowerCase().includes(q);
      });
    });
  }, [rootSessions, searchQuery, childMap, sessions]);

  const handleSessionClick = (e: React.MouseEvent, sessionId: string) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (isMobile) setOpenMobile(false);

    const session = rootSessions.find(s => s.id === sessionId) ||
      sessions?.find(s => s.id === sessionId);
    const parentId = session?.parentID || forkOriginMap.get(sessionId);
    useTabStore.getState().openTab({
      id: sessionId,
      title: session?.title || 'Session',
      type: 'session',
      href: `/sessions/${sessionId}`,
      ...(parentId && { parentSessionId: parentId }),
      serverId: useServerStore.getState().activeServerId,
    });

    startTransition(() => {
      router.push(`/sessions/${sessionId}`);
    });
  };

  const handleDeleteSession = (sessionId: string, title: string) => {
    setSessionToDelete({ id: sessionId, name: title });
    setIsDeleteDialogOpen(true);
  };

  const handleRenameSession = (sessionId: string, currentTitle: string) => {
    setRenameSessionId(sessionId);
    setRenameValue(currentTitle);
  };

  const confirmRename = () => {
    if (!renameSessionId || !renameValue.trim()) {
      setRenameSessionId(null);
      return;
    }
    updateSession(
      { sessionId: renameSessionId, title: renameValue.trim() },
    );
    setRenameSessionId(null);
  };

  const handleArchiveSession = (sessionId: string) => {
    const isActive = pathname?.includes(sessionId);

    // Close the tab for the archived session
    const tabState = useTabStore.getState();
    if (tabState.tabs[sessionId]) {
      tabState.closeTab(sessionId);
    }

    updateSession(
      { sessionId, archived: true },
      {
        onSuccess: () => {
          if (isActive) {
            const nextState = useTabStore.getState();
            const nextTab = nextState.activeTabId ? nextState.tabs[nextState.activeTabId] : null;
            router.push(nextTab?.href || '/dashboard');
          }
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!sessionToDelete) return;
    setIsDeleteDialogOpen(false);
    const isActive = pathname?.includes(sessionToDelete.id);

    // Close the tab for the deleted session and navigate BEFORE the async
    // deletion so the route-sync effect in TabBar doesn't re-open the tab
    // (which would cause an infinite setState loop).
    const tabState = useTabStore.getState();
    if (tabState.tabs[sessionToDelete.id]) {
      const nextTabId = tabState.closeTab(sessionToDelete.id);
      if (isActive) {
        const nextTab = nextTabId ? useTabStore.getState().tabs[nextTabId] : null;
        router.push(nextTab?.href || '/dashboard');
      }
    } else if (isActive) {
      router.push('/dashboard');
    }

    deleteSession(sessionToDelete.id);
    setSessionToDelete(null);
  };

  const isActiveSession = (sessionId: string) =>
    pathname?.includes(sessionId) || false;

  if (state === 'collapsed' && !isMobile) return null;

  return (
    <div className="flex flex-col">
      {/* Search */}
      {!isLoading && !error && rootSessions.length > 0 && (
        <div className="px-2 pb-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-7 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-border focus:bg-muted/60 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="px-2 pb-2">
        {isLoading ? (
          <div className="space-y-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-lg">
                <div className="h-3.5 w-24 bg-muted/20 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Frown className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Failed to connect</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Could not reach server</p>
          </div>
        ) : rootSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No sessions yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Start a new session to get going</p>
          </div>
        ) : filteredRootSessions.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
            <Search className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No sessions match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Pending sessions — need user input */}
            {filteredRootSessions.filter((s) => getPendingCount(s.id) > 0).map((session) => (
              <SessionTreeNode
                key={session.id}
                session={session}
                depth={0}
                allSessions={sessions || []}
                childMap={childMap}
                expandedNodes={expandedNodes}
                forkIds={forkIds}
                onToggleExpand={handleToggleExpand}
                isActiveSession={isActiveSession}
                getStatus={getStatus}
                onClick={handleSessionClick}
                onDelete={handleDeleteSession}
                onRename={handleRenameSession}
                onArchive={handleArchiveSession}
              />
            ))}

            {/* Divider between pending and other sessions */}
            {filteredRootSessions.some((s) => getPendingCount(s.id) > 0) &&
              filteredRootSessions.some((s) => getPendingCount(s.id) === 0) && (
              <div className="flex items-center gap-2 px-3 py-1.5">
                <div className="flex-1 h-px bg-border/20" />
              </div>
            )}

            {/* Remaining sessions */}
            {filteredRootSessions.filter((s) => getPendingCount(s.id) === 0).map((session) => (
              <SessionTreeNode
                key={session.id}
                session={session}
                depth={0}
                allSessions={sessions || []}
                childMap={childMap}
                expandedNodes={expandedNodes}
                forkIds={forkIds}
                onToggleExpand={handleToggleExpand}
                isActiveSession={isActiveSession}
                getStatus={getStatus}
                onClick={handleSessionClick}
                onDelete={handleDeleteSession}
                onRename={handleRenameSession}
                onArchive={handleArchiveSession}
              />
            ))}
          </div>
        )}
      </div>

      {sessionToDelete && (
        <DeleteConfirmationDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
          threadName={sessionToDelete.name}
          isDeleting={isDeleting}
        />
      )}

      {/* Rename dialog */}
      {renameSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRenameSessionId(null)}>
          <div className="bg-popover border border-border rounded-xl shadow-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium mb-3">Rename session</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setRenameSessionId(null);
              }}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Session title..."
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setRenameSessionId(null)}
                className="px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRename}
                className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
