'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, FileText, Folder, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useFileSearch } from '../hooks';
import { useFilesStore } from '../store/files-store';
import { cn } from '@/lib/utils';

export function FileSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const closeSearch = useFilesStore((s) => s.closeSearch);
  const openFile = useFilesStore((s) => s.openFile);
  const navigateToPath = useFilesStore((s) => s.navigateToPath);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeSearch]);

  const { data: results, isLoading } = useFileSearch(debouncedQuery, {
    limit: 30,
    enabled: debouncedQuery.length > 0,
  });

  const handleSelect = useCallback(
    (path: string) => {
      // If the path ends with '/', it's a directory
      if (path.endsWith('/')) {
        navigateToPath(path.slice(0, -1));
      } else {
        openFile(path);
      }
      closeSearch();
    },
    [openFile, navigateToPath, closeSearch],
  );

  return (
    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto max-w-lg mt-4 px-4">
        <div className="rounded-lg border bg-background shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files..."
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-10"
            />
            <button
              onClick={closeSearch}
              className="p-1 rounded hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto">
            {debouncedQuery.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Type to search files...
              </div>
            )}

            {isLoading && debouncedQuery.length > 0 && (
              <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            )}

            {results && results.length === 0 && debouncedQuery.length > 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No files found
              </div>
            )}

            {results &&
              results.map((filePath) => {
                const isDir = filePath.endsWith('/');
                const name = isDir
                  ? filePath.slice(0, -1).split('/').pop()
                  : filePath.split('/').pop();

                return (
                  <button
                    key={filePath}
                    onClick={() => handleSelect(filePath)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 text-sm text-left',
                      'hover:bg-muted transition-colors',
                    )}
                  >
                    {isDir ? (
                      <Folder className="h-4 w-4 text-blue-400 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate flex-1 font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {filePath}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
