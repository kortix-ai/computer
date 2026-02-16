'use client';

import React from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToolViewHeaderProps {
  /** The icon to display */
  icon: LucideIcon;
  /** The title text */
  title: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Children to render on the right side of the header */
  children?: React.ReactNode;
  /** Additional classes for the header */
  className?: string;
}

/**
 * Standardized header component for tool views.
 * Provides consistent styling across all tool views with neutral black/white colors.
 */
export function ToolViewHeader({
  icon: Icon,
  title,
  subtitle,
  children,
  className,
}: ToolViewHeaderProps) {
  return (
    <CardHeader className={cn(
      "h-14 bg-muted/50 backdrop-blur-sm border-b border-border p-2 px-4 space-y-2",
      className
    )}>
      <div className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="relative p-2 rounded-lg border bg-muted border-border flex-shrink-0">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-medium text-foreground truncate">
              {title}
            </CardTitle>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {children}
          </div>
        )}
      </div>
    </CardHeader>
  );
}

