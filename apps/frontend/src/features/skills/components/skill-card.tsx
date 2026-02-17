'use client';

import {
  Sparkles,
  FolderOpen,
  ChevronRight,
  Globe,
  Laptop,
  ExternalLink,
  Pencil,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Skill, SkillSource } from '../types';
import { getSkillSource, SOURCE_META } from '../types';

// ---------------------------------------------------------------------------
// Source icon mapping
// ---------------------------------------------------------------------------

const SOURCE_ICONS: Record<SkillSource, typeof Sparkles> = {
  project: Laptop,
  global: Globe,
  external: ExternalLink,
};

// ---------------------------------------------------------------------------
// Skill Card
// ---------------------------------------------------------------------------

interface SkillCardProps {
  skill: Skill;
  onEdit?: (skill: Skill) => void;
  onDelete?: (skill: Skill) => void;
  onNavigate?: (skill: Skill) => void;
}

export function SkillCard({ skill, onEdit, onDelete, onNavigate }: SkillCardProps) {
  const source = getSkillSource(skill.location);
  const meta = SOURCE_META[source];
  const SourceIcon = SOURCE_ICONS[source];

  const isEditable = source === 'project';

  return (
    <div className="group rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-all duration-150">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate?.(skill)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate?.(skill);
          }
        }}
        className="flex items-start gap-4 w-full px-4 py-3 text-left cursor-pointer"
      >
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

        {/* Actions + Navigate chevron */}
        <div className="flex items-center gap-1 flex-shrink-0 mt-1">
          {isEditable && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(skill);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(skill);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>
    </div>
  );
}
