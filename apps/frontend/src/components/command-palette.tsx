'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';

import {
  Plus,
  LayoutDashboard,
  Bot,
  Sun,
  Moon,
  Monitor,
  Palette,
  PanelLeftClose,
  PanelLeftIcon,
  FileText,
  Loader2,
  Database,
  Settings,
  Cog,
  MessageCircle,
  FileCode,
  Folder,
  TerminalSquare,
  Sparkles,
  Search,
  Layers,
  GitCompareArrows,
  TextSearch,
  Hash,
  Keyboard,
  Slash,
  ArrowRightLeft,
  FolderOpen,
  Blocks,
  Wrench,
  KeyRound,
  MessageSquare,
  Calendar,
  ScrollText,
} from 'lucide-react';

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
  useOpenCodeCommands,
  useExecuteOpenCodeCommand,
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
import { useUserPreferencesStore } from '@/stores/user-preferences-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
import { THEMES, getThemeById } from '@/lib/themes';
import { CompactDialog } from '@/components/session/compact-dialog';
import { DiffDialog } from '@/components/session/diff-dialog';
import { InitProjectDialog } from '@/components/session/init-project-dialog';

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

const isMacPlatform =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

const MOD_KEY = isMacPlatform ? '⌘' : 'Ctrl+';

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
// Keyboard shortcuts reference data
// ============================================================================

const KEYBOARD_SHORTCUTS = [
  { label: 'Command palette', keys: `${MOD_KEY}K`, category: 'General' },
  { label: 'New session', keys: `${MOD_KEY}J`, category: 'General' },
  { label: 'Open terminal', keys: `${MOD_KEY}\``, category: 'General' },
  { label: 'Toggle left sidebar', keys: `${MOD_KEY}B`, category: 'General' },
  { label: 'Toggle right sidebar', keys: `${MOD_KEY}Shift+B`, category: 'General' },
  { label: 'Switch tab 1-8', keys: `${MOD_KEY}1…8`, category: 'Tabs' },
  { label: 'Last tab', keys: `${MOD_KEY}9`, category: 'Tabs' },
  { label: 'Close tab', keys: `${MOD_KEY}W`, category: 'Tabs' },
];

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
  const [initOpen, setInitOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const createSession = useCreateOpenCodeSession();
  const executeCommand = useExecuteOpenCodeCommand();

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

  // Fetch available slash commands
  const { data: slashCommands = [] } = useOpenCodeCommands();

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
        const store = useKortixComputerStore.getState();
        store.setActiveView('terminal');
        store.openSidePanel();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset query and sub-views when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setLssDebouncedQuery('');
      setTextSearchDebouncedQuery('');
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // Filter sessions by query (client-side fuzzy match on title/slug)
  const filteredSessions = useMemo(() => {
    if (!sessions || !query.trim()) return [];
    const q = query.toLowerCase();
    return sessions
      .filter((s) => {
        if (s.parentID || s.time.archived) return false;
        const title = (s.title || s.slug || '').toLowerCase();
        return title.includes(q);
      })
      .slice(0, 8);
  }, [sessions, query]);

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

  // Filter slash commands by query
  const filteredSlashCommands = useMemo(() => {
    if (!query.trim()) return [];
    // Show slash commands when query starts with / or matches command names
    const q = query.toLowerCase().replace(/^\//, '');
    if (!q) return slashCommands.slice(0, 8);
    return slashCommands
      .filter((cmd) => {
        const name = (cmd.name || '').toLowerCase();
        const desc = (cmd.description || '').toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
      .slice(0, 8);
  }, [slashCommands, query]);

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
  const hasSlashCommandResults = filteredSlashCommands.length > 0;
  const hasAnyResults =
    hasSessionResults || hasFileResults || hasLssResults || hasTextResults || hasSlashCommandResults;

  // Show semantic search section (results or skeletons)
  const showLssSection = hasQuery && queryLongEnough;
  const showLssSkeletons = showLssSection && isLssPending && !hasLssResults;

  // Show text search section
  const showTextSection = hasQuery && textQueryLongEnough;
  const showTextSkeletons = showTextSection && isTextPending && !hasTextResults;

  const showQuickActions = !hasQuery;

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
      const type = path.startsWith('/settings') || path === '/configuration'
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
    [router, close],
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

  const handleToggleTheme = useCallback(() => {
    const next =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
    close();
  }, [theme, setTheme, close]);

  const setThemeId = useUserPreferencesStore((s) => s.setThemeId);
  const currentThemeId = useUserPreferencesStore((s) => s.preferences.themeId);

  const handleSwitchTheme = useCallback(
    (themeId: string) => {
      setThemeId(themeId);
      close();
    },
    [setThemeId, close],
  );

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar();
    close();
  }, [toggleSidebar, close]);

  const handleOpenTerminal = useCallback(() => {
    const store = useKortixComputerStore.getState();
    store.setActiveView('terminal');
    store.openSidePanel();
    close();
  }, [close]);

  // Detect if we're on a session page and extract session ID
  const currentSessionId = useMemo(() => {
    const match = pathname?.match(/^\/sessions\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const handleExecuteSlashCommand = useCallback(
    (commandName: string) => {
      if (!currentSessionId) {
        toast.error('Open a session first to run slash commands');
        close();
        return;
      }
      executeCommand.mutate(
        { sessionId: currentSessionId, command: commandName },
        {
          onError: () => toast.error(`Failed to execute /${commandName}`),
        },
      );
      close();
    },
    [currentSessionId, executeCommand, close],
  );

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

  const handleInitProject = useCallback(() => {
    if (!currentSessionId) return;
    close();
    setInitOpen(true);
  }, [currentSessionId, close]);

  // Worktree handlers — disabled for now
  // const handleCreateWorktree = useCallback(() => { ... }, []);
  // const handleSelectWorktreeDir = useCallback(...);
  // const handleRemoveWorktree = useCallback(...);
  // const handleResetWorktree = useCallback(...);

  const themeLabel = useMemo(() => {
    if (theme === 'light') return 'Switch to Dark';
    if (theme === 'dark') return 'Switch to System';
    return 'Switch to Light';
  }, [theme]);

  const ThemeIcon =
    theme === 'light' ? Moon : theme === 'dark' ? Monitor : Sun;

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
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search files, text, sessions… or type / for commands"
          value={query}
          onValueChange={setQuery}
        />
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

          {/* Slash commands (when query starts with / or matches command names) */}
          {hasQuery && hasSlashCommandResults && (
            <CommandGroup heading="Slash Commands">
              {filteredSlashCommands.map((cmd) => (
                <CommandItem
                  key={`cmd-${cmd.name}`}
                  value={`command-${cmd.name}`}
                  onSelect={() => handleExecuteSlashCommand(cmd.name)}
                >
                  <Slash className="mr-2 h-4 w-4 flex-shrink-0" />
                  <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                    <span className="truncate font-medium">/{cmd.name}</span>
                    {cmd.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {cmd.description}
                      </span>
                    )}
                  </div>
                  {!currentSessionId && (
                    <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
                      needs session
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Session title matches (instant, client-side) */}
          {hasQuery && hasSessionResults && (
            <CommandGroup heading="Sessions">
              {filteredSessions.map((session) => (
                <CommandItem
                  key={session.id}
                  value={`session-${session.title || session.slug || session.id}`}
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

          {/* Semantic file search (LSS — BM25 + embeddings) */}
          {showLssSection && (hasLssResults || showLssSkeletons) && (
            <CommandGroup heading={lssHeading}>
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

          {/* Text content search (ripgrep) */}
          {showTextSection && (hasTextResults || showTextSkeletons) && (
            <CommandGroup heading={textSearchHeading}>
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

          {/* File name search results */}
          {hasQuery && hasFileResults && (
            <CommandGroup heading="Files">
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

          {/* Quick actions (when no query) */}
          {showQuickActions && (
            <>
              <CommandGroup heading="Actions">
                <CommandItem onSelect={handleNewSession} disabled={isCreating}>
                  {isCreating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  <span>New Session</span>
                  <CommandShortcut>⌘J</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={handleOpenTerminal}>
                  <TerminalSquare className="mr-2 h-4 w-4" />
                  <span>Open Terminal</span>
                  <CommandShortcut>⌘`</CommandShortcut>
                </CommandItem>
                {currentSessionId && (
                  <CommandItem onSelect={handleCompactSession}>
                    <Layers className="mr-2 h-4 w-4" />
                    <span>Compact Session</span>
                  </CommandItem>
                )}
                {currentSessionId && (
                  <CommandItem onSelect={handleViewChanges}>
                    <GitCompareArrows className="mr-2 h-4 w-4" />
                    <span>View Changes</span>
                  </CommandItem>
                )}
                {currentSessionId && (
                  <CommandItem onSelect={handleInitProject}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    <span>Initialize Project</span>
                  </CommandItem>
                )}
              </CommandGroup>

              <CommandSeparator />

              {/* Worktrees management — disabled for now, will be re-enabled later */}

              {/* Slash commands quick access */}
              {slashCommands.length > 0 && (
                <>
                  <CommandGroup heading="Slash Commands">
                    {slashCommands.slice(0, 6).map((cmd) => (
                      <CommandItem
                        key={`quick-cmd-${cmd.name}`}
                        value={`quick-command-${cmd.name}`}
                        onSelect={() => handleExecuteSlashCommand(cmd.name)}
                      >
                        <Slash className="mr-2 h-4 w-4" />
                        <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                          <span className="truncate">/{cmd.name}</span>
                          {cmd.description && (
                            <span className="text-xs text-muted-foreground truncate">
                              {cmd.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* Session switching */}
              {sessions && sessions.filter((s) => !s.parentID && !s.time.archived).length > 0 && (
                <>
                  <CommandGroup heading="Recent Sessions">
                    {sessions
                      .filter((s) => !s.parentID && !s.time.archived)
                      .slice(0, 5)
                      .map((session) => (
                        <CommandItem
                          key={`recent-${session.id}`}
                          value={`recent-session-${session.title || session.slug || session.id}`}
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
                            </span>
                          </div>
                          <ArrowRightLeft className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                        </CommandItem>
                      ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              <CommandGroup heading="Navigation">
                <CommandItem onSelect={() => handleNavigate('/dashboard', 'Dashboard')}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/projects', 'Projects')}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>Projects</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/workspace', 'Workspace')}>
                  <Blocks className="mr-2 h-4 w-4" />
                  <span>Workspace</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/agents', 'Agents')}>
                  <Bot className="mr-2 h-4 w-4" />
                  <span>Agents</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/skills', 'Skills')}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  <span>Skills</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/commands', 'Commands')}>
                  <Slash className="mr-2 h-4 w-4" />
                  <span>Commands</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/tools', 'Tools')}>
                  <Wrench className="mr-2 h-4 w-4" />
                  <span>Tools</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/files', 'Files')}>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Files</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/channels', 'Channels')}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span>Channels</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/scheduled-tasks', 'Scheduled Tasks')}>
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>Scheduled Tasks</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/changelog', 'Changelog')}>
                  <ScrollText className="mr-2 h-4 w-4" />
                  <span>Changelog</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Settings">
                <CommandItem
                  onSelect={() => handleNavigate('/settings/credentials', 'Secrets Manager')}
                  value="secrets manager credentials env environment variables integrations keys"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  <span>Secrets Manager</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/settings/api-keys', 'API Keys')}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>API Keys</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/configuration', 'Configuration')}>
                  <Cog className="mr-2 h-4 w-4" />
                  <span>Configuration</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Appearance">
                <CommandItem onSelect={() => handleToggleTheme()}>
                  <ThemeIcon className="mr-2 h-4 w-4" />
                  <span>{themeLabel}</span>
                </CommandItem>
                {THEMES.map((t) => (
                  <CommandItem
                    key={t.id}
                    onSelect={() => handleSwitchTheme(t.id)}
                    keywords={['theme', t.name.toLowerCase()]}
                  >
                    <span
                      className="mr-2 h-3 w-3 rounded-full shrink-0 inline-block"
                      style={{ backgroundColor: t.accentColor }}
                    />
                    <span className="flex-1">{t.name}</span>
                    {t.id === currentThemeId && (
                      <span className="ml-auto text-xs text-muted-foreground">Active</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandGroup heading="View">
                <CommandItem onSelect={() => handleToggleSidebar()}>
                  {sidebarOpen ? (
                    <PanelLeftClose className="mr-2 h-4 w-4" />
                  ) : (
                    <PanelLeftIcon className="mr-2 h-4 w-4" />
                  )}
                  <span>
                    {sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
                  </span>
                  <CommandShortcut>⌘B</CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* Keyboard shortcuts reference */}
              <CommandGroup heading="Keyboard Shortcuts">
                {KEYBOARD_SHORTCUTS.map((shortcut) => (
                  <CommandItem
                    key={`shortcut-${shortcut.label}`}
                    value={`shortcut-${shortcut.label}`}
                    disabled
                    className="cursor-default opacity-100"
                  >
                    <Keyboard className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{shortcut.label}</span>
                    <CommandShortcut>{shortcut.keys}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
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
          <InitProjectDialog
            sessionId={currentSessionId}
            open={initOpen}
            onOpenChange={setInitOpen}
          />
        </>
      )}
    </>
  );
}
