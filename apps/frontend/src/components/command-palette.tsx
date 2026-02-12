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
import { useProjects } from '@/hooks/sidebar/use-sidebar';
import { useThreadSearch } from '@/hooks/threads/use-thread-search';
import { createThreadInProject } from '@/lib/api/threads';
import { threadKeys, projectKeys } from '@/hooks/threads/keys';
import { toast } from '@/lib/toast';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();

  const {
    results: searchResults,
    isSearching,
    shouldSearch,
  } = useThreadSearch(query, 10);

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
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const handleNewSession = useCallback(async () => {
    if (isCreating) return;
    const project = projects[0];
    if (!project) {
      toast.error('No project available');
      close();
      return;
    }
    setIsCreating(true);
    try {
      const result = await createThreadInProject(project.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: threadKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      ]);
      router.push(`/projects/${project.id}/thread/${result.thread_id}`);
      toast.success('New session created');
      close();
    } catch {
      toast.error('Failed to create session');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, projects, queryClient, router, close]);

  const handleNavigate = useCallback(
    (path: string) => {
      router.push(path);
      close();
    },
    [router, close],
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

  // Search result items mapped from thread search
  const searchItems = useMemo(() => {
    if (!shouldSearch || searchResults.length === 0) return [];
    const seen = new Set<string>();
    return searchResults.filter((r) => {
      if (seen.has(r.thread_id)) return false;
      seen.add(r.thread_id);
      return true;
    });
  }, [shouldSearch, searchResults]);

  const handleSelectSearchResult = useCallback(
    (result: { thread_id: string; project_id: string | null; project_name: string }) => {
      if (result.project_id) {
        router.push(`/projects/${result.project_id}/thread/${result.thread_id}`);
      }
      close();
    },
    [router, close],
  );

  const showQuickActions = !shouldSearch && !query.trim();

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search sessions or type a command..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {shouldSearch && !isSearching && searchItems.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {isSearching && (
          <CommandEmpty>
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Searching...</span>
            </div>
          </CommandEmpty>
        )}

        {shouldSearch && searchItems.length > 0 && (
          <CommandGroup heading="Sessions">
            {searchItems.map((result) => (
              <CommandItem
                key={result.thread_id}
                value={`${result.project_name} ${result.text_preview || ''}`}
                onSelect={() => handleSelectSearchResult(result)}
              >
                <FileText className="mr-2 h-4 w-4" />
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate">{result.project_name || 'Untitled'}</span>
                  {result.text_preview && (
                    <span className="text-xs text-muted-foreground truncate">
                      {result.text_preview.slice(0, 80)}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showQuickActions && (
          <>
            <CommandGroup heading="Sessions">
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
