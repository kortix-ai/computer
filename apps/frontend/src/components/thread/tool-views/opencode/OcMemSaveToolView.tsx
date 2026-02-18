'use client';

import React, { useMemo } from 'react';
import {
  Brain,
  Check,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';

// ============================================================================
// Types
// ============================================================================

interface ValidationIssue {
  code: string;
  message: string;
  path: string[];
  received?: string;
  options?: string[];
  expected?: string;
}

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

/** Try to parse validation issues from error output (Zod-style JSON arrays/objects). */
function parseValidationIssues(text: string): ValidationIssue[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (arr.length === 0) return null;
    // Validate that at least one item looks like a validation issue
    if (!arr.every((item: any) => item && typeof item === 'object' && 'message' in item)) return null;

    return arr.map((item: any) => ({
      code: item.code || 'error',
      message: item.message || String(item),
      path: Array.isArray(item.path) ? item.path.map(String) : [],
      received: item.received != null ? String(item.received) : undefined,
      options: Array.isArray(item.options) ? item.options.map(String) : undefined,
      expected: item.expected != null ? String(item.expected) : undefined,
    }));
  } catch {
    return null;
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

  // Parse validation issues from error output
  const validationIssues = useMemo(() => {
    if (!isError || !output) return null;
    return parseValidationIssues(output);
  }, [isError, output]);

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
          <ScrollArea className="h-full w-full">
            <div className="p-3 space-y-2">
              {/* Structured validation error display */}
              {validationIssues ? (
                <ValidationErrorDisplay issues={validationIssues} />
              ) : (
                <GenericErrorDisplay message={output || 'Failed to save observation'} />
              )}

              {/* Show what was being saved as context */}
              {(title || text) && (
                <div className="rounded-lg border border-border overflow-hidden bg-card">
                  <div className="flex items-center gap-2.5 px-3 py-2 text-muted-foreground/60">
                    <Brain className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium">Attempted to save</span>
                  </div>
                  <div className="border-t border-border px-3 py-2.5 space-y-1.5">
                    {title && (
                      <div className="flex items-start gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground/50 min-w-[40px] flex-shrink-0 font-mono pt-px">title</span>
                        <span className="text-xs text-foreground/80">{title}</span>
                      </div>
                    )}
                    {type && (
                      <div className="flex items-start gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground/50 min-w-[40px] flex-shrink-0 font-mono pt-px">type</span>
                        <span className={cn('text-xs font-medium', typeInfo.text)}>{type}</span>
                      </div>
                    )}
                    {text && (
                      <div className="flex items-start gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground/50 min-w-[40px] flex-shrink-0 font-mono pt-px">text</span>
                        <span className="text-xs text-foreground/60 line-clamp-3">{text}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : output ? (
          <ScrollArea className="h-full w-full">
            <div className="p-3 text-sm text-muted-foreground whitespace-pre-wrap font-mono">
              {output}
            </div>
          </ScrollArea>
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
            <Badge variant="outline" className="h-6 py-0.5 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300">
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

// ============================================================================
// Sub-components
// ============================================================================

/** Nicely formatted validation error display (Zod-style issues). */
function ValidationErrorDisplay({ issues }: { issues: ValidationIssue[] }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/10">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
        <span className="text-xs font-medium text-red-400">Validation Error</span>
        {issues.length > 1 && (
          <span className="text-[10px] text-red-400/60 font-mono ml-auto">
            {issues.length} issues
          </span>
        )}
      </div>

      {/* Issues */}
      <div className="divide-y divide-red-500/10">
        {issues.map((issue, i) => (
          <div key={i} className="px-3 py-2.5 space-y-2">
            {/* Path + message */}
            <div className="flex items-start gap-2">
              <ChevronRight className="h-3 w-3 flex-shrink-0 text-red-400/50 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                {issue.path.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 font-mono inline-block">
                    {issue.path.join('.')}
                  </span>
                )}
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {issue.message}
                </p>
              </div>
            </div>

            {/* Received value */}
            {issue.received && (
              <div className="ml-5 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/50">Received:</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-300 font-mono">
                  {issue.received}
                </span>
              </div>
            )}

            {/* Expected options */}
            {issue.options && issue.options.length > 0 && (
              <div className="ml-5 space-y-1">
                <div className="text-[10px] text-muted-foreground/50">Expected one of:</div>
                <div className="flex flex-wrap gap-1">
                  {issue.options.map((opt, oi) => (
                    <span
                      key={oi}
                      className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground/70 font-mono"
                    >
                      {opt}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Error code */}
            {issue.code && issue.code !== 'error' && (
              <div className="ml-5">
                <span className="text-[9px] text-muted-foreground/30 font-mono uppercase tracking-wider">
                  {issue.code}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Simple error display for non-validation errors. */
function GenericErrorDisplay({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/10">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
        <span className="text-xs font-medium text-red-400">Error</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs text-foreground/80 leading-relaxed break-words whitespace-pre-wrap font-mono">
          {message}
        </p>
      </div>
    </div>
  );
}
