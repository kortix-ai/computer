'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Sparkles,
  Terminal,
  Wrench,
  Search,
  X,
  ChevronRight,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Input } from '@/components/ui/input';
import { useOpenCodeAgents, useOpenCodeCommands, useOpenCodeToolIds, useOpenCodeMcpStatus } from '@/hooks/opencode/use-opencode-sessions';
import { useSkills } from '@/features/skills/hooks';
import { getSkillSource } from '@/features/skills/types';
import { openTabAndNavigate } from '@/stores/tab-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemKind = 'agent' | 'skill' | 'command' | 'tool' | 'mcp';
type ItemScope = 'project' | 'global' | 'external' | 'built-in';
type KindFilter = 'all' | ItemKind;
type ScopeFilter = 'all' | ItemScope;

interface WorkspaceItem {
  id: string;
  name: string;
  description?: string;
  kind: ItemKind;
  scope: ItemScope;
  href?: string;
  meta?: string; // secondary info (model, agent, source server)
}

// ---------------------------------------------------------------------------
// Scope classification helpers
// ---------------------------------------------------------------------------

function getCommandScope(source?: string): ItemScope {
  if (!source || source === 'command') return 'project';
  if (source === 'mcp') return 'external';
  if (source === 'skill') return 'external';
  return 'project';
}

function getToolDisplayName(id: string): string {
  if (!id.startsWith('mcp_')) return id;
  const parts = id.split('_');
  return parts.slice(2).join('_');
}

function getToolServerName(id: string): string | undefined {
  if (!id.startsWith('mcp_')) return undefined;
  return id.split('_')[1];
}

// ---------------------------------------------------------------------------
// Display config
// ---------------------------------------------------------------------------

const KIND_CONFIG: Record<ItemKind, { icon: typeof Bot; color: string; label: string }> = {
  agent:   { icon: Bot,      color: 'text-blue-500 bg-blue-500/10',    label: 'Agent' },
  skill:   { icon: Sparkles,  color: 'text-amber-500 bg-amber-500/10',  label: 'Skill' },
  command: { icon: Terminal,   color: 'text-green-500 bg-green-500/10',  label: 'Command' },
  tool:    { icon: Wrench,     color: 'text-violet-500 bg-violet-500/10', label: 'Tool' },
  mcp:     { icon: Plug,       color: 'text-cyan-500 bg-cyan-500/10',    label: 'MCP' },
};

const SCOPE_CONFIG: Record<ItemScope, { label: string; color: string }> = {
  project:   { label: 'Project',  color: 'text-blue-500 bg-blue-500/10' },
  global:    { label: 'Global',   color: 'text-emerald-500 bg-emerald-500/10' },
  external:  { label: 'External', color: 'text-violet-500 bg-violet-500/10' },
  'built-in': { label: 'Built-in', color: 'text-muted-foreground bg-muted' },
};

// ---------------------------------------------------------------------------
// Workspace Page
// ---------------------------------------------------------------------------

export default function WorkspacePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');

  // Data
  const { data: agents, isLoading: agentsLoading } = useOpenCodeAgents();
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: commands, isLoading: commandsLoading } = useOpenCodeCommands();
  const { data: toolIds, isLoading: toolsLoading } = useOpenCodeToolIds();
  const { data: mcpStatus, isLoading: mcpLoading } = useOpenCodeMcpStatus();

  const isLoading = agentsLoading || skillsLoading || commandsLoading || toolsLoading || mcpLoading;

  // Normalize all items into a flat list
  const allItems = useMemo<WorkspaceItem[]>(() => {
    const items: WorkspaceItem[] = [];

    // Agents
    if (agents) {
      for (const a of agents) {
        items.push({
          id: `agent:${a.name}`,
          name: a.name,
          description: a.description,
          kind: 'agent',
          scope: 'project',
          href: `/configuration`,
          meta: a.model?.modelID,
        });
      }
    }

    // Skills
    if (skills) {
      for (const s of skills) {
        const skillSource = getSkillSource(s.location);
        const scope: ItemScope = skillSource === 'project' ? 'project' : skillSource === 'global' ? 'global' : 'external';
        items.push({
          id: `skill:${s.name}`,
          name: s.name,
          description: s.description,
          kind: 'skill',
          scope,
          href: `/skills/${encodeURIComponent(s.name)}`,
        });
      }
    }

    // Commands
    if (commands) {
      for (const c of commands) {
        items.push({
          id: `command:${c.name}`,
          name: `/${c.name}`,
          description: c.description,
          kind: 'command',
          scope: getCommandScope(c.source),
          href: `/commands/${encodeURIComponent(c.name)}`,
          meta: c.agent,
        });
      }
    }

    // Tools
    if (toolIds) {
      for (const id of toolIds) {
        const isMcp = id.startsWith('mcp_');
        items.push({
          id: `tool:${id}`,
          name: isMcp ? getToolDisplayName(id) : id,
          kind: 'tool',
          scope: isMcp ? 'external' : 'built-in',
          meta: isMcp ? getToolServerName(id) : undefined,
        });
      }
    }

    // MCP Servers
    if (mcpStatus) {
      for (const [name, status] of Object.entries(mcpStatus)) {
        const statusLabel = status.status === 'connected' ? 'Connected'
          : status.status === 'disabled' ? 'Disabled'
          : status.status === 'failed' ? 'Failed'
          : status.status === 'needs_auth' ? 'Needs Auth'
          : 'Pending';
        items.push({
          id: `mcp:${name}`,
          name,
          description: status.status === 'failed' ? (status as any).error : undefined,
          kind: 'mcp',
          scope: 'external',
          meta: statusLabel,
        });
      }
    }

    return items;
  }, [agents, skills, commands, toolIds, mcpStatus]);

  // Counts for filter badges
  const kindCounts = useMemo(() => {
    const counts: Record<KindFilter, number> = { all: allItems.length, agent: 0, skill: 0, command: 0, tool: 0, mcp: 0 };
    for (const item of allItems) counts[item.kind]++;
    return counts;
  }, [allItems]);

  const scopeCounts = useMemo(() => {
    const counts: Record<ScopeFilter, number> = { all: 0, project: 0, global: 0, external: 0, 'built-in': 0 };
    // Scope counts are relative to the current kind filter
    const kindFiltered = kindFilter === 'all' ? allItems : allItems.filter((i) => i.kind === kindFilter);
    counts.all = kindFiltered.length;
    for (const item of kindFiltered) counts[item.scope]++;
    return counts;
  }, [allItems, kindFilter]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let result = allItems;
    if (kindFilter !== 'all') result = result.filter((i) => i.kind === kindFilter);
    if (scopeFilter !== 'all') result = result.filter((i) => i.scope === scopeFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.meta?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allItems, kindFilter, scopeFilter, search]);

  const handleItemClick = (item: WorkspaceItem) => {
    if (!item.href) return;
    openTabAndNavigate(
      {
        id: `page:${item.href}`,
        title: item.name,
        type: 'page',
        href: item.href,
      },
      router,
    );
  };

  // Active scope tabs (only show tabs that have items)
  const activeScopeTabs = useMemo(() => {
    const tabs: { value: ScopeFilter; label: string }[] = [{ value: 'all', label: 'All' }];
    if (scopeCounts.project > 0) tabs.push({ value: 'project', label: 'Project' });
    if (scopeCounts.global > 0) tabs.push({ value: 'global', label: 'Global' });
    if (scopeCounts.external > 0) tabs.push({ value: 'external', label: 'External' });
    if (scopeCounts['built-in'] > 0) tabs.push({ value: 'built-in', label: 'Built-in' });
    return tabs;
  }, [scopeCounts]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All agents, skills, commands, tools, and MCP servers in your environment.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <KortixLoader size="medium" />
          </div>
        ) : allItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No workspace items found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add agents, skills, or commands to .opencode/ to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  placeholder="Search by name, description, or model..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm rounded-lg"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Kind filter */}
            <div className="flex items-center gap-1 mb-2">
              {([
                { value: 'all' as KindFilter, label: 'All' },
                { value: 'agent' as KindFilter, label: 'Agents' },
                { value: 'skill' as KindFilter, label: 'Skills' },
                { value: 'command' as KindFilter, label: 'Commands' },
                { value: 'tool' as KindFilter, label: 'Tools' },
                { value: 'mcp' as KindFilter, label: 'MCP Servers' },
              ] as const).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setKindFilter(tab.value);
                    setScopeFilter('all'); // reset scope when changing kind
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                    kindFilter === tab.value
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'text-[10px] tabular-nums px-1 py-0.5 rounded',
                      kindFilter === tab.value
                        ? 'bg-background/20 text-background'
                        : 'bg-muted text-muted-foreground/60',
                    )}
                  >
                    {kindCounts[tab.value]}
                  </span>
                </button>
              ))}
            </div>

            {/* Scope filter (only when there are multiple scopes) */}
            {activeScopeTabs.length > 2 && (
              <div className="flex items-center gap-1 mb-4">
                {activeScopeTabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setScopeFilter(tab.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                      scopeFilter === tab.value
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30',
                    )}
                  >
                    {tab.label}
                    <span className="text-[10px] tabular-nums text-muted-foreground/50">
                      {scopeCounts[tab.value]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Results count */}
            <p className="text-xs text-muted-foreground mb-4">
              {filteredItems.length === allItems.length
                ? `${allItems.length} item${allItems.length !== 1 ? 's' : ''}`
                : `${filteredItems.length} of ${allItems.length} item${allItems.length !== 1 ? 's' : ''}`}
            </p>

            {/* Items */}
            {filteredItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <Search className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No items match your filters</p>
                <button
                  onClick={() => { setSearch(''); setKindFilter('all'); setScopeFilter('all'); }}
                  className="text-xs text-muted-foreground/60 hover:text-foreground mt-2 underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredItems.map((item) => {
                  const kindCfg = KIND_CONFIG[item.kind];
                  const scopeCfg = SCOPE_CONFIG[item.scope];
                  const KindIcon = kindCfg.icon;
                  const isClickable = !!item.href;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      disabled={!isClickable}
                      className={cn(
                        'group flex items-center gap-3.5 w-full px-4 py-3 rounded-lg border border-border/50 text-left transition-all duration-150',
                        isClickable
                          ? 'hover:border-border hover:bg-muted/30 cursor-pointer'
                          : 'opacity-80 cursor-default',
                      )}
                    >
                      {/* Kind icon */}
                      <div className={cn('flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center', kindCfg.color)}>
                        <KindIcon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-medium truncate', item.kind === 'command' && 'font-mono')}>
                            {item.name}
                          </span>
                          <span className={cn('inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider flex-shrink-0', scopeCfg.color)}>
                            {scopeCfg.label}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                        )}
                      </div>

                      {/* Meta + chevron */}
                      <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                        {item.meta && (
                          <span className="text-[11px] text-muted-foreground/50 truncate max-w-[160px]">
                            {item.meta}
                          </span>
                        )}
                        {isClickable && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
