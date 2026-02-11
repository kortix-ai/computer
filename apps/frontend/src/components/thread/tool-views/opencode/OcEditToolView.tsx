'use client';

import React from 'react';
import { FileCode2, CheckCircle, AlertCircle, Plus, Minus } from 'lucide-react';
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

export function OcEditToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const filePath = (args.filePath as string) || (args.target_filepath as string) || '';
  const ocState = args._oc_state as any;

  const filename = getFilename(filePath);
  const dir = getDirectory(filePath);

  // Extract diff info from metadata
  const metadata = ocState?.metadata || {};
  const filediff = metadata?.filediff;
  const additions = filediff?.additions;
  const deletions = filediff?.deletions;

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={FileCode2}
        iconColor="text-blue-500 dark:text-blue-400"
        bgColor="bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60"
        title="Editing File"
        subtitle={filename}
        showProgress={true}
      />
    );
  }

  // Build a diff-like display
  const ext = filename.split('.').pop() || '';

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={FileCode2}
            title={filename || 'Edit File'}
            subtitle={dir}
          />
          {(additions != null || deletions != null) && (
            <div className="flex items-center gap-2 text-xs flex-shrink-0">
              {additions != null && (
                <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <Plus className="h-3 w-3" />
                  {additions}
                </span>
              )}
              {deletions != null && (
                <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400">
                  <Minus className="h-3 w-3" />
                  {deletions}
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4 space-y-3">
            {/* Show the old/new content or a summary */}
            {filediff?.after != null ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">Result</div>
                <UnifiedMarkdown
                  content={`\`\`\`${ext}\n${filediff.after}\n\`\`\``}
                  isStreaming={false}
                />
              </div>
            ) : args.oldString && args.newString ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-xs text-red-500 font-medium">Removed</div>
                  <UnifiedMarkdown
                    content={`\`\`\`${ext}\n${args.oldString}\n\`\`\``}
                    isStreaming={false}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-emerald-500 font-medium">Added</div>
                  <UnifiedMarkdown
                    content={`\`\`\`${ext}\n${args.newString}\n\`\`\``}
                    isStreaming={false}
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                File edited: <span className="font-mono text-foreground">{filePath}</span>
              </div>
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
              Saved
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
