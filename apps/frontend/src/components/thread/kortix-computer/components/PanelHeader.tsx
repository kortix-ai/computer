'use client';

import { memo } from 'react';
import { Minimize2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrawerTitle } from '@/components/ui/drawer';
import { ViewType } from '@/stores/kortix-computer-store';
import { cn } from '@/lib/utils';
import { ToolbarButtons } from './ToolbarButtons';
import Image from 'next/image';


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
        {/* Left: Logo */}
        <div className="flex items-center min-w-0">
          <Image
            src="/kortix-computer-white.svg"
            alt="Kortix Computer"
            width={120}
            height={14}
            className="hidden dark:block"
            priority
          />
          <Image
            src="/kortix-computer-black.svg"
            alt="Kortix Computer"
            width={120}
            height={14}
            className="block dark:hidden"
            priority
          />
          <DrawerTitle className="sr-only">Kortix Computer</DrawerTitle>
        </div>
        
        {/* Right: Actions label + Close */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300">
            <Activity className="w-3 h-3" strokeWidth={2.5} />
            <span className="text-[11px] font-medium">Actions</span>
          </div>
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
        className="flex items-center justify-center cursor-pointer select-none hover:opacity-80 transition-opacity"
      >
        <Image
          src="/kortix-computer-white.svg"
          alt="Kortix Computer"
          width={140}
          height={16}
          className="hidden dark:block"
          priority
        />
        <Image
          src="/kortix-computer-black.svg"
          alt="Kortix Computer"
          width={140}
          height={16}
          className="block dark:hidden"
          priority
        />
      </div>

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300">
          <Activity className="w-3 h-3" strokeWidth={2.5} />
          <span className="text-[11px] font-medium">Actions</span>
        </div>
      </div>
    </div>
  );
});

PanelHeader.displayName = 'PanelHeader';
