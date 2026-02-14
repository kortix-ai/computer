'use client';

import { memo } from 'react';
import { Activity } from 'lucide-react';

interface EmptyStateProps {
  t: (key: string) => string;
}

export const EmptyState = memo(function EmptyState({ t }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      {/* Empty state container */}
      <div className="flex flex-col items-center space-y-6">
        {/* Icon */}
        <div className="relative">
          <div className="absolute inset-0 blur-3xl opacity-15 dark:opacity-5 bg-gradient-to-b from-zinc-400 to-transparent scale-150" />
          <Activity className="w-10 h-10 text-zinc-300 dark:text-zinc-600 relative z-10" strokeWidth={1.5} />
        </div>

        {/* Empty state text */}
        <div className="flex flex-col items-center space-y-2 max-w-xs text-center">
          <p className="text-sm text-zinc-400 dark:text-zinc-500 font-light">
            {t('emptyActionsDescription')}
          </p>
        </div>
      </div>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
