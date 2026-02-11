'use client';

import React from 'react';
import { Eye, CheckCircle, AlertCircle } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';

function getFilename(path: string | undefined): string {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
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

  // Extract loaded files from metadata
  const metadata = ocState?.metadata || {};
  const loaded: string[] = Array.isArray(metadata?.loaded) ? metadata.loaded : [];

  const isError = toolResult?.success === false || !!toolResult?.error;

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
            title="Read File"
            subtitle={filename || filePath}
          />
          {loaded.length > 0 && (
            <div className="text-xs text-muted-foreground flex-shrink-0">
              {loaded.length} file{loaded.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4 space-y-1.5">
            {loaded.length > 0 ? (
              loaded.map((fp, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-500 flex-shrink-0">+</span>
                  <span className="font-mono text-xs text-foreground truncate">{fp}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                Reading: <span className="font-mono text-foreground">{filePath}</span>
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
              Read
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
