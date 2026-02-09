'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  Terminal,
  FileEdit,
  Check,
  AlertCircle,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  useOpenCodeSession,
  useOpenCodeMessages,
  useSendOpenCodeMessage,
  useAbortOpenCodeSession,
  useOpenCodeAgents,
  useOpenCodeCommands,
  useExecuteOpenCodeCommand,
  useSummarizeOpenCodeSession,
  useOpenCodeProviders,
} from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import type {
  OpenCodeMessageWithParts,
  OpenCodeMessagePart,
  OpenCodeCommand,
} from '@/lib/api/opencode';

import { SessionChatInput, flattenModels } from '@/components/session/session-chat-input';
import { SessionWelcome } from '@/components/session/session-welcome';

// ============================================================================
// Tool Part Component
// ============================================================================

const toolIcons: Record<string, React.ReactNode> = {
  bash: <Terminal className="size-3.5" />,
  write: <FileEdit className="size-3.5" />,
  edit: <FileEdit className="size-3.5" />,
};

function getToolIcon(type: string) {
  for (const [key, icon] of Object.entries(toolIcons)) {
    if (type.includes(key)) return icon;
  }
  return <Terminal className="size-3.5" />;
}

function ToolPartView({ part }: { part: OpenCodeMessagePart }) {
  const [open, setOpen] = useState(false);

  const title =
    (part.title as string) ||
    (part.tool as string) ||
    part.type;

  const output = (part.output as string) || (part.result as string) || '';
  const state = (part.state as string) || '';

  const statusIcon =
    state === 'completed' || state === 'complete' ? (
      <Check className="size-3.5 text-green-500" />
    ) : state === 'error' ? (
      <AlertCircle className="size-3.5 text-destructive" />
    ) : state === 'running' || state === 'pending' ? (
      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    ) : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex items-center gap-1.5 h-8 px-2 py-1.5 text-xs text-muted-foreground bg-card hover:bg-card/80 rounded-lg transition-colors cursor-pointer border border-neutral-200 dark:border-neutral-700/50 max-w-full">
        <ChevronRight
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        {getToolIcon(part.type)}
        <span className="truncate font-mono text-xs text-foreground">{title}</span>
        <span className="ml-auto">{statusIcon}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 mb-2 p-2 rounded-lg bg-muted/30 text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
          {output ? (
            <pre className="whitespace-pre-wrap text-muted-foreground">
              {output}
            </pre>
          ) : (
            <span className="text-muted-foreground/60 italic">
              {state === 'running' || state === 'pending'
                ? 'Running...'
                : 'No output'}
            </span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// User Message Row
// ============================================================================

function UserMessageRow({ message }: { message: OpenCodeMessageWithParts }) {
  const { parts } = message;

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[90%] rounded-3xl rounded-br-lg bg-card border px-4 py-3 break-words overflow-hidden">
        <div className="space-y-2 min-w-0 flex-1">
          {parts.map((part) =>
            part.type === 'text' && part.text ? (
              <p key={part.id} className="text-sm leading-relaxed whitespace-pre-wrap">
                {part.text}
              </p>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Thinking Section
// ============================================================================

function ThinkingSection({ content }: { content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        <span className="italic">Thinking...</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-5 p-3 rounded-lg bg-muted/40 border border-border/50 text-sm text-muted-foreground whitespace-pre-wrap max-h-[400px] overflow-y-auto">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Assistant Message Group
// ============================================================================

function AssistantGroupRow({
  message,
  isStreaming,
}: {
  message: OpenCodeMessageWithParts;
  isStreaming: boolean;
}) {
  const { parts } = message;

  return (
    <div>
      <div className="flex flex-col gap-2">
        {/* Agent header - Kortix logomark */}
        <div className="flex items-center">
          <img
            src="/kortix-logomark-white.svg"
            alt="Kortix"
            className="dark:invert-0 invert flex-shrink-0"
            style={{ height: '12px', width: 'auto' }}
          />
        </div>

        {/* Content area */}
        <div className="flex w-full break-words">
          <div className="space-y-1.5 min-w-0 flex-1">
            {parts.map((part) => {
              if (part.type === 'text' && part.text) {
                return (
                  <UnifiedMarkdown
                    key={part.id}
                    content={part.text}
                    isStreaming={isStreaming}
                  />
                );
              }
              if (
                part.type === 'tool-invocation' ||
                part.type === 'tool-result' ||
                part.type.includes('tool')
              ) {
                return <ToolPartView key={part.id} part={part} />;
              }
              if (part.type === 'reasoning' || part.type === 'thinking') {
                return (
                  <ThinkingSection key={part.id} content={part.text || ''} />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main SessionChat Component
// ============================================================================

interface SessionChatProps {
  sessionId: string;
}

export function SessionChat({ sessionId }: SessionChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const { data: session, isLoading: sessionLoading } = useOpenCodeSession(sessionId);
  const { data: messages, isLoading: messagesLoading } = useOpenCodeMessages(sessionId);
  const { data: agents } = useOpenCodeAgents();
  const { data: commands } = useOpenCodeCommands();
  const { data: providers } = useOpenCodeProviders();
  const sendMessage = useSendOpenCodeMessage();
  const abortSession = useAbortOpenCodeSession();
  const executeCommand = useExecuteOpenCodeCommand();
  const summarizeSession = useSummarizeOpenCodeSession();

  // --- Auto-send pending prompt for new sessions ---
  const searchParams = useSearchParams();
  const isNewSession = searchParams.get('new') === 'true';
  const pendingPromptHandled = useRef(false);

  const [optimisticPrompt, setOptimisticPrompt] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && isNewSession) {
      return sessionStorage.getItem('opencode_pending_prompt');
    }
    return null;
  });

  useEffect(() => {
    if (!isNewSession || pendingPromptHandled.current) return;
    const pendingPrompt = sessionStorage.getItem('opencode_pending_prompt');
    if (pendingPrompt) {
      pendingPromptHandled.current = true;
      sessionStorage.removeItem('opencode_pending_prompt');

      // Read agent/model/variant options stored by the dashboard
      let pendingOptions: Record<string, unknown> | undefined;
      try {
        const raw = sessionStorage.getItem('opencode_pending_options');
        if (raw) {
          pendingOptions = JSON.parse(raw);
          sessionStorage.removeItem('opencode_pending_options');
          // Apply selections to local state so the input reflects them
          if (pendingOptions?.agent) setSelectedAgent(pendingOptions.agent as string);
          if (pendingOptions?.model) setSelectedModel(pendingOptions.model as { providerID: string; modelID: string });
          if (pendingOptions?.variant) setSelectedVariant(pendingOptions.variant as string);
        }
      } catch {
        // ignore
      }

      sendMessage.mutate({
        sessionId,
        parts: [{ type: 'text', text: pendingPrompt }],
        options: pendingOptions && Object.keys(pendingOptions).length > 0 ? pendingOptions as any : undefined,
      });
      window.history.replaceState({}, '', `/sessions/${sessionId}`);
    }
  }, [isNewSession, sessionId, sendMessage]);

  useEffect(() => {
    if (optimisticPrompt && messages && messages.length > 0) {
      setOptimisticPrompt(null);
    }
  }, [optimisticPrompt, messages]);

  // Filter agents: exclude subagents and hidden
  const visibleAgents = useMemo(
    () => (agents || []).filter((a) => a.mode !== 'subagent' && !a.hidden),
    [agents],
  );

  // Flatten models from connected providers
  const flatModels = useMemo(() => flattenModels(providers), [providers]);

  // Compute variants for the selected model
  const currentVariants = useMemo(() => {
    if (!selectedModel) {
      const first = flatModels[0];
      return first?.variants ? Object.keys(first.variants) : [];
    }
    const model = flatModels.find(
      (m) => m.providerID === selectedModel.providerID && m.modelID === selectedModel.modelID,
    );
    return model?.variants ? Object.keys(model.variants) : [];
  }, [selectedModel, flatModels]);

  const sessionStatus = useOpenCodeSessionStatusStore(
    (s) => s.statuses[sessionId],
  );
  const isBusy = sessionStatus?.type === 'busy';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollButton(!atBottom);
  }

  function scrollToBottom() {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }

  const handleSend = useCallback(
    (text: string) => {
      const options: Record<string, unknown> = {};
      if (selectedAgent) options.agent = selectedAgent;
      if (selectedModel) options.model = selectedModel;
      if (selectedVariant) options.variant = selectedVariant;
      sendMessage.mutate({
        sessionId,
        parts: [{ type: 'text', text }],
        options: Object.keys(options).length > 0 ? options as any : undefined,
      });
    },
    [sessionId, sendMessage, selectedAgent, selectedModel, selectedVariant],
  );

  const handleStop = useCallback(() => {
    abortSession.mutate(sessionId);
  }, [sessionId, abortSession]);

  const handleCommand = useCallback(
    (cmd: OpenCodeCommand) => {
      if (cmd.name === 'compact') {
        summarizeSession.mutate(sessionId);
      } else {
        executeCommand.mutate({ sessionId, command: cmd.name });
      }
    },
    [sessionId, executeCommand, summarizeSession],
  );

  // Don't show loading spinner if we have an optimistic prompt to show
  if ((sessionLoading || messagesLoading) && !optimisticPrompt) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <KortixLoader size="small" />
      </div>
    );
  }

  if (!session && !optimisticPrompt) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Session not found
      </div>
    );
  }

  const hasMessages = messages && messages.length > 0;
  const showOptimistic = !!optimisticPrompt && !hasMessages;

  // Determine if last assistant message is still streaming
  const lastMessage = messages?.[messages.length - 1];
  const isLastMessageStreaming =
    isBusy && lastMessage?.info.role === 'assistant';

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Messages, Optimistic Prompt, or Empty State */}
      {hasMessages || showOptimistic ? (
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 pb-6 bg-background h-full"
          >
            <div className="mx-auto max-w-3xl min-w-0 w-full px-3 sm:px-6">
              <div className="space-y-6 min-w-0">
                {/* Optimistic user message when real messages haven't loaded yet */}
                {showOptimistic && (
                  <>
                    <div className="flex justify-end">
                      <div className="flex max-w-[90%] rounded-3xl rounded-br-lg bg-card border px-4 py-3 break-words overflow-hidden">
                        <div className="space-y-2 min-w-0 flex-1">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {optimisticPrompt}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Loading indicator */}
                    <div className="w-full rounded mt-6">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <img
                            src="/kortix-logomark-white.svg"
                            alt="Kortix"
                            className="dark:invert-0 invert flex-shrink-0 animate-pulse"
                            style={{ height: '14px', width: 'auto' }}
                          />
                          <div className="flex items-center gap-1.5 py-1">
                            <KortixLoader size="small" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {hasMessages && messages.map((msg, i) => {
                  if (msg.info.role === 'user') {
                    return <UserMessageRow key={msg.info.id} message={msg} />;
                  }
                  return (
                    <AssistantGroupRow
                      key={msg.info.id}
                      message={msg}
                      isStreaming={isLastMessageStreaming && i === messages.length - 1}
                    />
                  );
                })}

                {/* Busy indicator when waiting for first assistant chunk */}
                {!showOptimistic && isBusy && lastMessage?.info.role === 'user' && (
                  <div className="w-full rounded mt-6">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <img
                          src="/kortix-logomark-white.svg"
                          alt="Kortix"
                          className="dark:invert-0 invert flex-shrink-0 animate-pulse"
                          style={{ height: '14px', width: 'auto' }}
                        />
                        <div className="flex items-center gap-1.5 py-1">
                          <KortixLoader size="small" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scroll to bottom */}
          <div
            className={cn(
              'absolute bottom-4 left-1/2 -translate-x-1/2 transition-all',
              showScrollButton
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2 pointer-events-none',
            )}
          >
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full shadow-md h-7 text-xs"
              onClick={scrollToBottom}
            >
              <ArrowDown className="size-3 mr-1" />
              Scroll to bottom
            </Button>
          </div>
        </div>
      ) : (
        <SessionWelcome showPrompts onPromptSelect={handleSend} />
      )}

      {/* Input */}
      <SessionChatInput
        onSend={handleSend}
        isBusy={isBusy}
        onStop={handleStop}
        agents={visibleAgents}
        selectedAgent={selectedAgent}
        onAgentChange={setSelectedAgent}
        commands={commands || []}
        onCommand={handleCommand}
        models={flatModels}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        variants={currentVariants}
        selectedVariant={selectedVariant}
        onVariantChange={setSelectedVariant}
        messages={messages}
      />
    </div>
  );
}
