'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  BookOpen,
  Clock,
  FileText,
  Minimize2,
  ChevronDown,
  ChevronRight,
  ListTodo,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { cn } from '@/lib/utils';

// ============================================================================
// Types & Parsing
// ============================================================================

interface SessionGetData {
  title: string;
  id: string;
  timestamps: string;
  changes: string;
  parent: string | null;
  todos: string[];
  conversationHeader: string;
  conversation: string;
  compression: string | null;
}

function parseSessionGetOutput(output: string): SessionGetData | null {
  if (!output || typeof output !== 'string') return null;

  const titleMatch = output.match(/^=== SESSION:\s*(.+?)\s*===$/m);
  const idMatch = output.match(/^ID:\s*(ses_\S+)/m);
  const tsMatch = output.match(/^Created:\s*(.+)/m);
  const changesMatch = output.match(/^Changes:\s*(.+)/m);
  const parentMatch = output.match(/^Parent:\s*(ses_\S+)/m);

  // Todos section
  const todosSection = output.match(/^Todos:\n([\s\S]*?)(?=\n(?:Storage|===))/m);
  const todos = todosSection
    ? todosSection[1].split('\n').map((l) => l.trim()).filter((l) => l && l !== '(none)')
    : [];

  // Conversation
  const convHeaderMatch = output.match(/^(=== CONVERSATION .+? ===)$/m);
  const convStart = convHeaderMatch ? output.indexOf(convHeaderMatch[0]) + convHeaderMatch[0].length : -1;
  const compressMatch = output.match(/^=== COMPRESSION ===\n(.+)/m);
  const convEnd = compressMatch ? output.indexOf('=== COMPRESSION ===') : output.length;
  const conversation = convStart > 0 ? output.slice(convStart, convEnd).trim() : '';

  return {
    title: titleMatch?.[1] ?? 'Unknown Session',
    id: idMatch?.[1] ?? '',
    timestamps: tsMatch?.[1] ?? '',
    changes: changesMatch?.[1] ?? '',
    parent: parentMatch?.[1] ?? null,
    todos,
    conversationHeader: convHeaderMatch?.[1] ?? '',
    conversation,
    compression: compressMatch?.[1]?.trim() ?? null,
  };
}

// ============================================================================
// Component
// ============================================================================

export function OcSessionGetToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = (args as any)._oc_state as any;
  const sessionId = (args.session_id as string) || (ocState?.input?.session_id as string) || '';
  const aggressiveness = (args.aggressiveness as number) ?? 0.3;
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);
  const isError = toolResult?.success === false || !!toolResult?.error;

  const data = useMemo(() => parseSessionGetOutput(output), [output]);
  const [showConversation, setShowConversation] = useState(true);
  const [showTodos, setShowTodos] = useState(true);

  if (isStreaming && !toolResult) {
    return <LoadingState title="Retrieving session" subtitle={sessionId} />;
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={BookOpen}
            title={data?.title ?? 'Session'}
            subtitle={sessionId}
          />
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {data?.compression && (
              <Badge variant="outline" className="h-5 py-0 text-[10px] bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300">
                <Minimize2 className="h-3 w-3 mr-0.5" />
                Compressed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        {data ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground/70">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono">{data.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3" />
                  <span>{data.timestamps}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3" />
                  <span>{data.changes}</span>
                </div>
                {data.parent && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/50">Parent: <span className="font-mono">{data.parent}</span></span>
                  </div>
                )}
              </div>

              {/* Todos */}
              {data.todos.length > 0 && (
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <button
                    onClick={() => setShowTodos(!showTodos)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                  >
                    {showTodos ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    <ListTodo className="size-3.5" />
                    <span className="text-xs font-medium">Todos</span>
                    <Badge variant="outline" className="h-4 py-0 text-[9px] ml-auto">{data.todos.length}</Badge>
                  </button>
                  {showTodos && (
                    <div className="border-t border-border/30 px-3 py-2 space-y-1">
                      {data.todos.map((todo, i) => {
                        const isComplete = todo.startsWith('[completed]') || todo.startsWith('[x]');
                        const isProgress = todo.startsWith('[in_progress]') || todo.startsWith('[~]');
                        const content = todo.replace(/^\[[\w_]+\]\s*/, '');
                        return (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <input type="checkbox" checked={isComplete} readOnly className="mt-0.5 rounded border-border" />
                            <span className={cn(
                              isComplete && 'line-through text-muted-foreground',
                              isProgress && 'font-medium',
                            )}>
                              {content}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Conversation */}
              {data.conversation && (
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <button
                    onClick={() => setShowConversation(!showConversation)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                  >
                    {showConversation ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    <BookOpen className="size-3.5" />
                    <span className="text-xs font-medium">Conversation</span>
                  </button>
                  {showConversation && (
                    <div className="border-t border-border/30 p-3">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                        <UnifiedMarkdown content={data.conversation} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Compression stats */}
              {data.compression && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50 px-1">
                  <Minimize2 className="size-3" />
                  <span>{data.compression}</span>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : output && !isError ? (
          <ScrollArea className="h-full w-full">
            <div className="p-3 text-sm text-muted-foreground whitespace-pre-wrap">
              {output.slice(0, 5000)}
            </div>
          </ScrollArea>
        ) : isError ? (
          <div className="flex items-start gap-2.5 px-4 py-6 text-muted-foreground">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{output || 'Failed to retrieve session'}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6">
            <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No session data</p>
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
          ) : data ? (
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
