'use client';

import { memo } from 'react';
import { Minimize2, FolderOpen, Activity, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrawerTitle } from '@/components/ui/drawer';
import { ViewType } from '@/stores/kortix-computer-store';
import { cn } from '@/lib/utils';
import { ViewToggle } from './ViewToggle';
import { ToolbarButtons } from './ToolbarButtons';
import Image from 'next/image';
import { motion } from 'framer-motion';


interface ActionFilesSwitcherProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  size?: 'sm' | 'md';
}

const SWITCHER_TABS: { key: ViewType; label: string; icon: typeof Activity }[] = [
  { key: 'tools', label: 'Actions', icon: Activity },
  { key: 'files', label: 'Files', icon: FolderOpen },
  { key: 'terminal', label: 'Terminal', icon: TerminalSquare },
];

function ActionFilesSwitcher({ currentView, onViewChange, size = 'md' }: ActionFilesSwitcherProps) {
  const activeIndex = SWITCHER_TABS.findIndex((t) => t.key === currentView);
  const resolvedIndex = activeIndex === -1 ? 0 : activeIndex;

  // Size variants - sm is more compact for mobile
  const config = size === 'sm'
    ? { height: 30, padding: 2, btnWidth: 64, iconSize: 12, fontSize: 11 }
    : { height: 36, padding: 3, btnWidth: 80, iconSize: 14, fontSize: 12 };

  const totalWidth = config.btnWidth * SWITCHER_TABS.length + config.padding * 2;

  return (
    <div
      className="relative flex items-center bg-zinc-100 dark:bg-zinc-800/90 rounded-full"
      style={{
        height: config.height,
        width: totalWidth,
        padding: config.padding
      }}
    >
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-[3px] bottom-[3px] rounded-full bg-white dark:bg-zinc-900 shadow-sm"
        style={{ width: config.btnWidth }}
        initial={false}
        animate={{ x: resolvedIndex * config.btnWidth }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />

      {SWITCHER_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === currentView;
        return (
          <button
            key={tab.key}
            onClick={() => onViewChange(tab.key)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1 rounded-full font-medium transition-colors cursor-pointer",
              isActive ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
            )}
            style={{ width: config.btnWidth, height: config.height - config.padding * 2, fontSize: config.fontSize }}
          >
            <Icon style={{ width: config.iconSize, height: config.iconSize }} strokeWidth={2.5} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

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
  showFilesTab = true,
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
        {/* Left: Logo - compact for mobile */}
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
        
        {/* Right: Switcher + Close - tighter spacing */}
        <div className="flex items-center gap-1.5">
          <ActionFilesSwitcher
            currentView={currentView}
            onViewChange={onViewChange}
            size="sm"
          />
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

      <div className="flex items-center justify-end gap-2">
        <ActionFilesSwitcher
          currentView={currentView}
          onViewChange={onViewChange}
          size={isMaximized ? 'sm' : 'md'}
        />
      </div>
    </div>
  );
});

PanelHeader.displayName = 'PanelHeader';

