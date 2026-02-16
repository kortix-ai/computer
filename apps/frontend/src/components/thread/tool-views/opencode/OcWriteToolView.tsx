'use client';

import React from 'react';
import { FilePlus2, CheckCircle, AlertCircle } from 'lucide-react';
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

export function OcWriteToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const filePath = (args.filePath as string) || '';
  const content = (args.content as string) || '';

  const { openFile, toDisplayPath } = useOcFileOpen();

  const displayPath = toDisplayPath(filePath);
  const filename = getFilename(displayPath);
  const dir = getDirectory(displayPath);
  const ext = filename.split('.').pop() || '';

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title="Writing File"
        subtitle={filename}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={FilePlus2}
            title={filename || 'Write File'}
            subtitle={dir}
            onTitleClick={filePath ? () => openFile(filePath) : undefined}
          />
          {content && (
            <div className="text-xs text-muted-foreground flex-shrink-0">
              {content.split('\n').length} lines
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3">
            {content ? (
              <CodeHighlight
                code={content}
                language={ext || 'text'}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                File written: <span className="font-mono text-foreground">{displayPath}</span>
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
              Created
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
