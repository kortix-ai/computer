'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  ArrowDown,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Bug,
  FileText,
  Image as ImageIcon,
  ArrowUpLeft,
  Info,
  GitFork,
  Layers,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { SandboxUrlDetector } from '@/components/thread/content/sandbox-url-detector';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useOpenCodeSession,
  useOpenCodeMessages,
  useSendOpenCodeMessage,
  useAbortOpenCodeSession,
  useOpenCodeAgents,
  useOpenCodeCommands,
  useExecuteOpenCodeCommand,
  useOpenCodeProviders,
  useForkSession,
  useRevertSession,
  useUnrevertSession,
  useSessionBusyPolling,
  replyToPermission,
  replyToQuestion,
  rejectQuestion,
  findOpenCodeFiles,
} from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useThrottledValue } from '@/hooks/use-throttled-value';
import { SessionSiteHeader } from '@/components/session/session-site-header';

// Shared UI primitives (framework-agnostic, reusable on mobile)
import {
  type MessageWithParts,
  type Turn,
  type Command,
  type Part,
  type TextPart,
  type ToolPart,
  type FilePart,
  type AgentPart,
  type PermissionRequest,
  type QuestionRequest,
  type RetryInfo,
  type TurnCostInfo,
  type PartWithMessage,
  isTextPart,
  isToolPart,
  isReasoningPart,
  isFilePart,
  isAgentPart,
  isCompactionPart,
  isAttachment,
  splitUserParts,
  groupMessagesIntoTurns,
  collectTurnParts,
  findLastTextPart,
  turnHasSteps,
  isShellMode,
  getShellModePart,
  isLastUserMessage,
  getWorkingState,
  shouldHideResponsePart,
  getHiddenToolParts,
  isToolPartHidden,
  getAnsweredQuestionParts,
  unwrapError,
  getTurnStatus,
  getTurnError,
  getTurnCost,
  getRetryInfo,
  getPermissionForTool,
  getQuestionForTool,
  formatDuration,
  formatCost,
  formatTokens,
  shouldShowToolPart,
  hasDiffs,
} from '@/ui';

import { SessionChatInput, type AttachedFile } from '@/components/session/session-chat-input';
import { uploadFile } from '@/features/files/api/opencode-files';
import { useOpenCodeLocal } from '@/hooks/opencode/use-opencode-local';
import { useOpenCodeConfig } from '@/hooks/opencode/use-opencode-config';
import { SessionWelcome } from '@/components/session/session-welcome';
import { ToolPartRenderer } from '@/components/session/tool-renderers';
import { QuestionPrompt } from '@/components/session/question-prompt';
import { ImagePreview } from '@/components/session/image-preview';
import { RevertBanner, ConfirmDialog } from '@/components/session/message-actions';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/lib/api/billing';
import { invalidateAccountState } from '@/hooks/billing/use-account-state';

// ============================================================================
// Sub-Session / Fork Breadcrumb
// ============================================================================

function SubSessionBar({
  sessionId,
  parentID,
  variant = 'thread',
}: {
  sessionId: string;
  parentID: string;
  /** 'thread' for task sub-sessions, 'fork' for forked sessions */
  variant?: 'thread' | 'fork';
}) {
  const { data: parentSession } = useOpenCodeSession(parentID);
  const router = useRouter();

  const handleBackToParent = useCallback(() => {
    if (parentSession) {
      router.push(`/sessions/${parentSession.id}`);
    }
  }, [parentSession, router]);

  const parentTitle = parentSession?.title || 'Parent session';
  const isFork = variant === 'fork';

  return (
    <div className="flex-shrink-0">
      {/* Thin accent stripe */}
      <div
        className={cn(
          'h-[2px] bg-gradient-to-r',
          isFork
            ? 'from-muted-foreground/30 via-muted-foreground/20 to-muted-foreground/10'
            : 'from-indigo-500/80 via-violet-500/80 to-purple-500/60',
        )}
      />
      {/* Bar */}
      <div className="flex items-center h-10 px-3 gap-2 border-b border-border/50 bg-background">
        <button
          onClick={handleBackToParent}
          className={cn(
            'flex items-center gap-1.5 h-7 px-2 rounded-md',
            'text-xs text-muted-foreground hover:text-foreground',
            'hover:bg-muted/60 active:bg-muted/80',
            'transition-colors cursor-pointer group',
          )}
        >
          <ArrowUpLeft className="size-3.5 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          <span className="max-w-[200px] truncate">{parentTitle}</span>
        </button>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-muted/50">
              {isFork ? (
                <GitFork className="size-3 text-muted-foreground flex-shrink-0" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 flex-shrink-0" />
              )}
              <span className="text-[11px] font-medium text-muted-foreground">
                {isFork ? 'Fork' : 'Thread'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isFork ? `Forked from: ${parentTitle}` : `Sub-session of: ${parentTitle}`}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// Sub-session indicator shown above the chat input
function SubSessionInputBanner({ parentID, variant = 'thread' }: { parentID: string; variant?: 'thread' | 'fork' }) {
  const { data: parentSession } = useOpenCodeSession(parentID);
  const router = useRouter();
  const isForkVariant = variant === 'fork';

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border/40 bg-muted/20">
      {isForkVariant ? (
        <GitFork className="size-3 text-muted-foreground/60 flex-shrink-0" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500/70 flex-shrink-0" />
      )}
      <span className="text-[11px] text-muted-foreground truncate">
        {isForkVariant ? 'Continuing in fork' : 'Replying in thread'}
      </span>
      <button
        onClick={() => parentSession && router.push(`/sessions/${parentSession.id}`)}
        className="text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors ml-auto flex items-center gap-1 cursor-pointer"
      >
        <ArrowUpLeft className="size-3" />
        <span className="truncate max-w-[150px]">{parentSession?.title || 'Back'}</span>
      </button>
    </div>
  );
}

// ============================================================================
// Fork Context Divider — shown at the top of the message list in forked sessions
// ============================================================================

function ForkContextDivider({ parentID }: { parentID: string }) {
  const { data: parentSession } = useOpenCodeSession(parentID);
  const router = useRouter();
  const parentTitle = parentSession?.title || 'Parent session';

  return (
    <div className="flex items-center gap-3 py-2 mb-2">
      <div className="flex-1 h-px bg-border/50" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => parentSession && router.push(`/sessions/${parentSession.id}`)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/40 hover:bg-muted/80 transition-colors cursor-pointer"
          >
            <GitFork className="size-3 text-muted-foreground/60" />
            <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Forked from
            </span>
            <span className="text-[10px] font-medium text-muted-foreground max-w-[150px] truncate">
              {parentTitle}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Go to parent session: {parentTitle}
        </TooltipContent>
      </Tooltip>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// ============================================================================
// Debug JSON View
// ============================================================================

function DebugView({ messages }: { messages: MessageWithParts[] | undefined }) {
  if (!messages) return <p className="text-xs text-muted-foreground p-4">No messages loaded.</p>;

  return (
    <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed bg-black/5 dark:bg-white/5">
      {messages.map((msg) => (
        <details key={msg.info.id} className="mb-3 border border-border/40 rounded-lg overflow-hidden">
          <summary className="px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors flex items-center gap-2">
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
              msg.info.role === 'user' ? 'bg-blue-500/20 text-blue-500' : 'bg-emerald-500/20 text-emerald-500',
            )}>
              {msg.info.role}
            </span>
            <span className="text-muted-foreground truncate">{msg.info.id}</span>
            <span className="ml-auto text-muted-foreground/60">{msg.parts.length} parts</span>
          </summary>
          <div className="px-3 py-2 space-y-2">
            {/* Message info */}
            <details className="group">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">info</summary>
              <pre className="mt-1 p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(msg.info, null, 2)}
              </pre>
            </details>
            {/* Parts */}
            {msg.parts.map((part) => (
              <details key={part.id} className="group">
                <summary className="cursor-pointer hover:text-foreground flex items-center gap-2">
                  <span className={cn(
                    'px-1 py-0.5 rounded text-[9px] font-bold uppercase',
                    part.type === 'text' ? 'bg-violet-500/20 text-violet-500' :
                    part.type === 'tool' ? 'bg-orange-500/20 text-orange-500' :
                    part.type === 'reasoning' ? 'bg-pink-500/20 text-pink-500' :
                    'bg-gray-500/20 text-gray-500',
                  )}>
                    {part.type}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {part.type === 'tool' ? (part as ToolPart).tool : ''}
                    {part.type === 'text' ? ((part as TextPart).text?.slice(0, 60) + '...') : ''}
                  </span>
                  <span className="ml-auto text-muted-foreground/50">{part.id}</span>
                </summary>
                <pre className="mt-1 p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(part, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

// ============================================================================
// Highlight @mentions in plain text (for optimistic & user messages)
// ============================================================================

function HighlightMentions({ text, agentNames, onFileClick }: { text: string; agentNames?: string[]; onFileClick?: (path: string) => void }) {
  const segments = useMemo(() => {
    if (!text) return [{ text, type: undefined as 'file' | 'agent' | undefined }];
    const agentSet = new Set(agentNames || []);
    const mentionRegex = /@(\S+)/g;
    const detected: { start: number; end: number; type: 'file' | 'agent' }[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      const name = match[1];
      const type = agentSet.has(name) ? 'agent' as const : 'file' as const;
      detected.push({ start: match.index, end: match.index + match[0].length, type });
    }
    if (detected.length === 0) return [{ text, type: undefined as 'file' | 'agent' | undefined }];
    const result: { text: string; type?: 'file' | 'agent' }[] = [];
    let lastIndex = 0;
    for (const ref of detected) {
      if (ref.start < lastIndex) continue;
      if (ref.start > lastIndex) result.push({ text: text.slice(lastIndex, ref.start) });
      result.push({ text: text.slice(ref.start, ref.end), type: ref.type });
      lastIndex = ref.end;
    }
    if (lastIndex < text.length) result.push({ text: text.slice(lastIndex) });
    return result;
  }, [text, agentNames]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'file' && onFileClick ? (
          <span
            key={i}
            className="text-blue-500 font-medium cursor-pointer hover:underline"
            onClick={(e) => { e.stopPropagation(); onFileClick(seg.text.replace(/^@/, '')); }}
          >
            {seg.text}
          </span>
        ) : (
          <span
            key={i}
            className={cn(
              seg.type === 'file' && 'text-blue-500 font-medium',
              seg.type === 'agent' && 'text-purple-500 font-medium',
            )}
          >
            {seg.text}
          </span>
        ),
      )}
    </>
  );
}

// ============================================================================
// Parse <file> XML references from uploaded file text parts
// ============================================================================

interface ParsedFileRef {
  path: string;
  mime: string;
  filename: string;
}

const FILE_TAG_REGEX = /<file\s+path="([^"]*?)"\s+mime="([^"]*?)"\s+filename="([^"]*?)">\s*[\s\S]*?<\/file>/g;

function parseFileReferences(text: string): { cleanText: string; files: ParsedFileRef[] } {
  const files: ParsedFileRef[] = [];
  const cleanText = text.replace(FILE_TAG_REGEX, (_, path, mime, filename) => {
    files.push({ path, mime, filename });
    return '';
  }).trim();
  return { cleanText, files };
}

// ============================================================================
// User Message Row
// ============================================================================

function UserMessageRow({ message, agentNames }: { message: MessageWithParts; agentNames?: string[] }) {
  const openFileInComputer = useKortixComputerStore((s) => s.openFileInComputer);
  const { attachments, stickyParts } = useMemo(
    () => splitUserParts(message.parts),
    [message.parts],
  );

  // Extract text from sticky parts, parse out <file> XML references
  const textParts = stickyParts.filter(isTextPart).filter((p) => (p as TextPart).text?.trim() && !(p as TextPart).synthetic);
  const rawText = textParts.map((p) => (p as TextPart).text).join('\n');
  const { cleanText: text, files: uploadedFiles } = useMemo(() => parseFileReferences(rawText), [rawText]);

  // Inline file references
  const inlineFiles = stickyParts.filter(isFilePart) as FilePart[];
  const filesWithSource = inlineFiles.filter(
    (f) => f.source?.text?.start !== undefined && f.source?.text?.end !== undefined,
  );

  // Agent mentions
  const agentParts = stickyParts.filter(isAgentPart) as AgentPart[];

  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setCanExpand(el.scrollHeight > el.clientHeight + 2);
  }, [text, expanded]);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build highlighted text segments
  const segments = useMemo(() => {
    if (!text) return [];
    const refs = [
      ...filesWithSource.map((f) => ({
        start: f.source!.text!.start,
        end: f.source!.text!.end,
        type: 'file' as const,
      })),
      ...agentParts
        .filter((a) => a.source?.start !== undefined && a.source?.end !== undefined)
        .map((a) => ({
          start: a.source!.start,
          end: a.source!.end,
          type: 'agent' as const,
        })),
    ].sort((a, b) => a.start - b.start);

    // If server provided source-based refs, use them
    if (refs.length > 0) {
      const result: { text: string; type?: 'file' | 'agent' }[] = [];
      let lastIndex = 0;
      for (const ref of refs) {
        if (ref.start < lastIndex) continue;
        if (ref.start > lastIndex) result.push({ text: text.slice(lastIndex, ref.start) });
        result.push({ text: text.slice(ref.start, ref.end), type: ref.type });
        lastIndex = ref.end;
      }
      if (lastIndex < text.length) result.push({ text: text.slice(lastIndex) });
      return result;
    }

    // Fallback: detect @mentions from text using regex
    const agentSet = new Set(agentNames || []);
    const mentionRegex = /@(\S+)/g;
    const detected: { start: number; end: number; type: 'file' | 'agent' }[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      const name = match[1];
      const type = agentSet.has(name) ? 'agent' as const : 'file' as const;
      detected.push({ start: match.index, end: match.index + match[0].length, type });
    }

    if (detected.length === 0) return [{ text, type: undefined }];

    // Sort by start, prefer longer match on tie
    detected.sort((a, b) => a.start - b.start || b.end - a.end);
    const result: { text: string; type?: 'file' | 'agent' }[] = [];
    let lastIndex = 0;
    for (const ref of detected) {
      if (ref.start < lastIndex) continue;
      if (ref.start > lastIndex) result.push({ text: text.slice(lastIndex, ref.start) });
      result.push({ text: text.slice(ref.start, ref.end), type: ref.type });
      lastIndex = ref.end;
    }
    if (lastIndex < text.length) result.push({ text: text.slice(lastIndex) });
    return result;
  }, [text, filesWithSource, agentParts, agentNames]);

  return (
    <div className="flex justify-end">
      <div
        className={cn(
          'flex flex-col max-w-[90%] rounded-3xl rounded-br-lg bg-card border overflow-hidden',
          canExpand && 'cursor-pointer hover:bg-card/80 transition-colors',
        )}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        {/* Attachment thumbnails (images/PDFs) */}
        {attachments.length > 0 && (
          <div className="flex gap-2 p-3 pb-0 flex-wrap">
            {attachments.map((file) => (
              <div key={file.id} className="rounded-lg overflow-hidden border border-border/50">
                {file.mime?.startsWith('image/') && file.url ? (
                  <ImagePreview src={file.url} alt={file.filename ?? 'Attachment'}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.url}
                      alt={file.filename ?? 'Attachment'}
                      className="max-h-32 max-w-48 object-cover"
                    />
                  </ImagePreview>
                ) : file.mime === 'application/pdf' ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{file.filename || 'PDF'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                    <ImageIcon className="size-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{file.filename || 'File'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Uploaded file references (from <file> XML tags) */}
        {uploadedFiles.length > 0 && (
          <div className="flex gap-2 p-3 pb-0 flex-wrap">
            {uploadedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30">
                <FileText className="size-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{f.filename}</span>
              </div>
            ))}
          </div>
        )}

        {/* Text content */}
        {text && (
          <div className="relative group px-4 py-3">
            <div
              ref={textRef}
              className={cn(
                'text-sm leading-relaxed whitespace-pre-wrap break-words min-w-0',
                !expanded && 'max-h-[200px] overflow-hidden',
              )}
            >
              {segments.length > 0 ? (
                segments.map((seg, i) =>
                  seg.type === 'file' ? (
                    <span
                      key={i}
                      className="text-blue-500 font-medium cursor-pointer hover:underline"
                      onClick={(e) => { e.stopPropagation(); openFileInComputer(seg.text.replace(/^@/, '')); }}
                    >
                      {seg.text}
                    </span>
                  ) : (
                    <span
                      key={i}
                      className={cn(
                        seg.type === 'agent' && 'text-purple-500 font-medium',
                      )}
                    >
                      {seg.text}
                    </span>
                  ),
                )
              ) : (
                <span>{text}</span>
              )}
            </div>

            {/* Gradient fade overlay for collapsed long messages */}
            {canExpand && !expanded && (
              <div className="absolute inset-x-0 bottom-3 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none" />
            )}

            {/* Expand/collapse indicator */}
            {canExpand && (
              <div className="absolute bottom-3 right-4 p-1 rounded-md bg-card/80 backdrop-blur-sm text-muted-foreground z-10">
                <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Throttled Markdown — limits re-renders during streaming (100ms)
// ============================================================================

function ThrottledMarkdown({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const throttled = useThrottledValue(content, 100);
  return <UnifiedMarkdown content={isStreaming ? throttled : content} isStreaming={isStreaming} />;
}

// ============================================================================
// Session Turn — core turn component
// ============================================================================

interface SessionTurnProps {
  turn: Turn;
  allMessages: MessageWithParts[];
  sessionId: string;
  sessionStatus: import('@/ui').SessionStatus | undefined;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  stepsExpanded: boolean;
  onToggleSteps: () => void;
  onPermissionReply: (requestId: string, reply: 'once' | 'always' | 'reject') => Promise<void>;
  onQuestionReply: (requestId: string, answers: string[][]) => Promise<void>;
  onQuestionReject: (requestId: string) => Promise<void>;
  agentNames?: string[];
  /** Whether this is the first turn in the session */
  isFirstTurn: boolean;
  /** Whether the session is busy */
  isBusy: boolean;
  /** Whether the session is in a reverted state */
  isReverted: boolean;
  /** Whether this turn contains a compaction */
  isCompaction?: boolean;
  /** Fork the session at a specific message */
  onFork: (messageId: string) => Promise<void>;
  /** Revert the session to before a specific message */
  onRevert: (messageId: string) => Promise<void>;
}

function SessionTurn({
  turn,
  allMessages,
  sessionId,
  sessionStatus,
  permissions,
  questions,
  stepsExpanded,
  onToggleSteps,
  onPermissionReply,
  onQuestionReply,
  onQuestionReject,
  agentNames,
  isFirstTurn,
  isBusy,
  isReverted,
  isCompaction,
  onFork,
  onRevert,
}: SessionTurnProps) {
  const [copied, setCopied] = useState(false);
  const [userCopied, setUserCopied] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);

  // Derived state from shared helpers
  const allParts = useMemo(() => collectTurnParts(turn), [turn]);
  const isLast = useMemo(
    () => isLastUserMessage(turn.userMessage.info.id, allMessages),
    [turn.userMessage.info.id, allMessages],
  );
  const working = useMemo(
    () => getWorkingState(sessionStatus, isLast),
    [sessionStatus, isLast],
  );
  const hasSteps = useMemo(() => turnHasSteps(allParts), [allParts]);
  const lastTodoWritePart = useMemo(() => {
    for (let i = allParts.length - 1; i >= 0; i--) {
      const p = allParts[i].part;
      if (isToolPart(p) && p.tool === 'todowrite') return p as ToolPart;
    }
    return undefined;
  }, [allParts]);
  const lastTextPart = useMemo(() => findLastTextPart(allParts), [allParts]);
  const responsePartId = lastTextPart?.id;
  const response = lastTextPart?.text?.trim();
  const hideResponse = useMemo(
    () => shouldHideResponsePart(working, responsePartId),
    [working, responsePartId],
  );

  // Retry info (only on last turn)
  const retryInfo = useMemo(
    () => (isLast ? getRetryInfo(sessionStatus) : undefined),
    [sessionStatus, isLast],
  );

  // Cost info (only when not working)
  const costInfo = useMemo(
    () => (!working ? getTurnCost(allParts) : undefined),
    [allParts, working],
  );

  // Turn error
  const turnError = useMemo(() => getTurnError(turn), [turn]);

  // Shell mode detection
  const shellModePart = useMemo(() => getShellModePart(turn), [turn]);

  // Permission/question matching for this session
  const nextPermission = useMemo(
    () => permissions.filter((p) => p.sessionID === sessionId)[0],
    [permissions, sessionId],
  );
  const nextQuestion = useMemo(
    () => questions.filter((q) => q.sessionID === sessionId)[0],
    [questions, sessionId],
  );

  // Hidden tool parts (when permission/question is active)
  const hidden = useMemo(
    () => getHiddenToolParts(nextPermission, nextQuestion),
    [nextPermission, nextQuestion],
  );

  // Answered question parts (shown outside collapsed steps)
  const answeredQuestionParts = useMemo(
    () => getAnsweredQuestionParts(turn, stepsExpanded, !!nextQuestion),
    [turn, stepsExpanded, nextQuestion],
  );

  // Task/subsession parts (always visible outside collapsed steps)
  const taskToolParts = useMemo(() => {
    return allParts.filter(({ part }) => isToolPart(part) && (part as ToolPart).tool === 'task');
  }, [allParts]);

  // Last assistant message ID — used for "fork from response" action
  const lastAssistantMessageId = useMemo(() => {
    const msgs = turn.assistantMessages;
    return msgs.length > 0 ? msgs[msgs.length - 1].info.id : undefined;
  }, [turn.assistantMessages]);

  // User message text — for copy action
  const userMessageText = useMemo(() => {
    const textParts = turn.userMessage.parts.filter(isTextPart) as TextPart[];
    return textParts.map((p) => p.text).join('\n').trim();
  }, [turn.userMessage.parts]);

  const handleCopyUser = async () => {
    if (!userMessageText) return;
    await navigator.clipboard.writeText(userMessageText);
    setUserCopied(true);
    setTimeout(() => setUserCopied(false), 2000);
  };

  // ---- Status throttling (2.5s) ----
  const lastStatusChangeRef = useRef(Date.now());
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const childMessages = undefined as MessageWithParts[] | undefined; // placeholder for child session delegation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rawStatus = useMemo(() => getTurnStatus(allParts, childMessages), [allParts]);
  const [throttledStatus, setThrottledStatus] = useState('');

  useEffect(() => {
    const newStatus = rawStatus;
    if (newStatus === throttledStatus || !newStatus) return;
    const elapsed = Date.now() - lastStatusChangeRef.current;
    if (elapsed >= 2500) {
      setThrottledStatus(newStatus);
      lastStatusChangeRef.current = Date.now();
    } else {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
        setThrottledStatus(getTurnStatus(allParts, childMessages));
        lastStatusChangeRef.current = Date.now();
      }, 2500 - elapsed);
    }
    return () => clearTimeout(statusTimeoutRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allParts, rawStatus, throttledStatus]);

  // ---- Retry countdown ----
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);
  useEffect(() => {
    if (!retryInfo) { setRetrySecondsLeft(0); return; }
    const update = () => setRetrySecondsLeft(Math.max(0, Math.round((retryInfo.next - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryInfo]);

  // ---- Duration ticking ----
  const [duration, setDuration] = useState('');
  useEffect(() => {
    if (!working) {
      const startTime = turn.userMessage.info.time.created;
      const lastMsg = turn.assistantMessages[turn.assistantMessages.length - 1];
      const endTime = (lastMsg?.info as any)?.time?.completed || (lastMsg?.info as any)?.time?.created || startTime;
      setDuration(formatDuration(endTime - startTime));
      return;
    }
    const startTime = turn.userMessage.info.time.created;
    const update = () => setDuration(formatDuration(Date.now() - startTime));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [working, turn]);

  // ---- Copy response ----
  const handleCopy = async () => {
    if (!response) return;
    await navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Attachment images from user message
  const { attachments } = useMemo(
    () => splitUserParts(turn.userMessage.parts),
    [turn.userMessage.parts],
  );

  // ============================================================================
  // Shell mode — short-circuit rendering
  // ============================================================================

  if (shellModePart) {
    return (
      <div className="space-y-1">
         <ToolPartRenderer
          part={shellModePart}
          sessionId={sessionId}
          permission={nextPermission?.tool ? nextPermission : undefined}
          question={nextQuestion?.tool ? nextQuestion : undefined}
          onPermissionReply={onPermissionReply}
          onQuestionReply={onQuestionReply}
          onQuestionReject={onQuestionReject}
          defaultOpen
        />
        {turnError && (
          <div className="flex items-start gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground">
            <Info className="size-3 flex-shrink-0 mt-0.5" />
            <span className="break-all">{turnError}</span>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Compaction mode — render as a distinct card, no user bubble / logo / steps
  // ============================================================================

  if (isCompaction && !working && response) {
    return (
      <div className="group/turn">
        <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/40">
            <Layers className="size-3.5 text-muted-foreground/70" />
            <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              Compaction
            </span>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground/90 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground/90">
            <SandboxUrlDetector content={response} isStreaming={false} />
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Normal mode rendering
  // ============================================================================

  return (
    <div className="space-y-3 group/turn">
      <div>
        {/* User message */}
        <UserMessageRow message={turn.userMessage} agentNames={agentNames} />
        {/* User message actions */}
        {userMessageText && (
          <div className="flex justify-end mt-1 opacity-0 group-hover/turn:opacity-100 transition-opacity duration-150">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopyUser}
                  className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  {userCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{userCopied ? 'Copied!' : 'Copy'}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Kortix logo header */}
      {(working || hasSteps) && (
        <div className="flex items-center gap-2 mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kortix-logomark-white.svg"
            alt="Kortix"
            className={cn('dark:invert-0 invert flex-shrink-0', working && 'animate-pulse')}
            style={{ height: '14px', width: 'auto' }}
          />
          {working && turn.assistantMessages.length === 0 && (
            <KortixLoader size="small" />
          )}
        </div>
      )}

      {/* Steps trigger button */}
      {(working || hasSteps) && (
        <button
          onClick={onToggleSteps}
          aria-expanded={stepsExpanded}
          className={cn(
            'flex items-center gap-2 text-xs transition-colors py-1.5 cursor-pointer',
            working
              ? 'text-muted-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {working ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-muted-foreground/30" />
                <span className="relative inline-flex rounded-full size-3 bg-muted-foreground/50" />
              </span>
            </span>
          ) : (
            <ChevronRight
              className={cn(
                'size-3 transition-transform flex-shrink-0',
                stepsExpanded && 'rotate-90',
              )}
            />
          )}

          {/* Status text / retry info / show-hide label */}
          <span>
            {retryInfo
              ? retryInfo.message.length > 60
                ? retryInfo.message.slice(0, 60) + '...'
                : retryInfo.message
              : working
                ? (throttledStatus || 'Working...')
                : stepsExpanded
                  ? 'Hide steps'
                  : 'Show steps'}
          </span>

          {/* Retry countdown + attempt */}
          {retryInfo && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-amber-500">
                Retrying{retrySecondsLeft > 0 ? ` in ${retrySecondsLeft}s` : ''}
              </span>
              <span className="text-muted-foreground/50">(#{retryInfo.attempt})</span>
            </>
          )}

          {/* Duration */}
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground/70">{duration}</span>

          {/* Cost & tokens (when done) */}
          {costInfo && !working && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground/70">{formatCost(costInfo.cost)}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground/70">
                {formatTokens(costInfo.tokens.input + costInfo.tokens.output)}t
              </span>
            </>
          )}
        </button>
      )}

      {/* Expanded steps content — indented with left border (matching OpenCode SolidJS) */}
      {(working || hasSteps) && stepsExpanded && turn.assistantMessages.length > 0 && (
        <div className="ml-3 pl-3 border-l border-border/60 space-y-3">
          {allParts.map(({ part, message }) => {
            // Skip the response text part (shown separately below)
            if (hideResponse && part.id === responsePartId) return null;

            // Reasoning — hidden when turn is done
            if (isReasoningPart(part)) {
              if (!working) return null;
              if (!part.text?.trim()) return null;
              return (
                <div key={part.id} className="text-sm text-muted-foreground italic">
                  <ThrottledMarkdown content={part.text} isStreaming={true} />
                </div>
              );
            }

            // Text parts — render as markdown with sandbox URL detection
            if (isTextPart(part) && part.text?.trim()) {
              const isStreamingText = working && part.id === lastTextPart?.id;
              return (
                <div key={part.id} className="text-sm">
                  {isStreamingText ? (
                    <ThrottledMarkdown content={part.text} isStreaming={true} />
                  ) : (
                    <SandboxUrlDetector content={part.text} isStreaming={false} />
                  )}
                </div>
              );
            }

            // Compaction indicator
            if (isCompactionPart(part)) {
              return (
                <div key={part.id} className="flex items-center gap-2 py-2.5 -mx-1">
                  <div className="flex-1 h-px bg-border" />
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/80 border border-border/60">
                    <Layers className="size-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground tracking-wide">
                      Compaction
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>
              );
            }

            // Tool parts
            if (isToolPart(part)) {
              if (!shouldShowToolPart(part)) return null;
              // Skip all todowrite parts — rendered as a single stable component below
              if (part.tool === 'todowrite') return null;
              // Skip task parts — rendered always-visible outside collapsed steps
              if (part.tool === 'task') return null;

              const perm = getPermissionForTool(permissions, part.callID);
              const question = getQuestionForTool(questions, part.callID);

              // Hide tool parts that have active permission (but NOT questions — we show them with overlay)
              if (!question && isToolPartHidden(part, message.info.id, hidden)) return null;

              return (
                <ToolPartRenderer
                  key={part.id}
                  part={part}
                  sessionId={sessionId}
                  permission={perm}
                  question={question}
                  onPermissionReply={onPermissionReply}
                  onQuestionReply={onQuestionReply}
                  onQuestionReject={onQuestionReject}
                />
              );
            }

            return null;
          })}

          {/* Stable TodoWrite — single instance with stable key to prevent remount flickering */}
          {lastTodoWritePart && (
            <ToolPartRenderer
              key="todowrite-stable"
              part={lastTodoWritePart}
              sessionId={sessionId}
              onPermissionReply={onPermissionReply}
              onQuestionReply={onQuestionReply}
              onQuestionReject={onQuestionReject}
            />
          )}

          {/* Error at bottom of steps */}
          {turnError && (
            <div className="flex items-start gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground">
              <Info className="size-3 flex-shrink-0 mt-0.5" />
              <span className="break-all">{turnError}</span>
            </div>
          )}
        </div>
      )}

      {/* Always-visible: Subsession/task cards */}
      {taskToolParts.length > 0 && (
        <div className="space-y-2">
          {taskToolParts.map(({ part, message }) => {
            const toolPart = part as ToolPart;
            if (!shouldShowToolPart(toolPart)) return null;
            const perm = getPermissionForTool(permissions, toolPart.callID);
            const question = getQuestionForTool(questions, toolPart.callID);
            // Hide tool parts with active permission (but NOT questions — we show them with overlay)
            if (!question && isToolPartHidden(toolPart, message.info.id, hidden)) return null;
            return (
              <ToolPartRenderer
                key={part.id}
                part={toolPart}
                sessionId={sessionId}
                permission={perm}
                question={question}
                onPermissionReply={onPermissionReply}
                onQuestionReply={onQuestionReply}
                onQuestionReject={onQuestionReject}
              />
            );
          })}
        </div>
      )}

      {/* Answered question parts (shown when steps collapsed + no active question) */}
      {(working || hasSteps) && !stepsExpanded && answeredQuestionParts.length > 0 && (
        <div className="space-y-1.5">
          {answeredQuestionParts.map(({ part }) => (
            <ToolPartRenderer
              key={part.id}
              part={part as ToolPart}
              sessionId={sessionId}
            />
          ))}
        </div>
      )}

      {/* Response section (final text, shown when done) */}
      {!working && response && (
        <div className="mt-3">
          {/* Kortix logo — shown when there are no steps (otherwise logo is already above) */}
          {!hasSteps && (
            <div className="flex items-center gap-2 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kortix-logomark-white.svg"
                alt="Kortix"
                className="dark:invert-0 invert flex-shrink-0"
                style={{ height: '14px', width: 'auto' }}
              />
            </div>
          )}
          <div className="text-sm">
            <SandboxUrlDetector content={response} isStreaming={false} />
          </div>
          <div className="sr-only" aria-live="polite">
            {response}
          </div>
        </div>
      )}

      {/* Streaming text when working and steps not expanded */}
      {working && !stepsExpanded && lastTextPart?.text?.trim() && (
        <div className="mt-3">
          <div className="text-sm">
            <SandboxUrlDetector content={lastTextPart.text} isStreaming={true} />
          </div>
        </div>
      )}


      {/* Error shown outside steps when collapsed */}
      {turnError && !stepsExpanded && (
        <div className="flex items-start gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground">
          <Info className="size-3 flex-shrink-0 mt-0.5" />
          <span className="break-all">{turnError}</span>
        </div>
      )}

      {/* Standalone permission (no tool ref) */}
      {nextPermission && !nextPermission.tool && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <span className="text-xs text-foreground flex-1">
            Permission required: <span className="font-medium">{nextPermission.permission}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPermissionReply(nextPermission.id, 'reject')}
              className="px-2 py-1 text-[11px] rounded-md text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              Deny
            </button>
            <button
              onClick={() => onPermissionReply(nextPermission.id, 'always')}
              className="px-2 py-1 text-[11px] rounded-md text-foreground hover:bg-muted transition-colors cursor-pointer border border-border"
            >
              Allow always
            </button>
            <button
              onClick={() => onPermissionReply(nextPermission.id, 'once')}
              className="px-2 py-1 text-[11px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Allow once
            </button>
          </div>
        </div>
      )}

      {/* Standalone question (no tool ref) or question with tool ref when steps are collapsed */}
      {nextQuestion && (!nextQuestion.tool || !stepsExpanded) && (
        <QuestionPrompt
          request={nextQuestion}
          onReply={onQuestionReply}
          onReject={onQuestionReject}
        />
      )}

      {/* Unified action bar — copy, fork, revert under the response */}
      {!working && response && (
        <>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/turn:opacity-100 transition-opacity duration-150">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
            </Tooltip>
            {!isBusy && !isReverted && lastAssistantMessageId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onFork(lastAssistantMessageId)}
                    className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                  >
                    <GitFork className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Fork from here</TooltipContent>
              </Tooltip>
            )}
            {!isFirstTurn && !isBusy && !isReverted && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setRevertDialogOpen(true)}
                    className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                  >
                    <Undo2 className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Revert to before this</TooltipContent>
              </Tooltip>
            )}
          </div>
          <ConfirmDialog
            open={revertDialogOpen}
            onOpenChange={setRevertDialogOpen}
            title="Revert to this point"
            description="This will undo all messages and file changes after this point. You can restore them later by clicking the undo button in the revert banner."
            action={async () => {
              setRevertLoading(true);
              try {
                await onRevert(turn.userMessage.info.id);
              } finally {
                setRevertLoading(false);
                setRevertDialogOpen(false);
              }
            }}
            actionLabel="Revert"
            variant="destructive"
            loading={revertLoading}
          />
        </>
      )}
    </div>
  );
}

// ============================================================================
// Billing: track billed turn IDs to prevent double-deduction
// ============================================================================

const billedTurnIds = new Set<string>();

// ============================================================================
// Main SessionChat Component
// ============================================================================

interface SessionChatProps {
  sessionId: string;
}

export function SessionChat({ sessionId }: SessionChatProps) {
  const [debugMode, setDebugMode] = useState(false);

  // ---- KortixComputer side panel ----
  const { isSidePanelOpen, setIsSidePanelOpen, openFileInComputer } = useKortixComputerStore();
  const handleTogglePanel = useCallback(() => {
    setIsSidePanelOpen(!isSidePanelOpen);
  }, [isSidePanelOpen, setIsSidePanelOpen]);

  // ---- Hooks ----
  const { data: session, isLoading: sessionLoading } = useOpenCodeSession(sessionId);
  const { data: messages, isLoading: messagesLoading } = useOpenCodeMessages(sessionId);
  const { data: agents } = useOpenCodeAgents();
  const { data: commands } = useOpenCodeCommands();
  const { data: providers } = useOpenCodeProviders();
  const { data: config } = useOpenCodeConfig();
  const sendMessage = useSendOpenCodeMessage();
  const abortSession = useAbortOpenCodeSession();
  const executeCommand = useExecuteOpenCodeCommand();
  const forkSession = useForkSession();
  const revertSession = useRevertSession();
  const unrevertSession = useUnrevertSession();
  const router = useRouter();

  // ---- Billing: query client for invalidation ----
  const queryClient = useQueryClient();

  // ---- Unified model/agent/variant state (1:1 port of SolidJS local.tsx) ----
  const local = useOpenCodeLocal({ agents, providers, config });

  // ---- URL params ----
  const searchParams = useSearchParams();
  const isDebugEnabled = searchParams.has('debug');
  const pendingPromptHandled = useRef(false);

  // ---- Polling fallback & optimistic send ----
  const [pollingActive, setPollingActive] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  useSessionBusyPolling(sessionId, pollingActive);

  // ---- Optimistic prompt (from dashboard/project page) ----
  // Uses session-specific sessionStorage keys so pushState navigation works
  // (no dependency on ?new=true URL param which requires router.push).
  const [optimisticPrompt, setOptimisticPrompt] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(`opencode_pending_prompt:${sessionId}`);
    }
    return null;
  });

  // Hydrate options and clean up sessionStorage for new sessions.
  // The prompt is already sent by the dashboard/project page — we only use sessionStorage
  // for optimistic display and to restore selected agent/model/variant.
  useEffect(() => {
    if (pendingPromptHandled.current) return;
    const pendingPrompt = sessionStorage.getItem(`opencode_pending_prompt:${sessionId}`);
    if (pendingPrompt) {
      pendingPromptHandled.current = true;
      setPollingActive(true);
      sessionStorage.removeItem(`opencode_pending_prompt:${sessionId}`);

      // Restore agent/model/variant selections from the dashboard
      let pendingOptions: Record<string, unknown> | null = null;
      try {
        const raw = sessionStorage.getItem(`opencode_pending_options:${sessionId}`);
        if (raw) {
          pendingOptions = JSON.parse(raw);
          sessionStorage.removeItem(`opencode_pending_options:${sessionId}`);
          if (pendingOptions?.agent) local.agent.set(pendingOptions.agent as string);
          if (pendingOptions?.model) local.model.set(pendingOptions.model as { providerID: string; modelID: string });
          if (pendingOptions?.variant) local.model.variant.set(pendingOptions.variant as string);
        }
      } catch {
        // ignore
      }

      // If the dashboard's send failed, retry it here
      const sendFailed = sessionStorage.getItem(`opencode_pending_send_failed:${sessionId}`);
      if (sendFailed) {
        sessionStorage.removeItem(`opencode_pending_send_failed:${sessionId}`);
        const options: Record<string, unknown> = {};
        if (pendingOptions?.agent) options.agent = pendingOptions.agent;
        if (pendingOptions?.model) options.model = pendingOptions.model;
        if (pendingOptions?.variant) options.variant = pendingOptions.variant;
        sendMessage.mutateAsync({
          sessionId,
          parts: [{ type: 'text', text: pendingPrompt }],
          options: Object.keys(options).length > 0 ? options as any : undefined,
        }).catch(() => {
          // ignore — SSE will surface this now that listener is active
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Clear optimistic prompt once real messages arrive
  useEffect(() => {
    if (optimisticPrompt && messages && messages.length > 0) {
      setOptimisticPrompt(null);
    }
  }, [optimisticPrompt, messages]);

  const agentNames = useMemo(
    () => local.agent.list.map((a) => a.name),
    [local.agent.list],
  );

  // ---- Check if any messages have tool calls ----
  const hasToolCalls = useMemo(() => {
    if (!messages) return false;
    return messages.some((msg) =>
      msg.parts?.some((p) => p.type === 'tool'),
    );
  }, [messages]);

  // ---- Restore model/agent from last user message (matching SolidJS session.tsx:550-560) ----
  const lastUserMessage = useMemo(
    () => messages ? [...messages].reverse().find((m) => m.info.role === 'user') : undefined,
    [messages],
  );
  const lastUserMsgIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!lastUserMessage) return;
    if (lastUserMsgIdRef.current === lastUserMessage.info.id) return;
    lastUserMsgIdRef.current = lastUserMessage.info.id;
    const msg = lastUserMessage.info as any;
    if (msg.agent) local.agent.set(msg.agent);
    if (msg.model) local.model.set(msg.model); // no { recent: true } — matches SolidJS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUserMessage?.info.id]);

  // ---- Session status ----
  const sessionStatus = useOpenCodeSessionStatusStore(
    (s) => s.statuses[sessionId],
  );
  const isServerBusy = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';
  const isBusy = isServerBusy || !!pendingUserMessage;

  // Stop polling when session goes idle (via SSE or polling fallback)
  useEffect(() => {
    if (pollingActive && sessionStatus?.type === 'idle') {
      setPollingActive(false);
    }
  }, [pollingActive, sessionStatus?.type]);

  // Clear pending user message when server acknowledges (status becomes busy)
  // or when new messages arrive from the server
  const prevMsgLenRef = useRef(messages?.length || 0);
  useEffect(() => {
    if (!pendingUserMessage) return;
    // Server reported busy → it received our prompt, real messages incoming
    if (isServerBusy) {
      setPendingUserMessage(null);
      return;
    }
    // New messages arrived from server → clear optimistic display
    const len = messages?.length || 0;
    if (len > prevMsgLenRef.current) {
      setPendingUserMessage(null);
    }
  }, [isServerBusy, messages?.length, pendingUserMessage]);

  useEffect(() => {
    prevMsgLenRef.current = messages?.length || 0;
  }, [messages?.length]);

  // ---- Auto-scroll (replaces inline scroll logic) ----
  const { scrollRef, contentRef, showScrollButton, scrollToBottom } = useAutoScroll({
    working: isBusy,
  });

  // Scroll to bottom when switching between session tabs
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Use instant scroll (no smooth) so it feels like switching to a tab already at the bottom
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom after messages are rendered on initial session open.
  // The loading guard (early return above) unmounts the scroll container while
  // loading, so we cannot rely on loading-state transitions — the ref is null
  // at that point. Instead we watch `messages` and fire once per session when
  // content first becomes available in the DOM.
  const initialScrollDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialScrollDoneRef.current !== sessionId) {
      initialScrollDoneRef.current = null;
    }
  }, [sessionId]);

  useEffect(() => {
    if (initialScrollDoneRef.current === sessionId) return;
    if (!messages || messages.length === 0) return;
    initialScrollDoneRef.current = sessionId;

    const scrollDown = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };

    // Staggered attempts: the scroll container mounts after this render,
    // then message components (markdown, code blocks) render asynchronously.
    requestAnimationFrame(scrollDown);
    const t1 = setTimeout(scrollDown, 150);
    const t2 = setTimeout(scrollDown, 500);
    const t3 = setTimeout(scrollDown, 1000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [messages, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Pending permissions & questions ----
  const allPermissions = useOpenCodePendingStore((s) => s.permissions);
  const allQuestions = useOpenCodePendingStore((s) => s.questions);
  const pendingPermissions = useMemo(
    () => Object.values(allPermissions).filter((p) => p.sessionID === sessionId),
    [allPermissions, sessionId],
  );
  const pendingQuestions = useMemo(
    () => Object.values(allQuestions).filter((q) => q.sessionID === sessionId),
    [allQuestions, sessionId],
  );

  // ---- Permission/question reply handlers ----
  const removePermission = useOpenCodePendingStore((s) => s.removePermission);
  const removeQuestion = useOpenCodePendingStore((s) => s.removeQuestion);

  const handlePermissionReply = useCallback(
    async (requestId: string, reply: 'once' | 'always' | 'reject') => {
      try {
        await replyToPermission(requestId, reply);
        removePermission(requestId);
      } catch {
        // ignore
      }
    },
    [removePermission],
  );

  const handleQuestionReply = useCallback(
    async (requestId: string, answers: string[][]) => {
      try {
        await replyToQuestion(requestId, answers);
        removeQuestion(requestId);
      } catch {
        // ignore
      }
    },
    [removeQuestion],
  );

  const handleQuestionReject = useCallback(
    async (requestId: string) => {
      try {
        await rejectQuestion(requestId);
        removeQuestion(requestId);
      } catch {
        // ignore
      }
    },
    [removeQuestion],
  );

  // ---- Group messages into turns ----
  const turns = useMemo(
    () => (messages ? groupMessagesIntoTurns(messages) : []),
    [messages],
  );

  // ============================================================================
  // Expanded state management (keyed by user message ID)
  // ============================================================================

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Auto-expand last turn when session is busy
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const lastUserId = [...messages].reverse().find((m) => m.info.role === 'user')?.info.id;
    if (lastUserId && sessionStatus?.type !== 'idle') {
      setExpanded((prev) => ({ ...prev, [lastUserId]: true }));
    }
  }, [sessionStatus, messages]);

  // Reset on session change
  useEffect(() => {
    setExpanded({});
    setPollingActive(false);
    setPendingUserMessage(null);
  }, [sessionId]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ============================================================================
  // Billing: deduct credits after agent run completes
  // ============================================================================

  useEffect(() => {
    if (!messages || messages.length === 0 || isBusy) return;

    const currentTurns = groupMessagesIntoTurns(messages);
    for (const turn of currentTurns) {
      const turnId = turn.userMessage.info.id;
      if (billedTurnIds.has(turnId)) continue;

      const parts = collectTurnParts(turn);
      const costInfo = getTurnCost(parts);
      console.log('[Billing] Turn', turnId, 'costInfo:', costInfo);
      if (!costInfo || costInfo.cost <= 0) continue;

      // Mark as billed immediately to prevent double-deduction
      billedTurnIds.add(turnId);

      console.log('[Billing] Deducting', costInfo.cost, 'for turn', turnId);
      // Fire-and-forget deduction
      billingApi.deductUsage({
        amount: costInfo.cost,
        thread_id: sessionId,
        description: `Agent run: ${formatCost(costInfo.cost)} (${formatTokens(costInfo.tokens.input + costInfo.tokens.output)} tokens)`,
      }).then((result) => {
        console.log('[Billing] Deduction successful:', result);
        invalidateAccountState(queryClient);
      }).catch((err) => {
        console.warn('[Billing] Failed to deduct usage:', err);
      });
    }
  }, [messages, isBusy, sessionId, queryClient]);

  // ============================================================================
  // Fork / Revert / Unrevert handlers
  // ============================================================================

  const isReverted = !!session?.revert;

  const handleFork = useCallback(
    async (messageId: string) => {
      const forkedSession = await forkSession.mutateAsync({
        sessionId,
        messageId,
      });

      // Open the forked session in a new tab and navigate
      const title = forkedSession.title || 'Forked session';
      useTabStore.getState().openTab({
        id: forkedSession.id,
        title,
        type: 'session',
        href: `/sessions/${forkedSession.id}`,
        parentSessionId: sessionId,
        serverId: useServerStore.getState().activeServerId,
      });
      // Store fork origin in localStorage (survives refresh) so the forked
      // session can show the "Forked from" indicator.
      localStorage.setItem(`fork_origin_${forkedSession.id}`, sessionId);
      router.push(`/sessions/${forkedSession.id}`);
    },
    [sessionId, forkSession, router],
  );

  const handleRevert = useCallback(
    async (messageId: string) => {
      await revertSession.mutateAsync({
        sessionId,
        messageId,
      });
    },
    [sessionId, revertSession],
  );

  const handleUnrevert = useCallback(async () => {
    await unrevertSession.mutateAsync(sessionId);
  }, [sessionId, unrevertSession]);

  // ============================================================================
  // Send / Stop / Command handlers
  // ============================================================================

  const handleSend = useCallback(
    async (text: string, files?: AttachedFile[]) => {
      // Optimistic: show message immediately and start polling fallback
      setPendingUserMessage(text);
      setPollingActive(true);

      const options: Record<string, unknown> = {};
      if (local.agent.current) options.agent = local.agent.current.name;
      if (local.model.currentKey) options.model = local.model.currentKey;
      if (local.model.variant.current) options.variant = local.model.variant.current;

      // Build parts: text first, then upload attached files to /workspace/uploads/
      // and send as XML text references (agent reads from disk on demand, not loaded into context)
      const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'file'; mime: string; url: string; filename?: string }
      > = [{ type: 'text', text }];

      if (files && files.length > 0) {
        const uploadResults = await Promise.all(
          files.map(async (af) => {
            const timestamp = Date.now();
            const safeName = af.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const uniqueName = `${timestamp}-${safeName}`;
            const uploadBlob = new File([af.file], uniqueName, { type: af.file.type });
            const results = await uploadFile(uploadBlob, '/workspace/uploads');
            if (!results || results.length === 0) {
              throw new Error(`Failed to upload file: ${af.file.name}`);
            }
            return {
              path: results[0].path,
              mime: af.file.type || 'application/octet-stream',
              filename: af.file.name,
            };
          }),
        );
        for (const f of uploadResults) {
          parts.push({
            type: 'text',
            text: `<file path="${f.path}" mime="${f.mime}" filename="${f.filename}">\nThis file has been uploaded and is available at the path above.\n</file>`,
          });
        }
      }

      try {
        await sendMessage.mutateAsync({
          sessionId,
          parts,
          options: Object.keys(options).length > 0 ? options as any : undefined,
        });
      } catch {
        // If send fails, clear optimistic state
        setPendingUserMessage(null);
        setPollingActive(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, sendMessage, local.agent.current, local.model.currentKey, local.model.variant.current],
  );

  const handleStop = useCallback(() => {
    abortSession.mutate(sessionId);
  }, [sessionId, abortSession]);

  const handleCommand = useCallback(
    (cmd: Command) => {
      executeCommand.mutate({ sessionId, command: cmd.name });
    },
    [sessionId, executeCommand],
  );

  const handleFileSearch = useCallback(async (query: string): Promise<string[]> => {
    try {
      return await findOpenCodeFiles(query);
    } catch {
      return [];
    }
  }, []);

  // Detect if this session was forked and resolve its parent.
  // Must be above early returns to preserve hook order.
  // localStorage is the source of truth (set by handleFork). The server may
  // or may not populate parentID on the forked session.
  const forkParentId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`fork_origin_${sessionId}`);
  }, [sessionId]);
  const isSubSession = !!session?.parentID || !!forkParentId;
  const isFork = !!forkParentId;
  // The effective parent ID: prefer server parentID, fall back to localStorage
  const effectiveParentId = session?.parentID || forkParentId;

  // ============================================================================
  // Loading / Not-found states
  // ============================================================================

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

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Session header */}
      {!isSubSession && (
        <SessionSiteHeader
          sessionId={sessionId}
          sessionTitle={session?.title || 'Untitled'}
          onToggleSidePanel={handleTogglePanel}
          isSidePanelOpen={isSidePanelOpen}
          canOpenSidePanel={hasMessages}
          isCompacting={!!session?.time?.compacting}
        />
      )}

      {/* Sub-session / fork top bar */}
      {isSubSession && effectiveParentId && (
        <SubSessionBar
          sessionId={sessionId}
          parentID={effectiveParentId}
          variant={isFork ? 'fork' : 'thread'}
        />
      )}

      {/* Revert banner — shown when session is in reverted state */}
      {isReverted && session?.revert?.messageID && (
        <RevertBanner
          sessionId={sessionId}
          revertMessageId={session.revert.messageID}
          loading={unrevertSession.isPending}
          onUnrevert={handleUnrevert}
        />
      )}

      {/* Debug mode toggle — floating, only visible when ?debug is in URL */}
      {isDebugEnabled && hasMessages && (
        <button
          onClick={() => setDebugMode(!debugMode)}
          className={cn(
            'absolute bottom-20 right-4 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium shadow-lg border transition-colors cursor-pointer backdrop-blur-sm',
            debugMode
              ? 'bg-orange-500/15 text-orange-500 border-orange-500/30 hover:bg-orange-500/25'
              : 'bg-background/80 text-muted-foreground/60 border-border/50 hover:text-muted-foreground hover:bg-muted/60',
          )}
        >
          <Bug className="size-3" />
          {debugMode ? 'Debug ON' : 'Debug'}
        </button>
      )}

      {/* Debug view */}
      {isDebugEnabled && debugMode && hasMessages ? (
        <DebugView messages={messages} />
      ) : (hasMessages || showOptimistic) ? (
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 pb-6 bg-background h-full"
          >
            <div
              ref={contentRef}
              role="log"
              className="mx-auto max-w-3xl min-w-0 w-full px-3 sm:px-6"
            >
              <div className="flex flex-col gap-12 min-w-0">
                {/* Fork context divider — shown at the top of forked sessions */}
                {isFork && effectiveParentId && (
                  <ForkContextDivider parentID={effectiveParentId} />
                )}

                {/* Optimistic user message */}
                {showOptimistic && (
                  <>
                    <div className="flex justify-end">
                      <div className="flex flex-col max-w-[90%] rounded-3xl rounded-br-lg bg-card border overflow-hidden">
                        {(() => {
                          const { cleanText, files } = parseFileReferences(optimisticPrompt || '');
                          return (
                            <>
                              {files.length > 0 && (
                                <div className="flex gap-2 p-3 pb-0 flex-wrap">
                                  {files.map((f, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30">
                                      <FileText className="size-4 text-muted-foreground shrink-0" />
                                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">{f.filename}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {cleanText && (
                                <p className="text-sm leading-relaxed whitespace-pre-wrap px-4 py-3">
                                  <HighlightMentions text={cleanText} agentNames={agentNames} onFileClick={openFileInComputer} />
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/kortix-logomark-white.svg"
                        alt="Kortix"
                        className="dark:invert-0 invert flex-shrink-0 animate-pulse"
                        style={{ height: '14px', width: 'auto' }}
                      />

                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-muted-foreground">
                          {isPendingConfirmation ? 'Paused - waiting for confirmation' : 'Thinking'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/kortix-logomark-white.svg"
                        alt="Kortix"
                        className="dark:invert-0 invert flex-shrink-0 animate-pulse"
                        style={{ height: '14px', width: 'auto' }}
                      />
                      <KortixLoader size="small" />
                    </div>
                  </>
                )}

                {/* Busy indicator when no turns yet but session is busy */}
                {!showOptimistic && !pendingUserMessage && isBusy && turns.length === 0 && (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/kortix-logomark-white.svg"
                        alt="Kortix"
                        className="dark:invert-0 invert flex-shrink-0 animate-pulse"
                        style={{ height: '14px', width: 'auto' }}
                      />
                    <KortixLoader size="small" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scroll to bottom FAB */}
          <div
            className={cn(
              'absolute bottom-4 left-1/2 -translate-x-1/2 transition-all',
              showScrollButton
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2 pointer-events-none',
            )}
          >
            <Button
              variant="outline"
              size="sm"
              className="rounded-full shadow-md h-7 text-xs bg-background/90 backdrop-blur-sm border-border/60"
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

      {/* Sub-session indicator above input */}
      {effectiveParentId && <SubSessionInputBanner parentID={effectiveParentId} variant={isFork ? 'fork' : 'thread'} />}

      {/* Input */}
      <SessionChatInput
        onSend={handleSend}
        isBusy={isBusy}
        onStop={handleStop}
        agents={local.agent.list}
        selectedAgent={local.agent.current?.name ?? null}
        onAgentChange={(name) => local.agent.set(name ?? undefined)}
        commands={commands || []}
        onCommand={handleCommand}
        models={local.model.list}
        selectedModel={local.model.currentKey ?? null}
        onModelChange={(m) => local.model.set(m ?? undefined, { recent: true })}
        variants={local.model.variant.list}
        selectedVariant={local.model.variant.current ?? null}
        onVariantChange={(v) => local.model.variant.set(v ?? undefined)}
        messages={messages}
        onTogglePanel={handleTogglePanel}
        isPanelOpen={isSidePanelOpen}
        hasToolCalls={hasToolCalls}
        onFileSearch={handleFileSearch}
        providers={providers}
      />
    </div>
  );
}
