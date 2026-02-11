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
  Braces,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

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

/** Pick a color theme based on tool name */
function pickToolColor(name: string): { iconColor: string; bg: string } {
  const lower = name.toLowerCase();
  if (lower.includes('patch') || lower.includes('diff')) {
    return {
      iconColor: 'text-blue-500 dark:text-blue-400',
      bg: 'bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60',
    };
  }
  return {
    iconColor: 'text-orange-500 dark:text-orange-400',
    bg: 'bg-gradient-to-b from-orange-100 to-orange-50 shadow-inner dark:from-orange-800/40 dark:to-orange-900/60',
  };
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
  const colors = pickToolColor(ocTool);

  // Build clean arguments without internal adapter fields
  const cleanArgs = useMemo(() => {
    const { _oc_tool, _oc_state, ...rest } = args;
    return Object.keys(rest).length > 0 ? rest : null;
  }, [args]);

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
        icon={ToolIcon}
        iconColor={colors.iconColor}
        bgColor={colors.bg}
        title={title}
        showProgress={true}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
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
              <SimpleArgsSection entries={simpleEntries} />
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
            <Badge variant="outline" className="h-6 py-0.5 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300">
              <AlertCircle className="h-3 w-3" />
              Failed
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

/* ---------- Sub-components ---------- */

function OutputSection({ output }: { output: unknown }) {
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  const isJson = typeof output !== 'string';

  return isJson ? (
    <UnifiedMarkdown content={`\`\`\`json\n${text}\n\`\`\``} isStreaming={false} />
  ) : (
    <div className="px-1">
      <UnifiedMarkdown content={text} isStreaming={false} />
    </div>
  );
}

function ErrorSection({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-900/50 overflow-hidden bg-red-50/50 dark:bg-red-950/20">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/40 flex-shrink-0 mt-0.5">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            Error
          </span>
          <p className="text-xs text-red-700/80 dark:text-red-300/70 mt-1 whitespace-pre-wrap break-words">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

function SimpleArgsSection({ entries }: { entries: [string, unknown][] }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-start gap-3 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground min-w-[80px] pt-0.5 flex-shrink-0 font-mono">
              {key}
            </span>
            <span className="text-xs text-foreground break-all font-mono">
              {typeof val === 'string' ? val : JSON.stringify(val)}
            </span>
          </div>
        ))}
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
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
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
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <UnifiedMarkdown
            content={`\`\`\`${lang}\n${content}\n\`\`\``}
            isStreaming={false}
          />
        </div>
      )}
    </div>
  );
}
