'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToolViewIconTitleProps {
  /** The icon to display */
  icon: LucideIcon;
  /** The title text */
  title: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Optional click handler for the title (e.g. to open a file) */
  onTitleClick?: () => void;
  /** Additional classes for the container */
  className?: string;
}

/**
 * Standardized icon + title component for tool views.
 * Provides consistent styling for the icon wrapper and title text.
 * Leaves flexibility for each tool view to add custom actions, tabs, etc.
 */
export function ToolViewIconTitle({
  icon: Icon,
  title,
  subtitle,
  onTitleClick,
  className,
}: ToolViewIconTitleProps) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0 overflow-hidden flex-1", className)}>
      <div className="relative p-2 rounded-lg border bg-muted border-border flex-shrink-0">
        <Icon className="w-5 h-5 text-foreground" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        {onTitleClick ? (
          <div
            className="text-base font-medium text-foreground truncate cursor-pointer hover:text-primary transition-colors"
            onClick={onTitleClick}
            title={subtitle || undefined}
          >
            {title}
          </div>
        ) : (
          <div className="text-base font-medium text-foreground truncate">
            {title}
          </div>
        )}
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate" title={subtitle}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

