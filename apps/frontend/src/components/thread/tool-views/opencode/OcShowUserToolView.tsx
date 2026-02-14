'use client';

import React from 'react';
import {
  Eye,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';

export function OcShowUserToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const title = (args.title as string) || (ocState?.input?.title as string) || '';
  const description = (args.description as string) || (ocState?.input?.description as string) || '';
  const type = (args.type as string) || (ocState?.input?.type as string) || '';
  const path = (args.path as string) || (ocState?.input?.path as string) || '';
  const url = (args.url as string) || (ocState?.input?.url as string) || '';
  const content = (args.content as string) || (ocState?.input?.content as string) || '';

  const isError = toolResult?.success === false || !!toolResult?.error;
  const isImage = type === 'image' || path.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);

  const displayTitle = title || description || 'Output';

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={isImage ? ImageIcon : Eye}
            title={displayTitle}
            subtitle={path || url || undefined}
          />
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4 space-y-3">
            {/* Image preview */}
            {isImage && path && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={path}
                  alt={title || 'Output image'}
                  className="max-w-full max-h-[400px] rounded-lg border border-zinc-200 dark:border-zinc-800 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}

            {/* Description */}
            {description && title && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}

            {/* Content */}
            {content && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
              </div>
            )}

            {/* URL link */}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {url}
              </a>
            )}

            {/* File path */}
            {path && !isImage && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-foreground font-mono truncate">{path}</span>
              </div>
            )}

            {/* Error */}
            {isError && (
              <div className="flex items-start gap-2.5 text-muted-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{toolResult?.error || 'Operation failed'}</p>
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
          <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
            <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
            Displayed
          </Badge>
        )}
      </ToolViewFooter>
    </Card>
  );
}
