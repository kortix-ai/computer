'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, AlertTriangle } from 'lucide-react';
import { useTabStore } from '@/stores/tab-store';
import { FileContentRenderer } from '@/features/files/components/file-content-renderer';
import { useDiagnosticsStore, findDiagnosticsForFile } from '@/stores/diagnostics-store';

/**
 * Standalone file viewer for the tab system.
 * Thin wrapper around FileContentRenderer that syncs dirty state
 * with the tab store, reads targetLine from tab metadata, and shows
 * diagnostics + file path in a footer bar.
 */

interface FileTabContentProps {
  /** The tab ID (e.g., "file:/path/to/file.ts") */
  tabId: string;
  /** The file path to display */
  filePath: string;
}

export function FileTabContent({ tabId, filePath }: FileTabContentProps) {
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Read targetLine from tab metadata (set when navigating from diagnostics panel, chat, etc.)
  const targetLine = useTabStore(
    (s) => (s.tabs[tabId]?.metadata?.targetLine as number | undefined) ?? null,
  );

  // LSP diagnostics for this file (suffix-matching for abs/rel path mismatch)
  const diagByFile = useDiagnosticsStore((s) => s.byFile);
  const fileDiagnostics = useMemo(
    () => findDiagnosticsForFile(diagByFile, filePath),
    [diagByFile, filePath],
  );
  const { errorCount, warningCount } = useMemo(() => {
    if (!fileDiagnostics || fileDiagnostics.length === 0) return { errorCount: 0, warningCount: 0 };
    let errors = 0;
    let warnings = 0;
    for (const d of fileDiagnostics) {
      if (d.severity === 1) errors++;
      else if (d.severity === 2) warnings++;
    }
    return { errorCount: errors, warningCount: warnings };
  }, [fileDiagnostics]);

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
          targetLine={targetLine}
        />
      </div>

      {/* Path bar footer with diagnostics summary */}
      <div className="flex items-center justify-between gap-4 px-3 py-1 border-t border-border/50 text-[10px] text-muted-foreground/50 shrink-0">
        <span className="truncate">{filePath}</span>
        {(errorCount > 0 || warningCount > 0) && (
          <span className="inline-flex items-center gap-2 shrink-0">
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-red-500/80">
                <CircleAlert className="h-2.5 w-2.5" />
                {errorCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-yellow-500/80">
                <AlertTriangle className="h-2.5 w-2.5" />
                {warningCount}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
