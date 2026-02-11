'use client';

import React, { useMemo } from 'react';
import { Terminal, CheckCircle, AlertCircle, Clock, Info } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

interface BashMetadata {
  message: string;
  isTimeout: boolean;
  timeoutMs: number | null;
}

/** Extract and strip <bash_metadata> and similar XML tags from output */
function extractMetadata(output: string): { cleanOutput: string; metadata: BashMetadata[] } {
  const metadata: BashMetadata[] = [];

  // Strip <bash_metadata>...</bash_metadata>
  const cleanOutput = output.replace(/<bash_metadata>([\s\S]*?)<\/bash_metadata>/g, (_, content) => {
    const msg = content.trim();
    const timeoutMatch = msg.match(/timeout\s+(\d+)\s*ms/i);
    metadata.push({
      message: msg,
      isTimeout: /timeout|timed?\s*out/i.test(msg),
      timeoutMs: timeoutMatch ? parseInt(timeoutMatch[1], 10) : null,
    });
    return '';
  })
  // Also strip any other stray metadata-like XML tags
  .replace(/<\/?(?:system_info|exit_code|stderr_note)>[\s\S]*?(?:<\/\w+>|$)/g, '')
  .trim();

  return { cleanOutput, metadata };
}

function formatTimeout(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function OcBashToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const command = (args.command as string) || '';
  const description = (args.description as string) || '';
  const ocState = args._oc_state as any;

  // Get output from toolResult or from running state metadata
  const rawOutput = toolResult?.output
    || (ocState?.status === 'running' && ocState?.metadata?.output)
    || '';
  const strippedAnsi = typeof rawOutput === 'string' ? stripAnsi(rawOutput) : '';

  // Extract metadata tags from output
  const { cleanOutput, metadata } = useMemo(
    () => extractMetadata(strippedAnsi),
    [strippedAnsi]
  );

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={Terminal}
        iconColor="text-emerald-500 dark:text-emerald-400"
        bgColor="bg-gradient-to-b from-emerald-100 to-emerald-50 shadow-inner dark:from-emerald-800/40 dark:to-emerald-900/60"
        title="Running Command"
        subtitle={description || command}
        showProgress={true}
      />
    );
  }

  const codeBlock = `\`\`\`bash\n$ ${command}${cleanOutput ? '\n' + cleanOutput : ''}\n\`\`\``;

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Terminal}
            title={description || 'Shell Command'}
            subtitle={command.length > 60 ? command.slice(0, 60) + '...' : command}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4 space-y-3">
            <UnifiedMarkdown content={codeBlock} isStreaming={false} />

            {metadata.map((meta, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs ${
                  meta.isTimeout
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                    : 'bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-700/50'
                }`}
              >
                {meta.isTimeout ? (
                  <Clock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Info className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={meta.isTimeout
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-muted-foreground'
                  }>
                    {meta.isTimeout && meta.timeoutMs
                      ? `Command timed out after ${formatTimeout(meta.timeoutMs)}`
                      : meta.message
                    }
                  </span>
                </div>
                {meta.isTimeout && meta.timeoutMs && (
                  <Badge variant="outline" className="h-5 py-0 text-[10px] flex-shrink-0 bg-amber-100/50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400">
                    {formatTimeout(meta.timeoutMs)}
                  </Badge>
                )}
              </div>
            ))}
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
          ) : metadata.some((m) => m.isTimeout) ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300">
              <Clock className="h-3 w-3" />
              Timed Out
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
