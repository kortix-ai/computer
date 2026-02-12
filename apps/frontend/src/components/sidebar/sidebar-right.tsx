'use client';

import * as React from 'react';
import { useCallback, useRef, useState, useEffect } from 'react';
import {
  PanelRightClose,
  PanelRightOpen,
  FolderTree,
  Search,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { useRightSidebar, SIDEBAR_RIGHT_WIDTH, SIDEBAR_RIGHT_WIDTH_ICON } from '@/components/ui/sidebar-right-provider';
import { SidebarFileBrowser } from '@/components/sidebar/sidebar-explorer';
import { useFilesStore } from '@/features/files/store/files-store';

// ============================================================================
// Collapsed Icon Button with optional hover flyout
// (mirrors the left sidebar's CollapsedIconButton exactly)
// ============================================================================

interface CollapsedIconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  flyoutContent?: React.ReactNode;
  disabled?: boolean;
}

function CollapsedIconButton({ icon, label, onClick, flyoutContent, disabled }: CollapsedIconButtonProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const buttonEl = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center h-10 w-10 rounded-xl cursor-pointer',
        'transition-all duration-150 ease-out',
        'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {icon}
    </button>
  );

  if (flyoutContent) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            onMouseEnter={() => { cancelClose(); setOpen(true); }}
            onMouseLeave={scheduleClose}
          >
            {buttonEl}
          </div>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="start"
          sideOffset={12}
          className="w-[280px] max-h-[75vh] p-0 overflow-hidden"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {flyoutContent}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {buttonEl}
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={12} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Files Flyout — compact file browser shown on hover in collapsed state
// ============================================================================

function FilesFlyout() {
  return (
    <div className="h-[400px] flex flex-col">
      <SidebarFileBrowser openFileAsTab />
    </div>
  );
}

// ============================================================================
// Main Right Sidebar
// ============================================================================

export function SidebarRight() {
  const { state, open, setOpen, toggleSidebar, isMobile } = useRightSidebar();
  const toggleSearch = useFilesStore((s) => s.toggleSearch);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Hidden upload handled via the expanded file browser; collapsed just opens the sidebar
  if (isMobile) return null;

  return (
    <>
      {/* Gap element — takes space in flex layout so content area shrinks.
          Also hosts the rail so there's a single interactive edge aligned
          with the content area's right border. */}
      <div
        className="relative shrink-0 bg-transparent transition-[width] duration-300 ease-out will-change-[width] transform-gpu"
        style={{
          width: open ? SIDEBAR_RIGHT_WIDTH : SIDEBAR_RIGHT_WIDTH_ICON,
        }}
      >
        {/* Rail — thin hoverable strip on the left edge to toggle.
            Positioned at the left edge of the gap (= content border). */}
        <button
          aria-label="Toggle File Sidebar"
          tabIndex={-1}
          onClick={toggleSidebar}
          title="Toggle File Sidebar"
          className={cn(
            'hover:after:bg-sidebar-border absolute inset-y-0 left-0 z-20 hidden w-4 -translate-x-1/2 transition-all duration-300 ease-out after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex',
            state === 'expanded' ? 'cursor-w-resize' : 'cursor-e-resize',
          )}
        />
      </div>

      {/* Fixed sidebar panel — mirrors the left sidebar's fixed container */}
      <div
        className="fixed inset-y-0 right-0 z-10 h-svh transition-[right,width] duration-300 ease-out will-change-[width,transform] transform-gpu backface-visibility-hidden flex overflow-visible"
        style={{
          width: open ? SIDEBAR_RIGHT_WIDTH : SIDEBAR_RIGHT_WIDTH_ICON,
        }}
      >
        <div className="bg-sidebar text-sidebar-foreground flex h-full w-full flex-col">

          {/* ====== HEADER: Title/Icon + collapse/expand ====== */}
          <div className="flex flex-col gap-2 p-2 pt-4 pb-0 transition-[padding] duration-300 ease-out transform-gpu overflow-visible">
            <div className="relative flex h-[32px] items-center px-4 justify-between">
              {/* Left side: icon in collapsed, title in expanded */}
              <div className={cn(
                'relative flex items-center group/logo',
                state === 'collapsed' && 'absolute left-1/2 -translate-x-1/2',
              )}>
                {/* Collapsed: FolderTree icon → hover reveals PanelRightOpen */}
                <FolderTree
                  className={cn(
                    'h-[18px] w-[18px] flex-shrink-0 transition-[transform,opacity] duration-300 ease-out transform-gpu',
                    state === 'collapsed'
                      ? 'opacity-100 scale-100 group-hover/logo:opacity-0 group-hover/logo:scale-90'
                      : 'opacity-0 scale-90 absolute',
                  )}
                />
                {/* Expanded: "Explorer" title */}
                <span
                  className={cn(
                    'text-sm font-semibold transition-[opacity] duration-300 ease-out whitespace-nowrap',
                    state === 'collapsed' ? 'opacity-0 absolute pointer-events-none' : 'opacity-100',
                  )}
                >
                  Explorer
                </span>
                {/* Collapsed: hover overlay with expand button */}
                {state === 'collapsed' && (
                  <button
                    className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0 scale-75 group-hover/logo:opacity-100 group-hover/logo:scale-100 transition-[opacity,transform] duration-300 ease-out transform-gpu"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
                    aria-label="Expand file sidebar"
                  >
                    <PanelRightOpen className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>

              {/* Right side: collapse button (expanded only) */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 transition-opacity duration-200',
                  state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100',
                )}
                onClick={() => setOpen(false)}
              >
                <PanelRightClose className="!h-5 !w-5" />
              </Button>
            </div>
          </div>

          {/* ====== CONTENT ====== */}
          <div className={cn(
            'flex min-h-0 flex-1 flex-col transition-[opacity] duration-300 ease-out transform-gpu relative',
            state === 'collapsed' ? 'overflow-visible' : 'overflow-auto',
          )}>
            {/* --- Collapsed: icon buttons (Search, Upload) --- */}
            <div className={cn(
              'absolute inset-0 px-2 pt-3 space-y-0.5 flex flex-col items-center transition-opacity duration-150 ease-out overflow-visible',
              state === 'collapsed' ? 'opacity-100 pointer-events-auto delay-100' : 'opacity-0 pointer-events-none delay-0',
            )}>
              <CollapsedIconButton
                icon={<Search className="h-[18px] w-[18px]" />}
                label="Search files"
                onClick={() => { setOpen(true); setTimeout(() => toggleSearch(), 100); }}
              />
              <CollapsedIconButton
                icon={<Upload className="h-[18px] w-[18px]" />}
                label="Upload file"
                onClick={() => setOpen(true)}
              />
            </div>

            {/* --- Expanded: full file tree browser --- */}
            <div className={cn(
              'flex flex-col h-full transition-opacity duration-150 ease-out overflow-hidden',
              state === 'collapsed' ? 'opacity-0 pointer-events-none delay-0' : 'opacity-100 pointer-events-auto delay-100',
            )}>
              <SidebarFileBrowser openFileAsTab />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
