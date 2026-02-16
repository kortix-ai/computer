'use client';

import { memo } from 'react';
import { Activity } from 'lucide-react';

interface EmptyStateProps {
  t: (key: string) => string;
}

export const EmptyState = memo(function EmptyState({ t }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <div className="flex flex-col items-center gap-4">
        <Activity className="w-8 h-8 text-muted-foreground/30" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground max-w-xs text-center">
          {t('emptyActionsDescription')}
        </p>
      </div>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
