'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Search, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSkills } from '../hooks/use-skills';
import { useSkillsStore } from '../store/skills-store';
import { SkillCard } from './skill-card';
import { SkillEditor } from './skill-editor';
import { DeleteSkillDialog } from './delete-skill-dialog';
import {
  getSkillSource,
  SKILL_FILTER_TABS,
  type Skill,
  type SkillFilterTab,
} from '../types';
import { openTabAndNavigate } from '@/stores/tab-store';

// ---------------------------------------------------------------------------
// Skills List (main content component for the skills page)
// ---------------------------------------------------------------------------

export function SkillList() {
  const { data: skills, isLoading, error } = useSkills();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<SkillFilterTab>('all');

  const { openCreateEditor, openEditEditor, openDeleteDialog } =
    useSkillsStore();

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
      result = result.filter(
        (s) => getSkillSource(s.location) === activeFilter,
      );
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

  const handleEdit = (skill: Skill) => openEditEditor(skill);
  const handleDelete = (skill: Skill) => openDeleteDialog(skill);
  const handleNavigate = (skill: Skill) => {
    openTabAndNavigate(
      {
        id: `page:/skills/${encodeURIComponent(skill.name)}`,
        title: skill.name,
        type: 'page',
        href: `/skills/${encodeURIComponent(skill.name)}`,
      },
      router,
    );
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Skills Browser
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Browse, create, and manage skill instruction sets (SKILL.md
                files).
              </p>
            </div>
            <Button onClick={openCreateEditor} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Skill
            </Button>
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
                Add SKILL.md files to .opencode/skills/ to get started.
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Source filter tabs */}
                <div className="flex items-center gap-1">
                  {SKILL_FILTER_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => setActiveFilter(tab.value)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
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
                  <p className="text-sm text-muted-foreground">
                    No skills match your filters
                  </p>
                  <button
                    onClick={() => {
                      setSearch('');
                      setActiveFilter('all');
                    }}
                    className="text-xs text-muted-foreground/60 hover:text-foreground mt-2 underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSkills.map((skill) => (
                    <SkillCard
                      key={skill.name}
                      skill={skill}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <SkillEditor />
      <DeleteSkillDialog />
    </>
  );
}
