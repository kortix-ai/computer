'use client';

import { memo } from 'react';
import { Minimize2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrawerTitle } from '@/components/ui/drawer';
import { ViewType } from '@/stores/kortix-computer-store';
import { cn } from '@/lib/utils';
import { ToolbarButtons } from './ToolbarButtons';


interface PanelHeaderProps {
  agentName?: string;
  onClose: () => void;
  onMaximize?: () => void;
  isStreaming?: boolean;
  variant?: 'drawer' | 'desktop' | 'motion';
  layoutId?: string;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  showFilesTab?: boolean;
  isMaximized?: boolean;
  isSuiteMode?: boolean;
  onToggleSuiteMode?: () => void;
  hideViewToggle?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const PanelHeader = memo(function PanelHeader({
  agentName,
  onClose,
  onMaximize,
  isStreaming = false,
  variant = 'desktop',
  layoutId,
  currentView,
  onViewChange,
  showFilesTab = false,
  isMaximized = false,
  isSuiteMode = false,
  onToggleSuiteMode,
  hideViewToggle = false,
  isExpanded = false,
  onToggleExpand,
}: PanelHeaderProps) {
  if (variant === 'drawer') {
    return (
      <div className="h-12 flex-shrink-0 px-3 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm">
        {/* Left: Title */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Activity className="w-3.5 h-3.5 text-foreground/70" strokeWidth={2.5} />
          <span className="text-sm font-medium text-foreground">Actions</span>
          <DrawerTitle className="sr-only">Actions</DrawerTitle>
        </div>
        
        {/* Right: Close */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground touch-manipulation"
            title="Minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex-shrink-0 grid grid-cols-3 items-center",
      isMaximized
        ? "h-9 px-3"
        : "h-14 px-3.5 pt-1 border-b border-border"
    )}>
      <div className="flex items-center justify-start">
        <ToolbarButtons
          onClose={onClose}
          isMaximized={isMaximized}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
        />
      </div>
      <div
        onClick={() => onMaximize?.()}
        className="flex items-center justify-center cursor-pointer select-none hover:opacity-80 transition-opacity gap-1.5"
      >
        <Activity className="w-3.5 h-3.5 text-foreground/70" strokeWidth={2.5} />
        <span className="text-sm font-medium text-foreground">Actions</span>
      </div>

      <div className="flex items-center justify-end" />
    </div>
  );
});

PanelHeader.displayName = 'PanelHeader';
