'use client';

import React from 'react';
import { CheckSquare, CheckCircle, AlertCircle } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { cn } from '@/lib/utils';

interface TodoItem {
  id?: string;
  content: string;
  status: string;
  priority?: string;
}

export function OcTodoToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;

  // Extract todos from metadata or input
  const metadata = ocState?.metadata || {};
  const todos: TodoItem[] = Array.isArray(metadata?.todos)
    ? metadata.todos
    : Array.isArray(args?.todos)
      ? (args.todos as TodoItem[])
      : [];

  const completed = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;

  const isError = toolResult?.success === false || !!toolResult?.error;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title="Updating Todos"
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={CheckSquare}
            title="Task List"
            subtitle={todos.length > 0 ? `${completed}/${todos.length} done` : undefined}
          />
          {inProgress > 0 && (
            <Badge variant="outline" className="h-5 py-0 text-[10px] bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 flex-shrink-0">
              {inProgress} active
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-px">
            {todos.length > 0 ? (
              todos.map((todo) => (
                <div key={todo.id || todo.content} className={cn(
                  'flex items-center gap-2 py-1',
                  todo.status === 'completed' && 'opacity-40',
                )}>
                  <span className={cn(
                    'size-3.5 rounded-sm flex-shrink-0 flex items-center justify-center border border-border/60',
                    todo.status === 'completed' && 'bg-muted',
                  )}>
                    {todo.status === 'completed' && (
                      <svg viewBox="0 0 12 12" fill="none" width="9" height="9"><path d="M3 7.17905L5.02703 8.85135L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" className="text-muted-foreground" /></svg>
                    )}
                    {todo.status === 'in_progress' && <div className="size-1.5 rounded-full bg-foreground" />}
                  </span>
                  <span
                    className={cn(
                      'text-[13px] leading-tight truncate',
                      todo.status === 'completed' && 'line-through text-muted-foreground',
                      todo.status === 'in_progress' && 'text-foreground',
                    )}
                  >
                    {todo.content}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No tasks defined.</div>
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
              <CheckCircle className="h-3 w-3 text-muted-foreground" />
              Updated
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
