'use client';

import React from 'react';
import { Globe, CheckCircle, AlertCircle } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

export function OcCodesearchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;

  const query = (args.query as string) || '';
  const tokensNum = (args.tokensNum as number) || 5000;
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = String(rawOutput).trim();

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return <LoadingState title="Code Search" subtitle={query} />;
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2 overflow-hidden">
        <div className="flex flex-row items-center justify-between min-w-0 overflow-hidden">
          <ToolViewIconTitle
            icon={Globe}
            title="Code Search"
            subtitle={query}
          />
          {tokensNum !== 5000 && (
            <Badge variant="outline" className="h-5 py-0 text-[10px] flex-shrink-0 ml-2">
              {tokensNum.toLocaleString()} tokens
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3">
            {output ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <UnifiedMarkdown content={output} />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No results found for &ldquo;{query}&rdquo;
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
            <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Done
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
