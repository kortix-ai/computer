'use client';

import { useState, useMemo } from 'react';
import {
  Sparkles,
  FolderOpen,
  Search,
  ChevronRight,
  Globe,
  Laptop,
  ExternalLink,
  FileText,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useOpenCodeSkills, type Skill } from '@/hooks/opencode/use-opencode-sessions';

// ---------------------------------------------------------------------------
// Source detection
// ---------------------------------------------------------------------------

type SkillSource = 'project' | 'global' | 'external';

function getSkillSource(location: string): SkillSource {
  if (location.includes('/.opencode/')) return 'project';
  if (location.includes('/.claude/') || location.includes('/.agents/')) return 'external';
  if (location.includes('/Users/') && location.includes('/.config/')) return 'global';
  return 'project';
}

const SOURCE_META: Record<SkillSource, { label: string; icon: typeof Sparkles; color: string }> = {
  project: { label: 'Project', icon: Laptop, color: 'text-blue-500 bg-blue-500/10' },
  global: { label: 'Global', icon: Globe, color: 'text-emerald-500 bg-emerald-500/10' },
  external: { label: 'External', icon: ExternalLink, color: 'text-violet-500 bg-violet-500/10' },
};

type FilterTab = 'all' | SkillSource;

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'project', label: 'Project' },
  { value: 'global', label: 'Global' },
  { value: 'external', label: 'External' },
];

// ---------------------------------------------------------------------------
// Skill Card
// ---------------------------------------------------------------------------

function SkillCard({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false);
  const source = getSkillSource(skill.location);
  const meta = SOURCE_META[source];
  const SourceIcon = meta.icon;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex items-start gap-4 w-full px-4 py-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-colors text-left cursor-default">
        {/* Icon */}
        <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mt-0.5">
          <Sparkles className="h-4 w-4" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{skill.name}</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider',
                meta.color,
              )}
            >
              <SourceIcon className="h-2.5 w-2.5" />
              {meta.label}
            </span>
          </div>
          {skill.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {skill.description}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/60">
            <FolderOpen className="h-3 w-3" />
            <span className="truncate">{skill.location}</span>
          </div>
        </div>

        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground/30 transition-transform mt-1 flex-shrink-0',
            expanded && 'rotate-90',
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-[52px] mr-4 mb-2 mt-1 space-y-2">
          {/* Content preview */}
          {skill.content ? (
            <div className="rounded-md border border-border/30 bg-muted/20 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/30 bg-muted/30">
                <FileText className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Skill Content
                </span>
              </div>
              <pre className="text-[11px] text-foreground/80 font-mono p-3 max-h-60 overflow-auto whitespace-pre-wrap break-words">
                {skill.content}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">No content available</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Skills Browser Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const { data: skills, isLoading, error } = useOpenCodeSkills();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // Compute source counts for tab badges
  const sourceCounts = useMemo(() => {
    if (!skills) return { all: 0, project: 0, global: 0, external: 0 };
    const counts = { all: skills.length, project: 0, global: 0, external: 0 };
    for (const skill of skills) {
      const src = getSkillSource(skill.location);
      counts[src]++;
    }
    return counts;
  }, [skills]);

  // Filter skills by search + source tab
  const filteredSkills = useMemo(() => {
    if (!skills) return [];
    let result = skills;

    // Source filter
    if (activeFilter !== 'all') {
      result = result.filter((s) => getSkillSource(s.location) === activeFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q),
      );
    }

    return result;
  }, [skills, search, activeFilter]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Skills Browser</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and inspect skill instruction sets loaded from SKILL.md files across your workspace.
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <KortixLoader size="medium" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load skills</p>
            <p className="text-xs text-muted-foreground mt-1">
              Could not connect to the OpenCode server
            </p>
          </div>
        ) : !skills || skills.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No skills found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add SKILL.md files to .opencode/skills/ or .claude/skills/ to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Search + Filters */}
            <div className="space-y-3 mb-6">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  placeholder="Search skills by name, description, or path..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm rounded-lg"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Source filter tabs */}
              <div className="flex items-center gap-1">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveFilter(tab.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      activeFilter === tab.value
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        'text-[10px] tabular-nums px-1 py-0.5 rounded',
                        activeFilter === tab.value
                          ? 'bg-background/20 text-background'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      {sourceCounts[tab.value]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Results summary */}
            <p className="text-xs text-muted-foreground mb-4">
              {filteredSkills.length === skills.length
                ? `${skills.length} skill${skills.length !== 1 ? 's' : ''} available`
                : `${filteredSkills.length} of ${skills.length} skill${skills.length !== 1 ? 's' : ''}`}
            </p>

            {/* Skill cards */}
            {filteredSkills.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <Search className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No skills match your filters</p>
                <button
                  onClick={() => {
                    setSearch('');
                    setActiveFilter('all');
                  }}
                  className="text-xs text-muted-foreground/60 hover:text-foreground mt-2 underline underline-offset-2 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSkills.map((skill) => (
                  <SkillCard key={skill.name} skill={skill} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
