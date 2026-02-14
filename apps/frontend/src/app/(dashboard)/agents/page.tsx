'use client';

import { Bot, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { useOpenCodeAgents } from '@/hooks/opencode/use-opencode-sessions';

export default function AgentsPage() {
  const { data: agents, isLoading, error } = useOpenCodeAgents();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI agents available in your workspace. Click to configure.
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <KortixLoader size="medium" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load agents</p>
            <p className="text-xs text-muted-foreground mt-1">Could not connect to the OpenCode server</p>
          </div>
        ) : !agents || agents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No agents configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="group flex items-center gap-4 px-4 py-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-colors"
              >
                {/* Icon */}
                <div
                  className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: agent.color ? `${agent.color}20` : 'var(--muted)',
                    color: agent.color || 'var(--muted-foreground)',
                  }}
                >
                  <Bot className="h-4 w-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{agent.name}</span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider',
                      agent.mode === 'primary' ? 'bg-blue-500/10 text-blue-500' :
                      agent.mode === 'subagent' ? 'bg-violet-500/10 text-violet-500' :
                      'bg-emerald-500/10 text-emerald-500'
                    )}>
                      {agent.mode}
                    </span>
                    {agent.hidden && (
                      <EyeOff className="h-3 w-3 text-muted-foreground/50" />
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{agent.description}</p>
                  )}
                </div>

                {/* Model info */}
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                  {agent.model && (
                    <span className="truncate max-w-[200px]">{agent.model.modelID}</span>
                  )}
                </div>

                {/* Arrow */}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
