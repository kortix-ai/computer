'use client';

import React, { useMemo } from 'react';
import {
  Brain,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';

// ============================================================================
// Types & Parsing
// ============================================================================

interface Observation {
  id: string;
  time: string;
  type: string;
  title: string;
  files: string;
}

function parseObservationTable(output: string): { total: number; observations: Observation[] } | null {
  if (!output) return null;
  const headerMatch = output.match(/Found\s+(\d+)\s+observations/i);
  const total = headerMatch ? parseInt(headerMatch[1], 10) : 0;

  const observations: Observation[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    if (cells[0] === 'ID') continue;
    if (/^-+$/.test(cells[0])) continue;

    observations.push({
      id: cells[0] || '',
      time: cells[1] || '',
      type: cells[2] || '',
      title: cells[3] || '',
      files: cells[4] || '',
    });
  }

  if (observations.length === 0) return null;
  return { total, observations };
}

function observationTypeInfo(type: string): { label: string; bg: string; text: string; dot: string } {
  const t = type.trim();
  if (t.includes('🔵') || t.includes('💠'))
    return { label: 'Research',  bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-400' };
  if (t.includes('🟣') || t.includes('💜'))
    return { label: 'Analysis',  bg: 'bg-purple-500/10',  text: 'text-purple-400',  dot: 'bg-purple-400' };
  if (t.includes('🟢') || t.includes('💚'))
    return { label: 'Success',   bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' };
  if (t.includes('🔴') || t.includes('❤️'))
    return { label: 'Error',     bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400' };
  if (t.includes('🟡') || t.includes('💛'))
    return { label: 'Warning',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400' };
  if (t.includes('🟠') || t.includes('🧡'))
    return { label: 'Build',     bg: 'bg-orange-500/10',  text: 'text-orange-400',  dot: 'bg-orange-400' };
  if (t.includes('🏗') || t.includes('🔨'))
    return { label: 'Build',     bg: 'bg-orange-500/10',  text: 'text-orange-400',  dot: 'bg-orange-400' };
  return { label: 'Note', bg: 'bg-muted/40', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' };
}

// ============================================================================
// Component
// ============================================================================

export function OcMemSearchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const query = (args.query as string) || (ocState?.input?.query as string) || '';
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);

  const isError = toolResult?.success === false || !!toolResult?.error;
  const parsed = useMemo(() => parseObservationTable(output), [output]);
  const observations = parsed?.observations ?? [];
  const total = parsed?.total ?? observations.length;

  // --- Loading ---
  if (isStreaming && !toolResult) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Brain} title="Mem Search" subtitle={query} />
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="size-5 text-primary animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Searching memory...</p>
            {query && (
              <p className="text-xs text-muted-foreground/50 font-mono">{query}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Brain} title="Mem Search" subtitle={query} />
          {observations.length > 0 && (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted flex-shrink-0 ml-2">
              <Brain className="h-3 w-3 mr-1 opacity-70" />
              {total} {total === 1 ? 'observation' : 'observations'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        {observations.length > 0 ? (
          <ScrollArea className="h-full w-full">
            <div className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2 px-1">
                Observations
              </div>
              <div className="space-y-1.5">
                {observations.map((obs, i) => {
                  const typeInfo = observationTypeInfo(obs.type);
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 -mx-1 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      {/* Type indicator */}
                      <div className={cn('size-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5', typeInfo.bg)}>
                        <span className={cn('size-2 rounded-full', typeInfo.dot)} />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground line-clamp-2">
                          {obs.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground/50 font-mono">
                            {obs.id}
                          </span>
                          <span className="text-muted-foreground/20">·</span>
                          <span className="text-xs text-muted-foreground/50 inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {obs.time}
                          </span>
                          <span className="text-muted-foreground/20">·</span>
                          <span className={cn('text-xs font-medium', typeInfo.text)}>
                            {typeInfo.label}
                          </span>
                          {obs.files.trim() && (
                            <>
                              <span className="text-muted-foreground/20">·</span>
                              <span className="text-xs text-muted-foreground/40 font-mono truncate inline-flex items-center gap-1">
                                <FileText className="size-3" />
                                {obs.files}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {total > observations.length && (
                <div className="mt-3 pt-2 border-t border-border/20 px-1">
                  <span className="text-xs text-muted-foreground/40">
                    Showing {observations.length} of {total} observations
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : output && !isError ? (
          <ScrollArea className="h-full w-full">
            <div className="p-3 text-sm text-muted-foreground whitespace-pre-wrap font-mono">
              {output.slice(0, 3000)}
            </div>
          </ScrollArea>
        ) : isError ? (
          <div className="flex items-start gap-2.5 px-4 py-6 text-muted-foreground">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{output || 'Memory search failed'}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6">
            <Brain className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No observations found</p>
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
          ) : observations.length > 0 ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-muted-foreground" />
              {total} {total === 1 ? 'observation' : 'observations'}
            </Badge>
          ) : null
        )}
      </ToolViewFooter>
    </Card>
  );
}
