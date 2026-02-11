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
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

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

function toRelativePath(fullPath: string): string {
  // Strip common home-dir prefixes to get a shorter relative-ish path
  return fullPath
    .replace(/^\/Users\/[^/]+\//, '~/')
    .replace(/^\/home\/[^/]+\//, '~/');
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
  const dir = getDirectory(filePath);
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

  const [expanded, setExpanded] = useState(false);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={Eye}
        iconColor="text-sky-500 dark:text-sky-400"
        bgColor="bg-gradient-to-b from-sky-100 to-sky-50 shadow-inner dark:from-sky-800/40 dark:to-sky-900/60"
        title="Reading File"
        subtitle={filename || filePath}
        showProgress={true}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Eye}
            title={filename || 'Read File'}
            subtitle={dir}
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
                ext={ext}
                output={output}
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
              />
            ) : (
              <MultiFileList paths={allPaths} />
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
            <Badge variant="outline" className="h-6 py-0.5 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
              <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
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
  ext,
  output,
  expanded,
  onToggle,
}: {
  filePath: string;
  ext: string;
  output: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasContent = !!output;
  const relativePath = toRelativePath(filePath);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 ${hasContent ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900' : ''} transition-colors`}
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
        <span className="font-mono text-xs text-foreground truncate flex-1">
          {relativePath}
        </span>
        {hasContent && (
          <span className="text-[10px] text-muted-foreground flex-shrink-0 uppercase tracking-wider">
            {expanded ? 'collapse' : 'expand'}
          </span>
        )}
      </div>
      {expanded && hasContent && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <UnifiedMarkdown
            content={`\`\`\`${ext}\n${output}\n\`\`\``}
            isStreaming={false}
          />
        </div>
      )}
    </div>
  );
}

function MultiFileList({ paths }: { paths: string[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-1.5">
      {paths.map((fp, i) => {
        const fname = getFilename(fp);
        const fext = getExtension(fname);
        const relativePath = toRelativePath(fp);
        const isExpanded = expandedIndex === i;

        return (
          <div
            key={i}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950"
          >
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <FileText className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0" />
              <span className="font-mono text-xs text-foreground truncate flex-1">
                {relativePath}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
