'use client';

import { Sparkles, FolderOpen } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { useOpenCodeSkills } from '@/hooks/opencode/use-opencode-sessions';

function getSkillSource(location: string): string {
  if (location.includes('/.opencode/')) return 'project';
  if (location.includes('/.claude/') || location.includes('/.agents/')) return 'external';
  const home = typeof window !== 'undefined' ? '' : '';
  // Heuristic: if path is under home config dirs, it's global
  if (location.includes('/Users/') && location.includes('/.config/')) return 'global';
  return 'project';
}

export default function SkillsPage() {
  const { data: skills, isLoading, error } = useOpenCodeSkills();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Specialized instruction sets loaded from SKILL.md files in your workspace.
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
            <p className="text-xs text-muted-foreground mt-1">Could not connect to the OpenCode server</p>
          </div>
        ) : !skills || skills.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No skills found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add SKILL.md files to .opencode/skills/ or .claude/skills/
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => {
              const source = getSkillSource(skill.location);
              return (
                <div
                  key={skill.name}
                  className="group flex items-start gap-4 px-4 py-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-colors"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mt-0.5">
                    <Sparkles className="h-4 w-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{skill.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-muted text-muted-foreground">
                        {source}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/60">
                      <FolderOpen className="h-3 w-3" />
                      <span className="truncate">{skill.location}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
