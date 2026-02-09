'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, Frown, Bot, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { useOpenCodeAgents } from '@/hooks/opencode/use-opencode-sessions';
import type { OpenCodeAgent } from '@/lib/api/opencode';

function getAgentModeLabel(mode: string): string {
  switch (mode) {
    case 'primary': return 'Primary';
    case 'subagent': return 'Sub-agent';
    case 'all': return 'All';
    default: return mode;
  }
}

function AgentItem({
  agent,
  isActive,
  onClick,
}: {
  agent: OpenCodeAgent;
  isActive: boolean;
  onClick: (name: string) => void;
}) {
  return (
    <SpotlightCard
      className={cn(
        'transition-colors cursor-pointer',
        isActive ? 'bg-muted' : 'bg-transparent'
      )}
    >
      <div
        className="flex items-center gap-3 p-2.5 text-sm"
        onClick={() => onClick(agent.name)}
      >
        <div
          className="flex items-center justify-center w-10 h-10 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0"
          style={agent.color ? { borderColor: agent.color + '40' } : undefined}
        >
          <Bot
            className="h-3.5 w-3.5"
            style={agent.color ? { color: agent.color } : undefined}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{agent.name}</div>
          {agent.model && (
            <div className="text-xs text-muted-foreground truncate">
              {agent.model.modelID}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>
    </SpotlightCard>
  );
}

export function OpenCodeAgentsList() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: agents, isLoading, error } = useOpenCodeAgents();

  const handleAgentClick = useCallback(
    (agentName: string) => {
      router.push(`/agents/config/${encodeURIComponent(agentName)}`);
      if (isMobile) setOpenMobile(false);
    },
    [router, isMobile, setOpenMobile]
  );

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    const visible = agents.filter((a) => !a.hidden);
    if (!searchQuery.trim()) return visible;
    const q = searchQuery.toLowerCase();
    return visible.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
    );
  }, [agents, searchQuery]);

  const primaryAgents = useMemo(
    () => filteredAgents.filter((a) => a.mode === 'primary' || a.mode === 'all'),
    [filteredAgents]
  );
  const subAgents = useMemo(
    () => filteredAgents.filter((a) => a.mode === 'subagent'),
    [filteredAgents]
  );

  const isAgentActive = (name: string) => {
    return pathname?.includes(`/agents/config/${encodeURIComponent(name)}`) || false;
  };

  if (state === 'collapsed' && !isMobile) return null;

  return (
    <div className="flex flex-col h-full pt-4">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-xl text-sm bg-muted/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
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
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
              <Bot className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No agents found' : 'No agents available'}
            </p>
          </div>
        ) : (
          <>
            {primaryAgents.length > 0 && (
              <div>
                {!searchQuery && (
                  <div className="text-xs font-medium text-muted-foreground px-2.5 pb-2 pt-2">
                    Primary Agents
                  </div>
                )}
                <div className="space-y-1">
                  {primaryAgents.map((agent) => (
                    <AgentItem
                      key={agent.name}
                      agent={agent}
                      isActive={isAgentActive(agent.name)}
                      onClick={handleAgentClick}
                    />
                  ))}
                </div>
              </div>
            )}

            {subAgents.length > 0 && (
              <div className="pt-2">
                {!searchQuery && (
                  <div className="text-xs font-medium text-muted-foreground px-2.5 pb-2">
                    Sub-agents
                  </div>
                )}
                <div className="space-y-1">
                  {subAgents.map((agent) => (
                    <AgentItem
                      key={agent.name}
                      agent={agent}
                      isActive={isAgentActive(agent.name)}
                      onClick={handleAgentClick}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
