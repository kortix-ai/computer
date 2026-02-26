'use client';

import { useEffect } from 'react';
import { Search, ServerOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useFilesStore } from '../store/files-store';
import { useServerHealth, useFileEventInvalidation } from '../hooks';
import { useServerStore } from '@/stores/server-store';
import { FileTree } from './file-tree';
import { FileViewer } from './file-viewer';
import { FileHistoryPanel } from './file-history-panel';
import { FileSearch } from './file-search';
import { FileExplorerToolbar } from './file-explorer-toolbar';
import { FileExplorerStatusBar } from './file-explorer-status-bar';

/**
 * Full-page VS Code-style file explorer.
 * Tree sidebar (left) + viewer/editor (right).
 */
export function FileExplorerPage() {
  const panelMode = useFilesStore((s) => s.panelMode);
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath);
  const historyFilePath = useFilesStore((s) => s.historyFilePath);
  const isSidebarCollapsed = useFilesStore((s) => s.isSidebarCollapsed);
  const isSearchOpen = useFilesStore((s) => s.isSearchOpen);
  const toggleSearch = useFilesStore((s) => s.toggleSearch);
  const closeSearch = useFilesStore((s) => s.closeSearch);

  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const { data: health, isLoading: isHealthLoading, refetch } = useServerHealth();

  useFileEventInvalidation();

  // Cmd+P search, Escape close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'p') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      if (e.key === 'Escape' && isSearchOpen) {
        e.preventDefault();
        closeSearch();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch, closeSearch, isSearchOpen]);

  // Server not reachable
  if (!isHealthLoading && !health?.healthy) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center bg-background">
        <ServerOff className="h-10 w-10 text-muted-foreground/30" />
        <div>
          <h3 className="text-sm font-medium text-foreground">Server not reachable</h3>
          <p className="text-xs text-muted-foreground mt-1.5">
            Could not connect to{' '}
            <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{serverUrl}</code>
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background relative">
      <FileExplorerToolbar />

      {isSearchOpen && <FileSearch />}

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {!isSidebarCollapsed && (
            <>
              <ResizablePanel
                defaultSize={22}
                minSize={15}
                maxSize={40}
                className="overflow-hidden"
              >
                <FileTree />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          <ResizablePanel defaultSize={isSidebarCollapsed ? 100 : 78} minSize={40} className="overflow-hidden">
            <div className="h-full flex flex-col">
              {panelMode === 'history' && historyFilePath ? (
                <FileHistoryPanel />
              ) : panelMode === 'viewer' && selectedFilePath ? (
                <FileViewer />
              ) : (
                <WelcomePanel />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <FileExplorerStatusBar />
    </div>
  );
}

// ─── Welcome panel ──────────────────────────────────────────────────────────

function WelcomePanel() {
  const toggleSearch = useFilesStore((s) => s.toggleSearch);
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center select-none">
      {/* Subtle file icon */}
      <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
        <svg
          className="h-6 w-6 text-muted-foreground/30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-[11px] text-muted-foreground/50">
          Open a file from the tree or search
        </p>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={toggleSearch}
        >
          <Search className="h-3 w-3" />
          <span>Open File</span>
          <kbd className="ml-1 px-1 py-0 rounded bg-muted/80 text-[9px] font-mono text-muted-foreground/60">
            {isMac ? '\u2318' : 'Ctrl'}P
          </kbd>
        </Button>
      </div>
    </div>
  );
}
