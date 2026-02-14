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
  PanelLeftClose,
  PanelLeftIcon,
  FileText,
  Loader2,
  Database,
  Zap,
  Settings,
  Cog,
  MessageCircle,
  FileCode,
  Folder,
  TerminalSquare,
  Sparkles,
  Search,
  MessagesSquare,
  Layers,
  GitCompareArrows,
  ListTodo,
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
import { useThreadSearch } from '@/hooks/threads/use-thread-search';
import { useFileSearch, useLssSearch } from '@/features/files';
import { toast } from '@/lib/toast';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
import { CompactDialog } from '@/components/session/compact-dialog';
import { DiffDialog } from '@/components/session/diff-dialog';
import { TodoDialog } from '@/components/session/todo-dialog';
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
  const [isCreating, setIsCreating] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const createSession = useCreateOpenCodeSession();

  // Fetch all sessions (for client-side title filter)
  const { data: sessions } = useOpenCodeSessions();

  // Thread/conversation content search (backend semantic search, 400ms internal debounce)
  const {
    results: threadResults,
    isSearching: isThreadSearching,
    isConfigured: isThreadSearchConfigured,
  } = useThreadSearch(open ? query : '', 6);

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

  // Semantic search (LSS — BM25 + embeddings over workspace files)
  // TODO: temporarily disabled
  const {
    data: lssResults = [],
    isFetching: isLssSearching,
  } = useLssSearch(lssDebouncedQuery, {
    limit: 8,
    enabled: false,
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

  // Thread search pending state
  const isThreadPending = queryLongEnough && isThreadSearching;
  const hasThreadResults = threadResults.length > 0;

  // LSS pending state (includes debounce wait)
  const isLssDebouncing = queryLongEnough && query !== lssDebouncedQuery;
  const isLssPending = isLssDebouncing || isLssSearching;

  // File search pending state
  const isFileDebouncing = queryLongEnough && query !== debouncedQuery;
  const isFilePending = isFileDebouncing || isFileSearching;

  const hasSessionResults = filteredSessions.length > 0;
  const hasFileResults = fileResults.length > 0;
  const hasLssResults = filteredLssResults.length > 0;
  const hasAnyResults =
    hasSessionResults || hasFileResults || hasLssResults || hasThreadResults;

  // Show semantic search section (results or skeletons)
  const showLssSection = hasQuery && queryLongEnough;
  const showLssSkeletons = showLssSection && isLssPending && !hasLssResults;

  // Show thread search section (results or skeletons)
  const showThreadSection =
    hasQuery && queryLongEnough && isThreadSearchConfigured;
  const showThreadSkeletons =
    showThreadSection && isThreadPending && !hasThreadResults;

  const showQuickActions = !hasQuery;

  // Overall pending state
  const isAnyPending = isLssPending || isFilePending || isThreadPending;
  const showGlobalLoading =
    hasQuery &&
    queryLongEnough &&
    isAnyPending &&
    !hasAnyResults &&
    !showLssSkeletons &&
    !showThreadSkeletons;

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
      window.history.pushState(null, '', `/sessions/${session.id}`);
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
      useTabStore.getState().openTab({
        id: `page:${path}`,
        title: label || path.split('/').pop() || '',
        type,
        href: path,
      });
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

  /**
   * Navigate to a thread search result.
   * Uses the project page since thread_id ≠ session.id (different systems).
   */
  const handleSelectThread = useCallback(
    (threadId: string, projectId: string | null) => {
      if (projectId) {
        router.push(`/projects/${projectId}`);
      } else {
        // Fallback: navigate to dashboard if no project
        router.push('/dashboard');
      }
      close();
    },
    [router, close],
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

  const handleViewTasks = useCallback(() => {
    if (!currentSessionId) return;
    close();
    setTodoOpen(true);
  }, [currentSessionId, close]);

  const handleInitProject = useCallback(() => {
    if (!currentSessionId) return;
    close();
    setInitOpen(true);
  }, [currentSessionId, close]);

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

  const threadHeading = (
    <span className="inline-flex items-center gap-1.5">
      <MessagesSquare className="h-3 w-3" />
      Conversations
      {isThreadPending && hasThreadResults && (
        <Loader2 className="h-3 w-3 animate-spin ml-0.5 text-muted-foreground" />
      )}
    </span>
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search sessions, conversations, files, or type a command..."
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
                  <span className="text-muted-foreground">
                    No results found.
                  </span>
                </div>
              </CommandEmpty>
            )}

          {/* Session title matches (instant, client-side) */}
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

          {/* Conversation content search (backend semantic search) */}
          {showThreadSection &&
            (hasThreadResults || showThreadSkeletons) && (
              <CommandGroup heading={threadHeading}>
                {hasThreadResults &&
                  threadResults.map((result, index) => (
                    <CommandItem
                      key={`thread-${result.thread_id}-${index}`}
                      value={`thread-${result.thread_id}-${index}-${result.text_preview?.slice(0, 20)}`}
                      onSelect={() =>
                        handleSelectThread(
                          result.thread_id,
                          result.project_id,
                        )
                      }
                    >
                      <MessagesSquare className="mr-2 h-4 w-4 flex-shrink-0 mt-0.5" />
                      <div className="flex flex-col overflow-hidden flex-1 min-w-0 gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-sm">
                            {result.project_name || 'Untitled'}
                          </span>
                          {result.updated_at && (
                            <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
                              {formatRelativeTimeFromISO(result.updated_at)}
                            </span>
                          )}
                        </div>
                        {result.text_preview && (
                          <span className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                            {result.text_preview}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}

                {showThreadSkeletons && (
                  <SearchSkeletons count={2} variant="conversation" />
                )}
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
                  <CommandItem onSelect={handleViewTasks}>
                    <ListTodo className="mr-2 h-4 w-4" />
                    <span>View Tasks</span>
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

              <CommandGroup heading="Navigation">
                <CommandItem onSelect={() => handleNavigate('/dashboard', 'Dashboard')}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/agents', 'Agents')}>
                  <Bot className="mr-2 h-4 w-4" />
                  <span>Agents</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/knowledge', 'Knowledge')}>
                  <Bot className="mr-2 h-4 w-4" />
                  <span>Knowledge</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/skills')}>
                  <Database className="mr-2 h-4 w-4" />
                  <span>Skills</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/triggers', 'Triggers')}>
                  <Zap className="mr-2 h-4 w-4" />
                  <span>Triggers</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/settings/api-keys', 'Settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </CommandItem>
                <CommandItem onSelect={() => handleNavigate('/configuration', 'Configuration')}>
                  <Cog className="mr-2 h-4 w-4" />
                  <span>Configuration</span>
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
          <TodoDialog
            sessionId={currentSessionId}
            open={todoOpen}
            onOpenChange={setTodoOpen}
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
