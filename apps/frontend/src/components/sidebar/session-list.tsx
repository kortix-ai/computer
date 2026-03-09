'use client';

import { useState, useMemo, useCallback, startTransition, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  MoreHorizontal,
  Trash2,
  Frown,
  MessageCircle,
  Pencil,
  Archive,
  ArchiveRestore,
  ChevronRight,
  ChevronDown,
  GitFork,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSidebar } from '@/components/ui/sidebar';
import { DeleteConfirmationDialog } from '@/components/thread/DeleteConfirmationDialog';
import { CompactDialog } from '@/components/session/compact-dialog';
import {
  useOpenCodeSessions,
  useDeleteOpenCodeSession,
  useUpdateOpenCodeSession,
} from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useDebouncedBusySessions } from '@/hooks/use-debounced-busy-sessions';
import { useSyncStore } from '@/stores/opencode-sync-store';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTabStore, openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { useSandboxConnectionStore } from '@/stores/sandbox-connection-store';

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
  onCompact: (sessionId: string) => void;
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
  onCompact,
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
          'flex items-center gap-2 py-1.5 rounded-lg text-[13px] cursor-pointer',
          'transition-colors duration-150',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
          'pr-2.5',
        )}
        style={{ paddingLeft: `${14 + depth * 12}px` }}
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
            className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-sidebar-foreground transition-colors duration-150 cursor-pointer"
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
                <GitFork className="size-3 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Forked from {parentTitle || 'parent session'}
            </TooltipContent>
          </Tooltip>
        ) : depth > 0 ? (
          <span className="flex-shrink-0 w-4 flex items-center justify-center">
            <span className="h-1 w-1 rounded-full bg-muted-foreground" />
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
                : 'Working on it\u2026'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Title */}
        <span
          className={cn(
            'flex-1 truncate',
            isActive ? 'text-sidebar-accent-foreground font-medium' : '',
            depth > 0 && !isActive && 'text-muted-foreground text-xs',
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
                   'p-0.5 rounded-md hover:bg-sidebar-accent transition-colors duration-150 text-muted-foreground hover:text-sidebar-foreground cursor-pointer',
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
            <DropdownMenuContent align="end" className="w-40 p-1">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRename(session.id, session.title || '');
                }}
              >
                <Pencil className="h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCompact(session.id);
                }}
              >
                <Layers className="h-4 w-4" />
                Compact
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onArchive(session.id);
                }}
              >
                <Archive className="h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(session.id, session.title || 'Untitled');
                }}
              >
                <Trash2 className="h-4 w-4" />
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
  onCompact: (sessionId: string) => void;
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
  onCompact,
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
        onCompact={onCompact}
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
              onCompact={onCompact}
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
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [sessionToArchive, setSessionToArchive] = useState<{ id: string; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: sessions, isLoading, error, refetch } = useOpenCodeSessions();
  const { mutate: deleteSession, isPending: isDeleting } = useDeleteOpenCodeSession();
  const { mutate: updateSession } = useUpdateOpenCodeSession();

  // Auto-refetch sessions when connection recovers from error state
  const connectionStatus = useSandboxConnectionStore((s) => s.status);
  const prevConnectionRef = useRef(connectionStatus);
  useEffect(() => {
    const prev = prevConnectionRef.current;
    prevConnectionRef.current = connectionStatus;
    if (prev !== 'connected' && connectionStatus === 'connected' && error) {
      refetch();
    }
  }, [connectionStatus, error, refetch]);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [compactSessionId, setCompactSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const statuses = useOpenCodeSessionStatusStore((s) => s.statuses);
  const syncStatuses = useSyncStore((s) => s.sessionStatus);
  const permissions = useOpenCodePendingStore((s) => s.permissions);
  const questions = useOpenCodePendingStore((s) => s.questions);

  // Debounced busy state — prevents green dot from flickering during reasoning
  const debouncedBusy = useDebouncedBusySessions(statuses);

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
  // Check debounced state first (handles reasoning gaps), then fall back to
  // raw status stores for immediate reactivity.
  const getStatus = useCallback(
    (sessionId: string) => {
      const pendingCount = getPendingCount(sessionId);
      const isBusy =
        pendingCount === 0 &&
        (debouncedBusy[sessionId] ||
          statuses[sessionId]?.type === 'busy' ||
          statuses[sessionId]?.type === 'retry' ||
          syncStatuses[sessionId]?.type === 'busy' ||
          syncStatuses[sessionId]?.type === 'retry');
      return { isBusy: !!isBusy, pendingCount };
    },
    [getPendingCount, debouncedBusy, statuses, syncStatuses],
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
      const aIsBusy = aPending === 0 && (debouncedBusy[a.id] || statuses[a.id]?.type === 'busy' || syncStatuses[a.id]?.type === 'busy') ? 1 : 0;
      const bIsBusy = bPending === 0 && (debouncedBusy[b.id] || statuses[b.id]?.type === 'busy' || syncStatuses[b.id]?.type === 'busy') ? 1 : 0;
      if (aIsBusy > bIsBusy) return -1;
      if (bIsBusy > aIsBusy) return 1;
      return 0;
    });
  }, [sessions, projectId, debouncedBusy, statuses, syncStatuses, getPendingCount, forkIds]);

  // Archived sessions
  const archivedSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions
      .filter((s) => !!(s.time as any).archived)
      .sort((a, b) => ((b.time as any).archived || 0) - ((a.time as any).archived || 0));
  }, [sessions]);

  const handleSessionClick = (e: React.MouseEvent, sessionId: string) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (isMobile) setOpenMobile(false);

    const session = rootSessions.find(s => s.id === sessionId) ||
      sessions?.find(s => s.id === sessionId);
    const parentId = session?.parentID || forkOriginMap.get(sessionId);
    openTabAndNavigate({
      id: sessionId,
      title: session?.title || 'Session',
      type: 'session',
      href: `/sessions/${sessionId}`,
      ...(parentId && { parentSessionId: parentId }),
      serverId: useServerStore.getState().activeServerId,
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
    const session = sessions?.find((s) => s.id === sessionId);
    setSessionToArchive({ id: sessionId, name: session?.title || 'Untitled' });
    setIsArchiveDialogOpen(true);
  };

  const confirmArchive = () => {
    if (!sessionToArchive) return;
    setIsArchiveDialogOpen(false);
    const isActive = pathname?.includes(sessionToArchive.id);

    // Close the tab for the archived session
    const tabState = useTabStore.getState();
    if (tabState.tabs[sessionToArchive.id]) {
      tabState.closeTab(sessionToArchive.id);
    }

    updateSession(
      { sessionId: sessionToArchive.id, archived: true },
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
    setSessionToArchive(null);
  };

  const handleUnarchiveSession = (sessionId: string) => {
    updateSession({ sessionId, archived: false });
  };

  const handleCompactSession = (sessionId: string) => {
    setCompactSessionId(sessionId);
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
    <div className="flex flex-col pl-2">
      {/* Archived sessions toggle */}
      {archivedSessions.length > 0 && !isLoading && !error && (
        <div className="px-2 pb-1">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
          >
            <Archive className="size-3" />
            <span>Archived</span>
            <span className="ml-auto text-[10px] tabular-nums bg-muted px-1.5 py-0.5 rounded-full">{archivedSessions.length}</span>
            {showArchived ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
          {showArchived && (
            <div className="space-y-0.5 mt-0.5 mb-1">
              {archivedSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-150 group cursor-pointer"
                >
                  <span className="flex-1 truncate text-xs">
                    {session.title || 'Untitled'}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleUnarchiveSession(session.id)}
                        className="p-0.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors cursor-pointer"
                      >
                        <ArchiveRestore className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      Unarchive
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleDeleteSession(session.id, session.title || 'Untitled')}
                        className="p-0.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      Delete
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session list */}
      <div className="px-2 pb-2">
        {isLoading ? (
          <div className="space-y-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-lg">
                <div className="h-3.5 w-24 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Frown className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Failed to connect</p>
            <p className="text-xs text-muted-foreground mt-1">Could not reach server</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg bg-muted hover:bg-sidebar-accent transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : rootSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No sessions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start a new session to get going</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Pending sessions — need user input */}
            {rootSessions.filter((s) => getPendingCount(s.id) > 0).map((session) => (
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
                onCompact={handleCompactSession}
              />
            ))}


            {/* Remaining sessions */}
            {rootSessions.filter((s) => getPendingCount(s.id) === 0).map((session) => (
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
                onCompact={handleCompactSession}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {sessionToDelete && (
        <DeleteConfirmationDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
          threadName={sessionToDelete.name}
          isDeleting={isDeleting}
        />
      )}

      {/* Archive confirmation dialog */}
      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive{' '}
              <span className="font-semibold">&ldquo;{sessionToArchive?.name}&rdquo;</span>?
              <br />
              You can restore it later from the archived list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmArchive();
              }}
              className="cursor-pointer"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Compact dialog */}
      {compactSessionId && (
        <CompactDialog
          sessionId={compactSessionId}
          open={!!compactSessionId}
          onOpenChange={(open) => { if (!open) setCompactSessionId(null); }}
        />
      )}

      {/* Rename dialog */}
      <Dialog
        open={!!renameSessionId}
        onOpenChange={(open) => { if (!open) setRenameSessionId(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>
              Enter a new name for this session.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
            }}
            autoFocus
            placeholder="Session title..."
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRenameSessionId(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmRename}
              className="cursor-pointer"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
