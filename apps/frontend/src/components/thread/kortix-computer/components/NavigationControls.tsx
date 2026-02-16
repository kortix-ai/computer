'use client';

import { memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface NavigationControlsProps {
  displayIndex: number;
  displayTotalCalls: number;
  safeInternalIndex: number;
  latestIndex: number;
  isLiveMode: boolean;
  agentStatus: string;
  onPrevious: () => void;
  onNext: () => void;
  onSliderChange: (value: number[]) => void;
  onJumpToLive: () => void;
  onJumpToLatest: () => void;
  isMobile?: boolean;
}

function StatusPill({
  isLiveMode,
  agentStatus,
  onJumpToLive,
  onJumpToLatest,
}: {
  isLiveMode: boolean;
  agentStatus: string;
  onJumpToLive: () => void;
  onJumpToLatest: () => void;
}) {
  const isRunning = agentStatus === 'running';
  const isAtLatest = isLiveMode && !isRunning;

  // At latest + idle = static "Latest" pill (no action)
  if (isAtLatest) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted border border-border text-xs font-medium text-muted-foreground">
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
        Latest
      </div>
    );
  }

  // Running (live or behind) = pulsing primary pill
  if (isRunning) {
    return (
      <button
        onClick={onJumpToLive}
        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/15 transition-colors cursor-pointer"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        {isLiveMode ? 'Live' : 'Jump to Live'}
      </button>
    );
  }

  // Manual mode + idle = "Jump to Latest"
  return (
    <button
      onClick={onJumpToLatest}
      className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
      Jump to Latest
    </button>
  );
}

export const NavigationControls = memo(function NavigationControls({
  displayIndex,
  displayTotalCalls,
  safeInternalIndex,
  latestIndex,
  isLiveMode,
  agentStatus,
  onPrevious,
  onNext,
  onSliderChange,
  onJumpToLive,
  onJumpToLatest,
  isMobile = false,
}: NavigationControlsProps) {
  if (isMobile) {
    return (
      <div className="border-t border-border bg-muted/50 p-3">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevious}
            disabled={displayIndex <= 0}
            className="h-8 px-2.5 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            Prev
          </Button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium tabular-nums min-w-[44px]">
              {safeInternalIndex + 1}/{displayTotalCalls}
            </span>
            <StatusPill
              isLiveMode={isLiveMode}
              agentStatus={agentStatus}
              onJumpToLive={onJumpToLive}
              onJumpToLatest={onJumpToLatest}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={displayIndex >= displayTotalCalls - 1}
            className="h-8 px-2.5 text-xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/50 px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Prev / counter / Next */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrevious}
            disabled={displayIndex <= 0}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground font-medium tabular-nums px-1 min-w-[44px] text-center">
            {displayIndex + 1}/{displayTotalCalls}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            disabled={safeInternalIndex >= latestIndex}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Slider */}
        <div className="flex-1">
          <Slider
            min={0}
            max={Math.max(0, displayTotalCalls - 1)}
            step={1}
            value={[safeInternalIndex]}
            onValueChange={onSliderChange}
          />
        </div>

        {/* Status pill */}
        <StatusPill
          isLiveMode={isLiveMode}
          agentStatus={agentStatus}
          onJumpToLive={onJumpToLive}
          onJumpToLatest={onJumpToLatest}
        />
      </div>
    </div>
  );
});

NavigationControls.displayName = 'NavigationControls';
