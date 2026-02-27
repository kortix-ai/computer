'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Loader2,
  MessageCircle,
  FileCode,
  Folder,
  Sparkles,
  Search,
  TextSearch,
  ArrowRightLeft,
  FileText,
  PanelLeftClose,
  PanelLeftIcon,
} from 'lucide-react';

import {
  getItemsForSurface,
  type MenuItemDef,
  type SettingsTabId,
} from '@/lib/menu-registry';

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { useSidebar } from '@/components/ui/sidebar';
import {
  useOpenCodeSessions,
} from '@/hooks/opencode/use-opencode-sessions';
// Worktree hooks — disabled for now, will be re-enabled later
// import {
//   useWorktreeList,
//   useCreateWorktree,
//   useRemoveWorktree,
//   useResetWorktree,
// } from '@/hooks/opencode/use-opencode-worktree';
import { useFileSearch, useTextSearch, useLssSearch } from '@/features/files';
import type { FindMatch } from '@/features/files';
import { toast } from '@/lib/toast';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useCreatePty } from '@/hooks/opencode/use-opencode-pty';
import { CompactDialog } from '@/components/session/compact-dialog';
import { DiffDialog } from '@/components/session/diff-dialog';
import { UserSettingsModal } from '@/components/settings/user-settings-modal';
import { PlanSelectionModal } from '@/components/billing/pricing';
import { createClient } from '@/lib/supabase/client';
import { isBillingEnabled } from '@/lib/config';
import { useTheme } from 'next-themes';
import { clearUserLocalStorage } from '@/lib/utils/clear-local-storage';
import { useAuth } from '@/components/AuthProvider';

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatRelativeTimeFromISO(dateStr: string | null): string {
  if (!dateStr) return '';
  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) return '';
  return formatRelativeTime(timestamp);
}

function getFileIcon(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (filePath.endsWith('/')) return Folder;

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'go':
    case 'rs':
    case 'java':
    case 'c':
    case 'cpp':
    case 'rb':
    case 'swift':
    case 'kt':
      return FileCode;
    default:
      return FileText;
  }
}

/**
 * Strip the /workspace prefix from an absolute file path returned by LSS.
 */
function stripWorkspacePrefix(filePath: string): string {
  return filePath.replace(/^\/workspace\/?/, '');
}

/**
 * Format a relevance score as a human-readable percentage.
 */
function formatRelevance(score: number): string {
  const pct = Math.min(Math.round(score * 100), 100);
  if (pct > 0) return `${pct}%`;
  return score.toFixed(3);
}

/**
 * Clean a snippet from LSS for display in the palette.
 */
function cleanSnippet(snippet: string): string {
  return snippet
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 200);
}

// ============================================================================
// Skeleton components for loading states
// ============================================================================

/** Skeleton row mimicking a semantic search result. */
function ContentResultSkeleton() {
  return (
    <div className="flex items-start gap-2 px-2 py-2.5">
      <Skeleton className="h-4 w-4 rounded flex-shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-24 rounded" />
          <Skeleton className="h-3 w-8 rounded" />
        </div>
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-32 rounded" />
      </div>
    </div>
  );
}

/** Skeleton row mimicking a conversation search result. */
function ConversationResultSkeleton() {
  return (
    <div className="flex items-start gap-2 px-2 py-2.5">
      <Skeleton className="h-4 w-4 rounded flex-shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <Skeleton className="h-3.5 w-36 rounded" />
        <Skeleton className="h-3 w-full rounded" />
      </div>
    </div>
  );
}

/** Multiple skeleton rows for a loading group. */
function SearchSkeletons({
  count = 3,
  variant = 'content',
}: {
  count?: number;
  variant?: 'content' | 'conversation';
}) {
  const Row =
    variant === 'conversation'
      ? ConversationResultSkeleton
      : ContentResultSkeleton;
  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Row key={i} />
      ))}
    </div>
  );
}

// ============================================================================
// Command Palette
// ============================================================================

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [lssDebouncedQuery, setLssDebouncedQuery] = useState('');
  const [textSearchDebouncedQuery, setTextSearchDebouncedQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general');
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const createSession = useCreateOpenCodeSession();
  const createPty = useCreatePty();
  const { theme, setTheme } = useTheme();
  const billingEnabled = isBillingEnabled();
  const { user: authUser } = useAuth();

  // Derive user's first name for personalized greeting
  const firstName = useMemo(() => {
    if (!authUser) return '';
    const fullName = authUser.user_metadata?.name || authUser.email?.split('@')[0] || '';
    return fullName.split(' ')[0] || '';
  }, [authUser]);

  // Personalized greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = firstName ? `, ${firstName}` : '';
    if (hour >= 5 && hour < 12) return `Good morning${name}`;
    if (hour >= 12 && hour < 17) return `Good afternoon${name}`;
    return `Good evening${name}`;
  }, [firstName]);

  // Worktree management — disabled for now
  // const [worktreeBrowsePath, setWorktreeBrowsePath] = useState<string | null>(null);
  // const { data: worktrees = [] } = useWorktreeList();
  // const { data: browseFiles } = useFileList(worktreeBrowsePath || '', { enabled: !!worktreeBrowsePath });
  // const createWorktree = useCreateWorktree();
  // const removeWorktree = useRemoveWorktree();
  // const resetWorktree = useResetWorktree();
  // const browseDirs = useMemo(
  //   () => (browseFiles || []).filter((f: FileNode) => f.type === 'directory' && !f.ignored),
  //   [browseFiles],
  // );

  // Fetch all sessions (for client-side title filter)
  const { data: sessions } = useOpenCodeSessions();

  // Debounce the query for file search API calls (300ms — fast)
  useEffect(() => {
    if (query.length < 2) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Separate debounce for LSS search (500ms — heavier operation)
  useEffect(() => {
    if (query.length < 2) {
      setLssDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setLssDebouncedQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  // Debounce for text search (600ms — ripgrep over workspace)
  useEffect(() => {
    if (query.length < 3) {
      setTextSearchDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setTextSearchDebouncedQuery(query), 600);
    return () => clearTimeout(timer);
  }, [query]);

  // File search (API-driven, fuzzy match)
  const {
    data: fileResults = [],
    isFetching: isFileSearching,
  } = useFileSearch(debouncedQuery, {
    limit: 10,
    enabled: debouncedQuery.length >= 2,
  });

  // Semantic search (LSS — BM25 + embeddings over workspace files)
  const {
    data: lssResults = [],
    isFetching: isLssSearching,
  } = useLssSearch(lssDebouncedQuery, {
    limit: 8,
    enabled: lssDebouncedQuery.length >= 2,
  });

  // Text content search (ripgrep across workspace files)
  const {
    data: textSearchResults = [],
    isFetching: isTextSearching,
  } = useTextSearch(textSearchDebouncedQuery, {
    enabled: textSearchDebouncedQuery.length >= 3,
  });

  const close = useCallback(() => setOpen(false), []);

  const handleOpenTerminal = useCallback(async () => {
    try {
      const pty = await createPty.mutateAsync({
        env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      });
      openTabAndNavigate({
        id: `terminal:${pty.id}`,
        title: pty.title || pty.command || 'Terminal',
        type: 'terminal',
        href: `/terminal/${pty.id}`,
      });
    } catch (e) {
      toast.error('Failed to open terminal');
    }
    close();
  }, [createPty, close]);

  // Global keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      // Cmd+J is handled by sidebar-left.tsx — no duplicate handler here.
      if (e.key === '`' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleOpenTerminal();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [handleOpenTerminal]);

  // Reset query and sub-views when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setLssDebouncedQuery('');
      setTextSearchDebouncedQuery('');
    }
  }, [open]);

  // ------------------------------------------------------------------
  // Fuzzy match helper — checks if all query words appear in the text
  // ------------------------------------------------------------------
  const fuzzyMatch = useCallback((text: string, q: string): boolean => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = text.toLowerCase();
    return words.every((w) => haystack.includes(w));
  }, []);

  // Filter sessions by query (client-side fuzzy match on title/slug/id)
  const filteredSessions = useMemo(() => {
    if (!sessions || !query.trim()) return [];
    const q = query.trim();
    return sessions
      .filter((s) => {
        if (s.parentID || s.time.archived) return false;
        // Search across title, slug, and ID for maximum findability
        const searchable = [s.title, s.slug, s.id].filter(Boolean).join(' ');
        return fuzzyMatch(searchable, q);
      })
      .slice(0, 20);
  }, [sessions, query, fuzzyMatch]);

  // Non-archived, non-child sessions for "Recent Sessions" section
  const recentSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter((s) => !s.parentID && !s.time.archived).slice(0, 10);
  }, [sessions]);

  // Deduplicate LSS results against file results (prefer file results for name matches)
  const filteredLssResults = useMemo(() => {
    if (lssResults.length === 0) return [];
    const filePathSet = new Set(fileResults);
    return lssResults.filter(
      (hit) => !filePathSet.has(stripWorkspacePrefix(hit.file_path)),
    );
  }, [lssResults, fileResults]);

  // Deduplicate, filter noise, and limit text search results
  const filteredTextResults = useMemo(() => {
    if (textSearchResults.length === 0) return [];
    // Filter out .git internals, node_modules, lock files, and other noise
    const ignoredPaths = ['.git/', 'node_modules/', '.next/', '.cache/', '__pycache__/'];
    const ignoredFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const filtered = textSearchResults.filter((match) => {
      const p = match.path;
      if (ignoredPaths.some((prefix) => p.includes(prefix))) return false;
      const fileName = p.split('/').pop() || '';
      if (ignoredFiles.includes(fileName)) return false;
      return true;
    });
    // Group by file path and take the top matches
    const byFile = new Map<string, FindMatch[]>();
    for (const match of filtered) {
      const existing = byFile.get(match.path) || [];
      if (existing.length < 2) {
        existing.push(match);
        byFile.set(match.path, existing);
      }
    }
    // Flatten, limit to 10 results
    const results: FindMatch[] = [];
    for (const matches of byFile.values()) {
      results.push(...matches);
      if (results.length >= 10) break;
    }
    return results.slice(0, 10);
  }, [textSearchResults]);

  const hasQuery = query.trim().length > 0;
  const queryLongEnough = query.trim().length >= 2;
  const textQueryLongEnough = query.trim().length >= 3;

  // LSS pending state (includes debounce wait)
  const isLssDebouncing = queryLongEnough && query !== lssDebouncedQuery;
  const isLssPending = isLssDebouncing || isLssSearching;

  // File search pending state
  const isFileDebouncing = queryLongEnough && query !== debouncedQuery;
  const isFilePending = isFileDebouncing || isFileSearching;

  // Text search pending state
  const isTextDebouncing = textQueryLongEnough && query !== textSearchDebouncedQuery;
  const isTextPending = isTextDebouncing || isTextSearching;

  const hasSessionResults = filteredSessions.length > 0;
  const hasFileResults = fileResults.length > 0;
  const hasLssResults = filteredLssResults.length > 0;
  const hasTextResults = filteredTextResults.length > 0;
  const hasAnyResults =
    hasSessionResults || hasFileResults || hasLssResults || hasTextResults;

  // Show semantic search section (results or skeletons)
  const showLssSection = hasQuery && queryLongEnough;
  const showLssSkeletons = showLssSection && isLssPending && !hasLssResults;

  // Show text search section
  const showTextSection = hasQuery && textQueryLongEnough;
  const showTextSkeletons = showTextSection && isTextPending && !hasTextResults;

  // Overall pending state
  const isAnyPending = isLssPending || isFilePending || isTextPending;
  // "Hard" pending = an actual network fetch is in flight (not just debounce timer)
  const isAnyFetching = isFileSearching || isLssSearching || isTextSearching;
  const showGlobalLoading =
    hasQuery &&
    queryLongEnough &&
    isAnyFetching &&
    !hasAnyResults &&
    !showLssSkeletons &&
    !showTextSkeletons;
  // Show "no results" when nothing found and no active fetches
  // (debounce timers alone don't block showing the empty state)
  const showNoResults =
    hasQuery &&
    queryLongEnough &&
    !isAnyFetching &&
    !hasAnyResults;

  const handleNewSession = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const session = await createSession.mutateAsync();
      openTabAndNavigate({
        id: session.id,
        title: 'New session',
        type: 'session',
        href: `/sessions/${session.id}`,
      });
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('focus-session-textarea'));
      });
      close();
    } catch {
      toast.error('Failed to create session');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, createSession, close]);

  const handleNavigate = useCallback(
    (path: string, label?: string) => {
      const type = path.startsWith('/settings')
        ? 'settings' as const
        : 'page' as const;
      openTabAndNavigate({
        id: `page:${path}`,
        title: label || path.split('/').pop() || '',
        type,
        href: path,
      }, router);
      close();
    },
    [router, close],
  );

  const handleSelectSession = useCallback(
    (sessionId: string, title?: string) => {
      openTabAndNavigate({
        id: sessionId,
        title: title || 'Session',
        type: 'session',
        href: `/sessions/${sessionId}`,
      });
      close();
    },
    [close],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      const fileName = filePath.split('/').pop() || filePath;
      const tabId = `file:${filePath}`;
      const href = `/files/${encodeURIComponent(filePath)}`;
      openTabAndNavigate({
        id: tabId,
        title: fileName,
        type: 'file',
        href,
      });
      close();
    },
    [close],
  );

  const handleSelectLssResult = useCallback(
    (absolutePath: string) => {
      const relativePath = stripWorkspacePrefix(absolutePath);
      handleSelectFile(relativePath);
    },
    [handleSelectFile],
  );

  const handleSelectTextResult = useCallback(
    (match: FindMatch) => {
      handleSelectFile(match.path);
    },
    [handleSelectFile],
  );

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar();
    close();
  }, [toggleSidebar, close]);

  const handleOpenSettings = useCallback((tab: SettingsTabId) => {
    close();
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, [close]);

  const handleOpenPlan = useCallback(() => {
    close();
    setPlanModalOpen(true);
  }, [close]);

  const handleLogout = useCallback(async () => {
    close();
    const supabase = createClient();
    await supabase.auth.signOut();
    clearUserLocalStorage();
    router.push('/auth');
  }, [close, router]);

  const handleSetTheme = useCallback((newTheme: string) => {
    setTheme(newTheme);
    close();
  }, [setTheme, close]);

  // Detect if we're on a session page and extract session ID
  const currentSessionId = useMemo(() => {
    const match = pathname?.match(/^\/sessions\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const handleCompactSession = useCallback(() => {
    if (!currentSessionId) return;
    close();
    setCompactOpen(true);
  }, [currentSessionId, close]);

  const handleViewChanges = useCallback(() => {
    if (!currentSessionId) return;
    close();
    setDiffOpen(true);
  }, [currentSessionId, close]);

  // View tasks is now shown in the chat input todo panel — no modal needed

  // ── Registry action dispatcher ──
  const actionHandlers: Record<string, () => void> = useMemo(() => ({
    newSession: handleNewSession,
    openTerminal: handleOpenTerminal,
    compactSession: handleCompactSession,
    viewChanges: handleViewChanges,
    toggleSidebar: handleToggleSidebar,
    logout: handleLogout,
    openPlan: handleOpenPlan,
  }), [handleNewSession, handleOpenTerminal, handleCompactSession, handleViewChanges, handleToggleSidebar, handleLogout, handleOpenPlan]);

  const handleRegistryItem = useCallback((item: MenuItemDef) => {
    switch (item.kind) {
      case 'navigate':
        handleNavigate(item.href!, item.label);
        break;
      case 'settings':
        handleOpenSettings(item.settingsTab!);
        break;
      case 'theme':
        handleSetTheme(item.themeValue!);
        break;
      case 'action': {
        const handler = actionHandlers[item.actionId!];
        if (handler) handler();
        break;
      }
    }
  }, [handleNavigate, handleOpenSettings, handleSetTheme, actionHandlers]);

  // ── All registry items visible in the palette (filtered by runtime conditions) ──
  const allPaletteItems = useMemo(() => {
    return getItemsForSurface('commandPalette').filter((item) => {
      if (item.requiresBilling && !billingEnabled) return false;
      if (item.requiresSession && !currentSessionId) return false;
      return true;
    });
  }, [billingEnabled, currentSessionId]);

  // Group headings
  const lssHeading = (
    <span className="inline-flex items-center gap-1.5">
      <Sparkles className="h-3 w-3" />
      Semantic Search
      {isLssPending && hasLssResults && (
        <Loader2 className="h-3 w-3 animate-spin ml-0.5 text-muted-foreground" />
      )}
    </span>
  );

  const textSearchHeading = (
    <span className="inline-flex items-center gap-1.5">
      <TextSearch className="h-3 w-3" />
      Text Search
      {isTextPending && hasTextResults && (
        <Loader2 className="h-3 w-3 animate-spin ml-0.5 text-muted-foreground" />
      )}
    </span>
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-2xl">
        <CommandInput
          placeholder={hasQuery ? 'Search files, sessions, commands...' : 'What would you like to do?'}
          value={query}
          onValueChange={setQuery}
        />

        {/* ── IDLE STATE: Personalized home ── */}
        {!hasQuery && (
          <div className="px-5 pb-5 pt-2">
            {/* Personalized greeting */}
            <div className="text-center mb-5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {greeting}
              </h2>
              <p className="text-[13px] text-muted-foreground mt-1">
                Search anything or pick a shortcut below
              </p>
            </div>

            {/* Quick nav grid — from registry */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
              {allPaletteItems
                .filter((item) =>
                  item.group === 'actions' ||
                  item.group === 'navigation'
                )
                .slice(0, 8)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleRegistryItem(item)}
                      disabled={item.id === 'new-session' && isCreating}
                      className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-[12px] text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground transition-all duration-150 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-foreground/[0.05] group-hover:bg-foreground/[0.08] transition-colors duration-150">
                        {item.id === 'new-session' && isCreating ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors duration-150" />
                        )}
                      </div>
                      <span className="truncate max-w-full">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[10px] text-muted-foreground/60">{item.shortcut}</span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Recent sessions */}
            {recentSessions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                    Recent sessions
                  </span>
                </div>
                <div className="space-y-0.5">
                  {recentSessions.slice(0, 5).map((session) => (
                    <button
                      key={session.id}
                      onClick={() => {
                        handleSelectSession(
                          session.id,
                          session.title || session.slug || 'Untitled',
                        );
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground transition-all duration-150 cursor-pointer group"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">
                        {session.title || session.slug || 'Untitled'}
                      </span>
                      <span className="text-[11px] text-muted-foreground/40 flex-shrink-0">
                        {formatRelativeTime(session.time.updated)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Settings & preferences row */}
            <div className="mt-3 pt-3 border-t border-border/40">
              <div className="flex flex-wrap gap-1.5">
                {allPaletteItems
                  .filter((item) =>
                    item.group === 'preferences' ||
                    item.group === 'settingsPages' ||
                    item.group === 'theme' ||
                    item.group === 'view'
                  )
                  .map((item) => {
                    const Icon = item.icon;
                    // Dynamic sidebar toggle
                    const isToggleSidebar = item.id === 'toggle-sidebar';
                    const displayLabel = isToggleSidebar
                      ? (sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar')
                      : item.label;
                    const DisplayIcon = isToggleSidebar
                      ? (sidebarOpen ? PanelLeftClose : PanelLeftIcon)
                      : Icon;
                    const isActiveTheme = item.kind === 'theme' && theme === item.themeValue;

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleRegistryItem(item)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                          isActiveTheme
                            ? 'bg-foreground/[0.1] text-foreground font-medium'
                            : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
                        }`}
                      >
                        <DisplayIcon className="h-3 w-3" />
                        <span>{displayLabel}</span>
                        {item.shortcut && (
                          <span className="text-[10px] text-muted-foreground/50 ml-0.5">{item.shortcut}</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ── SEARCH STATE: Results ── */}
        {hasQuery && (
          <CommandList>
            {/* Global loading — only when absolutely nothing else is visible */}
            {showGlobalLoading && (
              <CommandEmpty>
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Searching...</span>
                </div>
              </CommandEmpty>
            )}

            {/* No results — all fetches done, nothing found */}
            {showNoResults && (
              <div className="flex flex-col items-center gap-1.5 py-6" cmdk-empty="">
                <Search className="h-5 w-5 text-muted-foreground/50" />
                <span className="text-sm text-muted-foreground">
                  No results found for &ldquo;{query.trim()}&rdquo;
                </span>
              </div>
            )}

            {/* Session title matches (instant, client-side) */}
            {hasSessionResults && (
              <CommandGroup heading="Sessions" forceMount>
                {filteredSessions.map((session) => (
                  <CommandItem
                    key={session.id}
                    value={`session-${session.id}`}
                    onSelect={() =>
                      handleSelectSession(
                        session.id,
                        session.title || session.slug || 'Untitled',
                      )
                    }
                  >
                    <MessageCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                      <span className="truncate">
                        {session.title || session.slug || 'Untitled'}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {formatRelativeTime(session.time.updated)}
                        {session.summary && session.summary.files > 0 && (
                          <span className="ml-1.5">
                            · {session.summary.files} file
                            {session.summary.files !== 1 ? 's' : ''} changed
                          </span>
                        )}
                      </span>
                    </div>
                    <ArrowRightLeft className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* File name search results (fastest — 300ms debounce) */}
            {hasFileResults && (
              <CommandGroup heading="Files" forceMount>
                {fileResults.map((filePath) => {
                  const FileIcon = getFileIcon(filePath);
                  const fileName = filePath.split('/').pop() || filePath;
                  const dirPath = filePath.split('/').slice(0, -1).join('/');
                  return (
                    <CommandItem
                      key={filePath}
                      value={`file-${filePath}`}
                      onSelect={() => handleSelectFile(filePath)}
                    >
                      <FileIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                        <span className="truncate">{fileName}</span>
                        {dirPath && (
                          <span className="text-xs text-muted-foreground truncate">
                            {dirPath}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Text content search (ripgrep — 600ms debounce) */}
            {showTextSection && (hasTextResults || showTextSkeletons) && (
              <CommandGroup heading={textSearchHeading} forceMount>
                {hasTextResults &&
                  filteredTextResults.map((match, index) => {
                    const FileIcon = getFileIcon(match.path);
                    const fileName = match.path.split('/').pop() || match.path;
                    const dirPath = match.path.split('/').slice(0, -1).join('/');
                    const linePreview = match.lines.trim().slice(0, 120);

                    return (
                      <CommandItem
                        key={`text-${match.path}-${match.line_number}-${index}`}
                        value={`text-${match.path}-${match.line_number}-${index}`}
                        onSelect={() => handleSelectTextResult(match)}
                      >
                        <FileIcon className="mr-2 h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex flex-col overflow-hidden flex-1 min-w-0 gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-sm">
                              {fileName}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 tabular-nums font-mono">
                              L{match.line_number}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground/80 line-clamp-1 leading-relaxed font-mono">
                            {linePreview}
                          </span>
                          {dirPath && (
                            <span className="text-[11px] text-muted-foreground/50 truncate">
                              {dirPath}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}

                {showTextSkeletons && (
                  <SearchSkeletons count={3} variant="content" />
                )}
              </CommandGroup>
            )}

            {/* Semantic file search (LSS — BM25 + embeddings, slowest — 500ms debounce) */}
            {showLssSection && (hasLssResults || showLssSkeletons) && (
              <CommandGroup heading={lssHeading} forceMount>
                {hasLssResults &&
                  filteredLssResults.map((hit) => {
                    const relativePath = stripWorkspacePrefix(hit.file_path);
                    const FileIcon = getFileIcon(relativePath);
                    const fileName =
                      relativePath.split('/').pop() || relativePath;
                    const dirPath = relativePath
                      .split('/')
                      .slice(0, -1)
                      .join('/');
                    const snippet = cleanSnippet(hit.snippet);

                    return (
                      <CommandItem
                        key={`lss-${hit.file_path}-${hit.score}`}
                        value={`lss-${relativePath}-${snippet.slice(0, 30)}`}
                        onSelect={() => handleSelectLssResult(hit.file_path)}
                      >
                        <FileIcon className="mr-2 h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex flex-col overflow-hidden flex-1 min-w-0 gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-sm">
                              {fileName}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 tabular-nums">
                              {formatRelevance(hit.score)}
                            </span>
                          </div>
                          {snippet && (
                            <span className="text-xs text-muted-foreground/80 line-clamp-1 leading-relaxed">
                              {snippet}
                            </span>
                          )}
                          {dirPath && (
                            <span className="text-[11px] text-muted-foreground/50 truncate">
                              {dirPath}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}

                {showLssSkeletons && (
                  <SearchSkeletons count={3} variant="content" />
                )}
              </CommandGroup>
            )}

            {/* ── All registry commands (filterable by search) ── */}
            <CommandGroup heading="Commands">
              {allPaletteItems.map((item) => {
                const Icon = item.icon;
                const isToggleSidebar = item.id === 'toggle-sidebar';
                const SidebarIcon = isToggleSidebar
                  ? (sidebarOpen ? PanelLeftClose : PanelLeftIcon)
                  : Icon;
                const displayLabel = isToggleSidebar
                  ? (sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar')
                  : item.label;
                const isActiveTheme = item.kind === 'theme' && theme === item.themeValue;

                return (
                  <CommandItem
                    key={item.id}
                    value={item.keywords || `${item.group} ${item.label} ${item.id}`}
                    onSelect={() => handleRegistryItem(item)}
                    disabled={item.id === 'new-session' && isCreating}
                  >
                    {item.id === 'new-session' && isCreating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <SidebarIcon className="mr-2 h-4 w-4" />
                    )}
                    <span>{displayLabel}</span>
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                    {isActiveTheme && (
                      <span className="ml-auto text-xs text-muted-foreground">Active</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        )}
      </CommandDialog>

      {currentSessionId && (
        <>
          <CompactDialog
            sessionId={currentSessionId}
            open={compactOpen}
            onOpenChange={setCompactOpen}
          />
          <DiffDialog
            sessionId={currentSessionId}
            open={diffOpen}
            onOpenChange={setDiffOpen}
          />
        </>
      )}

      <UserSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsTab}
      />
      <PlanSelectionModal
        open={planModalOpen}
        onOpenChange={setPlanModalOpen}
      />
    </>
  );
}
