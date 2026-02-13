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
import {
  adaptMessagesToToolCalls,
  adaptAgentStatus,
} from '@/lib/adapters/opencode-to-kortix-computer';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import Image from 'next/image';

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
    isExpanded,
    toggleExpanded,
  } = useKortixComputerStore();

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

  const mainPanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);
  const sidePanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);

  // Side panel shows for tool calls only now (terminal/desktop moved to right sidebar)
  const shouldShowPanel = isSidePanelOpen && hasToolCalls;

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
