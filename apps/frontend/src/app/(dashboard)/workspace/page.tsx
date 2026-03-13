'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Blocks,
  Bot,
  Copy,
  FileText,
  FolderOpen,
  Loader2,
  Plug,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Ripple } from '@/components/ui/ripple';
import { PageHeader } from '@/components/ui/page-header';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { OpenCodeSettingsDialog } from '@/components/session/opencode-settings-dialog';
import {
  useOpenCodeAgents,
  useOpenCodeCommands,
  useOpenCodeToolIds,
  useOpenCodeMcpStatus,
  useOpenCodeProjects,
  type Agent,
  type Command,
  type McpStatus,
  type Project,
} from '@/hooks/opencode/use-opencode-sessions';
import { useSkills } from '@/features/skills/hooks';
import { getSkillSource, type Skill } from '@/features/skills/types';
import { openTabAndNavigate } from '@/stores/tab-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemKind = 'project' | 'agent' | 'skill' | 'command' | 'tool' | 'mcp';
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
  meta?: string;
  /** Raw data from the hook for the detail modal */
  raw?: Agent | Skill | Command | Project | { toolId: string; server?: string } | { serverName: string; status: McpStatus };
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

const KIND_CONFIG: Record<ItemKind, { icon: typeof Bot; label: string }> = {
  project: { icon: FolderOpen, label: 'Project' },
  agent:   { icon: Bot,        label: 'Agent' },
  skill:   { icon: Sparkles,   label: 'Skill' },
  command: { icon: Terminal,    label: 'Command' },
  tool:    { icon: Wrench,     label: 'Tool' },
  mcp:     { icon: Plug,       label: 'MCP' },
};

const SCOPE_CONFIG: Record<ItemScope, { label: string }> = {
  project:    { label: 'Project' },
  global:     { label: 'Global' },
  external:   { label: 'External' },
  'built-in': { label: 'Built-in' },
};

// ---------------------------------------------------------------------------
// Detail Modal
// ---------------------------------------------------------------------------

function WorkspaceItemDetailModal({
  item,
  open,
  onOpenChange,
}: {
  item: WorkspaceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const kindCfg = KIND_CONFIG[item.kind];
  const scopeCfg = SCOPE_CONFIG[item.scope];
  const Icon = kindCfg.icon;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Build detail rows from raw data based on item kind
  const detailRows: Array<{ label: string; value: string; mono?: boolean }> = [];
  let contentPreview: string | null = null;

  if (item.kind === 'agent' && item.raw) {
    const agent = item.raw as Agent;
    if (agent.model) {
      detailRows.push({ label: 'Model', value: `${agent.model.providerID}/${agent.model.modelID}`, mono: true });
    }
    detailRows.push({ label: 'Mode', value: agent.mode });
    if (agent.variant) detailRows.push({ label: 'Variant', value: agent.variant });
    if (agent.temperature !== undefined) detailRows.push({ label: 'Temperature', value: String(agent.temperature) });
    if (agent.topP !== undefined) detailRows.push({ label: 'Top-P', value: String(agent.topP) });
    if (agent.steps !== undefined) detailRows.push({ label: 'Max Steps', value: String(agent.steps) });
    if (agent.prompt) contentPreview = agent.prompt;
  }

  if (item.kind === 'skill' && item.raw) {
    const skill = item.raw as Skill;
    detailRows.push({ label: 'Location', value: skill.location, mono: true });
    if (skill.content) contentPreview = skill.content;
  }

  if (item.kind === 'command' && item.raw) {
    const cmd = item.raw as Command;
    if (cmd.source) detailRows.push({ label: 'Source', value: cmd.source });
    if (cmd.agent) detailRows.push({ label: 'Agent', value: cmd.agent });
    if (cmd.model) detailRows.push({ label: 'Model', value: cmd.model, mono: true });
    if (cmd.hints && cmd.hints.length > 0) detailRows.push({ label: 'Hints', value: cmd.hints.join(', ') });
    if (cmd.template) contentPreview = cmd.template;
  }

  if (item.kind === 'project' && item.raw) {
    const proj = item.raw as Project;
    detailRows.push({ label: 'ID', value: proj.id, mono: true });
    if (proj.worktree) detailRows.push({ label: 'Worktree', value: proj.worktree, mono: true });
    if (proj.vcs) detailRows.push({ label: 'VCS', value: proj.vcs });
  }

  if (item.kind === 'tool' && item.raw) {
    const tool = item.raw as { toolId: string; server?: string };
    detailRows.push({ label: 'Tool ID', value: tool.toolId, mono: true });
    if (tool.server) detailRows.push({ label: 'MCP Server', value: tool.server });
  }

  if (item.kind === 'mcp' && item.raw) {
    const mcp = item.raw as { serverName: string; status: McpStatus };
    detailRows.push({ label: 'Server', value: mcp.serverName });
    detailRows.push({ label: 'Status', value: mcp.status.status });
    if (mcp.status.status === 'failed' && 'error' in mcp.status) {
      detailRows.push({ label: 'Error', value: (mcp.status as { error: string }).error });
    }
  }

  const hasContent = contentPreview !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        'w-[calc(100vw-2rem)] gap-0 p-0 border-border/50 bg-background overflow-hidden',
        hasContent ? 'max-w-5xl h-[80vh] grid grid-rows-[auto_1fr]' : 'max-w-lg',
      )}>
        <DialogTitle className="sr-only">
          {item.name} - {kindCfg.label} Details
        </DialogTitle>

        {/* Header */}
        <div className="px-6 sm:px-8 py-6 border-b border-border/50">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50 shrink-0">
                  <Icon className="h-4.5 w-4.5 text-foreground" />
                </div>
                <h2 className={cn('text-lg font-semibold tracking-tight text-foreground', item.kind === 'command' && 'font-mono')}>
                  {item.name}
                </h2>
                <Badge variant="secondary" className="text-[10px]">{kindCfg.label}</Badge>
                <Badge variant="secondary" className="text-[10px]">{scopeCfg.label}</Badge>
              </div>
              {item.description && (
                <p className="mt-3 text-sm text-muted-foreground max-w-2xl leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs shrink-0 gap-1.5"
              onClick={() => handleCopy(item.name)}
            >
              {copied ? 'Copied!' : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Body */}
        {hasContent ? (
          <div className="grid grid-cols-[240px_1fr] min-h-0">
            {/* Properties sidebar */}
            <div className="border-r border-border/50 overflow-y-auto">
              <div className="sticky top-0 px-4 py-3 border-b border-border/50 bg-background">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Properties</span>
              </div>
              <div className="p-4 space-y-3">
                {detailRows.map((row) => (
                  <div key={row.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">{row.label}</p>
                    <p className={cn('text-xs text-foreground break-all leading-relaxed', row.mono && 'font-mono')}>{row.value}</p>
                  </div>
                ))}
                {detailRows.length === 0 && (
                  <p className="text-xs text-muted-foreground/50">No additional properties</p>
                )}
              </div>
            </div>

            {/* Content preview */}
            <div className="overflow-y-auto bg-background">
              <div className="sticky top-0 z-10 flex items-center gap-2 px-6 py-3 border-b border-border/50 bg-background">
                <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground font-mono">
                  {item.kind === 'skill' ? 'SKILL.md' : item.kind === 'command' ? 'template' : item.kind === 'agent' ? 'system prompt' : 'content'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] ml-auto"
                  onClick={() => contentPreview && handleCopy(contentPreview)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <pre className="p-6 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono">
                <code>{contentPreview}</code>
              </pre>
            </div>
          </div>
        ) : (
          /* No content preview — just show properties */
          <div className="px-6 sm:px-8 py-6">
            {detailRows.length > 0 ? (
              <div className="space-y-3">
                {detailRows.map((row) => (
                  <div key={row.label} className="flex items-start gap-4">
                    <p className="text-xs font-medium text-muted-foreground w-20 shrink-0">{row.label}</p>
                    <p className={cn('text-xs text-foreground break-all leading-relaxed', row.mono && 'font-mono')}>{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">{item.meta || 'No additional details'}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="rounded-2xl border dark:bg-card p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-9 w-9 rounded-[10px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-3 w-full mb-1" />
          <Skeleton className="h-3 w-4/5 mb-3" />
          <div className="flex justify-end">
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item card
// ---------------------------------------------------------------------------

function WorkspaceItemCard({
  item,
  onClick,
  index,
}: {
  item: WorkspaceItem;
  onClick: () => void;
  index: number;
}) {
  const kindCfg = KIND_CONFIG[item.kind];
  const scopeCfg = SCOPE_CONFIG[item.scope];
  const KindIcon = kindCfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.6) }}
    >
      <SpotlightCard className="bg-card border border-border/50">
        <div
          onClick={onClick}
          className="p-4 sm:p-5 flex flex-col h-full cursor-pointer"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50 shrink-0">
              <KindIcon className="h-4.5 w-4.5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className={cn('text-sm font-semibold text-foreground truncate', item.kind === 'command' && 'font-mono')}>
                  {item.name}
                </h3>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                  {scopeCfg.label}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">{kindCfg.label}</span>
                {item.meta && (
                  <span className="text-xs text-muted-foreground/50 truncate max-w-[140px]">{item.meta}</span>
                )}
              </div>
            </div>
          </div>

          <div className="h-[34px] mb-3">
            <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
              {item.description || '\u00A0'}
            </p>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
              View
            </Button>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  if (hasFilters) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No items match your filters.{' '}
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground/60 hover:text-foreground underline underline-offset-2 transition-colors cursor-pointer"
        >
          Clear all filters
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-muted/20 rounded-3xl border border-dashed border-border/50 flex flex-col items-center justify-center py-20 px-4 overflow-hidden">
      <Ripple mainCircleSize={160} mainCircleOpacity={0.12} numCircles={6} />
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-16 h-16 bg-muted border rounded-2xl flex items-center justify-center mb-4">
          <Blocks className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No workspace items found</h3>
        <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md">
          Add agents, skills, or commands to .opencode/ to get started.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace Page
// ---------------------------------------------------------------------------

export default function WorkspacePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WorkspaceItem | null>(null);

  // Data
  const { data: projects, isLoading: projectsLoading } = useOpenCodeProjects();
  const { data: agents, isLoading: agentsLoading } = useOpenCodeAgents();
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: commands, isLoading: commandsLoading } = useOpenCodeCommands();
  const { data: toolIds, isLoading: toolsLoading } = useOpenCodeToolIds();
  const { data: mcpStatus, isLoading: mcpLoading } = useOpenCodeMcpStatus();

  const isLoading = projectsLoading || agentsLoading || skillsLoading || commandsLoading || toolsLoading || mcpLoading;

  // Normalize all items into a flat list
  const allItems = useMemo<WorkspaceItem[]>(() => {
    const items: WorkspaceItem[] = [];

    // Projects
    if (projects && Array.isArray(projects)) {
      const sorted = [...projects].sort((a: any, b: any) => {
        const aIsGlobal = a.id === 'global' || a.worktree === '/';
        const bIsGlobal = b.id === 'global' || b.worktree === '/';
        if (aIsGlobal && !bIsGlobal) return -1;
        if (!aIsGlobal && bIsGlobal) return 1;
        return (b.time?.updated ?? 0) - (a.time?.updated ?? 0);
      });
      for (const p of sorted) {
        const name = p.name || (p.worktree === '/' || p.id === 'global' ? 'Global' : p.worktree.split('/').pop() || p.worktree);
        items.push({
          id: `project:${p.id}`,
          name,
          description: p.worktree && p.worktree !== '/' ? p.worktree : undefined,
          kind: 'project',
          scope: p.id === 'global' || p.worktree === '/' ? 'global' : 'project',
          raw: p,
        });
      }
    }

    // Agents (skip hidden)
    if (agents) {
      for (const a of agents) {
        if (a.hidden) continue;
        items.push({
          id: `agent:${a.name}`,
          name: a.name,
          description: a.description,
          kind: 'agent',
          scope: 'project',
          meta: a.model?.modelID,
          raw: a,
        });
      }
    }

    // Skills
    if (skills) {
      for (const s of skills) {
        if ((s as any).hidden) continue;
        const skillSource = getSkillSource(s.location);
        const scope: ItemScope = skillSource === 'project' ? 'project' : skillSource === 'global' ? 'global' : 'external';
        items.push({
          id: `skill:${s.name}`,
          name: s.name,
          description: s.description,
          kind: 'skill',
          scope,
          raw: s,
        });
      }
    }

    // Commands (skip subtask-only commands)
    if (commands) {
      for (const c of commands) {
        if ((c as any).hidden || c.subtask) continue;
        items.push({
          id: `command:${c.name}`,
          name: `/${c.name}`,
          description: c.description,
          kind: 'command',
          scope: getCommandScope(c.source),
          meta: c.agent,
          raw: c,
        });
      }
    }

    // Tools (deduplicate, skip hidden)
    if (toolIds) {
      const uniqueToolIds = [...new Set(toolIds)];
      for (const id of uniqueToolIds) {
        if (id.startsWith('_') || id.startsWith('.')) continue;
        const isMcp = id.startsWith('mcp_');
        items.push({
          id: `tool:${id}`,
          name: isMcp ? getToolDisplayName(id) : id,
          kind: 'tool',
          scope: isMcp ? 'external' : 'built-in',
          meta: isMcp ? getToolServerName(id) : undefined,
          raw: { toolId: id, server: isMcp ? getToolServerName(id) : undefined },
        });
      }
    }

    // MCP Servers (skip disabled)
    if (mcpStatus) {
      for (const [name, status] of Object.entries(mcpStatus)) {
        if (status.status === 'disabled') continue;
        const statusLabel = status.status === 'connected' ? 'Connected'
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
          raw: { serverName: name, status },
        });
      }
    }

    return items;
  }, [projects, agents, skills, commands, toolIds, mcpStatus]);

  // Counts for filter badges
  const kindCounts = useMemo(() => {
    const counts: Record<KindFilter, number> = { all: allItems.length, project: 0, agent: 0, skill: 0, command: 0, tool: 0, mcp: 0 };
    for (const item of allItems) counts[item.kind]++;
    return counts;
  }, [allItems]);

  const scopeCounts = useMemo(() => {
    const counts: Record<ScopeFilter, number> = { all: 0, project: 0, global: 0, external: 0, 'built-in': 0 };
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

  // Active scope tabs (only show tabs that have items)
  const activeScopeTabs = useMemo(() => {
    const tabs: { value: ScopeFilter; label: string }[] = [{ value: 'all', label: 'All' }];
    if (scopeCounts.project > 0) tabs.push({ value: 'project', label: 'Project' });
    if (scopeCounts.global > 0) tabs.push({ value: 'global', label: 'Global' });
    if (scopeCounts.external > 0) tabs.push({ value: 'external', label: 'External' });
    if (scopeCounts['built-in'] > 0) tabs.push({ value: 'built-in', label: 'Built-in' });
    return tabs;
  }, [scopeCounts]);

  const hasFilters = search.trim() !== '' || kindFilter !== 'all' || scopeFilter !== 'all';
  const clearAllFilters = () => { setSearch(''); setKindFilter('all'); setScopeFilter('all'); };

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {/* Page header */}
        <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
          <PageHeader icon={Blocks}>
            <div className="space-y-2 sm:space-y-4">
              <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
                <span className="text-primary">Workspace</span>
              </div>
            </div>
          </PageHeader>
        </div>

        <div className="container mx-auto max-w-7xl px-3 sm:px-4">
          {/* Search + settings bar */}
          <div className="flex items-center gap-2 sm:gap-4 pb-3 sm:pb-4 pt-2 sm:pt-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both delay-75">
            <div className="flex-1 max-w-md">
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Search by name, description, or model..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-input bg-card px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                  <Search className="h-4 w-4" />
                </div>
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md p-0.5 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Kind filter — segmented control */}
            <div className="hidden lg:flex items-center gap-1 rounded-2xl border border-border bg-muted/30 p-1">
              {([
                { value: 'all' as KindFilter, label: 'All' },
                { value: 'project' as KindFilter, label: 'Projects' },
                { value: 'agent' as KindFilter, label: 'Agents' },
                { value: 'skill' as KindFilter, label: 'Skills' },
                { value: 'command' as KindFilter, label: 'Commands' },
                { value: 'tool' as KindFilter, label: 'Tools' },
                { value: 'mcp' as KindFilter, label: 'MCP' },
              ] as const).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setKindFilter(tab.value);
                    setScopeFilter('all');
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer',
                    kindFilter === tab.value
                      ? 'bg-background text-foreground border border-border/50 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/70 border border-transparent',
                  )}
                >
                  {tab.label}
                  {kindCounts[tab.value] > 0 && (
                    <span className="ml-1 tabular-nums opacity-60">{kindCounts[tab.value]}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Mobile kind filter */}
            <div className="lg:hidden">
              <select
                value={kindFilter}
                onChange={(e) => { setKindFilter(e.target.value as KindFilter); setScopeFilter('all'); }}
                className="h-11 rounded-2xl border border-input bg-card px-3 text-sm"
              >
                {([
                  { value: 'all' as KindFilter, label: 'All' },
                  { value: 'project' as KindFilter, label: 'Projects' },
                  { value: 'agent' as KindFilter, label: 'Agents' },
                  { value: 'skill' as KindFilter, label: 'Skills' },
                  { value: 'command' as KindFilter, label: 'Commands' },
                  { value: 'tool' as KindFilter, label: 'Tools' },
                  { value: 'mcp' as KindFilter, label: 'MCP' },
                ] as const).map((tab) => (
                  <option key={tab.value} value={tab.value}>
                    {tab.label} ({kindCounts[tab.value]})
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="default"
              className="px-3 sm:px-4 rounded-2xl gap-1.5 sm:gap-2 text-sm"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden xs:inline">Settings</span>
            </Button>
          </div>

          <OpenCodeSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

          {/* Scope filter — secondary row (only when there are multiple scopes) */}
          {!isLoading && activeScopeTabs.length > 2 && (
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/30 p-1 w-fit mb-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both delay-100">
              {activeScopeTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setScopeFilter(tab.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer',
                    scopeFilter === tab.value
                      ? 'bg-background text-foreground border border-border/50 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/70 border border-transparent',
                  )}
                >
                  {tab.label}
                  <span className="ml-1 tabular-nums opacity-60">{scopeCounts[tab.value]}</span>
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="pb-6 sm:pb-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both delay-150">
            {isLoading ? (
              <LoadingSkeleton />
            ) : allItems.length === 0 ? (
              <EmptyState hasFilters={false} onClear={clearAllFilters} />
            ) : filteredItems.length === 0 ? (
              <EmptyState hasFilters={hasFilters} onClear={clearAllFilters} />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {kindFilter === 'all' ? 'All Items' : kindFilter === 'mcp' ? 'MCP Servers' : kindFilter.charAt(0).toUpperCase() + kindFilter.slice(1) + 's'}
                  </span>
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {filteredItems.length}
                  </Badge>
                </div>

                <AnimatePresence mode="popLayout">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredItems.map((item, index) => (
                      <WorkspaceItemCard
                        key={item.id}
                        item={item}
                        onClick={() => setSelectedItem(item)}
                        index={index}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      </div>

      <WorkspaceItemDetailModal
        item={selectedItem}
        open={Boolean(selectedItem)}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      />
    </>
  );
}
