'use client';

import { useState, useMemo } from 'react';
import { Search, Frown, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { useOpenCodeToolIds } from '@/hooks/opencode/use-opencode-sessions';

function getToolIcon(id: string): string {
  const iconMap: Record<string, string> = {
    bash: 'terminal',
    read: 'file-text',
    write: 'file-pen',
    edit: 'pencil',
    glob: 'folder-search',
    grep: 'search',
    task: 'list-checks',
    webfetch: 'globe',
    websearch: 'search',
    skill: 'sparkles',
  };
  return iconMap[id] || 'wrench';
}

function ToolItem({ toolId }: { toolId: string }) {
  return (
    <SpotlightCard className="transition-colors bg-transparent">
      <div className="flex items-center gap-3 p-2.5 text-sm">
        <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <span className="flex-1 truncate font-mono text-[13px]">{toolId}</span>
      </div>
    </SpotlightCard>
  );
}

export function OpenCodeToolsList() {
  const { state, isMobile } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: toolIds, isLoading, error } = useOpenCodeToolIds();

  const filteredTools = useMemo(() => {
    if (!toolIds) return [];
    if (!searchQuery.trim()) return toolIds;
    const q = searchQuery.toLowerCase();
    return toolIds.filter((id) => id.toLowerCase().includes(q));
  }, [toolIds, searchQuery]);

  if (state === 'collapsed' && !isMobile) return null;

  return (
    <div className="flex flex-col h-full pt-4">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-xl text-sm bg-muted/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] pb-16">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <KortixLoader size="small" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
              <Frown className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Could not reach OpenCode server
            </p>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
              <Wrench className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No tools found' : 'No tools available'}
            </p>
          </div>
        ) : (
          <>
            <div className="text-xs font-medium text-muted-foreground px-2.5 pb-2 pt-2">
              {filteredTools.length} tool{filteredTools.length !== 1 ? 's' : ''} available
            </div>
            <div className="space-y-1">
              {filteredTools.map((toolId) => (
                <ToolItem key={toolId} toolId={toolId} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
