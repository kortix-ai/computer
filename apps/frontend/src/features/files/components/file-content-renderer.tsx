'use client';

import { useMemo, useCallback, useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  AlertTriangle,
  Braces,
  CircleAlert,
  Code,
  Download,
  Eye,
  FileWarning,
  GitBranch,
  Loader2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileContent } from '../hooks';
import { downloadFile, uploadFile } from '../api/opencode-files';
import { useBinaryBlob } from '../hooks/use-binary-blob';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { UnifiedMarkdown } from '@/components/markdown';
import { CodeEditor } from '@/components/file-editors/code-editor';
import { getFileIcon } from './file-icon';
import { useDiagnosticsStore, findDiagnosticsForFile } from '@/stores/diagnostics-store';

// ---------------------------------------------------------------------------
// Lazy-load heavy renderers to keep initial bundle small
// ---------------------------------------------------------------------------

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

export type FileCategory =
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

export function getFileCategory(filename: string, mimeType?: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'tiff', 'tif'].includes(ext)) return 'image';
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

export function getLanguageFromExt(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const fileNameLower = filename.toLowerCase();
  
  // .env files (e.g., .env, .env.local, .env.production)
  if (fileNameLower.includes('.env') || fileNameLower.startsWith('.env')) {
    return 'properties';
  }
  
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
    env: 'properties', ini: 'properties', conf: 'properties',
    cfg: 'properties', properties: 'properties',
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
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Binary blob loading — uses shared hook from hooks/use-binary-blob.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FileContentRenderer — the shared file content rendering component
// ---------------------------------------------------------------------------

export interface FileContentRendererProps {
  /** Path to the file to render */
  filePath: string;
  /** Whether to show the compact header bar with file name, toggles, save/download buttons */
  showHeader?: boolean;
  /** Additional header actions (rendered after built-in buttons) */
  headerActions?: React.ReactNode;
  /** Callback when unsaved state changes */
  onUnsavedChange?: (hasUnsaved: boolean) => void;
  /** Callback when content is saved */
  onSaved?: () => void;
  /** Additional class name for the root container */
  className?: string;
  /** Custom error UI. When provided, replaces the default error display.
   *  Receives the error message and filePath so callers can render a graceful fallback. */
  errorFallback?: (error: string, filePath: string) => React.ReactNode;
  /** 1-indexed line number to scroll to after mount */
  targetLine?: number | null;
}

export function FileContentRenderer({
  filePath,
  showHeader = true,
  headerActions,
  onUnsavedChange,
  onSaved,
  className,
  errorFallback,
  targetLine,
}: FileContentRendererProps) {
  // Text content (for code/text files, CSV, images)
  const { data: fileContent, isLoading, error, refetch } = useFileContent(filePath);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const latestContentRef = useRef<string>('');

  const fileName = filePath.split('/').pop() || '';
  const language = getLanguageFromExt(fileName);
  const fileCategory = getFileCategory(fileName, fileContent?.mimeType);
  const [isMarkdownPreview, setIsMarkdownPreview] = useState(false);
  const [isJsonTreeView, setIsJsonTreeView] = useState(false);

  // LSP diagnostics for this file from the global diagnostics store
  // Uses suffix-matching because LSP stores absolute paths but we use relative paths
  const diagByFile = useDiagnosticsStore((s) => s.byFile);
  const fileDiagnostics = useMemo(
    () => findDiagnosticsForFile(diagByFile, filePath),
    [diagByFile, filePath],
  );
  const fileDiagErrorCount = useMemo(
    () => fileDiagnostics?.filter((d) => d.severity === 1).length ?? 0,
    [fileDiagnostics],
  );
  const fileDiagWarningCount = useMemo(
    () => fileDiagnostics?.filter((d) => d.severity === 2).length ?? 0,
    [fileDiagnostics],
  );

  const isMarkdownFile = language === 'markdown';
  const isJsonFile = language === 'json';

  // Binary blob for PDF, DOCX, video, audio, PPTX
  const blobPath = isBlobCategory(fileCategory) ? filePath : null;
  const { blobUrl, blob: rawBlob, isLoading: blobLoading, error: blobError } = useBinaryBlob(blobPath);

  const displayContent = fileContent?.content ?? '';

  // Keep latestContentRef in sync with loaded content
  useEffect(() => {
    if (fileContent?.content) {
      latestContentRef.current = fileContent.content;
    }
  }, [fileContent?.content]);

  // Reset state when file changes
  useEffect(() => {
    setIsMarkdownPreview(false);
    setIsJsonTreeView(false);
    setHasUnsavedChanges(false);
    latestContentRef.current = '';
  }, [filePath]);

  // Notify parent of unsaved state changes
  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  // Download handler
  const handleDownload = useCallback(async () => {
    if (!fileName) return;
    try {
      await downloadFile(filePath, fileName);
    } catch {
      toast.error(`Failed to download ${fileName}`);
    }
  }, [filePath, fileName]);

  // Save handler
  const handleSave = useCallback(async (content: string) => {
    setIsSaving(true);
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const file = new File([blob], fileName, { type: 'text/plain' });
      const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
      await uploadFile(file, parentPath || undefined);
      await refetch();
      setHasUnsavedChanges(false);
      onSaved?.();
      toast.success('File saved');
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [filePath, fileName, refetch, onSaved]);

  // Track editor content changes
  const handleEditorChange = useCallback((content: string) => {
    latestContentRef.current = content;
  }, []);

  // Cmd+S handler for when CodeEditor is not mounted (e.g. markdown preview)
  useEffect(() => {
    if (!isMarkdownPreview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && latestContentRef.current) {
          handleSave(latestContentRef.current);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMarkdownPreview, hasUnsavedChanges, handleSave]);

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

  // Determine loading state
  const needsBlob = isBlobCategory(fileCategory);
  const isContentReady = needsBlob
    ? (!blobLoading && !blobError)
    : (!isLoading && !error);
  const contentError = needsBlob ? blobError : (error instanceof Error ? error.message : error ? String(error) : null);
  const showLoadingState = needsBlob ? blobLoading : isLoading;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 shrink-0 h-10">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getFileIcon(fileName, { className: 'h-4 w-4 shrink-0' })}
            <span className="text-sm truncate">{fileName}</span>
            {hasUnsavedChanges && (
              <span className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" title="Unsaved changes" />
            )}
            {/* Inline diagnostic counts */}
            {(fileDiagErrorCount > 0 || fileDiagWarningCount > 0) && (
              <span className="inline-flex items-center gap-1.5 shrink-0">
                {fileDiagErrorCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-red-500 text-xs font-medium">
                    <CircleAlert className="h-3 w-3" />
                    {fileDiagErrorCount}
                  </span>
                )}
                {fileDiagWarningCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-yellow-500 text-xs font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {fileDiagWarningCount}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {/* Save button */}
            {hasUnsavedChanges && fileContent?.type === 'text' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-yellow-500 hover:text-yellow-600"
                onClick={() => handleSave(latestContentRef.current)}
                disabled={isSaving}
                title="Save"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* JSON tree toggle */}
            {isJsonFile && fileContent?.type === 'text' && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', isJsonTreeView && 'text-primary')}
                onClick={() => setIsJsonTreeView((v) => !v)}
                title={isJsonTreeView ? 'View source' : 'Tree view'}
              >
                <Braces className="h-4 w-4" />
              </Button>
            )}

            {/* Markdown preview toggle */}
            {isMarkdownFile && fileContent?.type === 'text' && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', isMarkdownPreview && 'text-primary')}
                onClick={() => setIsMarkdownPreview((v) => !v)}
                title={isMarkdownPreview ? 'View source' : 'Preview'}
              >
                {isMarkdownPreview ? (
                  <Code className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Additional header actions from parent */}
            {headerActions}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
              onClick={handleDownload}
              disabled={!fileContent && !blobUrl && !rawBlob}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {/* Loading */}
        {showLoadingState && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {/* Error */}
        {contentError && !showLoadingState && (
          errorFallback ? errorFallback(contentError, filePath) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <FileWarning className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/60 max-w-sm">
                {contentError}
              </p>
            </div>
          )
        )}

        {/* Image content */}
        {!isLoading && !error && imageDataUrl && (
          <Suspense fallback={<RendererFallback />}>
            <ImageRenderer url={imageDataUrl} className="h-full" />
          </Suspense>
        )}

        {/* PDF preview */}
        {isContentReady && fileCategory === 'pdf' && rawBlob && (
          <Suspense fallback={<RendererFallback />}>
            <PdfRenderer blob={rawBlob} className="h-full" />
          </Suspense>
        )}

        {/* DOCX preview */}
        {isContentReady && fileCategory === 'docx' && rawBlob && (
          <Suspense fallback={<RendererFallback />}>
            <DocxRenderer blob={rawBlob} className="h-full" />
          </Suspense>
        )}

        {/* XLSX / XLS preview */}
        {!isLoading && !error && fileCategory === 'xlsx' && (
          <Suspense fallback={<RendererFallback />}>
            <XlsxRenderer
              filePath={filePath}
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
          <div className="flex flex-col items-center justify-center h-full gap-5 p-8">
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
              <svg className="h-6 w-6 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground/60">{fileName}</p>
            <audio controls src={blobUrl} className="w-full max-w-sm" />
          </div>
        )}

        {/* PPTX preview */}
        {isContentReady && fileCategory === 'pptx' && rawBlob && (
          <Suspense fallback={<RendererFallback />}>
            <PptxRenderer
              blob={rawBlob}
              binaryUrl={blobUrl}
              filePath={filePath}
              fileName={fileName}
              className="h-full"
              onDownload={handleDownload}
            />
          </Suspense>
        )}

        {/* Binary fallback */}
        {!isLoading &&
          !error &&
          fileContent &&
          fileContent.type === 'binary' &&
          !imageDataUrl &&
          !['pdf', 'docx', 'pptx', 'xlsx', 'video', 'audio'].includes(fileCategory) && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
                <FileWarning className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground/50">
                Binary file
              </p>
              <Button variant="outline" size="sm" className="h-8 text-sm" onClick={handleDownload}>
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
            <div className="relative h-full flex flex-col">
              {/* Diff indicator */}
              {fileContent.patch && fileContent.patch.hunks.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/5 border-b border-yellow-500/15 text-xs text-yellow-600 dark:text-yellow-400/80 shrink-0">
                  <GitBranch className="h-3 w-3" />
                  Uncommitted changes
                </div>
              )}
              {isJsonTreeView && isJsonFile ? (
                <div key={filePath} className="w-full h-full overflow-auto">
                  <JsonTreeView content={hasUnsavedChanges ? latestContentRef.current : displayContent} />
                </div>
              ) : isMarkdownPreview && isMarkdownFile ? (
                <div key={filePath} className="w-full h-full overflow-auto p-6">
                  <UnifiedMarkdown content={hasUnsavedChanges ? latestContentRef.current : displayContent} />
                </div>
              ) : (
                <CodeEditor
                  key={filePath}
                  content={hasUnsavedChanges ? latestContentRef.current : fileContent.content}
                  originalContent={fileContent.content}
                  fileName={fileName}
                  onSave={handleSave}
                  onChange={handleEditorChange}
                  onUnsavedChange={setHasUnsavedChanges}
                  showHeader={false}
                  fontSize="text-sm"
                  className="h-full"
                  diagnostics={fileDiagnostics}
                  targetLine={targetLine}
                />
              )}
            </div>
          )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline JSON Tree View
// ---------------------------------------------------------------------------

function JsonTreeView({ content }: { content: string }) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  if (parsed === null) {
    return (
      <div className="p-4 text-sm text-red-500/70 font-mono">
        Invalid JSON
      </div>
    );
  }

  return (
    <div className="p-4 font-mono text-sm leading-relaxed">
      <JsonNode value={parsed} keyName={null} depth={0} />
    </div>
  );
}

function JsonNode({ value, keyName, depth }: { value: unknown; keyName: string | null; depth: number }) {
  const [isCollapsed, setIsCollapsed] = useState(depth > 2);

  if (value === null) {
    return (
      <div style={{ paddingLeft: depth * 20 }}>
        {keyName !== null && <span className="text-primary/70">{`"${keyName}"`}: </span>}
        <span className="text-muted-foreground/50 italic">null</span>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div style={{ paddingLeft: depth * 20 }}>
        {keyName !== null && <span className="text-primary/70">{`"${keyName}"`}: </span>}
        <span className="text-yellow-500/80">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div style={{ paddingLeft: depth * 20 }}>
        {keyName !== null && <span className="text-primary/70">{`"${keyName}"`}: </span>}
        <span className="text-cyan-500/80">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === 'string') {
    const isUrl = /^https?:\/\//.test(value);
    return (
      <div style={{ paddingLeft: depth * 20 }} className="break-all">
        {keyName !== null && <span className="text-primary/70">{`"${keyName}"`}: </span>}
        <span className="text-green-500/80">
          &quot;{value.length > 200 ? value.slice(0, 200) + '...' : value}&quot;
        </span>
        {isUrl && (
          <a href={value} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400/60 hover:text-blue-400 text-xs">
            open
          </a>
        )}
      </div>
    );
  }

  if (Array.isArray(value)) {
    const count = value.length;
    return (
      <div>
        <div
          style={{ paddingLeft: depth * 20 }}
          className="cursor-pointer hover:bg-muted/30 rounded-sm transition-colors inline-flex items-center gap-1"
          onClick={() => setIsCollapsed((v) => !v)}
        >
          <span className="text-muted-foreground/40 text-xs w-3.5 text-center select-none">
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </span>
          {keyName !== null && <span className="text-primary/70">{`"${keyName}"`}: </span>}
          {isCollapsed ? (
            <span className="text-muted-foreground/40">[{count} item{count !== 1 ? 's' : ''}]</span>
          ) : (
            <span className="text-muted-foreground/30">[</span>
          )}
        </div>
        {!isCollapsed && (
          <>
            {value.map((item, idx) => (
              <JsonNode key={idx} value={item} keyName={null} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: depth * 20 }} className="text-muted-foreground/30">]</div>
          </>
        )}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const count = entries.length;
    return (
      <div>
        <div
          style={{ paddingLeft: depth * 20 }}
          className="cursor-pointer hover:bg-muted/30 rounded-sm transition-colors inline-flex items-center gap-1"
          onClick={() => setIsCollapsed((v) => !v)}
        >
          <span className="text-muted-foreground/40 text-xs w-3.5 text-center select-none">
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </span>
          {keyName !== null && <span className="text-primary/70">{`"${keyName}"`}: </span>}
          {isCollapsed ? (
            <span className="text-muted-foreground/40">{'{' + count + ' key' + (count !== 1 ? 's' : '') + '}'}</span>
          ) : (
            <span className="text-muted-foreground/30">{'{'}</span>
          )}
        </div>
        {!isCollapsed && (
          <>
            {entries.map(([k, v]) => (
              <JsonNode key={k} value={v} keyName={k} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: depth * 20 }} className="text-muted-foreground/30">{'}'}</div>
          </>
        )}
      </div>
    );
  }

  return null;
}
