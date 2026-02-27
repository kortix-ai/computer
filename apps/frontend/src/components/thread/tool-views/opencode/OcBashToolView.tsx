'use client';

import React, { useMemo } from 'react';
import { Terminal, CheckCircle, AlertCircle, Clock, Info, MessageCircle, ExternalLink } from 'lucide-react';
import { ToolViewProps } from '../types';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { cn } from '@/lib/utils';
import { PreWithPaths } from '@/components/common/clickable-path';

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

interface BashMetadata {
  message: string;
  isTimeout: boolean;
  timeoutMs: number | null;
}

/** Extract and strip <bash_metadata> and similar XML tags from output */
function extractMetadata(output: string): { cleanOutput: string; metadata: BashMetadata[] } {
  const metadata: BashMetadata[] = [];

  const cleanOutput = output.replace(/<bash_metadata>([\s\S]*?)<\/bash_metadata>/g, (_, content) => {
    const msg = content.trim();
    const timeoutMatch = msg.match(/timeout\s+(\d+)\s*ms/i);
    metadata.push({
      message: msg,
      isTimeout: /timeout|timed?\s*out/i.test(msg),
      timeoutMs: timeoutMatch ? parseInt(timeoutMatch[1], 10) : null,
    });
    return '';
  })
  .replace(/<\/?(?:system_info|exit_code|stderr_note)>[\s\S]*?(?:<\/\w+>|$)/g, '')
  .trim();

  return { cleanOutput, metadata };
}

function formatTimeout(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

/**
 * Try to pretty-print JSON or mixed JSON/text output.
 */
function formatOutputContent(rawOutput: string): { content: string; lang: string; isJson: boolean } {
  const trimmed = rawOutput.trim();
  if (!trimmed) return { content: '', lang: 'bash', isJson: false };

  try {
    const parsed = JSON.parse(trimmed);
    return { content: JSON.stringify(parsed, null, 2), lang: 'json', isJson: true };
  } catch { /* not a single JSON blob */ }

  if (trimmed.includes('===') && trimmed.includes('{')) {
    const sections = trimmed.split(/^(={2,}\s.*)/m);
    let hasJson = false;
    const formatted = sections.map((section) => {
      const st = section.trim();
      if (!st) return '';
      if (/^={2,}\s/.test(st)) return st;
      try {
        const parsed = JSON.parse(st);
        hasJson = true;
        return JSON.stringify(parsed, null, 2);
      } catch {
        return st;
      }
    }).filter(Boolean).join('\n\n');
    if (hasJson) return { content: formatted, lang: 'json', isJson: true };
  }

  return { content: trimmed, lang: 'bash', isJson: false };
}

// --- Session metadata rich rendering ---

interface ParsedSessionMeta {
  id: string;
  slug?: string;
  title: string;
  time: { created: number; updated: number };
  summary?: { additions: number; deletions: number; files: number };
}

// --- Session messages rich rendering ---

interface ParsedSessionMessage {
  index: number;
  role: string;
  cost: number;
  content: string;
  tools?: string;
}

function parseSessionMessagesOutput(output: string): ParsedSessionMessage[] | null {
  const trimmed = output.trim();
  // Must have at least one "--- Msg N [ROLE] ---" block
  if (!trimmed.includes('--- Msg ')) return null;

  const msgRegex = /---\s*Msg\s+(\d+)\s+\[(\w+)\]\s+cost=\$?([\d.]+)\s*---/g;
  const matches = [...trimmed.matchAll(msgRegex)];
  if (matches.length < 1) return null;

  const messages: ParsedSessionMessage[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : trimmed.length;
    const rawContent = trimmed.slice(start, end).trim();

    // Extract "Tools used: ..." line if present
    const toolsMatch = rawContent.match(/^\s*Tools used:\s*(.+)$/m);
    const content = rawContent.replace(/^\s*Tools used:\s*.+$/m, '').trim();

    messages.push({
      index: parseInt(m[1], 10),
      role: m[2].toLowerCase(),
      cost: parseFloat(m[3]),
      content,
      tools: toolsMatch?.[1],
    });
  }

  return messages.length > 0 ? messages : null;
}

function SessionMessagesList({ messages }: { messages: ParsedSessionMessage[] }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {messages.length} message{messages.length !== 1 ? 's' : ''}
      </div>
      {messages.map((msg) => (
        <div
          key={msg.index}
          className={cn(
            'rounded-lg border overflow-hidden',
            msg.role === 'user'
              ? 'border-border/60'
              : 'border-border/40',
          )}
        >
          {/* Message header */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5',
            msg.role === 'user'
              ? 'bg-muted/50'
              : 'bg-card',
          )}>
            <span className={cn(
              'text-[10px] font-semibold uppercase tracking-wide',
              msg.role === 'user' ? 'text-blue-500' : 'text-emerald-500',
            )}>
              {msg.role}
            </span>
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              #{msg.index}
            </span>
            {msg.cost > 0 && (
              <span className="text-[10px] text-muted-foreground/50">
                ${msg.cost.toFixed(4)}
              </span>
            )}
          </div>

          {/* Message content */}
          <div className="px-3 py-2">
            <div className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
              {msg.content.slice(0, 1500)}
              {msg.content.length > 1500 && (
                <span className="text-muted-foreground/50">... (truncated)</span>
              )}
            </div>
            {msg.tools && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {msg.tools.split(',').map((t, i) => {
                  const trimmed = t.trim();
                  const nameMatch = trimmed.match(/^(\w+)\s*\((\w+)\)/);
                  const name = nameMatch?.[1] || trimmed;
                  const status = nameMatch?.[2] || '';
                  return (
                    <span
                      key={i}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded border',
                        status === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-muted/50 border-border/50 text-muted-foreground',
                      )}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Session metadata rich rendering ---

function parseSessionMetadataOutput(output: string): ParsedSessionMeta[] | null {
  const trimmed = output.trim();
  if (!trimmed.includes('===') || !trimmed.includes('"id"')) return null;

  const parts = trimmed.split(/^={2,}\s*(.*?)\s*={0,}\s*$/m);
  const sessions: ParsedSessionMeta[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    try {
      const parsed = JSON.parse(part);
      if (parsed && typeof parsed === 'object' && parsed.id && parsed.time) {
        sessions.push({
          id: parsed.id,
          slug: parsed.slug,
          title: parsed.title || parsed.slug || 'Untitled',
          time: parsed.time,
          summary: parsed.summary,
        });
      }
    } catch { /* not JSON */ }
  }

  return sessions.length > 0 ? sessions : null;
}

function formatSessionTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SessionMetadataList({ sessions }: { sessions: ParsedSessionMeta[] }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {sessions.length} session{sessions.length !== 1 ? 's' : ''}
      </div>
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() =>
            openTabAndNavigate({
              id: s.id,
              title: s.title || 'Session',
              type: 'session',
              href: `/sessions/${s.id}`,
              serverId: useServerStore.getState().activeServerId,
            })
          }
          className="flex items-start gap-2.5 px-3 py-2 rounded-md text-left w-full hover:bg-muted/60 transition-colors group cursor-pointer"
        >
          <MessageCircle className="size-3.5 flex-shrink-0 mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground truncate">
                {s.title}
              </span>
              {s.summary && s.summary.files > 0 && (
                <span className="flex items-center gap-1 text-[10px] flex-shrink-0">
                  {s.summary.additions > 0 && (
                    <span className="text-emerald-500">+{s.summary.additions}</span>
                  )}
                  {s.summary.deletions > 0 && (
                    <span className="text-red-500">-{s.summary.deletions}</span>
                  )}
                  <span className="text-muted-foreground">
                    {s.summary.files} file{s.summary.files !== 1 ? 's' : ''}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="font-mono truncate">{s.slug || s.id}</span>
              <span className="flex-shrink-0">{formatSessionTime(s.time.updated)}</span>
            </div>
          </div>
          <ExternalLink className="size-3 flex-shrink-0 mt-1 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
        </button>
      ))}
    </div>
  );
}

export function OcBashToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const command = (args.command as string) || '';
  const description = (args.description as string) || '';
  const ocState = args._oc_state as any;

  // Get output from toolResult or from running state metadata
  const rawOutput = toolResult?.output
    || (ocState?.status === 'running' && ocState?.metadata?.output)
    || '';
  const strippedAnsi = typeof rawOutput === 'string' ? stripAnsi(rawOutput) : '';

  // Extract metadata tags from output
  const { cleanOutput, metadata } = useMemo(
    () => extractMetadata(strippedAnsi),
    [strippedAnsi]
  );

  const isError = toolResult?.success === false || !!toolResult?.error;

  // Try to detect session metadata or messages for rich rendering
  const sessionMeta = useMemo(
    () => parseSessionMetadataOutput(cleanOutput),
    [cleanOutput],
  );

  const sessionMessages = useMemo(
    () => !sessionMeta ? parseSessionMessagesOutput(cleanOutput) : null,
    [cleanOutput, sessionMeta],
  );

  // Format output with proper syntax highlighting
  const { commandBlock, outputContent } = useMemo(() => {
    const cmd = `\`\`\`bash\n$ ${command}\n\`\`\``;
    if (!cleanOutput || sessionMeta || sessionMessages) return { commandBlock: cmd, outputContent: null };
    const { content, lang, isJson } = formatOutputContent(cleanOutput);
    // For JSON output, use markdown code blocks (syntax highlighting, no path detection needed)
    // For other output (bash, text), use PreWithPaths for clickable file paths
    if (isJson) {
      return { commandBlock: cmd, outputContent: { type: 'markdown' as const, text: `\`\`\`${lang}\n${content}\n\`\`\`` } };
    }
    return { commandBlock: cmd, outputContent: { type: 'paths' as const, text: content } };
  }, [command, cleanOutput, sessionMeta, sessionMessages]);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title="Running Command"
        subtitle={description || command}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Terminal}
            title={description || 'Shell Command'}
            subtitle={command.length > 60 ? command.slice(0, 60) + '...' : command}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-3">
            <UnifiedMarkdown content={commandBlock} isStreaming={false} />

            {sessionMeta ? (
              <SessionMetadataList sessions={sessionMeta} />
            ) : sessionMessages ? (
              <SessionMessagesList messages={sessionMessages} />
            ) : outputContent?.type === 'markdown' ? (
              <UnifiedMarkdown content={outputContent.text} isStreaming={false} />
            ) : outputContent?.type === 'paths' ? (
              <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                <PreWithPaths
                  text={outputContent.text}
                  className="p-4 font-mono text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words overflow-x-auto"
                />
              </div>
            ) : null}

            {metadata.map((meta, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs ${
                  meta.isTimeout
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                    : 'bg-muted/30 border-border'
                }`}
              >
                {meta.isTimeout ? (
                  <Clock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={meta.isTimeout
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-muted-foreground'
                  }>
                    {meta.isTimeout && meta.timeoutMs
                      ? `Command timed out after ${formatTimeout(meta.timeoutMs)}`
                      : meta.message
                    }
                  </span>
                </div>
                {meta.isTimeout && meta.timeoutMs && (
                  <Badge variant="outline" className="h-5 py-0 text-[10px] flex-shrink-0 bg-amber-100/50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400">
                    {formatTimeout(meta.timeoutMs)}
                  </Badge>
                )}
              </div>
            ))}
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
          ) : metadata.some((m) => m.isTimeout) ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300">
              <Clock className="h-3 w-3" />
              Timed Out
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
