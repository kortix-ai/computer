'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
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
import { useSidebar } from '@/components/ui/sidebar';
import { useOpenCodeSessions } from '@/hooks/opencode/use-opencode-sessions';
import { useFileSearch } from '@/features/files';
import { toast } from '@/lib/toast';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';

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
  const dirParts = filePath.split('/');
  // If it ends with / or has no extension and might be a directory
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

// ============================================================================
// Command Palette
// ============================================================================

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const queryClient = useQueryClient();
  const createSession = useCreateOpenCodeSession();

  // Fetch all sessions
  const { data: sessions } = useOpenCodeSessions();

  // Debounce the query for file search API calls
  useEffect(() => {
    if (query.length < 2) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
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

  const hasQuery = query.trim().length > 0;
  const isSearching = hasQuery && debouncedQuery.length >= 2 && isFileSearching;
  const hasSessionResults = filteredSessions.length > 0;
  const hasFileResults = fileResults.length > 0;
  const hasAnyResults = hasSessionResults || hasFileResults;
  const showQuickActions = !hasQuery;

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

  const handleToggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
    close();
  }, [theme, setTheme, close]);

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar();
    close();
  }, [toggleSidebar, close]);

  const themeLabel = useMemo(() => {
    if (theme === 'light') return 'Switch to Dark';
    if (theme === 'dark') return 'Switch to System';
    return 'Switch to Light';
  }, [theme]);

  const ThemeIcon = theme === 'light' ? Moon : theme === 'dark' ? Monitor : Sun;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search sessions, files, or type a command..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Loading state */}
        {hasQuery && isSearching && !hasAnyResults && (
          <CommandEmpty>
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Searching...</span>
            </div>
          </CommandEmpty>
        )}

        {/* No results */}
        {hasQuery && !isSearching && !hasAnyResults && debouncedQuery.length >= 2 && (
          <CommandEmpty>No sessions or files found.</CommandEmpty>
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
                        · {session.summary.files} file{session.summary.files !== 1 ? 's' : ''} changed
                      </span>
                    )}
                  </span>
                </div>
              </CommandItem>
            ))}
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
                <span>{sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}</span>
                <CommandShortcut>⌘B</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
