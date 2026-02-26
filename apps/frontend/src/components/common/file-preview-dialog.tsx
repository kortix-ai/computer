'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFilePreviewStore } from '@/stores/file-preview-store';
import { openTabAndNavigate } from '@/stores/tab-store';
import { FileContentRenderer } from '@/features/files/components/file-content-renderer';
import { useOcFileOpen } from '@/components/thread/tool-views/opencode/useOcFileOpen';

/**
 * Global file preview dialog.
 *
 * Renders as a modal overlay so the user stays on their current page.
 * Provides:
 *   - Full file preview via FileContentRenderer (handles all file types)
 *   - "Open in new tab" button to open the file as a proper tab
 *   - Fullscreen toggle
 *   - Click outside / X / Escape to close
 */
export function FilePreviewDialog() {
  const isOpen = useFilePreviewStore((s) => s.isOpen);
  const rawFilePath = useFilePreviewStore((s) => s.filePath);
  const closePreview = useFilePreviewStore((s) => s.closePreview);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Resolve absolute paths to project-relative paths for FileContentRenderer
  const { toDisplayPath } = useOcFileOpen();
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!rawFilePath) {
      setResolvedPath(null);
      return;
    }
    // toDisplayPath is synchronous and converts abs → relative using cached prefixes
    const resolved = toDisplayPath(rawFilePath);
    setResolvedPath(resolved);
  }, [rawFilePath, toDisplayPath]);

  const filePath = resolvedPath || rawFilePath;
  const fileName = filePath?.split('/').pop() || '';

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setIsFullscreen(false);
        closePreview();
      }
    },
    [closePreview],
  );

  const handleOpenInTab = useCallback(() => {
    if (!filePath) return;
    const name = filePath.split('/').pop() || filePath;
    openTabAndNavigate({
      id: `file:${filePath}`,
      title: name,
      type: 'file',
      href: `/files/${encodeURIComponent(filePath)}`,
    });
    // Close the preview after opening in tab
    setIsFullscreen(false);
    closePreview();
  }, [filePath, closePreview]);

  if (!filePath) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton
        className={cn(
          'flex flex-col p-0 gap-0 overflow-hidden transition-all duration-200',
          isFullscreen
            ? 'sm:max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] h-[calc(100vh-2rem)]'
            : 'sm:max-w-4xl max-h-[80vh] h-[80vh]',
        )}
      >
        <VisuallyHidden>
          <DialogTitle>File Preview: {fileName}</DialogTitle>
        </VisuallyHidden>

        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-medium text-foreground truncate">
              {fileName}
            </span>
            <span className="text-xs text-muted-foreground truncate hidden sm:block">
              {filePath}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreen((v) => !v)}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleOpenInTab}
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => handleOpenChange(false)}
              title="Close"
            >
              <span className="text-lg leading-none">&times;</span>
            </Button>
          </div>
        </div>

        {/* File content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <FileContentRenderer
            filePath={filePath}
            showHeader={false}
            className="h-full"
            errorFallback={(error, path) => (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Cannot preview <span className="font-mono text-foreground">{path}</span>
                </p>
                <p className="text-xs text-muted-foreground/60">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInTab}
                  className="mt-2"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in tab instead
                </Button>
              </div>
            )}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
