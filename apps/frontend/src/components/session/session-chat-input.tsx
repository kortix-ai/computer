'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowUp,
  ChevronDown,
  Check,
  Loader2,
  Paperclip,
  X,
  FileText,
  FileCode,
  FileImage,
  FileAudio,
  FileVideo,
  FileSpreadsheet,
  File,
  Archive,
  Database,
  ListPlus,
  MessageSquare,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VoiceRecorder } from '@/components/thread/chat-input/voice-recorder';
import { ModelSelector } from './model-selector';
import type {
  MessageWithParts,
  Agent,
  Command,
  ProviderListResponse,
} from '@/hooks/opencode/use-opencode-sessions';
import { useSummarizeOpenCodeSession, findOpenCodeFiles, useOpenCodeSessions } from '@/hooks/opencode/use-opencode-sessions';
import type { Session } from '@/hooks/opencode/use-opencode-sessions';
import { toast } from '@/lib/toast';
import { useMessageQueueStore } from '@/stores/message-queue-store';

export type { ProviderListResponse };

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// ============================================================================
// Flat model list helper
// ============================================================================

export interface FlatModel {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
  variants?: Record<string, Record<string, unknown>>;
  /** Capabilities extracted from the provider API response */
  capabilities?: {
    reasoning?: boolean;
    vision?: boolean;
    toolcall?: boolean;
  };
  /** Context window size in tokens */
  contextWindow?: number;
  /** ISO date string for release date */
  releaseDate?: string;
  /** Model family (used for "latest" logic) */
  family?: string;
  /** Cost per token (input/output) */
  cost?: {
    input: number;
    output: number;
  };
  /** Provider source (env, api, config, custom) */
  providerSource?: string;
}

export function flattenModels(providers: ProviderListResponse | undefined): FlatModel[] {
  if (!providers) return [];
  const result: FlatModel[] = [];
  for (const p of providers.all) {
    if (!providers.connected.includes(p.id)) continue;
    for (const [modelID, model] of Object.entries(p.models)) {
      const caps = (model as any).capabilities;
      const modalities = (model as any).modalities;
      result.push({
        providerID: p.id,
        providerName: p.name,
        modelID,
        modelName: (model.name || modelID).replace('(latest)', '').trim(),
        variants: model.variants,
        capabilities: caps ? {
          reasoning: caps.reasoning ?? false,
          vision: caps.input?.image ?? false,
          toolcall: caps.toolcall ?? false,
        } : {
          reasoning: (model as any).reasoning ?? false,
          vision: modalities?.input?.includes('image') ?? false,
          toolcall: (model as any).tool_call ?? false,
        },
        contextWindow: (model as any).limit?.context,
        releaseDate: (model as any).release_date,
        family: (model as any).family,
        cost: (model as any).cost ? {
          input: (model as any).cost.input ?? 0,
          output: (model as any).cost.output ?? 0,
        } : undefined,
        providerSource: (p as any).source,
      });
    }
  }
  return result;
}

// ============================================================================
// Agent Selector
// ============================================================================

function AgentSelector({
  agents,
  selectedAgent,
  onSelect,
}: {
  agents: Agent[];
  selectedAgent: string | null;
  onSelect: (agentName: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevAgentRef = useRef(selectedAgent);

  // Flash highlight when agent changes (e.g. via Tab cycling)
  useEffect(() => {
    if (prevAgentRef.current !== selectedAgent && prevAgentRef.current !== null) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 400);
      return () => clearTimeout(timer);
    }
    prevAgentRef.current = selectedAgent;
  }, [selectedAgent]);

  // Update ref after flash starts
  useEffect(() => {
    prevAgentRef.current = selectedAgent;
  }, [selectedAgent]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const currentAgent = agents.find((a) => a.name === selectedAgent);
  const displayName = currentAgent?.name || agents[0]?.name || 'Agent';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 capitalize cursor-pointer",
          flash && "bg-primary/10 text-foreground",
        )}
      >
        <span className="truncate max-w-[80px]">{displayName}</span>
        <ChevronDown className={cn('size-3 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]">
          <div className="max-h-48 overflow-y-auto p-1">
            {agents.map((agent) => {
              const isSelected = selectedAgent === agent.name || (!selectedAgent && agent === agents[0]);
              return (
                <button
                  key={agent.name}
                  onClick={() => {
                    onSelect(agent.name);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] hover:bg-muted transition-colors capitalize cursor-pointer',
                    isSelected && 'bg-muted',
                  )}
                >
                  <span className="flex-1 text-left truncate">{agent.name}</span>
                  {isSelected && (
                    <Check className="size-3.5 text-foreground shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ModelSelector is now a standalone component: ./model-selector.tsx

// ============================================================================
// Variant / Thinking Mode Selector
// ============================================================================

function VariantSelector({
  variants,
  selectedVariant,
  onSelect,
}: {
  variants: string[];
  selectedVariant: string | null;
  onSelect: (variant: string | null) => void;
}) {
  const currentIndex = selectedVariant ? variants.indexOf(selectedVariant) : -1;

  function cycle() {
    if (variants.length === 0) return;
    const nextIndex = (currentIndex + 1) % (variants.length + 1);
    onSelect(nextIndex === variants.length ? null : variants[nextIndex]);
  }

  const displayName = selectedVariant || 'Default';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={cycle}
          className={cn(
            "inline-flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer capitalize",
            selectedVariant && "text-foreground",
          )}
        >
          {displayName}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">Cycle thinking effort</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Token Progress Circle
// ============================================================================

const AUTO_COMPACT_THRESHOLD = 0.9;

function TokenProgress({ messages, sessionId, models, selectedModel }: { messages: MessageWithParts[] | undefined; sessionId?: string; models?: FlatModel[]; selectedModel?: { providerID: string; modelID: string } | null }) {
  const summarize = useSummarizeOpenCodeSession();
  const autoCompactTriggered = useRef(false);
  const [isCompacting, setIsCompacting] = useState(false);

  // Use the LAST assistant message's input tokens as the context window fill level.
  // Each API call's input tokens represent the full prompt size (all prior context),
  // so the last one reflects the current context window usage — not a cumulative sum.
  const contextTokens = useMemo(() => {
    if (!messages) return 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.info.role === 'assistant') {
        const tokens = (msg.info as any).tokens;
        if (tokens && (tokens.input || 0) > 0) {
          return tokens.input as number;
        }
      }
    }
    return 0;
  }, [messages]);

  // Use the actual model's context window instead of a hardcoded value
  const contextLimit = useMemo(() => {
    if (selectedModel && models) {
      const model = models.find(
        (m) => m.providerID === selectedModel.providerID && m.modelID === selectedModel.modelID
      );
      if (model?.contextWindow && model.contextWindow > 0) {
        return model.contextWindow;
      }
    }
    return 200000; // fallback
  }, [models, selectedModel]);

  const ratio = contextTokens > 0 ? Math.min(contextTokens / contextLimit, 1) : 0;

  // Reset auto-compact flag if ratio drops below threshold (e.g. after compaction)
  useEffect(() => {
    if (ratio < AUTO_COMPACT_THRESHOLD) {
      autoCompactTriggered.current = false;
    }
  }, [ratio]);

  // Auto-compact at 90% threshold
  useEffect(() => {
    if (
      ratio >= AUTO_COMPACT_THRESHOLD &&
      !autoCompactTriggered.current &&
      !isCompacting &&
      !summarize.isPending &&
      sessionId
    ) {
      autoCompactTriggered.current = true;
      setIsCompacting(true);
      toast.info('Context is 90% full — auto-compacting session...');

      summarize.mutate({ sessionId }, {
        onSuccess: () => {
          toast.success('Session compacted successfully');
          setIsCompacting(false);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to auto-compact session');
          setIsCompacting(false);
        },
      });
    }
  }, [ratio, sessionId, isCompacting, summarize]);

  if (contextTokens === 0) return null;

  const circumference = 2 * Math.PI * 7;
  const offset = circumference * (1 - ratio);

  // Color thresholds: >90% = amber/yellow warning, >80% = orange, default = muted
  const circleColor = isCompacting
    ? 'text-blue-500 animate-pulse'
    : ratio >= AUTO_COMPACT_THRESHOLD
      ? 'text-amber-400'
      : ratio > 0.8
        ? 'text-orange-500'
        : 'text-muted-foreground';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative size-6 flex items-center justify-center cursor-default">
          <svg className="size-5 -rotate-90" viewBox="0 0 18 18">
            <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" />
            <circle
              cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              className={circleColor}
            />
          </svg>
          {/* Pulsing dot indicator when compacting */}
          {isCompacting && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="text-xs font-mono space-y-1">
          <div>Context: {(contextTokens / 1000).toFixed(1)}k / {(contextLimit / 1000).toFixed(0)}k tokens</div>
          <div className="text-muted-foreground">{Math.round(ratio * 100)}% of context used</div>
          {isCompacting && (
            <div className="text-blue-500 font-sans pt-0.5">
              Compacting session...
            </div>
          )}
          {!isCompacting && ratio >= AUTO_COMPACT_THRESHOLD && (
            <div className="text-amber-400 font-sans pt-0.5">
              Context almost full — compaction will start automatically.
            </div>
          )}
          {!isCompacting && ratio > 0.8 && ratio < AUTO_COMPACT_THRESHOLD && (
            <div className="text-orange-500 font-sans pt-0.5">
              Context getting full. Consider compacting.
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// File Attachment Helpers
// ============================================================================

export interface AttachedFile {
  file: File;
  localUrl: string;
  isImage: boolean;
}

type FileType = 'image' | 'code' | 'text' | 'markdown' | 'pdf' | 'audio' | 'video' | 'spreadsheet' | 'csv' | 'archive' | 'database' | 'other';

function getFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, FileType> = {
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
    js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', css: 'code', html: 'code', vue: 'code', svelte: 'code',
    txt: 'text', log: 'text',
    md: 'markdown', mdx: 'markdown',
    pdf: 'pdf',
    mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
    mp4: 'video', mov: 'video', avi: 'video', webm: 'video',
    xls: 'spreadsheet', xlsx: 'spreadsheet',
    csv: 'csv',
    zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive',
    db: 'database', sqlite: 'database', sql: 'database',
    json: 'code', yaml: 'code', yml: 'code', toml: 'code', xml: 'code',
  };
  return map[ext] || 'other';
}

function getFileTypeLabel(type: FileType, ext: string): string {
  const labels: Record<FileType, string> = {
    image: 'Image', code: ext.toUpperCase(), text: 'Text', markdown: 'Markdown', pdf: 'PDF',
    audio: 'Audio', video: 'Video', spreadsheet: 'Spreadsheet', csv: 'CSV',
    archive: 'Archive', database: 'Database', other: ext.toUpperCase() || 'File',
  };
  return labels[type];
}

function getFileTypeIcon(type: FileType) {
  const icons: Record<FileType, typeof File> = {
    image: FileImage, code: FileCode, text: FileText, markdown: FileText, pdf: FileText,
    audio: FileAudio, video: FileVideo, spreadsheet: FileSpreadsheet, csv: FileSpreadsheet,
    archive: Archive, database: Database, other: File,
  };
  return icons[type];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

// ============================================================================
// Attachment Preview Strip
// ============================================================================

function AttachmentPreview({
  files,
  onRemove,
}: {
  files: AttachedFile[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {files.map((af, i) => {
        const ext = af.file.name.split('.').pop()?.toLowerCase() || '';
        const type = getFileType(af.file.name);
        const Icon = getFileTypeIcon(type);

        return (
          <div key={i} className="relative group">
            {af.isImage ? (
              <div className="h-[54px] w-[54px] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={af.localUrl} alt={af.file.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex items-center rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-sidebar h-[54px] w-fit min-w-[200px] max-w-[300px]">
                <div className="w-[54px] h-full flex items-center justify-center flex-shrink-0 bg-black/5 dark:bg-white/5">
                  <Icon className="h-5 w-5 text-black/60 dark:text-white/60" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center px-3 py-2 overflow-hidden">
                  <div className="text-sm font-medium truncate text-foreground">{af.file.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="truncate">{getFileTypeLabel(type, ext)}</span>
                    <span className="flex-shrink-0">&middot;</span>
                    <span className="flex-shrink-0">{formatFileSize(af.file.size)}</span>
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black dark:bg-white border-2 border-card text-white dark:text-black flex items-center justify-center z-10 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} strokeWidth={3} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Slash Command Popover — uses fixed positioning to escape overflow-hidden ancestors
// ============================================================================

function SlashCommandPopover({
  commands,
  filter,
  selectedIndex,
  onSelect,
  anchorRef,
}: {
  commands: Command[];
  filter: string;
  selectedIndex: number;
  onSelect: (command: Command) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)),
    );
  }, [commands, filter]);

  // Scroll selected item into view
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const item = container.children[selectedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  // Read position synchronously from the anchor ref — fixed positioning
  // escapes overflow-hidden ancestors without needing a portal.
  const el = anchorRef.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();

  return (
    <div
      className="fixed z-[9999] bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
      style={{ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width }}
    >
      <div ref={scrollRef} className="max-h-64 overflow-y-auto py-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.name}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            className={cn(
              'w-full flex flex-col gap-0.5 px-3 py-2 text-left transition-colors cursor-pointer rounded-lg mx-0',
              i === selectedIndex ? 'bg-muted' : 'hover:bg-muted',
            )}
          >
            <span className="font-mono text-sm text-foreground">/{cmd.name}</span>
            {cmd.description && (
              <span className="text-xs text-muted-foreground line-clamp-2">{cmd.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// @ Mention Types & Popover
// ============================================================================

export interface MentionItem {
  kind: 'file' | 'agent' | 'session';
  label: string;
  value: string;
  description?: string;
}

export interface TrackedMention {
  kind: 'file' | 'agent' | 'session';
  label: string;
  value?: string; // session ID for session mentions
}

function MentionPopover({
  items,
  selectedIndex,
  onSelect,
  loading,
  anchorRef,
}: {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
  loading?: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-mention-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const visible = items.length > 0 || !!loading;
  if (!visible) return null;

  const el = anchorRef.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();

  const agents = items.filter((i) => i.kind === 'agent');
  const sessions = items.filter((i) => i.kind === 'session');
  const files = items.filter((i) => i.kind === 'file');

  let globalIndex = 0;

  return (
    <div
      className="fixed z-[9999] bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
      style={{ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width }}
    >
      <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {agents.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Modes</div>
            {agents.map((item) => {
              const idx = globalIndex++;
              return (
                <button
                  key={`agent-${item.value}`}
                  data-mention-index={idx}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer',
                    idx === selectedIndex ? 'bg-muted' : 'hover:bg-muted',
                  )}
                >
                  <span className="size-4 rounded flex items-center justify-center bg-purple-500/15 text-purple-500 text-[10px] font-bold shrink-0">@</span>
                  <span className="truncate capitalize">{item.label}</span>
                  {item.description && <span className="text-muted-foreground truncate text-xs">{item.description}</span>}
                </button>
              );
            })}
          </>
        )}
        {sessions.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sessions</div>
            {sessions.map((item) => {
              const idx = globalIndex++;
              return (
                <button
                  key={`session-${item.value}`}
                  data-mention-index={idx}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer',
                    idx === selectedIndex ? 'bg-muted' : 'hover:bg-muted',
                  )}
                >
                  <MessageSquare className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate text-xs">{item.label}</span>
                  {item.description && <span className="text-muted-foreground truncate text-xs ml-auto">{item.description}</span>}
                </button>
              );
            })}
          </>
        )}
        {files.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Files</div>
            {files.map((item) => {
              const idx = globalIndex++;
              return (
                <button
                  key={`file-${item.value}`}
                  data-mention-index={idx}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer',
                    idx === selectedIndex ? 'bg-muted' : 'hover:bg-muted',
                  )}
                >
                  <FileCode className="size-3.5 text-blue-500 shrink-0" />
                  <span className="truncate font-mono text-xs">{item.label}</span>
                </button>
              );
            })}
          </>
        )}
        {/* Loading indicator while searching for files */}
        {loading && files.length === 0 && (
          <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span className="text-xs">Searching files...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Prompt history persistence
// ============================================================================

function loadPromptHistory(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// ============================================================================
// SessionChatInput - The unified chat input
// ============================================================================

export interface SessionChatInputProps {
  onSend: (text: string, files?: AttachedFile[], mentions?: TrackedMention[]) => void | Promise<void>;
  isBusy?: boolean;
  onStop?: () => void;
  agents?: Agent[];
  selectedAgent?: string | null;
  onAgentChange?: (agentName: string | null | undefined) => void;
  commands?: Command[];
  onCommand?: (command: Command, args?: string) => void;
  models?: FlatModel[];
  selectedModel?: { providerID: string; modelID: string } | null;
  onModelChange?: (model: { providerID: string; modelID: string } | null) => void;
  variants?: string[];
  selectedVariant?: string | null;
  onVariantChange?: (variant: string | null | undefined) => void;
  messages?: MessageWithParts[];
  /** Session ID — used for auto-compaction when context is nearly full */
  sessionId?: string;
  /** If true, disables the input (e.g. during session creation redirect) */
  disabled?: boolean;
  /** Auto-focus the textarea on mount (default: true on desktop) */
  autoFocus?: boolean;
  placeholder?: string;

  /** Callback to search files via SDK for @ mentions */
  onFileSearch?: (query: string) => Promise<string[]>;
  /** Full provider list response (for connect/manage provider dialogs) */
  providers?: ProviderListResponse;
}

export function SessionChatInput({
  onSend,
  isBusy = false,
  onStop,
  agents = [],
  selectedAgent = null,
  onAgentChange,
  commands = [],
  onCommand,
  models = [],
  selectedModel = null,
  onModelChange,
  variants = [],
  selectedVariant = null,
  onVariantChange,
  messages,
  sessionId,
  disabled = false,
  autoFocus,
  placeholder = 'Ask anything...',

  onFileSearch,
  providers,
}: SessionChatInputProps) {
  const placeholderVariants = useMemo(
    () => [
      placeholder,
      'Use / to run commands',
      'Reference files with @',
      'Ask about any file in this project',
      'Use Cmd+K to open command palette',
      'Press Tab to switch modes',
      'Use Up arrow to recall your last prompt',
      'Use Shift+Enter for a new line',
      'Ask to compact this session when context is full',
      'Ask for changed files and diffs',
      'Mention multiple files like @README.md @src/app.tsx',
      'Reference past sessions with @session-name',
    ],
    [placeholder],
  );
  const [text, setText] = useState('');
  const [showAnimatedPlaceholder, setShowAnimatedPlaceholder] = useState(true);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [slashFilter, setSlashFilter] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [stagedCommand, setStagedCommand] = useState<Command | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // File search: use provided callback or fall back to the SDK directly
  const fileSearchFn = useMemo(() => {
    if (onFileSearch) return onFileSearch;
    return async (query: string): Promise<string[]> => {
      try { return await findOpenCodeFiles(query); } catch { return []; }
    };
  }, [onFileSearch]);

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState<{ query: string; triggerPos: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentions, setMentions] = useState<TrackedMention[]>([]);
  const [fileResults, setFileResults] = useState<string[]>([]);
  const [fileSearchLoading, setFileSearchLoading] = useState(false);
  const fileSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileSearchSeq = useRef(0); // sequence counter to discard stale results
  // Cache of all file results seen during the current mention session.
  // This survives across query changes so that narrowing a query (e.g. "te" → "test")
  // never loses results even if the API returns empty for the longer query.
  const fileResultsCache = useRef<Set<string>>(new Set());
  const placeholderFadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sessions for @ mention search
  const { data: allSessions } = useOpenCodeSessions();

  useEffect(() => {
    if (text.trim().length > 0) {
      setShowAnimatedPlaceholder(false);
      return;
    }

    setShowAnimatedPlaceholder(true);
    const interval = setInterval(() => {
      setShowAnimatedPlaceholder(false);
      clearTimeout(placeholderFadeTimer.current);
      placeholderFadeTimer.current = setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % placeholderVariants.length);
        setShowAnimatedPlaceholder(true);
      }, 180);
    }, 2800);

    return () => {
      clearInterval(interval);
      clearTimeout(placeholderFadeTimer.current);
    };
  }, [text, placeholderVariants.length]);

  // Listen for 'focus-session-textarea' events (dispatched when a session tab
  // is activated from the sidebar or dashboard). Only the visible textarea
  // (inside the active, non-hidden tab) will respond. Retries briefly in case
  // the event fires before React has finished rendering the new tab.
  useEffect(() => {
    const handler = () => {
      const tryFocus = (retries: number) => {
        const el = textareaRef.current;
        if (el && el.offsetParent !== null) {
          el.focus();
          return;
        }
        if (retries > 0) {
          requestAnimationFrame(() => tryFocus(retries - 1));
        }
      };
      tryFocus(10);
    };
    window.addEventListener('focus-session-textarea', handler);
    return () => window.removeEventListener('focus-session-textarea', handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Prompt history (Up/Down arrow) — persisted to localStorage
  // ---------------------------------------------------------------------------
  const HISTORY_KEY = 'opencode:prompt-history';
  const HISTORY_MAX = 50;

  const historyRef = useRef<string[]>(loadPromptHistory(HISTORY_KEY));
  const historyIndexRef = useRef(-1);
  const draftRef = useRef('');

  /** Append a prompt to the persisted history (deduplicates consecutive). */
  const pushHistory = useCallback((prompt: string) => {
    const list = historyRef.current;
    // Skip if identical to the last entry
    if (list.length > 0 && list[list.length - 1] === prompt) return;
    list.push(prompt);
    // Trim to max length
    if (list.length > HISTORY_MAX) {
      list.splice(0, list.length - HISTORY_MAX);
    }
    historyIndexRef.current = -1;
    draftRef.current = '';
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }, []);

  // Default autoFocus: true on desktop, false on mobile
  const shouldAutoFocus = autoFocus ?? (typeof window !== 'undefined' && window.innerWidth >= 640);

  // Focus the textarea whenever it becomes visible (handles mount, tab switch,
  // and new-session creation where the component may mount inside a hidden div
  // that is revealed after a Zustand state update).
  useEffect(() => {
    if (!shouldAutoFocus) return;
    const el = textareaRef.current;
    if (!el) return;

    // If already visible, focus immediately
    if (el.offsetParent !== null) {
      el.focus();
      return;
    }

    // Otherwise observe visibility — the parent div toggles `hidden` via CSS
    // class, so IntersectionObserver will fire when it becomes visible.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          el.focus();
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldAutoFocus]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      const localUrl = URL.createObjectURL(file);
      newFiles.push({ file, localUrl, isImage: isImageFile(file) });
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.localUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const filteredCommands = useMemo(() => {
    if (slashFilter === null) return [];
    const q = slashFilter.toLowerCase();
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)),
    );
  }, [commands, slashFilter]);

  // Debounced file search for @ mentions
  // Uses a persistent cache (fileResultsCache) so that narrowing a query never
  // loses results — even if the API returns empty for longer queries.
  useEffect(() => {
    clearTimeout(fileSearchTimer.current);
    if (!mentionQuery) {
      setFileResults([]);
      setFileSearchLoading(false);
      fileResultsCache.current.clear();
      return;
    }
    // Immediately apply cached results that match the new query so the popover
    // never flickers empty while waiting for the debounced API call.
    const q = mentionQuery.query.toLowerCase();
    if (fileResultsCache.current.size > 0) {
      const cachedMatches = Array.from(fileResultsCache.current).filter(
        (f) => q.length === 0 || f.toLowerCase().includes(q),
      );
      if (cachedMatches.length > 0) {
        setFileResults(cachedMatches.slice(0, 20));
      }
    }
    setFileSearchLoading(true);
    const seq = ++fileSearchSeq.current;
    const currentQuery = mentionQuery.query;
    fileSearchTimer.current = setTimeout(async () => {
      try {
        const results = await fileSearchFn(currentQuery);
        // Add new results to the persistent cache
        for (const r of results) {
          fileResultsCache.current.add(r);
        }
        // Only apply if this is still the latest request
        if (seq === fileSearchSeq.current) {
          // Merge: API results + cached results that still match the query
          const ql = currentQuery.toLowerCase();
          const cachedMatches = Array.from(fileResultsCache.current).filter(
            (f) => ql.length === 0 || f.toLowerCase().includes(ql),
          );
          const merged = new Set([...results, ...cachedMatches]);
          setFileResults(Array.from(merged).slice(0, 20));
          setFileSearchLoading(false);
        }
      } catch {
        if (seq === fileSearchSeq.current) {
          // On error, fall back to cached results that match
          const ql = currentQuery.toLowerCase();
          const cachedMatches = Array.from(fileResultsCache.current).filter(
            (f) => ql.length === 0 || f.toLowerCase().includes(ql),
          );
          setFileResults(cachedMatches.slice(0, 20));
          setFileSearchLoading(false);
        }
      }
    }, 150);
    return () => clearTimeout(fileSearchTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionQuery?.query, fileSearchFn]);

  // Build mention popover items: agents (sync) + sessions (sync) + files (async)
  // File results are also filtered client-side against the current query so that
  // previously fetched results remain visible even if a longer query yields fewer
  // server-side results (e.g. SDK returns files for "te" but not for "test").
  const mentionItems = useMemo((): MentionItem[] => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    const agentItems: MentionItem[] = agents
      .filter((a) => a.name.toLowerCase().includes(q))
      .map((a) => ({ kind: 'agent' as const, label: a.name, value: a.name }));

    // Session items: filter by title or changed file paths, exclude current/child/archived
    const sessionItems: MentionItem[] = (allSessions ?? [])
      .filter((s: Session) => {
        if (s.parentID || s.time.archived) return false;
        if (s.id === sessionId) return false;
        const title = (s.title || '').toLowerCase();
        if (title.includes(q)) return true;
        // Also match against file paths in summary diffs
        const diffs = s.summary?.diffs;
        if (Array.isArray(diffs)) {
          return diffs.some((d: any) => (d.file || '').toLowerCase().includes(q));
        }
        return false;
      })
      .slice(0, 5)
      .map((s: Session) => {
        const ago = formatRelativeTime(s.time.updated);
        const files = s.summary?.files;
        const desc = files ? `${ago} - ${files} file${files === 1 ? '' : 's'} changed` : ago;
        return { kind: 'session' as const, label: s.title, value: s.id, description: desc };
      });

    const filteredFiles = q.length > 0
      ? fileResults.filter((f) => f.toLowerCase().includes(q))
      : fileResults;
    const fileItems: MentionItem[] = filteredFiles.map((f) => ({
      kind: 'file' as const,
      label: f,
      value: f,
    }));
    return [...agentItems, ...sessionItems, ...fileItems];
  }, [mentionQuery, agents, allSessions, sessionId, fileResults]);

  // Clamp mention index when items change to prevent out-of-bounds selection
  useEffect(() => {
    if (mentionItems.length > 0) {
      setMentionIndex((i) => Math.min(i, mentionItems.length - 1));
    }
  }, [mentionItems.length]);

  const enqueue = useMessageQueueStore((s) => s.enqueue);

  const handleSubmit = useCallback(async () => {
    // If a command is staged, execute it with the current text as args
    if (stagedCommand) {
      const args = text.trim();
      onCommand?.(stagedCommand, args || undefined);
      setText('');
      setStagedCommand(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Push to prompt history (persisted to localStorage)
    pushHistory(trimmed);

    // Snapshot files and mentions before clearing
    const filesToSend = attachedFiles.length > 0 ? [...attachedFiles] : undefined;
    const mentionsToSend = mentions.length > 0 ? [...mentions] : undefined;

    // Optimistically clear input
    setText('');
    setSlashFilter(null);
    setMentionQuery(null);
    setMentions([]);
    // Don't revoke URLs for files going into the queue — they're still needed
    if (!isBusy) {
      for (const af of attachedFiles) URL.revokeObjectURL(af.localUrl);
    }
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // If busy, queue the message instead of sending immediately
    if (isBusy && sessionId) {
      enqueue(sessionId, trimmed, filesToSend);
      return;
    }

    try {
      await onSend(trimmed, filesToSend, mentionsToSend);
    } catch {
      // Restore the text so the user can retry
      setText(trimmed);
    }
  }, [text, isBusy, disabled, onSend, onCommand, stagedCommand, attachedFiles, mentions, sessionId, enqueue, pushHistory]);

  const handleSelectCommand = (cmd: Command) => {
    // Stage the command — show an args input instead of executing immediately
    setStagedCommand(cmd);
    setText('');
    setSlashFilter(null);
    setSlashIndex(0);
    // Focus textarea for args input
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSelectMention = (item: MentionItem) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.triggerPos);
    const after = text.slice(mentionQuery.triggerPos + 1 + mentionQuery.query.length); // +1 for '@'
    const inserted = `@${item.label} `;
    const newText = before + inserted + after;
    setText(newText);
    setMentions((prev) => [...prev, { kind: item.kind, label: item.label, ...(item.kind === 'session' ? { value: item.value } : {}) }]);
    setMentionQuery(null);
    setMentionIndex(0);
    setFileResults([]);
    fileResultsCache.current.clear();
    // Refocus and position cursor after inserted mention
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const cursorPos = before.length + inserted.length;
        ta.selectionStart = cursorPos;
        ta.selectionEnd = cursorPos;
        ta.style.height = 'auto';
        const newHeight = Math.min(ta.scrollHeight, 200) + 'px';
        ta.style.height = newHeight;
        if (highlightRef.current) {
          highlightRef.current.style.height = newHeight;
        }
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Staged command: Escape cancels, Enter submits (handled by normal submit flow)
    if (stagedCommand && e.key === 'Escape') {
      e.preventDefault();
      setStagedCommand(null);
      setText('');
      return;
    }

    // @ mention popover keyboard navigation
    if (mentionQuery !== null && (mentionItems.length > 0 || fileSearchLoading)) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (mentionItems.length > 0) setMentionIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (mentionItems.length > 0) setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (mentionItems.length > 0) {
          e.preventDefault();
          handleSelectMention(mentionItems[mentionIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (slashFilter !== null && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectCommand(filteredCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashFilter(null);
        return;
      }
    }

    // Prompt history: Up arrow
    // For single-line text, trigger from any cursor position.
    // For multi-line text, only trigger when the cursor is at the very start
    // so the user can still navigate between lines with arrow keys.
    if (e.key === 'ArrowUp' && slashFilter === null) {
      const ta = e.currentTarget;
      const isSingleLine = !ta.value.includes('\n');
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      if ((isSingleLine || atStart) && historyRef.current.length > 0) {
        e.preventDefault();
        if (historyIndexRef.current === -1) {
          draftRef.current = text;
          historyIndexRef.current = historyRef.current.length - 1;
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
        }
        setText(historyRef.current[historyIndexRef.current]);
        return;
      }
    }

    // Prompt history: Down arrow
    // Same logic: single-line triggers from anywhere, multi-line only at end.
    if (e.key === 'ArrowDown' && slashFilter === null && historyIndexRef.current >= 0) {
      const ta = e.currentTarget;
      const isSingleLine = !ta.value.includes('\n');
      const atEnd = ta.selectionStart === ta.value.length;
      if (isSingleLine || atEnd) {
        e.preventDefault();
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++;
          setText(historyRef.current[historyIndexRef.current]);
        } else {
          historyIndexRef.current = -1;
          setText(draftRef.current);
        }
        return;
      }
    }

    // Tab cycles through agents when no popover is open
    if (e.key === 'Tab' && agents.length > 1 && onAgentChange) {
      e.preventDefault();
      const currentIdx = agents.findIndex((a) => a.name === selectedAgent);
      const nextIdx = (currentIdx + 1) % agents.length;
      onAgentChange(agents[nextIdx].name);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Slash command detection (disabled while a command is staged)
    if (!stagedCommand) {
      const match = val.match(/^\/(\S*)$/);
      if (match) {
        setSlashFilter(match[1]);
        setSlashIndex(0);
      } else {
        setSlashFilter(null);
      }
    }

    // @ mention detection: walk backwards from cursor to find @
    const cursorPos = e.target.selectionStart ?? val.length;
    let mentionDetected = false;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = val[i];
      if (ch === ' ' || ch === '\n') break; // stop at whitespace
      if (ch === '@') {
        // Must be at start of input or preceded by whitespace (not email-like)
        const charBefore = i > 0 ? val[i - 1] : ' ';
        if (charBefore === ' ' || charBefore === '\n' || i === 0) {
          const query = val.slice(i + 1, cursorPos);
          // Don't re-trigger popover for already-tracked mentions
          const isAlreadyTracked = mentions.some((m) => m.label === query);
          if (!isAlreadyTracked) {
            setMentionQuery({ query, triggerPos: i });
            setMentionIndex(0);
            mentionDetected = true;
          }
        }
        break;
      }
    }
    if (!mentionDetected) {
      setMentionQuery(null);
    }

    // Prune tracked mentions whose @label text was deleted
    setMentions((prev) => prev.filter((m) => val.includes(`@${m.label}`)));

    const ta = e.target;
    ta.style.height = 'auto';
    const newHeight = Math.min(ta.scrollHeight, 200) + 'px';
    ta.style.height = newHeight;
    // Sync overlay height
    if (highlightRef.current) {
      highlightRef.current.style.height = newHeight;
    }
  };

  const handleTranscription = useCallback((transcribedText: string) => {
    setText((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
  }, []);

  // Build highlighted segments for the overlay behind the textarea
  const highlightSegments = useMemo(() => {
    if (mentions.length === 0 || !text) return null;
    // Collect all mention ranges sorted by position
    const ranges: { start: number; end: number; kind: 'file' | 'agent' | 'session' }[] = [];
    for (const m of mentions) {
      const needle = `@${m.label}`;
      const idx = text.indexOf(needle);
      if (idx !== -1) {
        ranges.push({ start: idx, end: idx + needle.length, kind: m.kind });
      }
    }
    if (ranges.length === 0) return null;
    ranges.sort((a, b) => a.start - b.start || b.end - a.end);

    const segs: { text: string; kind?: 'file' | 'agent' | 'session' }[] = [];
    let last = 0;
    for (const r of ranges) {
      if (r.start < last) continue;
      if (r.start > last) segs.push({ text: text.slice(last, r.start) });
      segs.push({ text: text.slice(r.start, r.end), kind: r.kind });
      last = r.end;
    }
    if (last < text.length) segs.push({ text: text.slice(last) });
    return segs;
  }, [text, mentions]);

  return (
    <div className="mx-auto w-full max-w-4xl relative shrink-0 px-2 sm:px-4 pb-6">
      <div ref={cardRef} className="w-full bg-card border border-border rounded-[24px] shadow-sm shadow-black/[0.03] dark:shadow-white/[0.02] overflow-visible relative z-10">
        <div className="relative flex flex-col w-full gap-2 overflow-visible">
          {/* Slash command popover (portalled to body to escape overflow-hidden ancestors) */}
          {slashFilter !== null && filteredCommands.length > 0 && (
            <SlashCommandPopover
              commands={commands}
              filter={slashFilter}
              selectedIndex={slashIndex}
              onSelect={handleSelectCommand}
              anchorRef={cardRef}
            />
          )}

          {/* @ Mention popover (portalled to body to escape overflow-hidden ancestors) */}
          {mentionQuery !== null && (mentionItems.length > 0 || fileSearchLoading) && (
            <MentionPopover
              items={mentionItems}
              selectedIndex={mentionIndex}
              onSelect={handleSelectMention}
              loading={fileSearchLoading}
              anchorRef={cardRef}
            />
          )}

          {/* Attached files preview */}
          <AttachmentPreview files={attachedFiles} onRemove={removeAttachedFile} />

          {/* Staged command badge */}
          {stagedCommand && (
            <div className="flex items-center gap-2 px-4 pt-3 pb-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border/50">
                <Terminal className="size-3 text-muted-foreground" />
                <span className="font-mono text-xs font-medium text-foreground">/{stagedCommand.name}</span>
                <button
                  type="button"
                  onClick={() => { setStagedCommand(null); setText(''); }}
                  className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Cancel command"
                >
                  <X className="size-3" />
                </button>
              </div>
              {stagedCommand.description && (
                <span className="text-xs text-muted-foreground truncate">{stagedCommand.description}</span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 px-3.5">
            <div className="relative w-full">
              {text.trim().length === 0 && !stagedCommand && (
                <div
                  aria-hidden
                  className={cn(
                    'absolute left-0.5 top-4 text-[16px] sm:text-[15px] text-muted-foreground pointer-events-none transition-all duration-200',
                    showAnimatedPlaceholder ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-0.5',
                  )}
                >
                  {placeholderVariants[placeholderIndex]}
                </div>
              )}
              {text.trim().length === 0 && stagedCommand && (
                <div
                  aria-hidden
                  className="absolute left-0.5 top-4 text-[16px] sm:text-[15px] text-muted-foreground/50 pointer-events-none"
                >
                  Enter details and press Enter, or press Esc to cancel
                </div>
              )}
              {/* Highlight overlay — mirrors textarea text with colored mention spans */}
              {highlightSegments && (
                <div
                  ref={highlightRef}
                  aria-hidden
                  className="absolute inset-0 pointer-events-none px-0.5 pb-6 pt-4 min-h-[72px] max-h-[200px] overflow-y-auto text-[16px] sm:text-[15px] whitespace-pre-wrap break-words text-foreground"
                  style={{ wordBreak: 'break-word', lineHeight: 'normal' }}
                >
                  {highlightSegments.map((seg, i) => (
                    <span
                      key={i}
                      className={cn(
                        seg.kind === 'file' && 'text-blue-500 font-medium',
                        seg.kind === 'agent' && 'text-purple-500 font-medium',
                        seg.kind === 'session' && 'text-emerald-500 font-medium',
                      )}
                    >
                      {seg.text}
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onScroll={() => {
                  if (highlightRef.current && textareaRef.current) {
                    highlightRef.current.scrollTop = textareaRef.current.scrollTop;
                  }
                }}
                placeholder=""
                rows={1}
                disabled={disabled}
                className={cn(
                  'relative w-full bg-transparent border-none shadow-none focus-visible:ring-0 px-0.5 pb-6 pt-4 min-h-[72px] max-h-[200px] overflow-y-auto resize-none rounded-[24px] text-[16px] sm:text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-50',
                  highlightSegments && 'caret-foreground text-transparent',
                )}
                autoFocus={shouldAutoFocus}
              />
            </div>
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between mb-1.5 pl-2 pr-1.5 gap-1 overflow-visible">
            {/* LEFT: Attach + Agent + Model + Variant */}
            <div className="flex items-center gap-0 min-w-0 overflow-visible">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.toml,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.css,.html,.vue,.svelte,.log,.sql,.zip,.tar,.gz,.rar"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Paperclip className="h-4 w-4" strokeWidth={2} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Attach files</p>
                </TooltipContent>
              </Tooltip>

              <div className="w-px h-4 bg-border mx-1" />

              {agents.length > 0 && onAgentChange && (
                <AgentSelector
                  agents={agents}
                  selectedAgent={selectedAgent}
                  onSelect={onAgentChange}
                />
              )}
              {models.length > 0 && onModelChange && (
                <ModelSelector
                  models={models}
                  selectedModel={selectedModel}
                  onSelect={onModelChange}
                  providers={providers}
                />
              )}
              {variants.length > 0 && onVariantChange && (
                <VariantSelector
                  variants={variants}
                  selectedVariant={selectedVariant}
                  onSelect={onVariantChange}
                />
              )}
            </div>

            {/* RIGHT: TokenProgress + Voice + Submit/Stop */}
            <div className="flex items-center gap-0 shrink-0">
              <TokenProgress messages={messages} sessionId={sessionId} models={models} selectedModel={selectedModel} />

              <VoiceRecorder
                onTranscription={handleTranscription}
                disabled={disabled || isBusy}
              />

              {isBusy && onStop && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      onClick={onStop}
                      className="flex-shrink-0 h-8 w-8 rounded-full p-0"
                    >
                      <div className="w-3 h-3 rounded-[3px] bg-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Stop</p></TooltipContent>
                </Tooltip>
              )}
              {isBusy && text.trim() ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      variant="ghost"
                      className="flex-shrink-0 h-8 w-8 rounded-full p-0 text-muted-foreground hover:text-foreground"
                    >
                      <ListPlus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Add to queue</p></TooltipContent>
                </Tooltip>
              ) : !isBusy && (
                <Button
                  size="sm"
                  disabled={!text.trim() || disabled}
                  onClick={handleSubmit}
                  className="flex-shrink-0 h-8 w-8 rounded-full p-0"
                >
                  {disabled ? (
                    <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
