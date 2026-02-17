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

interface TimelineEntry {
  id: string;
  time: string;
  typeEmoji: string;
  title: string;
  isAnchor: boolean;
  subtitle: string;
  narrative: string;
  files: string;
}

function parseTimelineOutput(output: string): TimelineEntry[] {
  if (!output) return [];
  const entries: TimelineEntry[] = [];
  const lines = output.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Match: **#42** Feb 16 05:14 🔵 Some title here **[ANCHOR]**
    const m = line.match(/^\*\*#(\d+)\*\*\s+(.+?)\s+(\S+)\s+(.+?)(?:\s+\*\*\[ANCHOR\]\*\*)?$/);
    if (!m) { i++; continue; }

    const isAnchor = line.includes('**[ANCHOR]**');
    const titleText = m[4].replace(/\s*\*\*\[ANCHOR\]\*\*/, '').trim();

    let subtitle = '';
    let narrative = '';
    let files = '';
    i++;
    while (i < lines.length && lines[i].startsWith('  ')) {
      const content = lines[i].slice(2).trim();
      if (content.startsWith('Files:')) {
        files = content.replace('Files:', '').trim();
      } else if (!subtitle) {
        subtitle = content;
      } else {
        narrative = content;
      }
      i++;
    }

    entries.push({
      id: `#${m[1]}`,
      time: m[2],
      typeEmoji: m[3],
      title: titleText,
      isAnchor,
      subtitle,
      narrative,
      files,
    });
  }

  return entries;
}

function observationTypeInfo(type: string): { label: string; bg: string; text: string; dot: string } {
  const t = type.trim();
  if (t.includes('\u{1F535}'))
    return { label: 'Research',  bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-400' };
  if (t.includes('\u{1F7E3}'))
    return { label: 'Feature',   bg: 'bg-purple-500/10',  text: 'text-purple-400',  dot: 'bg-purple-400' };
  if (t.includes('\u{1F534}'))
    return { label: 'Bugfix',    bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400' };
  if (t.includes('\u{2696}'))
    return { label: 'Decision',  bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400' };
  if (t.includes('\u{1F504}'))
    return { label: 'Refactor',  bg: 'bg-orange-500/10',  text: 'text-orange-400',  dot: 'bg-orange-400' };
  if (t.includes('\u{2705}'))
    return { label: 'Change',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' };
  return { label: 'Note', bg: 'bg-muted/40', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' };
}

// ============================================================================
// Component
// ============================================================================

export function OcMemTimelineToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const anchor = (args.anchor as number) || (ocState?.input?.anchor as number) || 0;
  const anchorStr = anchor ? `#${anchor}` : '';
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);

  const isError = toolResult?.success === false || !!toolResult?.error;
  const entries = useMemo(() => parseTimelineOutput(output), [output]);

  // --- Loading ---
  if (isStreaming && !toolResult) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Clock} title="Mem Timeline" subtitle={anchorStr} />
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="size-5 text-primary animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Loading timeline...</p>
            {anchorStr && (
              <p className="text-xs text-muted-foreground/50 font-mono">around {anchorStr}</p>
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
          <ToolViewIconTitle icon={Clock} title="Mem Timeline" subtitle={anchorStr} />
          {entries.length > 0 && (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted flex-shrink-0 ml-2">
              <Clock className="h-3 w-3 mr-1 opacity-70" />
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        {entries.length > 0 ? (
          <ScrollArea className="h-full w-full">
            <div className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2 px-1">
                Timeline
              </div>
              <div className="space-y-1.5 relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border/30" />

                {entries.map((entry, i) => {
                  const typeInfo = observationTypeInfo(entry.typeEmoji);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-3 p-3 -mx-1 rounded-lg hover:bg-muted/40 transition-colors relative',
                        entry.isAnchor && 'bg-primary/5 border border-primary/10',
                      )}
                    >
                      {/* Type indicator */}
                      <div className={cn('size-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 z-10', typeInfo.bg)}>
                        <span className={cn('size-2 rounded-full', typeInfo.dot)} />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground line-clamp-2">
                          {entry.title}
                          {entry.isAnchor && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">
                              ANCHOR
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground/50 font-mono">
                            {entry.id}
                          </span>
                          <span className="text-muted-foreground/20">&middot;</span>
                          <span className="text-xs text-muted-foreground/50 inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {entry.time}
                          </span>
                          <span className="text-muted-foreground/20">&middot;</span>
                          <span className={cn('text-xs font-medium', typeInfo.text)}>
                            {typeInfo.label}
                          </span>
                        </div>

                        {/* Subtitle / narrative */}
                        {(entry.subtitle || entry.narrative) && (
                          <div className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2">
                            {entry.subtitle || entry.narrative}
                          </div>
                        )}

                        {/* Files */}
                        {entry.files && (
                          <div className="text-xs text-muted-foreground/40 font-mono truncate mt-1 inline-flex items-center gap-1">
                            <FileText className="size-3 flex-shrink-0" />
                            {entry.files}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
            <p className="text-sm">{output || 'Failed to load timeline'}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6">
            <Clock className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No timeline data found</p>
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
          ) : entries.length > 0 ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-muted-foreground" />
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </Badge>
          ) : null
        )}
      </ToolViewFooter>
    </Card>
  );
}
