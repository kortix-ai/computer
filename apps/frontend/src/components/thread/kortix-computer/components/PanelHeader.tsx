'use client';

import { memo } from 'react';
import { Minimize2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrawerTitle } from '@/components/ui/drawer';
import { ViewType } from '@/stores/kortix-computer-store';
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
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const PanelHeader = memo(function PanelHeader({
  agentName,
  onClose,
  onMaximize,
  isStreaming = false,
  variant = 'desktop',
  currentView,
  onViewChange,
  showFilesTab = false,
  isMaximized = false,
  isSuiteMode = false,
  onToggleSuiteMode,
  isExpanded = false,
  onToggleExpand,
}: PanelHeaderProps) {
  if (variant === 'drawer') {
    return (
      <div className="h-11 flex-shrink-0 px-3 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 min-w-0">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2} />
          <span className="text-sm font-medium text-foreground">Actions</span>
          <DrawerTitle className="sr-only">Actions</DrawerTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Minimize"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 h-11 px-3 flex items-center justify-between border-b border-border">
      <ToolbarButtons
        onClose={onClose}
        isMaximized={isMaximized}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
      />
      <button
        onClick={() => onMaximize?.()}
        className="flex items-center gap-1.5 select-none hover:opacity-70 transition-opacity cursor-pointer"
      >
        <Activity className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2} />
        <span className="text-sm font-medium text-foreground">Actions</span>
      </button>
      <div className="w-16" />
    </div>
  );
});

PanelHeader.displayName = 'PanelHeader';
