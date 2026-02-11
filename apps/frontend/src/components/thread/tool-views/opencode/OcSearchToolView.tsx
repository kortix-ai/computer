'use client';

import React from 'react';
import { Search, CheckCircle, AlertCircle } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

export function OcSearchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocTool = (args._oc_tool as string) || 'search';
  const ocState = args._oc_state as any;

  const pattern = (args.pattern as string) || '';
  const path = (args.path as string) || '';
  const output = toolResult?.output || (ocState?.output) || '';

  const toolLabel = ocTool === 'glob' ? 'Search Files'
    : ocTool === 'grep' ? 'Search Content'
    : ocTool === 'list' ? 'List Directory'
    : 'Search';

  const subtitle = pattern || path || undefined;

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={Search}
        iconColor="text-amber-500 dark:text-amber-400"
        bgColor="bg-gradient-to-b from-amber-100 to-amber-50 shadow-inner dark:from-amber-800/40 dark:to-amber-900/60"
        title={toolLabel}
        subtitle={subtitle}
        showProgress={true}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Search}
            title={toolLabel}
            subtitle={subtitle}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4">
            {output ? (
              <UnifiedMarkdown content={String(output)} isStreaming={false} />
            ) : (
              <div className="text-sm text-muted-foreground">
                No results to display.
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
              Done
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
