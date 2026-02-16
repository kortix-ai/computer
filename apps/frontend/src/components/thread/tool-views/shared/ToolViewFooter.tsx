'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '../utils';

export interface ToolViewFooterProps {
  /** Children to render on the left side of the footer */
  children?: React.ReactNode;
  /** Assistant message timestamp */
  assistantTimestamp?: string;
  /** Tool result timestamp */
  toolTimestamp?: string;
  /** Whether the tool is currently streaming */
  isStreaming?: boolean;
  /** Additional classes for the footer */
  className?: string;
}

/**
 * Standardized footer component for tool views.
 * Provides consistent styling with timestamp on the right.
 */
export function ToolViewFooter({
  children,
  assistantTimestamp,
  toolTimestamp,
  isStreaming = false,
  className,
}: ToolViewFooterProps) {
  const displayTimestamp = toolTimestamp && !isStreaming
    ? formatTimestamp(toolTimestamp)
    : assistantTimestamp
      ? formatTimestamp(assistantTimestamp)
      : '';

  return (
    <div className={cn(
      "px-4 py-2 h-10 bg-muted/50 backdrop-blur-sm border-t border-border flex justify-between items-center gap-4",
      className
    )}>
      <div className="h-full flex items-center gap-2 text-sm text-muted-foreground">
        {children}
      </div>
      {displayTimestamp && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          {displayTimestamp}
        </div>
      )}
    </div>
  );
}

