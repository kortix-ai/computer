'use client';

import { Wrench } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { useOpenCodeToolIds } from '@/hooks/opencode/use-opencode-sessions';

export default function ToolsPage() {
  const { data: toolIds, isLoading, error } = useOpenCodeToolIds();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Tools</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tools available to agents, including built-in and MCP-provided tools.
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <KortixLoader size="medium" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load tools</p>
            <p className="text-xs text-muted-foreground mt-1">Could not connect to the OpenCode server</p>
          </div>
        ) : !toolIds || toolIds.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Wrench className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tools available</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              {toolIds.length} tool{toolIds.length !== 1 ? 's' : ''} registered
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {toolIds.map((id) => {
                // Parse tool ID: "mcp_servername_toolname" or "builtin_name"
                const parts = id.split('_');
                const isMcp = parts[0] === 'mcp';
                const source = isMcp ? parts[1] : 'built-in';
                const name = isMcp ? parts.slice(2).join('_') : id;

                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-colors"
                  >
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm truncate block">{name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{source}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
