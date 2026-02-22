'use client';

import React, { useMemo } from 'react';
import {
  Brain,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  FileText,
  Wrench,
  Hash,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

// ============================================================================
// Types & Parsing
// ============================================================================

interface MemGetObservation {
  id: string;
  title: string;
  time: string;
  type: string;
  typeEmoji: string;
  tool: string;
  subtitle: string;
  narrative: string;
  facts: string[];
  concepts: string[];
  filesRead: string[];
  filesModified: string[];
}

/** Structured file-read result from the memory-get tool. */
interface MemoryFileResult {
  path: string;
  absolute_path?: string;
  total_lines: number;
  showing?: { start: number; end: number; count: number };
  content: string;
}

/** Structured error result from the memory-get tool. */
interface MemoryErrorResult {
  error: string;
  message: string;
  suggestion?: string;
}

/** Try to parse output as a JSON error result (with error + message fields). */
function parseErrorResult(output: string): MemoryErrorResult | null {
  if (!output) return null;
  const trimmed = output.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.error === 'string' &&
      typeof parsed.message === 'string'
    ) {
      return {
        error: parsed.error,
        message: parsed.message,
        suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : undefined,
      };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/** Try to parse output as a JSON file-read result (with path + content fields). */
function parseFileReadResult(output: string): MemoryFileResult | null {
  if (!output) return null;

  // If it's already an object (stringified JSON), try parsing
  const trimmed = output.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.path === 'string' &&
      typeof parsed.content === 'string'
    ) {
      return {
        path: parsed.path,
        absolute_path: parsed.absolute_path,
        total_lines: parsed.total_lines || 0,
        showing: parsed.showing,
        content: parsed.content,
      };
    }
  } catch {
    // Not JSON
  }

  return null;
}

/** Parse the rich markdown output produced by formatObservations() in the mem_get tool. */
function parseMemGetOutput(output: string): MemGetObservation[] {
  if (!output) return [];
  const sections = output.split(/\n---\n/).filter(s => s.trim());
  const observations: MemGetObservation[] = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const headerMatch = lines[0]?.match(/^##\s+#(\d+)\s*[—–-]\s*(.+)/);
    if (!headerMatch) continue;

    const id = `#${headerMatch[1]}`;
    const titlePart = headerMatch[2].trim();
    const emojiMatch = titlePart.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
    const typeEmoji = emojiMatch ? emojiMatch[1] : '';
    const title = emojiMatch ? titlePart.slice(emojiMatch[0].length) : titlePart;

    let time = '', type = '', tool = '';
    const metaLine = lines.find(l => l.includes('**Time:**'));
    if (metaLine) {
      const timeM = metaLine.match(/\*\*Time:\*\*\s*([^|]+)/);
      const typeM = metaLine.match(/\*\*Type:\*\*\s*([^|]+)/);
      const toolM = metaLine.match(/\*\*Tool:\*\*\s*(.+)/);
      time = timeM?.[1]?.trim() || '';
      type = typeM?.[1]?.trim() || '';
      tool = toolM?.[1]?.trim() || '';
    }

    const subtitleLine = lines.find(l => l.startsWith('**Subtitle:**'));
    const subtitle = subtitleLine?.replace('**Subtitle:**', '').trim() || '';

    let inNarrative = false;
    const narrativeLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('## #') || line.includes('**Time:**') || line.startsWith('**Subtitle:**')) {
        inNarrative = false;
        continue;
      }
      if (line.startsWith('**Facts:**') || line.startsWith('**Concepts:**') || line.startsWith('**Files read:**') || line.startsWith('**Files modified:**')) {
        inNarrative = false;
        continue;
      }
      if (inNarrative || (narrativeLines.length === 0 && line.trim() && !line.startsWith('**') && !line.startsWith('- '))) {
        inNarrative = true;
        narrativeLines.push(line);
      }
    }
    const narrative = narrativeLines.join(' ').trim();

    const facts: string[] = [];
    let inFacts = false;
    for (const line of lines) {
      if (line.startsWith('**Facts:**')) { inFacts = true; continue; }
      if (inFacts && line.startsWith('- ')) {
        facts.push(line.slice(2).trim());
      } else if (inFacts && !line.startsWith('- ') && line.trim()) {
        inFacts = false;
      }
    }

    const conceptsLine = lines.find(l => l.startsWith('**Concepts:**'));
    const concepts = conceptsLine
      ? conceptsLine.replace('**Concepts:**', '').split(',').map(c => c.trim()).filter(Boolean)
      : [];

    const filesReadLine = lines.find(l => l.startsWith('**Files read:**'));
    const filesRead = filesReadLine
      ? filesReadLine.replace('**Files read:**', '').split(',').map(f => f.trim()).filter(Boolean)
      : [];

    const filesModifiedLine = lines.find(l => l.startsWith('**Files modified:**'));
    const filesModified = filesModifiedLine
      ? filesModifiedLine.replace('**Files modified:**', '').split(',').map(f => f.trim()).filter(Boolean)
      : [];

    observations.push({ id, title, time, type, typeEmoji, tool, subtitle, narrative, facts, concepts, filesRead, filesModified });
  }

  return observations;
}

function memGetTypeInfo(typeEmoji: string, type: string): { label: string; bg: string; text: string; dot: string } {
  const e = typeEmoji.trim();
  if (e.includes('\u{1F535}') || type === 'discovery')
    return { label: 'Research',  bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-400' };
  if (e.includes('\u{1F7E3}') || type === 'feature')
    return { label: 'Feature',   bg: 'bg-purple-500/10',  text: 'text-purple-400',  dot: 'bg-purple-400' };
  if (e.includes('\u{1F534}') || type === 'bugfix')
    return { label: 'Bugfix',    bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400' };
  if (e.includes('\u{2696}') || type === 'decision')
    return { label: 'Decision',  bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400' };
  if (e.includes('\u{1F504}') || type === 'refactor')
    return { label: 'Refactor',  bg: 'bg-orange-500/10',  text: 'text-orange-400',  dot: 'bg-orange-400' };
  if (e.includes('\u{2705}') || type === 'change')
    return { label: 'Change',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' };
  return { label: 'Note', bg: 'bg-muted/40', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' };
}

/** Extract a short filename from a path. */
function getFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

// ============================================================================
// Component
// ============================================================================

export function OcMemGetToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const ids = (args.ids as string) || (ocState?.input?.ids as string) || '';
  const path = (args.path as string) || (ocState?.input?.path as string) || '';
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : (typeof rawOutput === 'object' ? JSON.stringify(rawOutput) : String(rawOutput));

  const isError = toolResult?.success === false || !!toolResult?.error;

  // Try to parse as error result first
  const errorResult = useMemo(() => parseErrorResult(output), [output]);

  // Try to parse as file-read result (skip if error)
  const fileResult = useMemo(() => {
    if (errorResult) return null;
    // If output is already a JSON object (not stringified)
    if (typeof rawOutput === 'object' && rawOutput !== null && 'path' in rawOutput && 'content' in rawOutput) {
      return rawOutput as MemoryFileResult;
    }
    return parseFileReadResult(output);
  }, [rawOutput, output, errorResult]);

  // Then try to parse as observations (only if not a file result or error)
  const observations = useMemo(() => {
    if (errorResult || fileResult) return [];
    return parseMemGetOutput(output);
  }, [output, errorResult, fileResult]);

  // Determine subtitle from context
  const subtitle = path || ids || (fileResult ? fileResult.path : '');

  // --- Loading ---
  if (isStreaming && !toolResult) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Brain} title="Memory" subtitle={subtitle} />
          </div>
        </CardHeader>
        <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="size-5 text-primary animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Loading memory...</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground/50 font-mono">{subtitle}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- File read result ---
  if (fileResult) {
    const filename = getFilename(fileResult.path);
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Brain} title="Memory" subtitle={filename} />
            <div className="flex items-center gap-2 text-xs flex-shrink-0">
              {fileResult.total_lines > 0 && (
                <span className="flex items-center gap-0.5 text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  {fileResult.total_lines} lines
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-full flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-3 space-y-2">
              {/* File path info */}
              <div className="flex items-center gap-2 px-1 py-1">
                <FolderOpen className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                <span className="text-[11px] text-muted-foreground/50 font-mono truncate">
                  {fileResult.path}
                </span>
              </div>

              {/* Rendered markdown content */}
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="px-4 py-3">
                  <div className="prose prose-sm dark:prose-invert max-w-none
                    prose-headings:text-foreground prose-headings:font-medium
                    prose-h1:text-base prose-h1:mb-2 prose-h1:mt-0
                    prose-h2:text-sm prose-h2:mb-1.5 prose-h2:mt-4
                    prose-h3:text-xs prose-h3:mb-1 prose-h3:mt-3
                    prose-p:text-xs prose-p:text-muted-foreground/80 prose-p:leading-relaxed prose-p:my-1.5
                    prose-li:text-xs prose-li:text-muted-foreground/80 prose-li:my-0.5
                    prose-ul:my-1 prose-ol:my-1
                    prose-strong:text-foreground prose-strong:font-medium
                    prose-code:text-[11px] prose-code:bg-muted/60 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                    prose-hr:border-border/50 prose-hr:my-3
                  ">
                    <UnifiedMarkdown content={fileResult.content} isStreaming={false} />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </CardContent>

        <ToolViewFooter
          assistantTimestamp={assistantTimestamp}
          toolTimestamp={toolTimestamp}
          isStreaming={isStreaming}
        >
          {!isStreaming && (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Loaded
            </Badge>
          )}
        </ToolViewFooter>
      </Card>
    );
  }

  // --- Error result (e.g. file not found) ---
  if (errorResult) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Brain} title="Memory" subtitle={subtitle} />
          </div>
        </CardHeader>

        <CardContent className="p-0 h-full flex-1 overflow-hidden">
          <div className="p-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-sm font-medium text-amber-300">
                  {errorResult.error}
                </div>
                <div className="text-xs text-muted-foreground/70 leading-relaxed break-all">
                  {errorResult.message}
                </div>
                {errorResult.suggestion && (
                  <div className="text-xs text-muted-foreground/50 italic">
                    {errorResult.suggestion}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>

        <ToolViewFooter
          assistantTimestamp={assistantTimestamp}
          toolTimestamp={toolTimestamp}
          isStreaming={isStreaming}
        >
          {!isStreaming && (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              Not found
            </Badge>
          )}
        </ToolViewFooter>
      </Card>
    );
  }

  // --- Observations display ---
  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Brain} title="Memory" subtitle={subtitle} />
          {observations.length > 0 && (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted flex-shrink-0 ml-2">
              <Brain className="h-3 w-3 mr-1 opacity-70" />
              {observations.length} {observations.length === 1 ? 'observation' : 'observations'}
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
                  const typeInfo = memGetTypeInfo(obs.typeEmoji, obs.type);
                  const allFiles = [...obs.filesRead, ...obs.filesModified];
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
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground/50 font-mono">
                            {obs.id}
                          </span>
                          <span className="text-muted-foreground/20">&middot;</span>
                          <span className="text-xs text-muted-foreground/50 inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {obs.time}
                          </span>
                          <span className="text-muted-foreground/20">&middot;</span>
                          <span className={cn('text-xs font-medium', typeInfo.text)}>
                            {typeInfo.label}
                          </span>
                          {obs.tool && obs.tool !== '—' && (
                            <>
                              <span className="text-muted-foreground/20">&middot;</span>
                              <span className="text-xs text-muted-foreground/40 font-mono inline-flex items-center gap-1">
                                <Wrench className="size-3" />
                                {obs.tool}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Subtitle / narrative */}
                        {(obs.subtitle || obs.narrative) && (
                          <div className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2">
                            {obs.subtitle || obs.narrative}
                          </div>
                        )}

                        {/* Facts */}
                        {obs.facts.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {obs.facts.slice(0, 4).map((fact, fi) => (
                              <div key={fi} className="text-xs text-muted-foreground/50 flex items-start gap-2">
                                <span className="text-muted-foreground/30 mt-px flex-shrink-0">&bull;</span>
                                <span className="line-clamp-1">{fact}</span>
                              </div>
                            ))}
                            {obs.facts.length > 4 && (
                              <div className="text-xs text-muted-foreground/30 pl-4">
                                +{obs.facts.length - 4} more facts
                              </div>
                            )}
                          </div>
                        )}

                        {/* Concepts */}
                        {obs.concepts.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {obs.concepts.slice(0, 6).map((c, ci) => (
                              <span key={ci} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/60">
                                {c}
                              </span>
                            ))}
                            {obs.concepts.length > 6 && (
                              <span className="text-[10px] text-muted-foreground/30">+{obs.concepts.length - 6}</span>
                            )}
                          </div>
                        )}

                        {/* Files */}
                        {allFiles.length > 0 && (
                          <div className="text-xs text-muted-foreground/40 font-mono truncate mt-1.5 inline-flex items-center gap-1">
                            <FileText className="size-3 flex-shrink-0" />
                            {allFiles.join(', ')}
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
            <div className="p-3">
              <div className="prose prose-sm dark:prose-invert max-w-none px-1">
                <UnifiedMarkdown content={output.slice(0, 3000)} isStreaming={false} />
              </div>
            </div>
          </ScrollArea>
        ) : isError ? (
          <div className="flex items-start gap-2.5 px-4 py-6 text-muted-foreground">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{output || 'Failed to load memory'}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6">
            <Brain className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No memory data found</p>
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
              {observations.length} {observations.length === 1 ? 'observation' : 'observations'}
            </Badge>
          ) : output ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Loaded
            </Badge>
          ) : null
        )}
      </ToolViewFooter>
    </Card>
  );
}
