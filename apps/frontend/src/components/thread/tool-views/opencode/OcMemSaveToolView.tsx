'use client';

import React, { useMemo } from 'react';
import {
  Brain,
  Check,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';

// ============================================================================
// Helpers
// ============================================================================

function memSaveTypeInfo(type: string): { label: string; bg: string; text: string; dot: string } {
  switch (type) {
    case 'discovery':
      return { label: 'Research',  bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-400' };
    case 'feature':
      return { label: 'Feature',   bg: 'bg-purple-500/10',  text: 'text-purple-400',  dot: 'bg-purple-400' };
    case 'bugfix':
      return { label: 'Bugfix',    bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400' };
    case 'decision':
      return { label: 'Decision',  bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400' };
    case 'refactor':
      return { label: 'Refactor',  bg: 'bg-orange-500/10',  text: 'text-orange-400',  dot: 'bg-orange-400' };
    case 'change':
      return { label: 'Change',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' };
    default:
      return { label: 'Note', bg: 'bg-muted/40', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' };
  }
}

// ============================================================================
// Component
// ============================================================================

export function OcMemSaveToolView({
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
  const text = (args.text as string) || (ocState?.input?.text as string) || '';
  const type = (args.type as string) || (ocState?.input?.type as string) || 'discovery';
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);

  const isError = toolResult?.success === false || !!toolResult?.error;

  // Parse success output: Observation #137 saved: "title"
  const parsed = useMemo(() => {
    if (!output) return null;
    const m = output.match(/Observation\s+#(\d+)\s+saved:\s+"([^"]+)"/);
    if (!m) return null;
    return { id: `#${m[1]}`, title: m[2] };
  }, [output]);

  const displayTitle = parsed?.title || title || '';
  const typeInfo = memSaveTypeInfo(type);

  // --- Loading ---
  if (isStreaming && !toolResult) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Brain} title="Mem Save" subtitle={displayTitle} />
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="size-5 text-primary animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Saving observation...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Brain} title="Mem Save" subtitle={displayTitle} />
          {parsed && (
            <Badge variant="outline" className="h-6 py-0.5 bg-emerald-500/10 border-emerald-500/20 flex-shrink-0 ml-2">
              <CheckCircle className="h-3 w-3 mr-1 text-emerald-400" />
              <span className="text-emerald-400">Saved</span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        {parsed ? (
          <div className="p-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/30">
              {/* Type indicator */}
              <div className={cn('size-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', typeInfo.bg)}>
                <span className={cn('size-3 rounded-full', typeInfo.dot)} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {parsed.title}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground/50 font-mono">
                    {parsed.id}
                  </span>
                  <span className="text-muted-foreground/20">&middot;</span>
                  <span className={cn('text-xs font-medium', typeInfo.text)}>
                    {typeInfo.label}
                  </span>
                  <span className="text-muted-foreground/20">&middot;</span>
                  <span className="text-xs text-emerald-400 font-medium inline-flex items-center gap-1">
                    <Check className="size-3" />
                    Saved
                  </span>
                </div>

                {/* Show text content preview */}
                {text && (
                  <div className="text-xs text-muted-foreground/60 mt-2 line-clamp-4">
                    {text}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : isError ? (
          <div className="flex items-start gap-2.5 px-4 py-6 text-muted-foreground">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
            <p className="text-sm">{output || 'Failed to save observation'}</p>
          </div>
        ) : output ? (
          <div className="p-3 text-sm text-muted-foreground whitespace-pre-wrap font-mono">
            {output}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6">
            <Brain className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No result</p>
          </div>
        )}
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
          ) : parsed ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-muted-foreground" />
              {parsed.id} saved
            </Badge>
          ) : null
        )}
      </ToolViewFooter>
    </Card>
  );
}
