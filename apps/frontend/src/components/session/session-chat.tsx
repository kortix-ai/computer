'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Loader2,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  GitFork,
  Layers,
  ListPlus,
  Scissors,
  Pencil,
  Send,
  Trash2,
  Undo2,
  X,
  Terminal,
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
  useSendOpenCodeMessage,
  useAbortOpenCodeSession,
  useOpenCodeAgents,
  useOpenCodeCommands,
  useExecuteOpenCodeCommand,
  useOpenCodeProviders,
  useForkSession,
  useRevertSession,
  useUnrevertSession,
  useUpdatePart,
  useDeletePart,
  replyToPermission,
  replyToQuestion,
  rejectQuestion,
  findOpenCodeFiles,
} from '@/hooks/opencode/use-opencode-sessions';
import { useSessionSync } from '@/hooks/opencode/use-session-sync';
import { useSyncStore, ascendingId } from '@/stores/opencode-sync-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
import { useMessageQueueStore } from '@/stores/message-queue-store';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useThrottledValue } from '@/hooks/use-throttled-value';
import { SessionSiteHeader } from '@/components/session/session-site-header';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';


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
  type SnapshotPart,
  type PatchPart,
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
  isSnapshotPart,
  isPatchPart,
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
  getTurnStatus,
  getTurnCost,
  getTurnError,
  getRetryInfo,
  getPermissionForTool,
  getQuestionForTool,
  formatDuration,
  formatCost,
  formatTokens,
  shouldShowToolPart,
  hasDiffs,
} from '@/ui';

import { SessionChatInput, type AttachedFile, type TrackedMention } from '@/components/session/session-chat-input';
import { uploadFile } from '@/features/files/api/opencode-files';
import { useOpenCodeLocal } from '@/hooks/opencode/use-opencode-local';
import { useOpenCodeConfig } from '@/hooks/opencode/use-opencode-config';
import { SessionWelcome } from '@/components/session/session-welcome';
import { ToolPartRenderer } from '@/components/session/tool-renderers';
import { QuestionPrompt } from '@/components/session/question-prompt';
import { ImagePreview } from '@/components/session/image-preview';
import { RevertBanner, ConfirmDialog } from '@/components/session/message-actions';
import { TurnErrorDisplay } from '@/components/session/session-error-banner';
import { OcSnapshotPartView, OcPatchPartView } from '@/components/session/snapshot-part-views';
import { SessionContextModal } from '@/components/session/session-context-modal';
import { ConnectProviderDialog } from '@/components/session/model-selector';
import type { ProviderListResponse } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';

// billingApi / invalidateAccountState / useQueryClient removed — billing is handled server-side by the router
import { playSound } from '@/lib/sounds';

// ============================================================================
// Sub-Session / Fork Breadcrumb
// ============================================================================

// SubSessionBar removed — subsessions now use SessionSiteHeader + chat input indicator

// ============================================================================
// Fork Context Divider — shown at the top of the message list in forked sessions
// ============================================================================

function ForkContextDivider({ parentID }: { parentID: string }) {
  const { data: parentSession } = useOpenCodeSession(parentID);
  const parentTitle = parentSession?.title || 'Parent session';

  return (
    <div className="flex items-center gap-3 py-2 mb-2">
      <div className="flex-1 h-px bg-border/50" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() =>
              parentSession &&
              openTabAndNavigate({
                id: parentSession.id,
                title: parentSession.title || 'Parent session',
                type: 'session',
                href: `/sessions/${parentSession.id}`,
                serverId: useServerStore.getState().activeServerId,
              })
            }
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
// Highlight @mentions in plain text (for optimistic & user messages)
// ============================================================================

function HighlightMentions({ text, agentNames, onFileClick }: { text: string; agentNames?: string[]; onFileClick?: (path: string) => void }) {
  // Strip session ref XML before processing mentions
  const { cleanText, sessions } = useMemo(() => parseSessionReferences(text), [text]);

  const segments = useMemo(() => {
    if (!cleanText) return [{ text: cleanText, type: undefined as 'file' | 'agent' | 'session' | undefined }];

    // Detect session @mentions first (titles can contain spaces)
    type MentionType = 'file' | 'agent' | 'session';
    const sessionDetected: { start: number; end: number; type: MentionType }[] = [];
    for (const s of sessions) {
      const needle = `@${s.title}`;
      const idx = cleanText.indexOf(needle);
      if (idx !== -1) {
        sessionDetected.push({ start: idx, end: idx + needle.length, type: 'session' });
      }
    }

    const agentSet = new Set(agentNames || []);
    const mentionRegex = /@(\S+)/g;
    const detected: { start: number; end: number; type: MentionType }[] = [...sessionDetected];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(cleanText)) !== null) {
      const mStart = match.index;
      // Skip if overlaps with a session mention
      if (sessionDetected.some((s) => mStart >= s.start && mStart < s.end)) continue;
      const name = match[1];
      detected.push({ start: mStart, end: match.index + match[0].length, type: agentSet.has(name) ? 'agent' : 'file' });
    }
    if (detected.length === 0) return [{ text, type: undefined }];

    detected.sort((a, b) => a.start - b.start || b.end - a.end);
    const result: { text: string; type?: MentionType }[] = [];
    let lastIndex = 0;
    for (const ref of detected) {
      if (ref.start < lastIndex) continue;
      if (ref.start > lastIndex) result.push({ text: cleanText.slice(lastIndex, ref.start) });
      result.push({ text: cleanText.slice(ref.start, ref.end), type: ref.type });
      lastIndex = ref.end;
    }
    if (lastIndex < cleanText.length) result.push({ text: cleanText.slice(lastIndex) });
    return result;
  }, [cleanText, agentNames, sessions]);

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
        ) : seg.type === 'session' ? (
          <span
            key={i}
            className="text-emerald-500 font-medium cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const title = seg.text.replace(/^@/, '');
              const ref = sessions.find((s) => s.title === title);
              if (ref) {
                openTabAndNavigate({
                  id: ref.id,
                  title: ref.title || 'Session',
                  type: 'session',
                  href: `/sessions/${ref.id}`,
                  serverId: useServerStore.getState().activeServerId,
                });
              }
            }}
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
// Parse <session_ref> XML tags from session mention text parts
// ============================================================================

interface ParsedSessionRef {
  id: string;
  title: string;
}

function parseSessionReferences(text: string): { cleanText: string; sessions: ParsedSessionRef[] } {
  const sessions: ParsedSessionRef[] = [];
  let cleaned = text.replace(/<session_ref\s+id="([^"]*?)"\s+title="([^"]*?)"\s*\/>/g, (_, id, title) => {
    sessions.push({ id, title });
    return '';
  });
  // Strip the instruction header text
  cleaned = cleaned.replace(/\n*Referenced sessions \(use the session_context tool to fetch details when needed\):\n?/g, '').trim();
  return { cleanText: cleaned, sessions };
}

// ============================================================================
// Parse <dcp-notification> XML tags from DCP plugin messages
// ============================================================================

interface DCPPrunedItem {
  tool: string;
  description: string;
}

interface DCPNotification {
  type: 'prune' | 'compress';
  tokensSaved: number;
  batchSaved: number;
  prunedCount: number;
  extractedTokens: number;
  reason?: string;
  items: DCPPrunedItem[];
  distilled?: string;
  // compress-specific
  messagesCount?: number;
  toolsCount?: number;
  topic?: string;
  summary?: string;
}

const DCP_TAG_REGEX = /<dcp-notification\s+([^>]*)>([\s\S]*?)<\/dcp-notification>/g;
const DCP_ITEM_REGEX = /<dcp-item\s+tool="([^"]*?)"\s+description="([^"]*?)"\s*\/>/g;
const DCP_DISTILLED_REGEX = /<dcp-distilled>([\s\S]*?)<\/dcp-distilled>/;
const DCP_SUMMARY_REGEX = /<dcp-summary>([\s\S]*?)<\/dcp-summary>/;

function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}="([^"]*?)"`);
  const m = attrs.match(re);
  return m ? unescapeXml(m[1]) : undefined;
}

// Legacy DCP format: "▣ DCP | ~12.5K tokens saved total" (pre-XML version)
const DCP_LEGACY_REGEX = /^▣ DCP \| ~([\d.]+K?) tokens saved total/;
const DCP_LEGACY_PRUNING_REGEX = /▣ Pruning \(~([\d.]+K?) tokens(?:, distilled ([\d.]+K?) tokens)?\)(?:\s*—\s*(.+))?/;
const DCP_LEGACY_ITEM_REGEX = /→\s+(\S+?):\s+(.+)/g;

function parseLegacyDCPNotification(text: string): DCPNotification | null {
  const headerMatch = text.match(DCP_LEGACY_REGEX);
  if (!headerMatch) return null;

  const tokenStr = headerMatch[1];
  const tokensSaved = tokenStr.endsWith('K')
    ? Math.round(parseFloat(tokenStr.slice(0, -1)) * 1000)
    : parseInt(tokenStr, 10);

  const pruningMatch = text.match(DCP_LEGACY_PRUNING_REGEX);
  let batchSaved = 0;
  let extractedTokens = 0;
  let reason: string | undefined;
  if (pruningMatch) {
    const batchStr = pruningMatch[1];
    batchSaved = batchStr.endsWith('K')
      ? Math.round(parseFloat(batchStr.slice(0, -1)) * 1000)
      : parseInt(batchStr, 10);
    if (pruningMatch[2]) {
      const extStr = pruningMatch[2];
      extractedTokens = extStr.endsWith('K')
        ? Math.round(parseFloat(extStr.slice(0, -1)) * 1000)
        : parseInt(extStr, 10);
    }
    reason = pruningMatch[3]?.trim();
  }

  const items: DCPPrunedItem[] = [];
  let itemMatch;
  DCP_LEGACY_ITEM_REGEX.lastIndex = 0;
  while ((itemMatch = DCP_LEGACY_ITEM_REGEX.exec(text)) !== null) {
    items.push({ tool: itemMatch[1], description: itemMatch[2].trim() });
  }

  // Check for compress format
  const isCompress = text.includes('▣ Compressing');

  return {
    type: isCompress ? 'compress' : 'prune',
    tokensSaved,
    batchSaved,
    prunedCount: items.length,
    extractedTokens,
    reason,
    items,
  };
}

function parseDCPNotifications(text: string): { cleanText: string; notifications: DCPNotification[] } {
  const notifications: DCPNotification[] = [];

  // First try XML format
  const cleanText = text.replace(DCP_TAG_REGEX, (_, attrs: string, body: string) => {
    const type = (parseAttr(attrs, 'type') || 'prune') as 'prune' | 'compress';
    const tokensSaved = parseInt(parseAttr(attrs, 'tokens-saved') || '0', 10);
    const batchSaved = parseInt(parseAttr(attrs, 'batch-saved') || '0', 10);
    const prunedCount = parseInt(parseAttr(attrs, 'pruned-count') || '0', 10);
    const extractedTokens = parseInt(parseAttr(attrs, 'extracted-tokens') || '0', 10);
    const reason = parseAttr(attrs, 'reason');

    // Parse items
    const items: DCPPrunedItem[] = [];
    let itemMatch;
    DCP_ITEM_REGEX.lastIndex = 0;
    while ((itemMatch = DCP_ITEM_REGEX.exec(body)) !== null) {
      items.push({ tool: unescapeXml(itemMatch[1]), description: unescapeXml(itemMatch[2]) });
    }

    // Parse distilled
    const distilledMatch = body.match(DCP_DISTILLED_REGEX);
    const distilled = distilledMatch ? unescapeXml(distilledMatch[1]) : undefined;

    // Compress-specific
    const messagesCount = parseInt(parseAttr(attrs, 'messages-count') || '0', 10) || undefined;
    const toolsCount = parseInt(parseAttr(attrs, 'tools-count') || '0', 10) || undefined;
    const topic = parseAttr(attrs, 'topic');
    const summaryMatch = body.match(DCP_SUMMARY_REGEX);
    const summary = summaryMatch ? unescapeXml(summaryMatch[1]) : undefined;

    notifications.push({
      type,
      tokensSaved,
      batchSaved,
      prunedCount,
      extractedTokens,
      reason,
      items,
      distilled,
      messagesCount,
      toolsCount,
      topic,
      summary,
    });
    return '';
  }).trim();

  // If no XML notifications found, try legacy format
  if (notifications.length === 0 && cleanText) {
    const legacy = parseLegacyDCPNotification(cleanText);
    if (legacy) {
      notifications.push(legacy);
      return { cleanText: '', notifications };
    }
  }

  return { cleanText, notifications };
}

// ============================================================================
// DCP Notification Card — styled component for pruning/compress events
// ============================================================================

const DCP_REASON_LABELS: Record<string, string> = {
  completion: 'Task Complete',
  noise: 'Noise Removal',
  extraction: 'Extraction',
};

function formatDCPTokens(tokens: number): string {
  if (tokens >= 1000) {
    const k = (tokens / 1000).toFixed(1).replace('.0', '');
    return `${k}K`;
  }
  return tokens.toString();
}

function DCPNotificationCard({ notification }: { notification: DCPNotification }) {
  const [expanded, setExpanded] = useState(false);
  const isPrune = notification.type === 'prune';
  const hasItems = notification.items.length > 0;
  const hasDetails = hasItems || notification.distilled || notification.summary;

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 border-b border-border/40 bg-muted/30',
          hasDetails && 'cursor-pointer hover:bg-muted/50 transition-colors',
        )}
      >
        <Scissors className="size-3.5 text-muted-foreground/70 flex-shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
          {isPrune ? 'Context Pruned' : 'Context Compressed'}
        </span>

        {/* Stats pills */}
        <div className="flex items-center gap-1.5 ml-auto">
          {notification.reason && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/70">
              {DCP_REASON_LABELS[notification.reason] || notification.reason}
            </span>
          )}
          {isPrune && notification.prunedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">
              {notification.prunedCount} pruned
            </span>
          )}
          {!isPrune && notification.messagesCount && notification.messagesCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
              {notification.messagesCount} msgs
            </span>
          )}
          {notification.batchSaved > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
              -{formatDCPTokens(notification.batchSaved)} tokens
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            {formatDCPTokens(notification.tokensSaved)} saved
          </span>
          {hasDetails && (
            <ChevronDown className={cn(
              'size-3 text-muted-foreground/50 transition-transform',
              expanded && 'rotate-180'
            )} />
          )}
        </div>
      </button>

      {/* Expandable details */}
      {expanded && hasDetails && (
        <div className="px-3 py-2 space-y-2">
          {/* Pruned items list */}
          {hasItems && (
            <div className="space-y-0.5">
              {notification.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
                  <span className="text-muted-foreground/40">&rarr;</span>
                  <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground/70">
                    {item.tool}
                  </span>
                  {item.description && (
                    <span className="truncate max-w-[300px]">{item.description}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compress topic */}
          {notification.topic && (
            <div className="text-[11px] text-muted-foreground/80">
              <span className="text-muted-foreground/50">Topic:</span>{' '}
              <span>{notification.topic}</span>
            </div>
          )}

          {/* Distilled content */}
          {notification.distilled && (
            <div className="mt-1.5 border-t border-border/30 pt-1.5">
              <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">
                Distilled
              </div>
              <div className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {notification.distilled}
              </div>
            </div>
          )}

          {/* Compress summary */}
          {notification.summary && (
            <div className="mt-1.5 border-t border-border/30 pt-1.5">
              <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">
                Summary
              </div>
              <div className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {notification.summary}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Edit Part Dialog — inline editing for text parts
// ============================================================================

function EditPartDialog({
  open,
  onOpenChange,
  initialText,
  onSave,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText: string;
  onSave: (text: string) => void;
  loading?: boolean;
}) {
  const [text, setText] = useState(initialText);

  // Reset text when dialog opens with new content
  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  const handleSave = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== initialText) {
      onSave(trimmed);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit message</DialogTitle>
          <DialogDescription>
            Modify the text content of this message part.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[120px] text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !text.trim() || text.trim() === initialText}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Part Actions — edit/delete actions for individual message parts
// ============================================================================

function PartActions({
  part,
  messageId,
  sessionId,
  isBusy,
  className,
}: {
  part: Part;
  messageId: string;
  sessionId: string;
  isBusy: boolean;
  className?: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const updatePart = useUpdatePart();
  const deletePart = useDeletePart();

  // Only text parts are editable
  const isEditable = isTextPart(part) && !!(part as TextPart).text?.trim();
  const partText = isEditable ? (part as TextPart).text : '';

  const handleUpdate = useCallback(
    (newText: string) => {
      updatePart.mutate(
        {
          sessionId,
          messageId,
          partId: part.id,
          part: { ...part, text: newText, metadata: { ...((part as any).metadata || {}), edited: true } } as any,
        },
        {
          onSuccess: () => setEditOpen(false),
        },
      );
    },
    [sessionId, messageId, part, updatePart],
  );

  const handleDelete = useCallback(() => {
    deletePart.mutate(
      {
        sessionId,
        messageId,
        partId: part.id,
      },
      {
        onSuccess: () => setDeleteDialogOpen(false),
      },
    );
  }, [sessionId, messageId, part.id, deletePart]);

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-0.5',
          className,
        )}
      >
        {/* Edit button — only for text parts */}
        {isEditable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setEditOpen(true)}
                disabled={isBusy}
                className={cn(
                  'p-1.5 rounded-md transition-colors cursor-pointer',
                  'text-muted-foreground/50 hover:text-foreground hover:bg-muted/60',
                  'disabled:opacity-30 disabled:cursor-not-allowed',
                )}
              >
                <Pencil className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Edit
            </TooltipContent>
          </Tooltip>
        )}

        {/* Delete button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setDeleteDialogOpen(true)}
              disabled={isBusy}
              className={cn(
                'p-1.5 rounded-md transition-colors cursor-pointer',
                'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10',
                'disabled:opacity-30 disabled:cursor-not-allowed',
              )}
            >
              <Trash2 className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Delete
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Edit dialog */}
      {isEditable && (
        <EditPartDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          initialText={partText}
          onSave={handleUpdate}
          loading={updatePart.isPending}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete message part"
        description="This will permanently remove this part from the message. This action cannot be undone."
        action={handleDelete}
        actionLabel="Delete"
        variant="destructive"
        loading={deletePart.isPending}
      />
    </>
  );
}

// ============================================================================
// User Message Row
// ============================================================================

/**
 * Detect if user message text matches a known command template.
 * Returns the command name + extracted args, or undefined if no match.
 * Works by splitting each command template at its first placeholder ($1 or $ARGUMENTS)
 * and checking if the message text starts with that prefix.
 */
function detectCommandFromText(
  rawText: string,
  commands?: Command[],
): { name: string; args?: string } | undefined {
  if (!commands || !rawText || rawText.length < 50) return undefined;

  for (const cmd of commands) {
    if (!cmd.template) continue;
    const tpl = cmd.template;

    // Find the first placeholder position ($1, $2, ..., $ARGUMENTS)
    const placeholderMatch = tpl.match(/\$(\d+|\bARGUMENTS\b)/);
    // Use the text before the first placeholder as the prefix to match
    const prefix = placeholderMatch
      ? tpl.slice(0, placeholderMatch.index).trimEnd()
      : tpl.trimEnd();

    // Require a meaningful prefix (at least 20 chars) to avoid false positives
    if (prefix.length < 20) continue;

    if (rawText.startsWith(prefix)) {
      // Extract the user's arguments: text after the template prefix (approximate)
      // For templates ending with the placeholder, the args are what comes after the prefix
      let args: string | undefined;
      if (placeholderMatch) {
        const afterPrefix = rawText.slice(prefix.length).trim();
        // The args are at the end; try to extract the last meaningful section
        const lastNewlineBlock = afterPrefix.split('\n\n').pop()?.trim();
        if (lastNewlineBlock && lastNewlineBlock.length < 200) {
          args = lastNewlineBlock;
        }
      }
      return { name: cmd.name, args };
    }
  }
  return undefined;
}

function UserMessageRow({ message, agentNames, commandInfo, commands }: { message: MessageWithParts; agentNames?: string[]; commandInfo?: { name: string; args?: string }; commands?: Command[] }) {
  const openFileInComputer = useKortixComputerStore((s) => s.openFileInComputer);
  const { attachments, stickyParts } = useMemo(
    () => splitUserParts(message.parts),
    [message.parts],
  );

  // Extract text from sticky parts, parse out <file> and <session_ref> XML references
  // Filter out both synthetic AND ignored parts from user-visible text
  const textParts = stickyParts.filter(isTextPart).filter((p) => (p as TextPart).text?.trim() && !(p as TextPart).synthetic && !(p as any).ignored);
  const rawText = textParts.map((p) => (p as TextPart).text).join('\n');
  const { cleanText: textAfterFiles, files: uploadedFiles } = useMemo(() => parseFileReferences(rawText), [rawText]);
  const { cleanText: text, sessions: sessionRefs } = useMemo(() => parseSessionReferences(textAfterFiles), [textAfterFiles]);

  // Resolve effective command info: use runtime-tracked info or fall back to template matching
  const effectiveCommandInfo = useMemo(
    () => commandInfo ?? detectCommandFromText(rawText, commands),
    [commandInfo, rawText, commands],
  );

  // Extract DCP notifications from ignored text parts (DCP plugin sends ignored user messages)
  const ignoredTextParts = stickyParts.filter(isTextPart).filter((p) => (p as any).ignored && (p as TextPart).text?.trim());
  const ignoredRawText = ignoredTextParts.map((p) => (p as TextPart).text).join('\n');
  const dcpNotifications = useMemo(() => {
    if (!ignoredRawText) return [];
    return parseDCPNotifications(ignoredRawText).notifications;
  }, [ignoredRawText]);

  // Check if any text part was edited
  const isEdited = textParts.some((p) => (p as any).metadata?.edited);

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
    type SegType = 'file' | 'agent' | 'session';

    // Detect session @mentions first (titles can contain spaces, so indexOf is used)
    const sessionDetected: { start: number; end: number; type: SegType }[] = [];
    for (const s of sessionRefs) {
      const needle = `@${s.title}`;
      const idx = text.indexOf(needle);
      if (idx !== -1) {
        sessionDetected.push({ start: idx, end: idx + needle.length, type: 'session' });
      }
    }

    // Collect server-provided source refs (file/agent), filtering out any that
    // overlap with a session mention (the server sees @Title as a file mention
    // for the first word only — the session range is more accurate).
    const serverRefs = [
      ...filesWithSource.map((f) => ({
        start: f.source!.text!.start,
        end: f.source!.text!.end,
        type: 'file' as SegType,
      })),
      ...agentParts
        .filter((a) => a.source?.start !== undefined && a.source?.end !== undefined)
        .map((a) => ({
          start: a.source!.start,
          end: a.source!.end,
          type: 'agent' as SegType,
        })),
    ].filter((r) => !sessionDetected.some((s) => r.start >= s.start && r.start < s.end));

    // Merge session + server refs
    const allRefs = [...sessionDetected, ...serverRefs];

    if (allRefs.length > 0) {
      allRefs.sort((a, b) => a.start - b.start || b.end - a.end);
      const result: { text: string; type?: SegType }[] = [];
      let lastIndex = 0;
      for (const ref of allRefs) {
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
    const detected: { start: number; end: number; type: SegType }[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      const mStart = match.index;
      detected.push({ start: mStart, end: match.index + match[0].length, type: agentSet.has(match[1]) ? 'agent' : 'file' });
    }

    if (detected.length === 0) return [{ text, type: undefined }];

    detected.sort((a, b) => a.start - b.start || b.end - a.end);
    const result: { text: string; type?: SegType }[] = [];
    let lastIndex = 0;
    for (const ref of detected) {
      if (ref.start < lastIndex) continue;
      if (ref.start > lastIndex) result.push({ text: text.slice(lastIndex, ref.start) });
      result.push({ text: text.slice(ref.start, ref.end), type: ref.type });
      lastIndex = ref.end;
    }
    if (lastIndex < text.length) result.push({ text: text.slice(lastIndex) });
    return result;
  }, [text, filesWithSource, agentParts, agentNames, sessionRefs]);

  // If the message is purely DCP notifications (no real user content), render only the cards
  const hasUserContent = !!(text || uploadedFiles.length > 0 || sessionRefs.length > 0 || attachments.length > 0);

  if (!hasUserContent && dcpNotifications.length > 0) {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {dcpNotifications.map((n, i) => (
          <DCPNotificationCard key={i} notification={n} />
        ))}
      </div>
    );
  }

  // Command messages: render as a right-aligned card instead of the raw template text
  if (effectiveCommandInfo) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="inline-flex flex-col gap-1.5 px-4 py-2.5 rounded-2xl border border-border/60 bg-muted/40">
          <div className="flex items-center gap-2">
            <Terminal className="size-3.5 text-muted-foreground shrink-0" />
            <span className="font-mono text-sm text-foreground">/{effectiveCommandInfo.name}</span>
          </div>
          {effectiveCommandInfo.args && (
            <div className="text-xs text-muted-foreground pl-5.5 break-words max-w-[400px]" style={{ paddingLeft: '1.375rem' }}>
              {effectiveCommandInfo.args}
            </div>
          )}
        </div>
        {/* DCP notifications from ignored parts */}
        {dcpNotifications.length > 0 && (
          <div className="flex flex-col gap-1.5 w-full mt-1">
            {dcpNotifications.map((n, i) => (
              <DCPNotificationCard key={i} notification={n} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
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
              <div key={file.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30">
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
                  ) : seg.type === 'session' ? (
                    <span
                      key={i}
                      className="text-emerald-500 font-medium cursor-pointer hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        const title = seg.text.replace(/^@/, '');
                        const ref = sessionRefs.find((s) => s.title === title);
                        if (ref) {
                          openTabAndNavigate({
                            id: ref.id,
                            title: ref.title || 'Session',
                            type: 'session',
                            href: `/sessions/${ref.id}`,
                            serverId: useServerStore.getState().activeServerId,
                          });
                        }
                      }}
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
      {isEdited && (
        <span className="text-[10px] text-muted-foreground/50 pr-1">edited</span>
      )}

      {/* DCP notifications from ignored parts (rendered below user bubble if mixed) */}
      {dcpNotifications.length > 0 && (
        <div className="flex flex-col gap-1.5 w-full mt-1">
          {dcpNotifications.map((n, i) => (
            <DCPNotificationCard key={i} notification={n} />
          ))}
        </div>
      )}
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
  /** Providers data for the Connect Provider dialog */
  providers?: ProviderListResponse;
  /** Map of user message IDs to command info for rendering command pills */
  commandMessages?: Map<string, { name: string; args?: string }>;
  /** Available commands for template prefix matching (page refresh detection) */
  commands?: Command[];
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
  providers,
  commandMessages,
  commands,
}: SessionTurnProps) {
  const [copied, setCopied] = useState(false);
  const [userCopied, setUserCopied] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [connectProviderOpen, setConnectProviderOpen] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);

  // Handler for action buttons on turn errors (e.g. "Check settings" opens provider dialog)
  const handleTurnErrorAction = useCallback(() => {
    setConnectProviderOpen(true);
  }, []);

  // Derived state from shared helpers
  const allParts = useMemo(() => collectTurnParts(turn), [turn]);
  const isLast = useMemo(
    () => isLastUserMessage(turn.userMessage.info.id, allMessages),
    [turn.userMessage.info.id, allMessages],
  );
  // A turn is "working" when:
  // 1. The session status says busy/retry (via getWorkingState), OR
  // 2. This is the last turn AND the parent component says isBusy (e.g. we
  //    just sent a message but sessionStatus hasn't updated to busy yet).
  //    This covers the race between sending and the server acknowledging.
  const working = useMemo(
    () => getWorkingState(sessionStatus, isLast) || (isLast && isBusy),
    [sessionStatus, isLast, isBusy],
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
  const retryInfo = useMemo(() => (isLast ? getRetryInfo(sessionStatus) : undefined), [sessionStatus, isLast]);

  // Cost info (only when not working)
  const costInfo = useMemo(() => (!working ? getTurnCost(allParts) : undefined), [allParts, working]);

  // Turn error — derived directly from message data (same approach as SolidJS reference)
  const turnError = useMemo(() => getTurnError(turn), [turn]);

  // Shell mode detection
  const shellModePart = useMemo(() => getShellModePart(turn), [turn]);

  // Permission/question matching for this session
  const nextPermission = useMemo(() => permissions.filter((p) => p.sessionID === sessionId)[0], [permissions, sessionId]);
  const nextQuestion = useMemo(() => questions.filter((q) => q.sessionID === sessionId)[0], [questions, sessionId]);

  // Hidden tool parts (when permission/question is active)
  const hidden = useMemo(() => getHiddenToolParts(nextPermission, nextQuestion), [nextPermission, nextQuestion]);

  // Answered question parts (shown outside collapsed steps)
  const answeredQuestionParts = useMemo(() => getAnsweredQuestionParts(turn, stepsExpanded, !!nextQuestion), [turn, stepsExpanded, nextQuestion]);

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
    const startTime = (turn.userMessage.info as any)?.time?.created;
    if (!startTime) return;

    if (!working) {
      const lastMsg = turn.assistantMessages[turn.assistantMessages.length - 1];
      const endTime = (lastMsg?.info as any)?.time?.completed || (lastMsg?.info as any)?.time?.created || startTime;
      setDuration(formatDuration(endTime - startTime));
      return;
    }
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
          <TurnErrorDisplay errorText={turnError} className="mt-2" />
        )}
        <ConnectProviderDialog
          open={connectProviderOpen}
          onOpenChange={setConnectProviderOpen}
          providers={providers}
        />
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
        <UserMessageRow
          message={turn.userMessage}
          agentNames={agentNames}
          commandInfo={commandMessages?.get(turn.userMessage.info.id)}
          commands={commands}
        />
        {/* User message actions — copy, edit, delete */}
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
            {/* Edit/Delete for user text parts */}
            {(() => {
              const userTextPart = turn.userMessage.parts.find(
                (p) => isTextPart(p) && (p as TextPart).text?.trim() && !(p as TextPart).synthetic,
              );
              if (!userTextPart) return null;
              return (
                <PartActions
                  part={userTextPart}
                  messageId={turn.userMessage.info.id}
                  sessionId={sessionId}
                  isBusy={isBusy}
                />
              );
            })()}
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
            className={cn('dark:invert-0 invert flex-shrink-0')}
            style={{ height: '14px', width: 'auto' }}
          />
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
                <div key={part.id}>
                  <ToolPartRenderer
                    part={part}
                    sessionId={sessionId}
                    permission={perm}
                    question={question}
                    onPermissionReply={onPermissionReply}
                    onQuestionReply={onQuestionReply}
                    onQuestionReject={onQuestionReject}
                  />
                </div>
              );
            }

            // Snapshot parts — collapsible metadata
            if (isSnapshotPart(part)) {
              return (
                <div key={part.id}>
                  <OcSnapshotPartView part={part} />
                </div>
              );
            }

            // Patch parts — collapsible with file list
            if (isPatchPart(part)) {
              return (
                <div key={part.id}>
                  <OcPatchPartView part={part} sessionId={sessionId} />
                </div>
              );
            }

            return null;
          })}

          {/* TodoWrite is now rendered in the chat input area — skip here */}

          {/* Error at bottom of steps */}
          {turnError && (
            <TurnErrorDisplay errorText={turnError} />
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

      {/* Streaming text is only visible inside expanded steps (matching SolidJS reference) */}


      {/* Error — always visible. Shown here (outside steps) when steps are collapsed OR when there are no steps at all */}
      {turnError && (!stepsExpanded || (!working && !hasSteps)) && (
        <TurnErrorDisplay errorText={turnError} />
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

      {/* Unified action bar — copy, edit, delete, fork, revert under the response */}
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

      {/* Connect Provider Dialog — opened from turn error action buttons */}
      <ConnectProviderDialog
        open={connectProviderOpen}
        onOpenChange={setConnectProviderOpen}
        providers={providers}
      />
    </div>
  );
}

// ============================================================================
// Main SessionChat Component
// ============================================================================

interface SessionChatProps {
  sessionId: string;
  /** Optional element rendered at the leading (left) edge of the session header */
  headerLeadingAction?: React.ReactNode;
  /** Hide the session site header entirely */
  hideHeader?: boolean;
}

export function SessionChat({ sessionId, headerLeadingAction, hideHeader }: SessionChatProps) {
  // ---- Context modal ----
  const [contextModalOpen, setContextModalOpen] = useState(false);

  // ---- KortixComputer side panel ----
  const { isSidePanelOpen, setIsSidePanelOpen, openFileInComputer } = useKortixComputerStore();
  const handleTogglePanel = useCallback(() => {
    setIsSidePanelOpen(!isSidePanelOpen);
  }, [isSidePanelOpen, setIsSidePanelOpen]);

  // ---- Hooks ----
  const { data: session, isLoading: sessionLoading } = useOpenCodeSession(sessionId);
  const { messages, status: sessionStatus, isBusy, isLoading: messagesLoading, permissions: pendingPermissions, questions: pendingQuestions } = useSessionSync(sessionId);
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

  // ---- Unified model/agent/variant state (1:1 port of SolidJS local.tsx) ----
  const local = useOpenCodeLocal({ agents, providers, config });

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
    if (msg.model) local.model.set(msg.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUserMessage?.info.id]);

  // ---- Session status comes from useSessionSync above ----

  // ---- Message Queue ----
  const allQueuedMessages = useMessageQueueStore((s) => s.messages);
  const queuedMessages = useMemo(
    () => allQueuedMessages.filter((m) => m.sessionId === sessionId),
    [allQueuedMessages, sessionId],
  );
  const queueDequeue = useMessageQueueStore((s) => s.dequeue);
  const queueRemove = useMessageQueueStore((s) => s.remove);
  const queueMoveUp = useMessageQueueStore((s) => s.moveUp);
  const queueMoveDown = useMessageQueueStore((s) => s.moveDown);
  const queueClearSession = useMessageQueueStore((s) => s.clearSession);

  // Auto-drain: when server transitions to idle and there are queued messages,
  // send the next one. Single effect — no double-drain guards needed.
  const prevBusyRef = useRef(isBusy);
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = isBusy;

    if (wasBusy && !isBusy && queuedMessages.length > 0) {
      const timer = setTimeout(() => {
        const next = queueDequeue(sessionId);
        if (next) handleSend(next.text, next.files);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isBusy, queuedMessages.length, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Send now" handler: abort current session + send the queued message
  const handleQueueSendNow = useCallback(
    (messageId: string) => {
      const msg = useMessageQueueStore.getState().messages.find((m) => m.id === messageId);
      if (!msg) return;
      queueRemove(messageId);
      abortSession.mutate(sessionId);
      setTimeout(() => {
        handleSend(msg.text, msg.files);
      }, 150);
    },
    [sessionId, abortSession, queueRemove], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- Dashboard handoff: send pending prompt on mount (fire-and-forget) ----
  const handoffDone = useRef(false);
  useEffect(() => {
    if (handoffDone.current) return;
    const pending = sessionStorage.getItem(`opencode_pending_prompt:${sessionId}`);
    if (!pending) return;
    handoffDone.current = true;
    sessionStorage.removeItem(`opencode_pending_prompt:${sessionId}`);
    sessionStorage.removeItem(`opencode_pending_send_failed:${sessionId}`);

    // Restore agent/model/variant from dashboard
    const options: Record<string, unknown> = {};
    try {
      const raw = sessionStorage.getItem(`opencode_pending_options:${sessionId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        sessionStorage.removeItem(`opencode_pending_options:${sessionId}`);
        if (parsed?.agent) { options.agent = parsed.agent; local.agent.set(parsed.agent as string); }
        if (parsed?.model) { options.model = parsed.model; local.model.set(parsed.model as { providerID: string; modelID: string }); }
        if (parsed?.variant) { options.variant = parsed.variant; local.model.variant.set(parsed.variant as string); }
      }
    } catch {
      // ignore
    }

  // Clear pendingSendInFlight once the server acknowledges it's working,
  // or when new messages arrive from the server.
  // This bridges the gap between the optimistic prompt clearing and the
  // server status updating — keeps isBusy true so the turn shows a loader.
  useEffect(() => {
    if (!pendingSendInFlight) return;
    if (isServerBusy) {
      setPendingSendInFlight(false);
      return;
    }
    // If messages include assistant content, the server already processed it
    const hasAssistant = messages?.some((m) => m.info.role === 'assistant');
    if (hasAssistant) {
      setPendingSendInFlight(false);
    }
  }, [pendingSendInFlight, isServerBusy, messages]);

  // Safety timeout: clear pendingSendInFlight after 30s even if the server
  // never acknowledged. Prevents the UI from being stuck forever in "busy"
  // when the send succeeded (HTTP 204) but the server never started processing.
  useEffect(() => {
    if (!pendingSendInFlight) return;
    const timer = setTimeout(() => {
      setPendingSendInFlight(false);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [pendingSendInFlight]);

  // Stale session watchdog: when the session has been busy for a while, do a
  // direct status check. If the server reports idle (or doesn't include the
  // session at all — meaning it's idle), force the status to idle — recovering
  // from a silently dropped SSE stream or missed event.
  // First check after 5s, then every 15s.
  useEffect(() => {
    if (!isServerBusy) return;

    const check = async () => {
      try {
        const client = getClient();
        const result = await client.session.status();
        if (result.data) {
          const statuses = result.data as Record<string, any>;
          const serverStatus = statuses[sessionId];
          if (serverStatus) {
            useOpenCodeSessionStatusStore.getState().setStatus(sessionId, serverStatus);
          } else {
            // Server didn't include this session — it's idle
            useOpenCodeSessionStatusStore.getState().setStatus(sessionId, { type: 'idle' });
          }
        }
      } catch {
        // ignore — next interval will retry
      }
    };

    // First check after 5s, then every 15s
    const initialTimer = setTimeout(() => {
      check();
    }, 5_000);
    const interval = setInterval(check, 15_000);
    return () => { clearTimeout(initialTimer); clearInterval(interval); };
  }, [isServerBusy, sessionId]);

  // Message-based idle detection: if the last assistant message has
  // time.completed set, the server marked the message as completed but we never got the
  // idle event — force the session to idle after a short grace period
  // to avoid racing with a status event that's still in flight.
  useEffect(() => {
    if (!isServerBusy || !messages || messages.length === 0) return;
    // Find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.info.role === 'assistant') {
        const assistantInfo = msg.info as any;
        if (assistantInfo.time?.completed) {
          const timer = setTimeout(() => {
            const currentStatus = useOpenCodeSessionStatusStore.getState().statuses[sessionId];
            if (currentStatus?.type === 'busy' || currentStatus?.type === 'retry') {
              useOpenCodeSessionStatusStore.getState().setStatus(sessionId, { type: 'idle' });
            }
          }, 2_000);
          return () => clearTimeout(timer);
        }
        break; // only check the last assistant message
      }
    }
  }, [isServerBusy, messages, sessionId]);

  // Clear pending user message when server acknowledges (status becomes busy)
  // or when new messages arrive from the server.
  // When a command was pending, associate the newest user message with the
  // command info so UserMessageRow can render a nice pill instead of raw template text.
  const prevMsgLenRef = useRef(messages?.length || 0);
  useEffect(() => {
    if (!pendingUserMessage) return;
    // Server reported busy → it received our prompt, real messages incoming
    if (isServerBusy) {
      setPendingUserMessage(null);
      setPendingCommand(null);
      return;
    }
    // New messages arrived from server → clear optimistic display
    const len = messages?.length || 0;
    if (len > prevMsgLenRef.current) {
      setPendingUserMessage(null);
      setPendingCommand(null);
    }
  }, [isServerBusy, messages?.length, pendingUserMessage]);

  // Associate stashed command info with the newest user message when messages arrive.
  // Runs separately so it captures the mapping even if busy fires before messages update.
  useEffect(() => {
    const stash = pendingCommandStashRef.current;
    if (!stash || !messages) return;
    const len = messages.length;
    if (len <= prevMsgLenRef.current) return;
    // Find the last user message — the one just created by the command
    for (let i = len - 1; i >= 0; i--) {
      if (messages[i].info.role === 'user') {
        commandMessagesRef.current.set(messages[i].info.id, stash);
        pendingCommandStashRef.current = null;
        break;
      }
    }
  }, [messages]);

  useEffect(() => {
    prevMsgLenRef.current = messages?.length || 0;
  }, [messages?.length]);

  // ---- Auto-scroll (replaces inline scroll logic) ----
  const { scrollRef, contentRef, showScrollButton, scrollToBottom } = useAutoScroll({
    working: isBusy,
  });

  // Scroll to bottom when switching session tabs or on initial message load.
  // Uses scrollToBottom() from the hook so the programmatic-scroll guard works
  // correctly and doesn't interfere with user-intent detection.
  const initialScrollDoneRef = useRef<string | null>(null);
  useEffect(() => {
    // Reset on session change so we scroll on first render of new session
    if (initialScrollDoneRef.current !== sessionId) {
      initialScrollDoneRef.current = null;
    }
  }, [sessionId]);

  // ---- Pending permissions & questions come from useSessionSync above ----

  // ---- Permission/question reply handlers (with double-click guard) ----
  const [responding, setResponding] = useState(false);

  const handlePermissionReply = useCallback(
    async (requestId: string, reply: 'once' | 'always' | 'reject') => {
      if (responding) return;
      setResponding(true);
      replyToPermission(requestId, reply)
        .catch(() => {})
        .finally(() => setResponding(false));
      // Removal handled by SSE permission.replied event → sync store
    },
    [responding],
  );

  const handleQuestionReply = useCallback(
    async (requestId: string, answers: string[][]) => {
      if (responding) return;
      setResponding(true);
      replyToQuestion(requestId, answers)
        .catch(() => {})
        .finally(() => setResponding(false));
      // Removal handled by SSE question.replied event → sync store
    },
    [responding],
  );

  const handleQuestionReject = useCallback(
    async (requestId: string) => {
      if (responding) return;
      setResponding(true);
      rejectQuestion(requestId)
        .catch(() => {})
        .finally(() => setResponding(false));
      // Removal handled by SSE question.rejected event → sync store
    },
    [responding],
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

  // Auto-expand last turn when server reports busy (purely server-driven)
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const lastUserId = [...messages].reverse().find((m) => m.info.role === 'user')?.info.id;
    if (lastUserId && isBusy) {
      setExpanded((prev) => ({ ...prev, [lastUserId]: true }));
    }
  }, [messages, sessionStatus, isBusy]);

  // Reset on session change
  useEffect(() => {
    setExpanded({});
    handoffDone.current = false;
  }, [sessionId]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ============================================================================
  // Billing: DISABLED — billing is handled server-side by the router
  // (POST /v1/router/chat/completions deducts credits per LLM call).
  // This frontend useEffect was causing double-billing once opencode.jsonc
  // got cost config and step-finish.cost became non-zero.
  // ============================================================================


  // ============================================================================
  // Fork / Revert / Unrevert handlers
  // ============================================================================

  const isReverted = !!session?.revert;

  const handleFork = useCallback(
    async (messageId: string) => {
      let forkAtMessageId: string | undefined;
      if (messages) {
        const idx = messages.findIndex((m) => m.info.id === messageId);
        if (idx >= 0 && idx < messages.length - 1) {
          forkAtMessageId = messages[idx + 1].info.id;
        }
      }

      const forkedSession = await forkSession.mutateAsync({
        sessionId,
        messageId: forkAtMessageId,
      });

      const title = forkedSession.title || 'Forked session';
      openTabAndNavigate({
        id: forkedSession.id,
        title,
        type: 'session',
        href: `/sessions/${forkedSession.id}`,
        parentSessionId: sessionId,
        serverId: useServerStore.getState().activeServerId,
      });
      localStorage.setItem(`fork_origin_${forkedSession.id}`, sessionId);
    },
    [sessionId, forkSession, messages],
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
    async (text: string, files?: AttachedFile[], mentions?: TrackedMention[]) => {
      playSound('send');
      scrollToBottom();

      const options: Record<string, unknown> = {};
      if (local.agent.current) options.agent = local.agent.current.name;
      if (local.model.currentKey) options.model = local.model.currentKey;
      if (local.model.variant.current) options.variant = local.model.variant.current;

      // Build parts: text first, then upload attached files
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

      // Append session reference hints for @session mentions
      const sessionMentions = mentions?.filter((m) => m.kind === 'session' && m.value);
      if (sessionMentions && sessionMentions.length > 0) {
        const refs = sessionMentions
          .map((m) => `<session_ref id="${m.value}" title="${m.label}" />`)
          .join('\n');
        parts.push({
          type: 'text',
          text: `\n\nReferenced sessions (use the session_context tool to fetch details when needed):\n${refs}`,
        });
      }

      // Generate ascending ID and insert optimistic user message into sync store
      const messageID = ascendingId();
      const optimisticParts = parts.map((p) => ({
        id: ascendingId('prt'),
        type: p.type as 'text',
        sessionID: sessionId,
        messageID,
        ...(p.type === 'text' ? { text: (p as { text: string }).text } : {}),
      })) as any[];

      useSyncStore.getState().optimisticAdd(sessionId, {
        id: messageID,
        sessionID: sessionId,
        role: 'user' as const,
        time: { created: Date.now() },
        ...(local.agent.current && { agent: local.agent.current.name }),
        ...(local.model.currentKey && { model: local.model.currentKey }),
      } as any, optimisticParts);

      // Fire and forget — SSE reconciles
      sendMessage.mutateAsync({
        sessionId,
        parts,
        options: Object.keys(options).length > 0 ? options as any : undefined,
        messageID,
      }).catch(() => {
        // Send failed — remove optimistic message
        useSyncStore.getState().optimisticRemove(sessionId, messageID);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, sendMessage, local.agent.current, local.model.currentKey, local.model.variant.current, scrollToBottom],
  );

  const handleStop = useCallback(() => {
    abortSession.mutate(sessionId);
  }, [sessionId, abortSession]);

  const handleCommand = useCallback(
    (cmd: Command, args?: string) => {
      playSound('send');
      scrollToBottom();
      executeCommand.mutate(
        { sessionId, command: cmd.name, args },
      );
    },
    [sessionId, executeCommand, scrollToBottom],
  );

  const handleFileSearch = useCallback(async (query: string): Promise<string[]> => {
    try {
      return await findOpenCodeFiles(query);
    } catch {
      return [];
    }
  }, []);

  // Detect if this session was forked and resolve its parent.
  const forkParentId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`fork_origin_${sessionId}`);
  }, [sessionId]);
  const isSubSession = !!session?.parentID || !!forkParentId;
  const isFork = !!forkParentId;
  const effectiveParentId = session?.parentID || forkParentId;

  const { data: parentSessionData } = useOpenCodeSession(effectiveParentId || '');
  const threadContext = useMemo(() => {
    if (!effectiveParentId || !parentSessionData) return undefined;
    return {
      variant: isFork ? 'fork' as const : 'thread' as const,
      parentTitle: parentSessionData.title || 'Parent session',
      onBackToParent: () => {
        openTabAndNavigate({
          id: parentSessionData.id,
          title: parentSessionData.title || 'Parent session',
          type: 'session',
          href: `/sessions/${parentSessionData.id}`,
          serverId: useServerStore.getState().activeServerId,
        });
      },
    };
  }, [effectiveParentId, parentSessionData, isFork]);

  // ============================================================================
  // Loading / Not-found states
  // ============================================================================

  const isDataLoading = sessionLoading || messagesLoading;
  const isNotFound = !session && !sessionLoading;

  const hasMessages = messages && messages.length > 0;

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Loading overlay */}
      {isDataLoading && !hasMessages && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <KortixLoader size="small" />
        </div>
      )}

      {/* Not-found overlay */}
      {isNotFound && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background text-sm text-muted-foreground">
          Session not found
        </div>
      )}
      {/* Session header */}
      {!hideHeader && (
        <SessionSiteHeader
          sessionId={sessionId}
          sessionTitle={session?.title || 'Untitled'}
          onToggleSidePanel={handleTogglePanel}
          isSidePanelOpen={isSidePanelOpen}
          canOpenSidePanel={hasToolCalls}
          leadingAction={headerLeadingAction}
        />
      )}

      {/* Revert banner */}
      {isReverted && session?.revert?.messageID && (
        <RevertBanner
          sessionId={sessionId}
          revertMessageId={session.revert.messageID}
          loading={unrevertSession.isPending}
          onUnrevert={handleUnrevert}
        />
      )}

      {/* Context modal */}
      <SessionContextModal
        open={contextModalOpen}
        onOpenChange={setContextModalOpen}
        messages={messages}
        session={session}
        providers={providers}
      />

      {hasMessages ? (
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 pb-32 bg-background h-full [scroll-behavior:auto]"
          >
            <div
              ref={contentRef}
              role="log"
              className="mx-auto max-w-3xl min-w-0 w-full px-3 sm:px-6"
            >
              <div className="flex flex-col gap-12 min-w-0">
                {/* Fork context divider */}
                {isFork && effectiveParentId && (
                  <ForkContextDivider parentID={effectiveParentId} />
                )}

                {/* Turn-based message rendering */}
                {turns.map((turn, turnIndex) => {
                  const hasCompaction = turn.assistantMessages.some(
                    (msg) => (msg.info as any).summary === true
                  ) || turn.assistantMessages.some(
                    (msg) => msg.parts.some((p) => p.type === 'compaction')
                  );

                  return (
                    <div key={turn.userMessage.info.id}>
                      {hasCompaction && (
                        <div className="flex items-center gap-3 py-4 my-3">
                          <div className="flex-1 h-px bg-border" />
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/80 border border-border/60">
                            <Layers className="size-3.5 text-muted-foreground" />
                            <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
                              Compaction
                            </span>
                          </div>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <SessionTurn
                        turn={turn}
                        allMessages={messages!}
                        sessionId={sessionId}
                        sessionStatus={sessionStatus}
                        permissions={pendingPermissions}
                        questions={pendingQuestions}
                        stepsExpanded={!!expanded[turn.userMessage.info.id]}
                        onToggleSteps={() => toggleExpanded(turn.userMessage.info.id)}
                        onPermissionReply={handlePermissionReply}
                        onQuestionReply={handleQuestionReply}
                        onQuestionReject={handleQuestionReject}
                        agentNames={agentNames}
                        isFirstTurn={turnIndex === 0}
                        isBusy={isBusy}
                        isReverted={isReverted}
                        isCompaction={hasCompaction}
                        onFork={handleFork}
                        onRevert={handleRevert}
                        providers={providers}
                        commands={commands}
                      />
                    </div>
                  );
                })}
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
              className="rounded-full h-7 text-xs bg-background/90 backdrop-blur-sm border-border/60"
              onClick={scrollToBottom}
            >
              <ArrowDown className="size-3 mr-1" />
              Scroll to bottom
            </Button>
          </div>
        </div>
      ) : (
        <SessionWelcome />
      )}

      {/* Queued messages popup */}
      {queuedMessages.length > 0 && (
        <div className="mx-auto w-full max-w-3xl px-2 sm:px-4">
          <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm overflow-hidden mb-1">
            <div className="flex items-center justify-between w-full px-3 py-2">
              <div className="flex items-center gap-2">
                <ListPlus className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Queued
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded-md">
                  {queuedMessages.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => queueClearSession(sessionId)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') queueClearSession(sessionId); }}
                      className="inline-flex items-center justify-center size-5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p className="text-xs">Clear all</p></TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="border-t border-border/40">
              <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: '240px' }}>
                <div className="flex flex-col gap-0.5 p-1.5">
                  {queuedMessages.map((qm, idx) => (
                    <div
                      key={qm.id}
                      className="group/queued flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-[10px] tabular-nums text-muted-foreground/40 mt-1 shrink-0 w-4 text-center">
                        {idx + 1}
                      </span>
                      <p className="flex-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words line-clamp-2 min-w-0">
                        {qm.text}
                      </p>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/queued:opacity-100 transition-opacity shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => handleQueueSendNow(qm.id)}
                              className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                            >
                              <Send className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p className="text-xs">Send now</p></TooltipContent>
                        </Tooltip>
                        {idx > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => queueMoveUp(qm.id)}
                                className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                              >
                                <ArrowUp className="size-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Move up</p></TooltipContent>
                          </Tooltip>
                        )}
                        {idx < queuedMessages.length - 1 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => queueMoveDown(qm.id)}
                                className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                              >
                                <ArrowDown className="size-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Move down</p></TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => queueRemove(qm.id)}
                              className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            >
                              <X className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p className="text-xs">Remove</p></TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
        sessionId={sessionId}
        onFileSearch={handleFileSearch}
        providers={providers}
        threadContext={threadContext}
        onContextClick={() => setContextModalOpen(true)}
      />
    </div>
  );
}
