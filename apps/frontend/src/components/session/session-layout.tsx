'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { KortixComputer } from '@/components/thread/kortix-computer';
import { useIsMobile } from '@/hooks/utils';
import { cn } from '@/lib/utils';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  useKortixComputerStore,
  type ViewType,
} from '@/stores/kortix-computer-store';
import {
  useOpenCodeMessages,
  useOpenCodeSession,
} from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import {
  adaptMessagesToToolCalls,
  adaptAgentStatus,
} from '@/lib/adapters/opencode-to-kortix-computer';
import { Activity, FolderOpen, Monitor, TerminalSquare, X, Maximize2, Minimize2 } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useServerStore } from '@/stores/server-store';

// ============================================================================
// Top bar tab switcher (Actions / Files / Desktop) — macOS title bar style
// ============================================================================

const TAB_WIDTH = 80;

const TABS: { key: ViewType; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { key: 'tools', label: 'Actions', icon: Activity },
  { key: 'files', label: 'Files', icon: FolderOpen },
  { key: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { key: 'desktop', label: 'Desktop', icon: Monitor },
];

function TopBarTabs({
  currentView,
  onViewChange,
}: {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}) {
  const activeIndex = TABS.findIndex((t) => t.key === currentView);
  const resolvedIndex = activeIndex === -1 ? 0 : activeIndex;

  return (
    <div
      className="relative flex items-center bg-zinc-100/80 dark:bg-zinc-800/60 rounded-full"
      style={{ height: 28, padding: 2 }}
    >
      <motion.div
        className="absolute top-[2px] bottom-[2px] rounded-full bg-white dark:bg-zinc-700 shadow-sm"
        style={{ width: TAB_WIDTH }}
        initial={false}
        animate={{ x: resolvedIndex * TAB_WIDTH }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      />
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === currentView;
        return (
          <button
            key={tab.key}
            onClick={() => onViewChange(tab.key)}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1 rounded-full font-medium transition-colors cursor-pointer text-[11px]',
              isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500',
            )}
            style={{ width: TAB_WIDTH, height: 24 }}
          >
            <Icon className="w-3 h-3" strokeWidth={2.5} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Desktop iframe view
// ============================================================================

function DesktopView({ serverUrl }: { serverUrl: string }) {
  // Derive desktop URL: replace the port with 6080
  const desktopUrl = useMemo(() => {
    try {
      const url = new URL(serverUrl);
      url.port = '6080';
      return url.toString();
    } catch {
      return `http://localhost:6080`;
    }
  }, [serverUrl]);

  return (
    <div className="h-full w-full flex flex-col bg-black">
      <iframe
        src={desktopUrl}
        className="flex-1 w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
        title="Desktop"
      />
    </div>
  );
}

// ============================================================================
// Session Layout
// ============================================================================

interface SessionLayoutProps {
  sessionId: string;
  children: React.ReactNode;
}

export const SessionLayout = memo(function SessionLayout({
  sessionId,
  children,
}: SessionLayoutProps) {
  const isMobile = useIsMobile();

  const { data: messages } = useOpenCodeMessages(sessionId);
  const { data: session } = useOpenCodeSession(sessionId);

  const sessionStatus = useOpenCodeSessionStatusStore(
    (s) => s.statuses[sessionId],
  );
  const isBusy = sessionStatus?.type === 'busy';

  const toolCalls = useMemo(
    () => (messages ? adaptMessagesToToolCalls(messages) : []),
    [messages],
  );
  const agentStatus = adaptAgentStatus(isBusy);

  const {
    isSidePanelOpen,
    setIsSidePanelOpen,
    shouldOpenPanel,
    clearShouldOpenPanel,
    activeView,
    setActiveView,
    isExpanded,
    toggleExpanded,
  } = useKortixComputerStore();

  const serverUrl = useServerStore((s) => {
    const active = s.servers.find((srv) => srv.id === s.activeServerId);
    return active?.url || 'http://localhost:4096';
  });

  const hasToolCalls = toolCalls.length > 0;
  const prevHasToolCallsRef = useRef(false);

  useEffect(() => {
    if (hasToolCalls && !prevHasToolCallsRef.current && !isMobile) {
      setIsSidePanelOpen(true);
    }
    prevHasToolCallsRef.current = hasToolCalls;
  }, [hasToolCalls, isMobile, setIsSidePanelOpen]);

  useEffect(() => {
    if (shouldOpenPanel && !isSidePanelOpen) {
      setIsSidePanelOpen(true);
      clearShouldOpenPanel();
    } else if (shouldOpenPanel) {
      clearShouldOpenPanel();
    }
  }, [shouldOpenPanel, isSidePanelOpen, setIsSidePanelOpen, clearShouldOpenPanel]);

  const [currentToolIndex, setCurrentToolIndex] = useState(0);
  const [externalNavIndex, setExternalNavIndex] = useState<number | undefined>(undefined);

  const handleSidePanelNavigate = useCallback((index: number) => {
    setCurrentToolIndex(index);
  }, []);

  const handleSidePanelClose = useCallback(() => {
    if (isExpanded) toggleExpanded();
    setIsSidePanelOpen(false);
  }, [setIsSidePanelOpen, isExpanded, toggleExpanded]);

  const handleToggleSidePanel = useCallback(() => {
    setIsSidePanelOpen(!isSidePanelOpen);
  }, [isSidePanelOpen, setIsSidePanelOpen]);

  // When Desktop or Terminal tab is selected, always open the side panel
  const handleViewChange = useCallback(
    (view: ViewType) => {
      setActiveView(view);
      if ((view === 'desktop' || view === 'terminal') && !isSidePanelOpen) {
        setIsSidePanelOpen(true);
      }
    },
    [setActiveView, isSidePanelOpen, setIsSidePanelOpen],
  );

  const mainPanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);
  const sidePanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);

  // Side panel can show for tool calls, desktop view, or terminal view
  const canOpenSidePanel = hasToolCalls || activeView === 'desktop' || activeView === 'terminal';
  const shouldShowPanel = isSidePanelOpen && canOpenSidePanel;
  const showDesktop = activeView === 'desktop' && shouldShowPanel;

  useEffect(() => {
    if (shouldShowPanel) {
      if (isExpanded) {
        sidePanelRef.current?.resize(100);
        mainPanelRef.current?.resize(0);
      } else {
        sidePanelRef.current?.resize(50);
        mainPanelRef.current?.resize(50);
      }
    } else {
      sidePanelRef.current?.resize(0);
      mainPanelRef.current?.resize(100);
    }
  }, [shouldShowPanel, isExpanded]);

  const renderAssistantMessage = useCallback(() => null, []);
  const renderToolResult = useCallback(() => null, []);

  const agentName = session?.title || 'OpenCode';

  // Mobile
  if (isMobile) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {children}
        </div>
        {showDesktop ? (
          <div className="fixed inset-0 z-50 bg-black">
            <div className="flex items-center justify-between h-11 px-3 bg-background border-b border-border/40">
              <span className="text-xs font-medium text-muted-foreground">Desktop</span>
              <button
                onClick={handleSidePanelClose}
                className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <DesktopView serverUrl={serverUrl} />
          </div>
        ) : (
          <KortixComputer
            isOpen={isSidePanelOpen && hasToolCalls}
            onClose={handleSidePanelClose}
            toolCalls={toolCalls}
            messages={[]}
            agentStatus={agentStatus}
            currentIndex={currentToolIndex}
            onNavigate={handleSidePanelNavigate}
            externalNavigateToIndex={externalNavIndex}
            renderAssistantMessage={renderAssistantMessage}
            renderToolResult={renderToolResult}
            isLoading={false}
            agentName={agentName}
            disableInitialAnimation={true}
          />
        )}
      </div>
    );
  }

  // Desktop: resizable split panel + panel-local top bar
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ---- Content area: resizable split ---- */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full"
          style={{ transition: 'none' }}
        >
          {/* Main content panel (SessionChat) */}
          <ResizablePanel
            ref={mainPanelRef}
            defaultSize={shouldShowPanel ? 50 : 100}
            minSize={shouldShowPanel ? (isExpanded ? 0 : 30) : 100}
            maxSize={shouldShowPanel ? (isExpanded ? 0 : 65) : 100}
            collapsible={isExpanded}
            className={cn(
              "flex flex-col overflow-hidden relative bg-transparent pl-3 pr-1.5",
              isExpanded && "hidden"
            )}
          >
            <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
              {children}
            </div>
          </ResizablePanel>

          {/* Resizable handle */}
          {!isExpanded && (
            <ResizableHandle
              withHandle={shouldShowPanel}
              disabled={!shouldShowPanel}
              className={cn('z-20', shouldShowPanel ? 'w-0' : 'w-0 opacity-0')}
            />
          )}

          {/* Side panel (KortixComputer or Desktop iframe) */}
          <ResizablePanel
            ref={sidePanelRef}
            defaultSize={shouldShowPanel ? 50 : 0}
            minSize={shouldShowPanel ? (isExpanded ? 100 : 35) : 0}
            maxSize={shouldShowPanel ? (isExpanded ? 100 : 70) : 0}
            collapsible={!isExpanded}
            className={cn(
              'relative overflow-hidden',
              !shouldShowPanel && 'hidden',
            )}
          >
            <div className={cn(
              "h-full",
              isExpanded ? "p-0" : "pt-3 pb-5 pr-3 pl-1.5"
            )}>
              {showDesktop ? (
                <div className={cn("h-full flex flex-col bg-card overflow-hidden", isExpanded ? "rounded-none border-0" : "border rounded-3xl")}>
                  {/* Header inside the card */}
                  <div className="flex-shrink-0 h-11 flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
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
                    </div>
                    <div className="flex items-center gap-2">
                      <TopBarTabs
                        currentView={activeView}
                        onViewChange={handleViewChange}
                      />
                      <button
                        onClick={toggleExpanded}
                        className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={handleSidePanelClose}
                        className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <DesktopView serverUrl={serverUrl} />
                  </div>
                </div>
              ) : (
                <KortixComputer
                  isOpen={isSidePanelOpen && hasToolCalls}
                  onClose={handleSidePanelClose}
                  toolCalls={toolCalls}
                  messages={[]}
                  agentStatus={agentStatus}
                  currentIndex={currentToolIndex}
                  onNavigate={handleSidePanelNavigate}
                  externalNavigateToIndex={externalNavIndex}
                  renderAssistantMessage={renderAssistantMessage}
                  renderToolResult={renderToolResult}
                  isLoading={false}
                  agentName={agentName}
                  disableInitialAnimation={true}
                  sidePanelRef={sidePanelRef}
                  hideTopBar={true}
                  headerSlot={
                    <div className="flex-shrink-0 h-11 flex items-center justify-between px-4">
                      <div className="flex items-center gap-3">
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
                      </div>
                      <div className="flex items-center gap-2">
                        <TopBarTabs
                          currentView={activeView}
                          onViewChange={handleViewChange}
                        />
                        <button
                          onClick={toggleExpanded}
                          className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={handleSidePanelClose}
                          className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  }
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
});
