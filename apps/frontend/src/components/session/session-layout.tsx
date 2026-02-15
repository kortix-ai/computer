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
} from '@/stores/kortix-computer-store';
import {
  useOpenCodeMessages,
  useOpenCodeSession,
} from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useTabStore } from '@/stores/tab-store';
import {
  adaptMessagesToToolCalls,
  adaptAgentStatus,
} from '@/lib/adapters/opencode-to-kortix-computer';
import { X, Maximize2, Minimize2, Activity } from 'lucide-react';

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

  // Use individual selectors to avoid re-rendering on unrelated store changes
  // (e.g. currentSandboxId, files store resets). Destructuring the whole store
  // subscribes to ALL properties and causes unnecessary re-renders for every
  // open session tab.
  const isSidePanelOpen = useKortixComputerStore((s) => s.isSidePanelOpen);
  const setIsSidePanelOpen = useKortixComputerStore((s) => s.setIsSidePanelOpen);
  const setActiveSession = useKortixComputerStore((s) => s.setActiveSession);
  const shouldOpenPanel = useKortixComputerStore((s) => s.shouldOpenPanel);
  const clearShouldOpenPanel = useKortixComputerStore((s) => s.clearShouldOpenPanel);
  const isExpanded = useKortixComputerStore((s) => s.isExpanded);
  const toggleExpanded = useKortixComputerStore((s) => s.toggleExpanded);

  // Track active tab to restore per-session panel state on tab switch
  const activeTabId = useTabStore((s) => s.activeTabId);
  const isActiveTab = activeTabId === sessionId;

  useEffect(() => {
    if (isActiveTab) {
      setActiveSession(sessionId);
    }
  }, [isActiveTab, sessionId, setActiveSession]);

  const hasToolCalls = toolCalls.length > 0;

  // Auto-open the side panel the FIRST time tool calls appear for a session.
  // Uses a Set to track which sessions have already triggered auto-open,
  // preventing re-opens on query refetches (e.g. after reconnection) or
  // when the user has manually closed the panel.
  const autoOpenedSessionsRef = useRef(new Set<string>());

  useEffect(() => {
    if (
      hasToolCalls &&
      !isMobile &&
      !autoOpenedSessionsRef.current.has(sessionId)
    ) {
      autoOpenedSessionsRef.current.add(sessionId);
      setIsSidePanelOpen(true);
    }
  }, [hasToolCalls, isMobile, sessionId, setIsSidePanelOpen]);

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

  const mainPanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);
  const sidePanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);

  // Side panel shows for tool calls only now (terminal/desktop moved to right sidebar)
  const shouldShowPanel = isSidePanelOpen && hasToolCalls;

  // Imperatively resize panels when visibility, expand state, or session changes.
  // Including sessionId ensures panels are correctly sized after navigating
  // between sessions (e.g. fork → parent), since the ResizablePanelGroup may
  // retain stale sizes from the previous session's layout.
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
  }, [shouldShowPanel, isExpanded, sessionId]);

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
      </div>
    );
  }

  // Desktop: resizable split panel
  return (
    <div className="flex flex-col h-full overflow-hidden">
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

          {/* Side panel (KortixComputer — Actions only) */}
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
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-foreground/70" strokeWidth={2.5} />
                      <span className="text-sm font-medium text-foreground">Actions</span>
                    </div>
                    <div className="flex items-center gap-1">
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
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
});
