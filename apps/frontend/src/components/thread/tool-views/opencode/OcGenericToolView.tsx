'use client';

import React from 'react';
import { Wrench, CheckCircle, AlertCircle } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { SmartJsonViewer } from '../shared/SmartJsonViewer';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

export function OcGenericToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocTool = (args._oc_tool as string) || toolCall?.function_name || 'tool';
  const ocState = args._oc_state as any;
  const output = toolResult?.output || (ocState?.output) || '';

  // Build clean arguments without internal adapter fields
  const cleanArgs = React.useMemo(() => {
    const { _oc_tool, _oc_state, ...rest } = args;
    return Object.keys(rest).length > 0 ? rest : null;
  }, [args]);

  const title = ocState?.title || ocTool;

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={Wrench}
        iconColor="text-orange-500 dark:text-orange-400"
        bgColor="bg-gradient-to-b from-orange-100 to-orange-50 shadow-inner dark:from-orange-800/40 dark:to-orange-900/60"
        title={title}
        showProgress={true}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Wrench}
            title={title}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4 space-y-4">
            {cleanArgs && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Input</div>
                <div className="border-muted bg-muted/20 rounded-lg overflow-hidden border p-3">
                  <SmartJsonViewer data={cleanArgs} />
                </div>
              </div>
            )}

            {output && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {isError ? 'Error' : 'Output'}
                </div>
                <div className="border-muted bg-muted/20 rounded-lg overflow-hidden border p-3">
                  {typeof output === 'string' ? (
                    <UnifiedMarkdown content={output} isStreaming={false} />
                  ) : (
                    <SmartJsonViewer data={output} />
                  )}
                </div>
              </div>
            )}

            {!cleanArgs && !output && (
              <div className="text-sm text-muted-foreground">
                No content to display.
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
              Completed
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
