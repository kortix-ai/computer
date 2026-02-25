'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTabStore } from '@/stores/tab-store';
import { FileContentRenderer } from '@/features/files/components/file-content-renderer';

/**
 * Standalone file viewer for the tab system.
 * Thin wrapper around FileContentRenderer that syncs dirty state
 * with the tab store and shows the file path in a footer bar.
 */

interface FileTabContentProps {
  /** The tab ID (e.g., "file:/path/to/file.ts") */
  tabId: string;
  /** The file path to display */
  filePath: string;
}

export function FileTabContent({ tabId, filePath }: FileTabContentProps) {
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Sync unsaved state to the tab store
  useEffect(() => {
    useTabStore.getState().setTabDirty(tabId, hasUnsaved);
  }, [tabId, hasUnsaved]);

  const handleUnsavedChange = useCallback((unsaved: boolean) => {
    setHasUnsaved(unsaved);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <FileContentRenderer
          filePath={filePath}
          showHeader
          onUnsavedChange={handleUnsavedChange}
        />
      </div>

      {/* Path bar footer */}
      <div className="px-3 py-1 border-t border-border/50 text-[10px] text-muted-foreground/50 truncate shrink-0">
        {filePath}
      </div>
    </div>
  );
}
