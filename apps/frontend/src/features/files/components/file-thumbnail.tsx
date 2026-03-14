'use client';

import { useMemo, useState, Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import { useFileContent } from '../hooks';
import { getFileCategory, getLanguageFromExt } from './file-content-renderer';
import { getFileIcon } from './file-icon';

// ---------------------------------------------------------------------------
// Image Thumbnail — loads base64 from API
// ---------------------------------------------------------------------------

function ImageThumbnail({ filePath }: { filePath: string }) {
  const { data: fileContent } = useFileContent(filePath, { staleTime: 60_000 });
  const [imgError, setImgError] = useState(false);

  const dataUrl = useMemo(() => {
    if (fileContent?.encoding === 'base64' && fileContent.mimeType?.startsWith('image/')) {
      return `data:${fileContent.mimeType};base64,${fileContent.content}`;
    }
    return null;
  }, [fileContent]);

  if (!dataUrl || imgError) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setImgError(true)}
      draggable={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Code / Text Thumbnail — shows first ~8 lines of content
// ---------------------------------------------------------------------------

function CodeThumbnail({ filePath }: { filePath: string }) {
  const { data: fileContent } = useFileContent(filePath, { staleTime: 60_000 });

  const preview = useMemo(() => {
    if (!fileContent?.content || fileContent.type === 'binary') return null;
    const lines = fileContent.content.split('\n').slice(0, 10);
    return lines.join('\n');
  }, [fileContent]);

  if (!preview) return null;

  return (
    <div className="absolute inset-0 p-2 overflow-hidden">
      <pre className="text-[7px] leading-[1.4] text-muted-foreground/70 font-mono whitespace-pre overflow-hidden select-none pointer-events-none">
        {preview}
      </pre>
      {/* Fade-out gradient at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/20 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown Thumbnail — shows rendered preview snippet
// ---------------------------------------------------------------------------

function MarkdownThumbnail({ filePath }: { filePath: string }) {
  const { data: fileContent } = useFileContent(filePath, { staleTime: 60_000 });

  const preview = useMemo(() => {
    if (!fileContent?.content) return null;
    // Show first ~150 chars of markdown, strip headers/links for brief display
    const text = fileContent.content
      .replace(/^#{1,6}\s+/gm, '') // strip heading markers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
      .replace(/[*_`~]/g, '') // strip formatting markers
      .trim();
    return text.slice(0, 200);
  }, [fileContent]);

  if (!preview) return null;

  return (
    <div className="absolute inset-0 p-2.5 overflow-hidden">
      <p className="text-[8px] leading-[1.5] text-muted-foreground/60 select-none pointer-events-none line-clamp-[8]">
        {preview}
      </p>
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/20 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV / Spreadsheet Thumbnail — shows a mini table
// ---------------------------------------------------------------------------

function CsvThumbnail({ filePath }: { filePath: string }) {
  const { data: fileContent } = useFileContent(filePath, { staleTime: 60_000 });

  const rows = useMemo(() => {
    if (!fileContent?.content) return null;
    const lines = fileContent.content.split('\n').filter(Boolean).slice(0, 6);
    return lines.map((line) => {
      const sep = line.includes('\t') ? '\t' : ',';
      return line.split(sep).slice(0, 5).map((cell) => cell.replace(/^"(.*)"$/, '$1').trim());
    });
  }, [fileContent]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="absolute inset-0 p-2 overflow-hidden">
      <table className="w-full text-[7px] text-muted-foreground/60 select-none pointer-events-none border-collapse">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i === 0 ? 'font-medium text-muted-foreground/80' : ''}>
              {row.map((cell, j) => (
                <td key={j} className="px-0.5 py-px truncate max-w-[60px] border-b border-border/20">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-muted/20 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// JSON Thumbnail — shows formatted JSON preview
// ---------------------------------------------------------------------------

function JsonThumbnail({ filePath }: { filePath: string }) {
  const { data: fileContent } = useFileContent(filePath, { staleTime: 60_000 });

  const preview = useMemo(() => {
    if (!fileContent?.content) return null;
    try {
      const parsed = JSON.parse(fileContent.content);
      return JSON.stringify(parsed, null, 2).split('\n').slice(0, 10).join('\n');
    } catch {
      return fileContent.content.split('\n').slice(0, 10).join('\n');
    }
  }, [fileContent]);

  if (!preview) return null;

  return (
    <div className="absolute inset-0 p-2 overflow-hidden">
      <pre className="text-[7px] leading-[1.4] text-muted-foreground/70 font-mono whitespace-pre overflow-hidden select-none pointer-events-none">
        {preview}
      </pre>
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/20 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main FileThumbnail — picks the right thumbnail based on file type
// ---------------------------------------------------------------------------

interface FileThumbnailProps {
  filePath: string;
  fileName: string;
  className?: string;
}

/**
 * Renders a rich thumbnail preview for grid file cards.
 * 
 * Supported:
 * - Images: actual image preview
 * - Code/text: first lines of source code
 * - Markdown: rendered text snippet
 * - CSV/TSV: mini table
 * - JSON: formatted JSON preview
 * - Everything else: large icon fallback
 */
export function FileThumbnail({ filePath, fileName, className }: FileThumbnailProps) {
  const category = getFileCategory(fileName);
  const language = getLanguageFromExt(fileName);
  const isMarkdown = language === 'markdown';
  const isJson = language === 'json';
  const isCsv = category === 'csv';
  const isImage = category === 'image';
  const isCode = category === 'code' && !isJson;
  // Treat plaintext files (.txt, .rst, .rtf, .log, etc.) as text even when
  // getFileCategory returns 'binary' (it needs mimeType we don't have here)
  const extLower = fileName.split('.').pop()?.toLowerCase() || '';
  const nameLower = fileName.toLowerCase();
  const isPlaintext = ['txt', 'rst', 'rtf', 'log', 'text', 'nfo', 'cfg', 'ini', 'conf', 'properties'].includes(extLower)
    || ['.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.nvmrc', '.prettierrc', '.eslintrc', 'license', 'readme', 'changelog', 'makefile', 'dockerfile'].some(n => nameLower === n || nameLower.endsWith(n));
  const isText = category === 'text' || isMarkdown || isPlaintext;
  const ext = fileName.includes('.') ? extLower.toUpperCase() : '';

  return (
    <div className={cn('flex items-center justify-center relative overflow-hidden bg-muted/20', className)}>
      {/* Thumbnails by type */}
      {isImage && <ImageThumbnail filePath={filePath} />}
      {isCode && <CodeThumbnail filePath={filePath} />}
      {isMarkdown && <MarkdownThumbnail filePath={filePath} />}
      {isJson && <JsonThumbnail filePath={filePath} />}
      {isCsv && <CsvThumbnail filePath={filePath} />}
      {isText && !isMarkdown && <CodeThumbnail filePath={filePath} />}

      {/* Fallback icon for binary / unsupported types */}
      {!isImage && !isCode && !isMarkdown && !isJson && !isCsv && !isText && (
        getFileIcon(fileName, { className: 'h-12 w-12', variant: 'monochrome' })
      )}

      {/* File type badge (shown for non-image types) */}
      {ext && !isImage && (
        <span className="absolute bottom-1.5 right-1.5 text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider bg-background/80 px-1.5 py-0.5 rounded z-10">
          {ext}
        </span>
      )}
    </div>
  );
}
