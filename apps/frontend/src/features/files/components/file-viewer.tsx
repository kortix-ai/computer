'use client';

import { useMemo, useCallback, useState, useEffect, useRef, lazy, Suspense } from 'react';
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
import { downloadFile, uploadFile, readFileAsBlob } from '../api/opencode-files';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

// Lazy-load heavy renderers to keep initial bundle small
const PdfRenderer = lazy(() =>
  import('@/components/file-renderers/pdf-renderer').then((m) => ({ default: m.PdfRenderer })),
);
const DocxRenderer = lazy(() =>
  import('@/components/file-renderers/docx-renderer').then((m) => ({ default: m.DocxRenderer })),
);
const VideoRenderer = lazy(() =>
  import('@/components/file-renderers/video-renderer').then((m) => ({ default: m.VideoRenderer })),
);
const CsvRenderer = lazy(() =>
  import('@/components/file-renderers/csv-renderer').then((m) => ({ default: m.CsvRenderer })),
);
const XlsxRenderer = lazy(() =>
  import('@/components/file-renderers/xlsx-renderer').then((m) => ({ default: m.XlsxRenderer })),
);
const PptxRenderer = lazy(() =>
  import('@/components/file-renderers/pptx-renderer').then((m) => ({ default: m.PptxRenderer })),
);
const ImageRenderer = lazy(() =>
  import('@/components/file-renderers/image-renderer').then((m) => ({ default: m.ImageRenderer })),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Categories that need a blob fetched via readFileAsBlob */
const BLOB_CATEGORIES = ['pdf', 'docx', 'video', 'audio', 'pptx'] as const;
type BlobCategory = (typeof BLOB_CATEGORIES)[number];

type FileCategory =
  | 'image'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'csv'
  | 'video'
  | 'audio'
  | 'code'
  | 'text'
  | 'binary';

function getFileCategory(filename: string, mimeType?: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (['pptx', 'ppt'].includes(ext)) return 'pptx';
  if (['xlsx', 'xls'].includes(ext)) return 'xlsx';
  if (['csv', 'tsv'].includes(ext)) return 'csv';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return 'audio';

  // Code/text files
  if (getLanguageFromExt(filename) !== 'plaintext') return 'code';
  if (mimeType?.startsWith('text/')) return 'text';

  return 'binary';
}

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

function isBlobCategory(cat: FileCategory): cat is BlobCategory {
  return (BLOB_CATEGORIES as readonly string[]).includes(cat);
}

/** Spinner placeholder used inside <Suspense> for lazy-loaded renderers. */
function RendererFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook: fetch binary blob via readFileAsBlob for preview renderers
// ---------------------------------------------------------------------------

function useBinaryBlob(filePath: string | null, category: FileCategory) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobLoading, setBlobLoading] = useState(false);
  const [blobError, setBlobError] = useState<string | null>(null);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    // Only fetch for categories that need a blob
    if (!filePath || !isBlobCategory(category)) {
      setBlobUrl(null);
      setBlob(null);
      setBlobError(null);
      return;
    }

    // Skip if same path (already loaded)
    if (filePath === prevPathRef.current && (blobUrl || blob)) return;
    prevPathRef.current = filePath;

    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      setBlobLoading(true);
      setBlobError(null);
      try {
        const result = await readFileAsBlob(filePath!);
        if (cancelled) return;

        // DocxRenderer and PptxRenderer take a blob directly; others need a URL
        if (category === 'docx' || category === 'pptx') {
          setBlob(result);
          setBlobUrl(null);
        } else {
          objectUrl = URL.createObjectURL(result);
          setBlobUrl(objectUrl);
          setBlob(null);
        }
      } catch (err) {
        if (!cancelled) {
          setBlobError(err instanceof Error ? err.message : 'Failed to load file');
        }
      } finally {
        if (!cancelled) setBlobLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, category]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { blobUrl, blob, blobLoading, blobError };
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

  // Text content (for code/text files, CSV, images)
  const { data: fileContent, isLoading, error, refetch } = useFileContent(selectedFilePath);

  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileName = selectedFilePath?.split('/').pop() || '';
  const language = getLanguageFromExt(fileName);
  const fileCategory = getFileCategory(fileName, fileContent?.mimeType);
  const [isEditing, setIsEditing] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const { resolvedTheme } = useTheme();

  // Binary blob for PDF, DOCX, video, audio, PPTX
  const { blobUrl, blob: docxBlob, blobLoading, blobError } = useBinaryBlob(selectedFilePath, fileCategory);

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

  // Determine loading state: for blob categories we wait on blob, for others on fileContent
  const needsBlob = isBlobCategory(fileCategory);
  const isContentReady = needsBlob
    ? (!blobLoading && !blobError)
    : (!isLoading && !error);
  const contentError = needsBlob ? blobError : (error instanceof Error ? error.message : error ? String(error) : null);
  const showLoading = needsBlob ? blobLoading : isLoading;

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
            disabled={!fileContent && !blobUrl && !docxBlob}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {/* Loading */}
        {showLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {contentError && !showLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <FileWarning className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Failed to load file
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {contentError}
            </p>
          </div>
        )}

        {/* Image content */}
        {!isLoading && !error && imageDataUrl && (
          <Suspense fallback={<RendererFallback />}>
            <ImageRenderer url={imageDataUrl} className="h-full" />
          </Suspense>
        )}

        {/* PDF preview */}
        {isContentReady && fileCategory === 'pdf' && blobUrl && (
          <Suspense fallback={<RendererFallback />}>
            <PdfRenderer url={blobUrl} className="h-full" />
          </Suspense>
        )}

        {/* DOCX preview */}
        {isContentReady && fileCategory === 'docx' && docxBlob && (
          <Suspense fallback={<RendererFallback />}>
            <DocxRenderer blob={docxBlob} className="h-full" />
          </Suspense>
        )}

        {/* XLSX / XLS preview */}
        {!isLoading && !error && fileCategory === 'xlsx' && selectedFilePath && (
          <Suspense fallback={<RendererFallback />}>
            <XlsxRenderer
              filePath={selectedFilePath}
              fileName={fileName}
              className="h-full"
            />
          </Suspense>
        )}

        {/* CSV / TSV preview */}
        {!isLoading && !error && fileCategory === 'csv' && fileContent && (
          <Suspense fallback={<RendererFallback />}>
            <CsvRenderer content={fileContent.content} className="h-full" />
          </Suspense>
        )}

        {/* Video preview */}
        {isContentReady && fileCategory === 'video' && blobUrl && (
          <Suspense fallback={<RendererFallback />}>
            <VideoRenderer url={blobUrl} className="h-full" onDownload={handleDownload} />
          </Suspense>
        )}

        {/* Audio preview */}
        {isContentReady && fileCategory === 'audio' && blobUrl && (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <svg className="h-8 w-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <p className="text-sm font-medium">{fileName}</p>
            <audio controls src={blobUrl} className="w-full max-w-md" />
          </div>
        )}

        {/* PPTX preview */}
        {isContentReady && fileCategory === 'pptx' && docxBlob && (
          <Suspense fallback={<RendererFallback />}>
            <PptxRenderer
              blob={docxBlob}
              binaryUrl={blobUrl}
              filePath={selectedFilePath || undefined}
              fileName={fileName}
              className="h-full"
              onDownload={handleDownload}
            />
          </Suspense>
        )}

        {/* Binary (non-image) content with no special renderer */}
        {!isLoading &&
          !error &&
          fileContent &&
          fileContent.type === 'binary' &&
          !imageDataUrl &&
          !['pdf', 'docx', 'pptx', 'xlsx', 'video', 'audio'].includes(fileCategory) && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <FileWarning className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Binary file — cannot display preview
              </p>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            </div>
          )}

        {/* Text / code content */}
        {!isLoading &&
          !error &&
          fileContent &&
          fileContent.type === 'text' &&
          !imageDataUrl &&
          fileCategory !== 'csv' && (
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
