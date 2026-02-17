'use client';

import { memo } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { m } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ToolbarButtonsProps {
  onClose: () => void;
  isMaximized?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const ToolbarButtons = memo(function ToolbarButtons({
  onClose,
  isMaximized = false,
  isExpanded = false,
  onToggleExpand,
}: ToolbarButtonsProps) {
  return (
    <div className="flex items-center gap-0.5 p-1 rounded-full bg-muted">
      <Tooltip>
        <TooltipTrigger asChild>
          <m.button
            onClick={onClose}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center cursor-pointer",
              isMaximized && "w-5 h-5",
              "text-muted-foreground hover:text-foreground hover:bg-background hover:shadow-sm",
              "transition-colors duration-150"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </m.button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span>Close</span>
        </TooltipContent>
      </Tooltip>

      {onToggleExpand && !isMaximized && (
        <Tooltip>
          <TooltipTrigger asChild>
            <m.button
              onClick={onToggleExpand}
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center cursor-pointer",
                "text-muted-foreground hover:text-foreground hover:bg-background hover:shadow-sm",
                "transition-colors duration-150"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isExpanded ? (
                <Minimize2 className="w-3.5 h-3.5" strokeWidth={2} />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" strokeWidth={2} />
              )}
            </m.button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
});

ToolbarButtons.displayName = 'ToolbarButtons';
