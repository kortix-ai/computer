'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  GitBranch,
  Loader2,
  Save,
} from 'lucide-react';
import { codeToHtml } from 'shiki';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useFilesStore } from '../store/files-store';
import { useFileContent } from '../hooks';
import { downloadFile, uploadFile } from '../api/opencode-files';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLanguageFromExt(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', swift: 'swift', kt: 'kotlin', php: 'php',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    xml: 'xml', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
    md: 'markdown', mdx: 'markdown', txt: 'plaintext',
    dockerfile: 'dockerfile', makefile: 'makefile',
    vue: 'vue', svelte: 'svelte',
  };
  return map[ext] || 'plaintext';
}

function isImageMime(mimeType?: string): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileViewer() {
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath);
  const filePathList = useFilesStore((s) => s.filePathList);
  const currentFileIndex = useFilesStore((s) => s.currentFileIndex);
  const goBackToBrowser = useFilesStore((s) => s.goBackToBrowser);
  const nextFile = useFilesStore((s) => s.nextFile);
  const prevFile = useFilesStore((s) => s.prevFile);

  const { data: fileContent, isLoading, error, refetch } = useFileContent(selectedFilePath);

  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileName = selectedFilePath?.split('/').pop() || '';
  const language = getLanguageFromExt(fileName);
  const [isEditing, setIsEditing] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const { resolvedTheme } = useTheme();

  const hasNext = currentFileIndex < filePathList.length - 1;
  const hasPrev = currentFileIndex > 0;

  // Track if content has been edited
  const hasUnsavedChanges = editedContent !== null;
  const displayContent = editedContent ?? fileContent?.content ?? '';

  // Reset edited content when file changes
  const prevFilePathRef = useMemo(() => ({ current: selectedFilePath }), [selectedFilePath]);
  if (prevFilePathRef.current !== selectedFilePath && editedContent !== null) {
    setEditedContent(null);
  }

  // Reset editing mode when file changes
  useEffect(() => {
    setIsEditing(false);
    setHighlightedHtml('');
  }, [selectedFilePath]);

  // Syntax highlight with Shiki
  const shikiTheme = resolvedTheme === 'dark' ? 'github-dark' : 'github-light';
  useEffect(() => {
    if (isEditing || !displayContent || language === 'plaintext') {
      return;
    }
    let cancelled = false;
    codeToHtml(displayContent, {
      lang: language,
      theme: shikiTheme,
      transformers: [{
        pre(node) {
          if (node.properties.style) {
            node.properties.style = (node.properties.style as string)
              .replace(/background-color:[^;]+;?/g, '');
          }
        },
      }],
    })
      .then((html) => { if (!cancelled) setHighlightedHtml(html); })
      .catch(() => { if (!cancelled) setHighlightedHtml(''); });
    return () => { cancelled = true; };
  }, [displayContent, language, shikiTheme, isEditing]);

  // Download handler
  const handleDownload = useCallback(async () => {
    if (!selectedFilePath || !fileName) return;
    try {
      await downloadFile(selectedFilePath, fileName);
    } catch {
      toast.error(`Failed to download ${fileName}`);
    }
  }, [selectedFilePath, fileName]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!selectedFilePath || editedContent === null) return;
    setIsSaving(true);
    try {
      const blob = new Blob([editedContent], { type: 'text/plain;charset=utf-8' });
      const file = new File([blob], fileName, { type: 'text/plain' });
      // Upload to the same path (overwrite)
      const parentPath = selectedFilePath.substring(0, selectedFilePath.lastIndexOf('/'));
      await uploadFile(file, parentPath || undefined);
      setEditedContent(null);
      await refetch();
      toast.success('File saved');
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [selectedFilePath, editedContent, fileName, refetch]);

  // Image rendering
  const imageDataUrl = useMemo(() => {
    if (
      fileContent?.encoding === 'base64' &&
      isImageMime(fileContent.mimeType)
    ) {
      return `data:${fileContent.mimeType};base64,${fileContent.content}`;
    }
    return null;
  }, [fileContent]);

  return (
    <div className="flex flex-col h-full">
      {/* Viewer header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={goBackToBrowser}
          title="Back to browser"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-sm truncate">{fileName}</span>
          {hasUnsavedChanges && (
            <span className="text-xs text-yellow-500 font-medium shrink-0">modified</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* File navigation */}
          {filePathList.length > 1 && (
            <div className="flex items-center gap-0.5 mr-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={prevFile}
                disabled={!hasPrev}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums min-w-[3ch] text-center">
                {currentFileIndex + 1}/{filePathList.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={nextFile}
                disabled={!hasNext}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Save button (only for text files with changes) */}
          {hasUnsavedChanges && fileContent?.type === 'text' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-yellow-500 hover:text-yellow-600"
              onClick={handleSave}
              disabled={isSaving}
              title="Save (Ctrl+S)"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDownload}
            disabled={!fileContent}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <FileWarning className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Failed to load file
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        {/* Image content */}
        {!isLoading && !error && imageDataUrl && (
          <div className="flex items-center justify-center p-4 h-full bg-muted/30">
            <img
              src={imageDataUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded"
            />
          </div>
        )}

        {/* Binary (non-image) content */}
        {!isLoading &&
          !error &&
          fileContent &&
          fileContent.type === 'binary' &&
          !imageDataUrl && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <FileWarning className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Binary file -- cannot display preview
              </p>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            </div>
          )}

        {/* Text content */}
        {!isLoading &&
          !error &&
          fileContent &&
          fileContent.type === 'text' &&
          !imageDataUrl && (
            <div className="relative h-full">
              {/* Diff indicator */}
              {fileContent.patch && fileContent.patch.hunks.length > 0 && (
                <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-yellow-500/5 border-b border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
                  <GitBranch className="h-3 w-3" />
                  File has uncommitted changes
                </div>
              )}
              {isEditing ? (
                <textarea
                  autoFocus
                  value={displayContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                      e.preventDefault();
                      if (hasUnsavedChanges) handleSave();
                    }
                    if (e.key === 'Escape') {
                      setIsEditing(false);
                    }
                  }}
                  className={cn(
                    'w-full h-full text-sm leading-relaxed p-4 font-mono',
                    'bg-transparent resize-none outline-none',
                    'selection:bg-primary/20',
                  )}
                  spellCheck={false}
                />
              ) : (
                <div
                  className="w-full h-full overflow-auto cursor-text"
                  onDoubleClick={() => setIsEditing(true)}
                >
                  {highlightedHtml ? (
                    <div
                      className={cn(
                        'p-4 font-mono text-sm leading-relaxed min-h-full',
                        '[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!overflow-visible',
                        '[&_code]:!bg-transparent',
                      )}
                      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                  ) : (
                    <pre className="p-4 font-mono text-sm leading-relaxed text-foreground whitespace-pre min-h-full">
                      {displayContent}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
      </div>

      {/* Path bar */}
      {selectedFilePath && (
        <div className="px-3 py-1.5 border-t text-xs text-muted-foreground truncate shrink-0 bg-muted/30">
          {selectedFilePath}
        </div>
      )}
    </div>
  );
}
