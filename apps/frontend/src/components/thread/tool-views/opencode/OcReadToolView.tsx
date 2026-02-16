'use client';

import React, { useState } from 'react';
import { Eye, CheckCircle, AlertCircle, FileText, ChevronRight, ChevronDown, Hash } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { CodeHighlight } from '@/components/markdown/unified-markdown';
import { useOcFileOpen } from './useOcFileOpen';

function getFilename(path: string | undefined): string {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function getDirectory(path: string | undefined): string {
  if (!path) return '';
  const idx = path.lastIndexOf('/');
  if (idx < 0) return '';
  return path.substring(0, idx);
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.substring(idx + 1);
}

function cleanReadOutput(raw: string): string {
  return raw
    .replace(/<\/?file>/g, '')
    .replace(/^\d{4,5}\|\s?/gm, '')
    .trim();
}

export function OcReadToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const filePath = (args.filePath as string) || '';
  const ocState = args._oc_state as any;

  const filename = getFilename(filePath);
  const ext = getExtension(filename);

  // Extract loaded files from metadata
  const metadata = ocState?.metadata || {};
  const loaded: string[] = Array.isArray(metadata?.loaded) ? metadata.loaded : [];

  // Extract file content from output if available
  const rawOutput = toolResult?.output || (ocState?.output) || '';
  const output = rawOutput ? cleanReadOutput(String(rawOutput)) : '';

  const lineCount = output ? output.split('\n').length : null;

  const isError = toolResult?.success === false || !!toolResult?.error;

  // For multiple files, track which ones are expanded
  const allPaths = loaded.length > 0 ? loaded : filePath ? [filePath] : [];
  const isSingleFile = allPaths.length <= 1;

  const { openFile, openFileWithList, toDisplayPath } = useOcFileOpen();

  const displayPath = toDisplayPath(filePath);
  const displayDir = getDirectory(displayPath);

  const [expanded, setExpanded] = useState(false);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title="Reading File"
        subtitle={filename || filePath}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Eye}
            title={filename || 'Read File'}
            subtitle={displayDir}
            onTitleClick={filePath ? () => openFile(filePath) : undefined}
          />
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            {allPaths.length > 1 && (
              <span className="text-muted-foreground">
                {allPaths.length} files
              </span>
            )}
            {lineCount != null && lineCount > 0 && (
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <Hash className="h-3 w-3" />
                {lineCount} lines
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-1.5">
            {isSingleFile ? (
              <SingleFileRow
                filePath={filePath}
                displayPath={displayPath}
                ext={ext}
                output={output}
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                onOpenFile={() => openFileWithList(filePath, allPaths)}
              />
            ) : (
              <MultiFileList
                paths={allPaths}
                toDisplayPath={toDisplayPath}
                onFileClick={(fp) => openFileWithList(fp, allPaths)}
              />
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && (
          isError ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Read
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}

function SingleFileRow({
  filePath,
  displayPath,
  ext,
  output,
  expanded,
  onToggle,
  onOpenFile,
}: {
  filePath: string;
  displayPath: string;
  ext: string;
  output: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenFile: () => void;
}) {
  const hasContent = !!output;
  const filename = getFilename(displayPath);
  const dir = getDirectory(displayPath);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 ${hasContent ? 'cursor-pointer hover:bg-muted' : ''} transition-colors`}
        onClick={hasContent ? onToggle : undefined}
      >
        {hasContent ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )
        ) : (
          <FileText className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0" />
        )}
        <span className="text-xs min-w-0 flex items-baseline gap-1.5 overflow-hidden flex-1">
          <span
            className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0 cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            onClick={(e) => { e.stopPropagation(); onOpenFile(); }}
            title={displayPath}
          >
            {filename}
          </span>
          {dir && <span className="text-muted-foreground/40 truncate text-[11px]">{dir}</span>}
        </span>
        {hasContent && (
          <span className="text-[10px] text-muted-foreground flex-shrink-0 uppercase tracking-wider">
            {expanded ? 'collapse' : 'expand'}
          </span>
        )}
      </div>
      {expanded && hasContent && (
        <div className="border-t border-border">
          <CodeHighlight
            code={output}
            language={ext || 'text'}
            className="[&>pre]:rounded-none [&>pre]:border-0"
          />
        </div>
      )}
    </div>
  );
}

function MultiFileList({
  paths,
  toDisplayPath,
  onFileClick,
}: {
  paths: string[];
  toDisplayPath: (p: string) => string;
  onFileClick: (path: string) => void;
}) {
  return (
    <div className="py-1">
      {paths.map((fp, i) => {
        const dp = toDisplayPath(fp);
        const fname = getFilename(dp);
        const dir = getDirectory(dp);

        return (
          <div
            key={i}
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-muted transition-colors group"
            onClick={() => onFileClick(fp)}
            title={dp}
          >
            <FileText className="h-3.5 w-3.5 text-sky-500/70 dark:text-sky-400/70 flex-shrink-0 group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors" />
            <span className="text-xs min-w-0 flex items-baseline gap-1.5 overflow-hidden">
              <span className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0">{fname}</span>
              {dir && <span className="text-muted-foreground/40 truncate text-[11px]">{dir}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
