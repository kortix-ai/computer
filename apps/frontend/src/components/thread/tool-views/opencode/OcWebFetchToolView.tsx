'use client';

import React, { useState, useMemo } from 'react';
import { Globe, CheckCircle, AlertCircle, ExternalLink, ChevronRight, ChevronDown, FileText, FileJson, AlertTriangle } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';

function getDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function getPathname(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return path.length > 1 ? path : '';
  } catch {
    return '';
  }
}

function parseError(output: string): { statusCode: string | null; message: string } {
  // Try to extract status code from common patterns
  const statusMatch = output.match(/status\s*code[:\s]*(\d{3})/i)
    || output.match(/^(\d{3})\s/m)
    || output.match(/HTTP\/\d\.\d\s+(\d{3})/i);
  const statusCode = statusMatch ? statusMatch[1] : null;

  // Clean up the error message
  let message = output
    .replace(/^Error:\s*/i, '')
    .trim();

  return { statusCode, message };
}

function getStatusLabel(code: string): string {
  const labels: Record<string, string> = {
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '408': 'Request Timeout',
    '429': 'Too Many Requests',
    '500': 'Internal Server Error',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    '999': 'Request Blocked',
  };
  return labels[code] || `Error ${code}`;
}

function isJsonLike(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function tryFormatJson(text: string): string | null {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

export function OcWebFetchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const url = (args.url as string) || '';
  const prompt = (args.prompt as string) || '';
  const ocState = args._oc_state as any;
  const rawOutput = toolResult?.output || (ocState?.output) || '';
  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);

  const isError = toolResult?.success === false || !!toolResult?.error || output.startsWith('Error:');

  const domain = getDomain(url);
  const pathname = getPathname(url);

  const [expanded, setExpanded] = useState(!isError);

  // Detect and format JSON content
  const formattedContent = useMemo(() => {
    if (!output || isError) return null;
    if (isJsonLike(output)) {
      const formatted = tryFormatJson(output);
      if (formatted) return { type: 'json' as const, content: formatted };
    }
    return { type: 'markdown' as const, content: output };
  }, [output, isError]);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={Globe}
        iconColor="text-cyan-500 dark:text-cyan-400"
        bgColor="bg-gradient-to-b from-cyan-100 to-cyan-50 shadow-inner dark:from-cyan-800/40 dark:to-cyan-900/60"
        title="Fetching URL"
        subtitle={domain + pathname}
        showProgress={true}
      />
    );
  }

  const errorInfo = isError ? parseError(output) : null;

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Globe}
            title={domain || 'Web Fetch'}
            subtitle={pathname || url}
          />
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3">
            {isError ? (
              <ErrorDisplay
                url={url}
                domain={domain}
                statusCode={errorInfo?.statusCode ?? null}
                message={errorInfo?.message ?? output}
              />
            ) : formattedContent ? (
              <ContentDisplay
                content={formattedContent}
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                url={url}
                domain={domain}
              />
            ) : (
              <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <Globe className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400 flex-shrink-0" />
                <span className="font-mono text-xs text-muted-foreground truncate">
                  Fetching {url}...
                </span>
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
              Fetched
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}

function ErrorDisplay({
  url,
  domain,
  statusCode,
  message,
}: {
  url: string;
  domain: string;
  statusCode: string | null;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-900/50 overflow-hidden bg-red-50/50 dark:bg-red-950/20">
      {/* Error header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-red-200/60 dark:border-red-900/30">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-red-700 dark:text-red-300">
              {statusCode ? getStatusLabel(statusCode) : 'Request Failed'}
            </span>
            {statusCode && (
              <Badge variant="outline" className="h-5 py-0 text-[10px] bg-red-100/50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                {statusCode}
              </Badge>
            )}
          </div>
          <p className="text-xs text-red-600/70 dark:text-red-400/60 mt-0.5 truncate">
            {domain}
          </p>
        </div>
      </div>

      {/* Error details */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-xs text-red-700/80 dark:text-red-300/70">
          {message}
        </p>
        <div className="flex items-center gap-1.5 pt-1">
          <Globe className="h-3 w-3 text-red-400/60 dark:text-red-500/40 flex-shrink-0" />
          <span className="font-mono text-[11px] text-red-600/50 dark:text-red-400/40 truncate">
            {url}
          </span>
        </div>
      </div>
    </div>
  );
}

function ContentDisplay({
  content,
  expanded,
  onToggle,
  url,
  domain,
}: {
  content: { type: 'json' | 'markdown'; content: string };
  expanded: boolean;
  onToggle: () => void;
  url: string;
  domain: string;
}) {
  const ContentIcon = content.type === 'json' ? FileJson : FileText;
  const label = content.type === 'json' ? 'JSON Response' : 'Page Content';
  const lineCount = content.content.split('\n').length;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
      {/* Clickable header row */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <ContentIcon className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400 flex-shrink-0" />
        <span className="text-xs text-foreground flex-1 truncate">
          {label}
          <span className="text-muted-foreground ml-1.5">
            from {domain}
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">
          {lineCount} lines
        </span>
      </div>

      {/* Expandable content */}
      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          {content.type === 'json' ? (
            <UnifiedMarkdown
              content={`\`\`\`json\n${content.content}\n\`\`\``}
              isStreaming={false}
            />
          ) : (
            <div className="p-4">
              <UnifiedMarkdown content={content.content} isStreaming={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
