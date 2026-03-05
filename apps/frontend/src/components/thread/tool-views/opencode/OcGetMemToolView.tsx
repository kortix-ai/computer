'use client';

import React, { useMemo } from 'react';
import {
  Brain,
  AlertCircle,
  CheckCircle,
  Fingerprint,
  CalendarClock,
  ClipboardList,
  FileText,
  Tags,
  Target,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';

interface ObservationReport {
  id: string;
  type: string;
  title: string;
  narrative: string;
  tool: string | null;
  prompt: string | null;
  session: string | null;
  created: string | null;
  facts: string[];
  concepts: string[];
  filesRead: string[];
}

function parseObservationReport(text: string): ObservationReport | null {
  if (!text.includes('Observation #') || !text.includes('Facts:')) return null;

  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const headerMatch = normalized.match(
    /===\s*Observation\s*#(\d+)\s*\[([^\]]+)\]\s*===\s*Title:\s*(.+?)\s*Narrative:\s*([\s\S]+?)\s*Facts:\s*([\s\S]*)$/,
  );
  if (!headerMatch) return null;

  const [, id, type, title, narrativeAndMeta, factsAndMore] = headerMatch;

  const lines = narrativeAndMeta
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let narrative = '';
  let tool: string | null = null;
  let prompt: string | null = null;
  let session: string | null = null;
  let created: string | null = null;

  for (const line of lines) {
    if (line.startsWith('Tool:')) {
      const compactMeta = line
        .replace(/^Tool:\s*/i, 'Tool: ')
        .replace(/\s+/g, ' ')
        .trim();
      const inlineMeta = compactMeta.match(/^Tool:\s*([^|]+?)\s*\|\s*Prompt\s*#([^\s]+)$/i);
      if (inlineMeta) {
        tool = inlineMeta[1].trim();
        prompt = inlineMeta[2].trim();
      } else {
        tool = line.replace(/^Tool:\s*/i, '').trim() || null;
      }
      continue;
    }
    if (line.startsWith('Prompt #')) {
      prompt = line.replace(/^Prompt\s*#/i, '').trim() || null;
      continue;
    }
    if (line.startsWith('Session:')) {
      session = line.replace(/^Session:\s*/i, '').trim() || null;
      continue;
    }
    if (line.startsWith('Created:')) {
      created = line.replace(/^Created:\s*/i, '').trim() || null;
      continue;
    }

    narrative = narrative ? `${narrative} ${line}` : line;
  }

  const facts: string[] = [];
  let concepts: string[] = [];
  let filesRead: string[] = [];

  for (const rawLine of factsAndMore.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('- ') || line.startsWith('• ')) {
      facts.push(line.slice(2).trim());
      continue;
    }

    if (line.startsWith('Concepts:')) {
      concepts = line
        .replace(/^Concepts:\s*/i, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    if (line.startsWith('Files read:')) {
      filesRead = line
        .replace(/^Files read:\s*/i, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!title.trim() || !narrative || facts.length === 0) return null;

  return {
    id,
    type,
    title: title.trim(),
    narrative,
    tool,
    prompt,
    session,
    created,
    facts,
    concepts,
    filesRead,
  };
}

export function OcGetMemToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const source = (args.source as string) || '';
  const memoryId = args.id != null ? String(args.id) : '';
  const rawOutput = toolResult?.output || (args as any)._oc_state?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput, null, 2);
  const isError = toolResult?.success === false || !!toolResult?.error;

  const report = useMemo(() => parseObservationReport(output), [output]);

  if (isStreaming && !toolResult) {
    return <LoadingState title="Get Memory" subtitle={memoryId ? `#${memoryId}` : source || undefined} />;
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Brain} title="Get Memory" subtitle={memoryId ? `#${memoryId}` : undefined} />
          {(source || memoryId) && (
            <div className="flex items-center gap-1.5 ml-2">
              {source && (
                <Badge variant="outline" className="h-5 py-0 text-[10px]">
                  {source}
                </Badge>
              )}
              {memoryId && (
                <Badge variant="outline" className="h-5 py-0 text-[10px] font-mono">
                  #{memoryId}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-2">
            {(source || memoryId) && (
              <div className="rounded-xl border border-sky-200/50 dark:border-sky-900/50 bg-gradient-to-r from-sky-50/60 via-background to-background dark:from-sky-950/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-sky-700/80 dark:text-sky-300/80 mb-2">Request</p>
                <div className="flex flex-wrap items-center gap-2">
                  {source && (
                    <Badge variant="secondary" className="h-6 text-[11px] font-medium bg-sky-100/70 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200 border border-sky-200/70 dark:border-sky-800/50">
                      <Target className="h-3.5 w-3.5" />
                      Source: {source}
                    </Badge>
                  )}
                  {memoryId && (
                    <Badge variant="secondary" className="h-6 text-[11px] font-semibold font-mono bg-background border border-sky-200/80 dark:border-sky-800/60">
                      <Fingerprint className="h-3.5 w-3.5" />
                      ID: {memoryId}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {report ? (
              <div className="rounded-2xl border border-border/70 overflow-hidden bg-gradient-to-b from-background via-background to-amber-50/20 dark:to-amber-950/10 shadow-sm">
                <div className="px-4 py-3 border-b border-border/60 bg-gradient-to-r from-amber-50/70 to-background dark:from-amber-950/20">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-6 bg-background/90 border-amber-200/80 dark:border-amber-800/60">
                      <Fingerprint className="h-3.5 w-3.5" />
                      Observation #{report.id}
                    </Badge>
                    <Badge variant="outline" className="h-6 bg-amber-100/70 text-amber-900 border-amber-200/80 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800/60 uppercase tracking-wide text-[10px]">
                      {report.type}
                    </Badge>
                    {report.created && (
                      <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-background/70 border border-border/60 rounded-full px-2 py-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {report.created}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-[1.05rem] font-semibold leading-snug text-foreground">{report.title}</h3>
                </div>

                <div className="px-4 py-3 space-y-3">
                  <div className="rounded-xl border border-border/60 bg-gradient-to-b from-background to-muted/10 p-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Narrative
                    </span>
                    <p className="text-sm leading-relaxed text-foreground/85">{report.narrative}</p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-gradient-to-b from-background to-muted/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        <ClipboardList className="h-3.5 w-3.5" />
                        Facts
                      </span>
                      <Badge variant="secondary" className="h-5 text-[10px] font-medium">{report.facts.length}</Badge>
                    </div>
                    <ul className="space-y-1.5">
                      {report.facts.map((fact, idx) => (
                        <li key={`${report.id}-${idx}`} className="flex items-start gap-2 text-sm text-foreground/90 leading-relaxed">
                          <span className="mt-[8px] h-1.5 w-1.5 rounded-full bg-emerald-500/90 flex-shrink-0" />
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {report.concepts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-gradient-to-r from-background to-muted/20 p-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground mr-1">
                        <Tags className="h-3.5 w-3.5" />
                        Concepts
                      </span>
                      {report.concepts.map((concept) => (
                        <Badge key={concept} variant="secondary" className="h-6 px-2 text-[11px] font-medium bg-emerald-100/60 text-emerald-800 border-emerald-200/70 dark:bg-emerald-900/25 dark:text-emerald-100 dark:border-emerald-800/60">
                          <Tags className="h-3 w-3" />
                          {concept}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {(report.tool || report.prompt || report.session || report.filesRead.length > 0) && (
                    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-muted/10 to-background p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {report.tool && <Badge variant="outline" className="h-5 px-1.5 font-medium bg-background/80">Tool: {report.tool}</Badge>}
                        {report.prompt && <Badge variant="outline" className="h-5 px-1.5 font-medium bg-background/80">Prompt #{report.prompt}</Badge>}
                        {report.session && <Badge variant="outline" className="h-5 px-1.5 font-medium font-mono bg-background/80">{report.session}</Badge>}
                      </div>
                      {report.filesRead.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Files read</p>
                          <div className="flex flex-wrap gap-1.5">
                            {report.filesRead.map((file) => (
                              <span
                                key={file}
                                className="px-2 py-1 rounded-md bg-background border border-border/70 text-[11px] font-mono text-foreground/75 break-all"
                              >
                                {file}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : isError ? (
              <div className="flex items-start gap-2.5 px-4 py-6 text-muted-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{output || 'Get memory failed'}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">{output}</pre>
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
              Completed
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
