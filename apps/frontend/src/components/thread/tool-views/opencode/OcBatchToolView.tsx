'use client';

import React, { useMemo } from 'react';
import { Layers, CheckCircle, AlertCircle, Check, X, Loader2 } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { cn } from '@/lib/utils';

interface BatchDetail {
  tool: string;
  success: boolean;
}

export function OcBatchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const metadata = ocState?.metadata || {};

  const totalCalls = (metadata.totalCalls as number) || 0;
  const successful = (metadata.successful as number) || 0;
  const failed = (metadata.failed as number) || 0;

  // Fall back to input tool_calls if metadata not yet available
  const toolCalls = useMemo(() => {
    const details = (metadata.details as BatchDetail[]) || [];
    const tools = (metadata.tools as string[]) || [];
    if (details.length > 0) return details;
    const inputCalls = args.tool_calls as Array<{ tool: string }> | undefined;
    if (Array.isArray(inputCalls)) {
      return inputCalls.map((c) => ({ tool: c.tool, success: true }));
    }
    return tools.map((t) => ({ tool: t, success: true }));
  }, [metadata.details, metadata.tools, args.tool_calls]);

  const isError = toolResult?.success === false || !!toolResult?.error;
  const hasFailed = failed > 0;
  const isRunning = isStreaming && !toolResult;

  if (isRunning) {
    const toolNames = toolCalls.map((c) => c.tool).join(', ');
    return <LoadingState title="Batch Execution" subtitle={toolNames || `${toolCalls.length} tools`} />;
  }

  const subtitle = totalCalls > 0
    ? `${successful}/${totalCalls} succeeded`
    : `${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''}`;

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Layers}
            title="Batch Execution"
            subtitle={subtitle}
          />
          {totalCalls > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {successful > 0 && (
                <Badge variant="outline" className="h-5 py-0 text-[10px] bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300">
                  {successful} passed
                </Badge>
              )}
              {failed > 0 && (
                <Badge variant="outline" className="h-5 py-0 text-[10px] bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300">
                  {failed} failed
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-1.5">
            {toolCalls.length > 0 ? (
              toolCalls.map((call, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg border',
                    call.success
                      ? 'border-border/40 bg-card'
                      : 'border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/10',
                  )}
                >
                  {/* Status icon */}
                  {!toolResult ? (
                    <Loader2 className="size-3.5 text-muted-foreground animate-spin shrink-0" />
                  ) : call.success ? (
                    <Check className="size-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <X className="size-3.5 text-red-500 shrink-0" />
                  )}

                  {/* Tool name */}
                  <span className="text-xs font-mono flex-1 truncate">{call.tool}</span>

                  {/* Index badge */}
                  <span className="text-[10px] text-muted-foreground/50 shrink-0">#{i + 1}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No tool calls recorded.
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
          isError || hasFailed ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              {isError ? 'Failed' : `${failed} failed`}
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              All passed
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
