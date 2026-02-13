'use client';

import { memo } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ViewType } from '@/stores/kortix-computer-store';

interface ViewToggleProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  showFilesTab?: boolean;
}

export const ViewToggle = memo(function ViewToggle({ 
  currentView, 
  onViewChange, 
  showFilesTab = false 
}: ViewToggleProps) {
  return (
    <div className="relative flex items-center gap-1 bg-muted rounded-3xl px-1 py-1">
      <div className="absolute top-1 left-1 h-7 w-7 bg-white dark:bg-zinc-700 rounded-xl shadow-sm" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            onClick={() => onViewChange('tools')}
            className="relative z-10 h-7 w-7 p-0 rounded-xl bg-transparent hover:bg-transparent shadow-none text-black dark:text-white"
          >
            <Zap className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span>Actions</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
});

ViewToggle.displayName = 'ViewToggle';
