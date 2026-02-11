'use client';

import React from 'react';
import { Cpu, CheckCircle, AlertCircle } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

function cleanTaskOutput(raw: string): string {
  return raw
    .replace(/^task_id:\s.*$/m, '')
    .replace(/^agentId:\s.*$/m, '')
    .replace(/<\/?task_result>/g, '')
    .replace(/<usage>[\s\S]*?<\/usage>/g, '')
    .trim();
}

export function OcTaskToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const subagentType = (args.subagent_type as string) || '';
  const description = (args.description as string) || '';
  const ocState = args._oc_state as any;
  const rawOutput = toolResult?.output || (ocState?.output) || '';
  const output = rawOutput ? cleanTaskOutput(String(rawOutput)) : '';

  const title = subagentType ? `Agent: ${subagentType}` : 'Sub-Agent Task';

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={Cpu}
        iconColor="text-purple-500 dark:text-purple-400"
        bgColor="bg-gradient-to-b from-purple-100 to-purple-50 shadow-inner dark:from-purple-800/40 dark:to-purple-900/60"
        title={title}
        subtitle={description}
        showProgress={true}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Cpu}
            title={title}
            subtitle={description}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4">
            {output ? (
              <UnifiedMarkdown content={String(output)} isStreaming={false} />
            ) : description ? (
              <div className="text-sm text-muted-foreground">{description}</div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Delegating to sub-agent...
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
