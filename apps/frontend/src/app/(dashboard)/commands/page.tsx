'use client';

import { Terminal } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { useOpenCodeCommands } from '@/hooks/opencode/use-opencode-sessions';

export default function CommandsPage() {
  const { data: commands, isLoading, error } = useOpenCodeCommands();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Commands</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Slash commands available in chat. Defined in .opencode/commands/.
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <KortixLoader size="medium" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load commands</p>
            <p className="text-xs text-muted-foreground mt-1">Could not connect to the OpenCode server</p>
          </div>
        ) : !commands || commands.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Terminal className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No commands configured</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add command files to .opencode/commands/
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {commands.map((command) => (
              <div
                key={command.name}
                className="group flex items-center gap-4 px-4 py-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-colors"
              >
                {/* Icon */}
                <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center">
                  <Terminal className="h-4 w-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium font-mono">/{command.name}</span>
                    {command.source && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {command.source}
                      </span>
                    )}
                  </div>
                  {command.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{command.description}</p>
                  )}
                </div>

                {/* Hints */}
                {command.hints && command.hints.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    {command.hints.map((hint) => (
                      <span
                        key={hint}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
