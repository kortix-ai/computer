'use client';

import React, { useState, useMemo } from 'react';
import {
  Wrench,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  FileCode2,
  AlertTriangle,
  Ban,
  Braces,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown, CodeHighlight } from '@/components/markdown/unified-markdown';
import { useOcFileOpen } from './useOcFileOpen';
import {
  type OutputSection as OutputSectionType,
  normalizeToolOutput,
  hasStructuredContent,
  parseStructuredOutput,
} from '@/lib/utils/structured-output';

/** Convert tool names like "apply_patch" or "oc-multi-edit" to "Apply Patch" / "Multi Edit" */
function humanizeToolName(raw: string): string {
  return raw
    .replace(/^oc[-_]?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Tool';
}

/** Check if a string looks like multiline code / patch / diff */
function isMultilineCode(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const lines = val.split('\n');
  return lines.length > 3;
}

/** Pick an icon based on tool name patterns */
function pickToolIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('patch') || lower.includes('diff') || lower.includes('edit') || lower.includes('morph')) {
    return FileCode2;
  }
  return Wrench;
}

/** Detect the best extension hint for a patch / multiline value */
function detectLang(key: string, val: string): string {
  const lower = key.toLowerCase();
  if (lower.includes('patch') || lower.includes('diff')) return 'diff';
  if (lower.includes('json')) return 'json';
  if (lower.includes('html')) return 'html';
  if (lower.includes('css')) return 'css';
  if (lower.includes('sql')) return 'sql';
  // Heuristic: if content starts with patch markers
  if (val.trimStart().startsWith('***') || val.trimStart().startsWith('---') || val.trimStart().startsWith('@@')) return 'diff';
  return '';
}

/** Check if a value looks like an absolute file path */
function isAbsolutePath(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return val.startsWith('/') && !val.includes('\n') && val.length < 500;
}

export function OcGenericToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocTool = (args._oc_tool as string) || toolCall?.function_name || 'tool';
  const ocState = args._oc_state as any;
  const output = toolResult?.output || (ocState?.output) || '';

  const title = humanizeToolName(ocState?.title || ocTool);
  const ToolIcon = pickToolIcon(ocTool);

  const { toDisplayPath } = useOcFileOpen();

  // Build clean arguments without internal adapter fields
  const cleanArgs = useMemo(() => {
    const args = toolCall?.arguments || {};
    const { _oc_tool, _oc_state, ...rest } = args;
    return Object.keys(rest).length > 0 ? rest : null;
  }, [toolCall?.arguments]);

  const isError = toolResult?.success === false || !!toolResult?.error;

  // Separate args into multiline code values vs simple values
  const { codeEntries, simpleEntries } = useMemo(() => {
    if (!cleanArgs) return { codeEntries: [] as [string, string][], simpleEntries: [] as [string, unknown][] };
    const code: [string, string][] = [];
    const simple: [string, unknown][] = [];
    for (const [k, v] of Object.entries(cleanArgs)) {
      if (isMultilineCode(v)) {
        code.push([k, v as string]);
      } else {
        simple.push([k, v]);
      }
    }
    return { codeEntries: code, simpleEntries: simple };
  }, [cleanArgs]);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title={title}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={ToolIcon}
            title={title}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-2">
            {/* Output first (most important) */}
            {output && !isError && (
              <OutputSection output={output} />
            )}

            {/* Error display */}
            {isError && output && (
              <ErrorSection message={String(output)} />
            )}

            {/* Simple args as key-value pairs */}
            {simpleEntries.length > 0 && (
              <SimpleArgsSection entries={simpleEntries} toDisplayPath={toDisplayPath} />
            )}

            {/* Code / multiline args as collapsible code blocks */}
            {codeEntries.map(([key, val]) => (
              <CodeSection key={key} label={key} content={val} lang={detectLang(key, val)} />
            ))}

            {!cleanArgs && !output && (
              <div className="text-sm text-muted-foreground px-1">
                No content to display.
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

/* ---------- Sub-components ---------- */

/** Render parsed structured output sections with semantic styling (for detail panel). */
function StructuredOutputDisplay({ sections }: { sections: OutputSectionType[] }) {
  const [showTrace, setShowTrace] = useState(false);

  return (
    <div className="space-y-2">
      {sections.map((section, i) => {
        switch (section.type) {
          case 'warning':
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-yellow-500/5 border border-yellow-500/15"
              >
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-yellow-500" />
                <p className="text-xs leading-relaxed text-yellow-700 dark:text-yellow-400 font-mono break-words">
                  {section.text}
                </p>
              </div>
            );

          case 'error':
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15"
              >
                <Ban className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-red-400" />
                <div className="min-w-0 flex-1">
                  {section.errorType && (
                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                      {section.errorType}
                    </span>
                  )}
                  <p className="text-xs leading-relaxed text-red-600 dark:text-red-400 font-mono break-words">
                    {section.summary}
                  </p>
                </div>
              </div>
            );

          case 'traceback':
            return (
              <div key={i}>
                <button
                  onClick={() => setShowTrace((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer w-full text-left"
                >
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 transition-transform flex-shrink-0',
                      showTrace && 'rotate-90',
                    )}
                  />
                  <span className="text-xs font-medium">Stack trace</span>
                  <span className="text-[10px] text-muted-foreground/40 font-mono ml-1">
                    {section.lines.length} lines
                  </span>
                </button>
                {showTrace && (
                  <div className="mt-1 rounded-lg bg-muted/20 border border-border/30 overflow-hidden">
                    <pre className="p-3 font-mono text-[10px] leading-relaxed text-muted-foreground/60 whitespace-pre-wrap break-all max-h-80 overflow-auto">
                      {section.lines.map((line, li) => {
                        if (/^\s+File "/.test(line)) {
                          return (
                            <span key={li} className="text-muted-foreground/80">
                              {line}
                              {'\n'}
                            </span>
                          );
                        }
                        return (
                          <span key={li}>
                            {line}
                            {'\n'}
                          </span>
                        );
                      })}
                    </pre>
                  </div>
                )}
              </div>
            );

          case 'install':
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15"
              >
                <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-mono">
                  {section.text}
                </span>
              </div>
            );

          case 'info':
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-muted-foreground font-mono"
              >
                <span className="size-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                <span className="break-words">{section.text}</span>
              </div>
            );

          case 'plain':
            return (
              <pre
                key={i}
                className="px-3 py-1.5 font-mono text-xs leading-relaxed text-foreground/70 whitespace-pre-wrap break-words"
              >
                {section.text}
              </pre>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

function OutputSection({ output }: { output: unknown }) {
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  const isJson = typeof output !== 'string';

  // Try structured rendering for string output with warnings/tracebacks
  const structuredSections = useMemo(() => {
    if (isJson || !text) return null;
    const normalized = normalizeToolOutput(text);
    if (!hasStructuredContent(normalized)) return null;
    return parseStructuredOutput(normalized);
  }, [text, isJson]);

  if (structuredSections) {
    return <StructuredOutputDisplay sections={structuredSections} />;
  }

  return isJson ? (
    <UnifiedMarkdown content={`\`\`\`json\n${text}\n\`\`\``} isStreaming={false} />
  ) : (
    <div className="px-1">
      <UnifiedMarkdown content={text} isStreaming={false} />
    </div>
  );
}

function ErrorSection({ message }: { message: string }) {
  const [showTrace, setShowTrace] = useState(false);

  // Try structured rendering for error output with warnings/tracebacks
  const structuredSections = useMemo(() => {
    const normalized = normalizeToolOutput(message);
    if (!hasStructuredContent(normalized)) return null;
    return parseStructuredOutput(normalized);
  }, [message]);

  const { summary, traceback, errorType } = useMemo(() => {
    const cleaned = message.replace(/^Error:\s*/, '');

    // Python-style traceback
    const tbIdx = cleaned.indexOf('Traceback (most recent call last):');
    if (tbIdx >= 0) {
      const before = cleaned.slice(0, tbIdx).trim();
      const traceSection = cleaned.slice(tbIdx);
      const lines = traceSection.split('\n').filter((l) => l.trim());
      const lastLine = lines[lines.length - 1] || '';
      const typeMatch = lastLine.match(/^([\w._]+(?:Error|Exception|Warning)):\s*/);
      const errType = typeMatch ? typeMatch[1].split('.').pop() || typeMatch[1] : null;
      const sum = before || (errType ? lastLine : lastLine.slice(0, 150));
      return { summary: sum, traceback: traceSection, errorType: errType };
    }

    // Node.js-style stack trace
    const stackIdx = cleaned.indexOf('\n    at ');
    if (stackIdx >= 0) {
      return { summary: cleaned.slice(0, stackIdx).trim(), traceback: cleaned.slice(stackIdx), errorType: null };
    }

    return { summary: cleaned, traceback: null, errorType: null };
  }, [message]);

  if (structuredSections) {
    return <StructuredOutputDisplay sections={structuredSections} />;
  }

  const displayType = errorType || 'Error';

  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/10">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
        <span className="text-xs font-medium text-red-400">{displayType}</span>
      </div>

      {/* Summary */}
      <div className="px-3 py-2.5">
        <p className="text-xs text-foreground/80 leading-relaxed break-words whitespace-pre-wrap font-mono">
          {summary}
        </p>
      </div>

      {/* Collapsible stack trace */}
      {traceback && (
        <>
          <button
            onClick={() => setShowTrace((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left border-t border-red-500/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showTrace ? 'rotate-90' : ''}`} />
            <span className="text-[10px] font-medium">Stack trace</span>
          </button>
          {showTrace && (
            <div className="px-3 pb-2.5 max-h-64 overflow-auto">
              <pre className="font-mono text-[10px] leading-relaxed text-muted-foreground/60 whitespace-pre-wrap break-all">
                {traceback}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SimpleArgsSection({
  entries,
  toDisplayPath,
}: {
  entries: [string, unknown][];
  toDisplayPath: (p: string) => string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="divide-y divide-border">
        {entries.map(([key, val]) => {
          // Convert absolute file paths in arg values to relative display paths
          const displayVal = isAbsolutePath(val) ? toDisplayPath(val as string) : (typeof val === 'string' ? val : JSON.stringify(val));
          return (
            <div key={key} className="flex items-start gap-3 px-3 py-2">
              <span className="text-[11px] font-medium text-muted-foreground min-w-[80px] pt-0.5 flex-shrink-0 font-mono">
                {key}
              </span>
              <span className="text-xs text-foreground break-all font-mono">
                {displayVal}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CodeSection({ label, content, lang }: { label: string; content: string; lang: string }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = content.split('\n').length;
  const humanLabel = label
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <Braces className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400 flex-shrink-0" />
        <span className="text-xs text-foreground flex-1 truncate">
          {humanLabel}
        </span>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">
          {lineCount} lines
        </span>
      </div>
      {expanded && (
        <div className="border-t border-border">
          <CodeHighlight
            code={content}
            language={lang || 'text'}
            className="[&>pre]:rounded-none [&>pre]:border-0"
          />
        </div>
      )}
    </div>
  );
}
