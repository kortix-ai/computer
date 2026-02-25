'use client';

import { useEffect } from 'react';
import { ServerOff, RefreshCw } from 'lucide-react';
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
 * Full-page VS Code-style file explorer:
 * - Resizable tree sidebar on the left (sole navigator)
 * - File viewer/editor on the right
 * - Welcome screen when no file is open
 * - Toolbar at top, status bar at bottom
 * - Single search overlay (Ctrl+P)
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

  // Wire SSE events to auto-invalidate file queries when agent edits files
  useFileEventInvalidation();

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const isMod = e.metaKey || e.ctrlKey;

      // Ctrl+P / Cmd+P: Quick search
      if (isMod && e.key === 'p') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // Escape: close search
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
        <ServerOff className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-medium">Server not reachable</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Could not connect to the OpenCode server at{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{serverUrl}</code>
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Make sure <code className="text-xs bg-muted px-1.5 py-0.5 rounded">opencode serve</code> or{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">opencode web</code> is running.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background relative">
      {/* Top toolbar */}
      <FileExplorerToolbar />

      {/* Search overlay */}
      {isSearchOpen && <FileSearch />}

      {/* Main content: tree + viewer */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Tree sidebar */}
          {!isSidebarCollapsed && (
            <>
              <ResizablePanel
                defaultSize={22}
                minSize={15}
                maxSize={40}
                className="bg-muted/10 overflow-hidden"
              >
                <FileTree />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          {/* Main content panel */}
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

      {/* Bottom status bar */}
      <FileExplorerStatusBar />
    </div>
  );
}

// ─── Welcome panel (VS Code style) ──────────────────────────────────────────

function WelcomePanel() {
  const toggleSearch = useFilesStore((s) => s.toggleSearch);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center select-none">
      <div className="flex flex-col items-center gap-2">
        <svg
          className="h-16 w-16 text-muted-foreground/20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <h3 className="text-sm font-medium text-muted-foreground">No file open</h3>
      </div>

      <div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground/60">
        <p>Select a file from the explorer tree to view or edit it.</p>
        <p className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
            {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318' : 'Ctrl'}+P
          </kbd>
          <span>to search files</span>
        </p>

      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={toggleSearch}
      >
        Open File...
      </Button>
    </div>
  );
}
