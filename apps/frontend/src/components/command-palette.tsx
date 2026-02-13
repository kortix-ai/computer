'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

import {
  Plus,
  LayoutDashboard,
  Bot,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  PanelLeftIcon,
  FileText,
  Loader2,
  Database,
  Zap,
  Settings,
  MessageCircle,
  FileCode,
  Folder,
  TerminalSquare,
  Sparkles,
  Search,
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
import { useOpenCodeSessions } from '@/hooks/opencode/use-opencode-sessions';
import { useFileSearch, useLssSearch } from '@/features/files';
import { toast } from '@/lib/toast';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';

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

/** Skeleton row mimicking a semantic search result with icon, filename, snippet, and path. */
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

/** Multiple skeleton rows for the semantic search loading state. */
function ContentSearchSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <ContentResultSkeleton key={i} />
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
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const createSession = useCreateOpenCodeSession();

  // Fetch all sessions
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

  // File search (API-driven, fuzzy match)
  const {
    data: fileResults = [],
    isFetching: isFileSearching,
  } = useFileSearch(debouncedQuery, {
    limit: 10,
    enabled: debouncedQuery.length >= 2,
  });

  // Semantic search (LSS — BM25 + embeddings)
  const {
    data: lssResults = [],
    isFetching: isLssSearching,
  } = useLssSearch(lssDebouncedQuery, {
    limit: 8,
    enabled: lssDebouncedQuery.length >= 2,
  });

  // Global keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setLssDebouncedQuery('');
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

  const hasQuery = query.trim().length > 0;
  const queryLongEnough = query.trim().length >= 2;

  // LSS is "pending" if user typed >=2 chars but debounced query hasn't caught up yet
  // or the query is running
  const isLssDebouncing =
    queryLongEnough && query !== lssDebouncedQuery;
  const isLssPending = isLssDebouncing || isLssSearching;

  const isFileDebouncing =
    queryLongEnough && query !== debouncedQuery;
  const isFilePending = isFileDebouncing || isFileSearching;

  const hasSessionResults = filteredSessions.length > 0;
  const hasFileResults = fileResults.length > 0;
  const hasLssResults = filteredLssResults.length > 0;
  const hasAnyResults = hasSessionResults || hasFileResults || hasLssResults;

  // Show the semantic search section (results or skeletons) whenever query >= 2
  const showLssSection = hasQuery && queryLongEnough;
  // Show skeletons when pending and no results yet
  const showLssSkeletons = showLssSection && isLssPending && !hasLssResults;

  const showQuickActions = !hasQuery;

  // Overall: show the global "searching" empty only when nothing at all is visible
  const isAnyPending = isLssPending || isFilePending;
  const showGlobalLoading =
    hasQuery && queryLongEnough && isAnyPending && !hasAnyResults && !showLssSkeletons;

  const handleNewSession = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const session = await createSession.mutateAsync();
      useTabStore.getState().openTab({
        id: session.id,
        title: 'New session',
        type: 'session',
        href: `/sessions/${session.id}`,
      });
      router.push(`/sessions/${session.id}`);
      toast.success('New session created');
      close();
    } catch {
      toast.error('Failed to create session');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, createSession, router, close]);

  const handleNavigate = useCallback(
    (path: string) => {
      router.push(path);
      close();
    },
    [router, close],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      router.push(`/sessions/${sessionId}`);
      close();
    },
    [router, close],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      const fileName = filePath.split('/').pop() || filePath;
      const tabId = `file:${filePath}`;
      const href = `/files/${encodeURIComponent(filePath)}`;
      useTabStore.getState().openTab({
        id: tabId,
        title: fileName,
        type: 'file',
        href,
      });
      window.history.pushState(null, '', href);
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

  const handleToggleTheme = useCallback(() => {
    const next =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
    close();
  }, [theme, setTheme, close]);

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

  const themeLabel = useMemo(() => {
    if (theme === 'light') return 'Switch to Dark';
    if (theme === 'dark') return 'Switch to System';
    return 'Switch to Light';
  }, [theme]);

  const ThemeIcon =
    theme === 'light' ? Moon : theme === 'dark' ? Monitor : Sun;

  // Shared heading for the semantic search group
  const lssHeading = (
    <span className="inline-flex items-center gap-1.5">
      <Sparkles className="h-3 w-3" />
      Semantic Search
      {isLssPending && hasLssResults && (
        <Loader2 className="h-3 w-3 animate-spin ml-0.5 text-muted-foreground" />
      )}
    </span>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search sessions, content, files, or type a command..."
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

        {/* No results — all searches done, nothing found */}
        {hasQuery &&
          queryLongEnough &&
          !isAnyPending &&
          !hasAnyResults && (
            <CommandEmpty>
              <div className="flex flex-col items-center gap-1.5 py-4">
                <Search className="h-5 w-5 text-muted-foreground/50" />
                <span className="text-muted-foreground">No results found.</span>
              </div>
            </CommandEmpty>
          )}

        {/* Session search results */}
        {hasQuery && hasSessionResults && (
          <CommandGroup heading="Sessions">
            {filteredSessions.map((session) => (
              <CommandItem
                key={session.id}
                value={`session-${session.title || session.slug || session.id}`}
                onSelect={() => handleSelectSession(session.id)}
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
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Semantic search results (LSS) — with skeletons during loading */}
        {showLssSection && (hasLssResults || showLssSkeletons) && (
          <CommandGroup heading={lssHeading}>
            {/* Actual results */}
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

            {/* Skeleton loading rows */}
            {showLssSkeletons && <ContentSearchSkeletons count={3} />}
          </CommandGroup>
        )}

        {/* File search results */}
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
              </CommandItem>
              <CommandItem onSelect={handleOpenTerminal}>
                <TerminalSquare className="mr-2 h-4 w-4" />
                <span>Open Terminal</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => handleNavigate('/dashboard')}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/agents')}>
                <Bot className="mr-2 h-4 w-4" />
                <span>Agents</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/knowledge')}>
                <Database className="mr-2 h-4 w-4" />
                <span>Knowledge</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/triggers')}>
                <Zap className="mr-2 h-4 w-4" />
                <span>Triggers</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/settings/api-keys')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Appearance">
              <CommandItem onSelect={handleToggleTheme}>
                <ThemeIcon className="mr-2 h-4 w-4" />
                <span>{themeLabel}</span>
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="View">
              <CommandItem onSelect={handleToggleSidebar}>
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
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
