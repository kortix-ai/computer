'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOpenCodeSessionTodo } from '@/hooks/opencode/use-opencode-sessions';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  ListTodo,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodoDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  pending: { icon: Circle, color: 'text-muted-foreground/50', label: 'Pending' },
  in_progress: { icon: Loader2, color: 'text-muted-foreground', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-muted-foreground', label: 'Completed' },
  cancelled: { icon: Ban, color: 'text-muted-foreground/30', label: 'Cancelled' },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  high: { color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'High' },
  medium: { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', label: 'Medium' },
  low: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Low' },
};

export function TodoDialog({ sessionId, open, onOpenChange }: TodoDialogProps) {
  const { data: todos, isLoading, error } = useOpenCodeSessionTodo(sessionId);

  const completed = todos?.filter((t) => t.status === 'completed').length ?? 0;
  const total = todos?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 pr-12">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <ListTodo className="h-4 w-4" />
            Session Tasks
            {total > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {completed}/{total} completed
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        {total > 0 && (
          <div className="px-6 pb-4">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground/50 rounded-full transition-all duration-300"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 pb-5 space-y-0.5">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="h-6 w-6 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load tasks</p>
              </div>
            )}

            {!isLoading && !error && (!todos || todos.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ListTodo className="h-8 w-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No tasks yet</p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Tasks will appear here as the agent works
                </p>
              </div>
            )}

            {todos?.map((todo, idx) => {
              const status = statusConfig[todo.status] || statusConfig.pending;
              const priority = priorityConfig[todo.priority];
              const StatusIcon = status.icon;
              const isCompleted = todo.status === 'completed';
              const isCancelled = todo.status === 'cancelled';

              return (
                <div
                  key={(todo as any).id ?? idx}
                  className={cn(
                    'flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors',
                    isCompleted && 'opacity-40',
                    isCancelled && 'opacity-30',
                  )}
                >
                  <StatusIcon
                    className={cn(
                      'h-3.5 w-3.5 flex-shrink-0',
                      status.color,
                      todo.status === 'in_progress' && 'animate-spin',
                    )}
                  />
                  <p className={cn(
                    'flex-1 min-w-0 text-[13px] leading-tight truncate',
                    isCompleted && 'line-through text-muted-foreground',
                    isCancelled && 'line-through text-muted-foreground/50',
                  )}>
                    {todo.content}
                  </p>
                  {priority && todo.priority !== 'medium' && (
                    <span className={cn(
                      'text-[9px] font-medium px-1.5 py-px rounded border flex-shrink-0',
                      priority.color,
                    )}>
                      {priority.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
