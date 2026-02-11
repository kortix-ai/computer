'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowUp,
  ChevronDown,
  Check,
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
  PanelRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VoiceRecorder } from '@/components/thread/chat-input/voice-recorder';
import type {
  MessageWithParts,
  Agent,
  Command,
  ProviderListResponse,
} from '@/hooks/opencode/use-opencode-sessions';

// ============================================================================
// Flat model list helper
// ============================================================================

export interface FlatModel {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
  variants?: Record<string, Record<string, unknown>>;
}

export function flattenModels(providers: ProviderListResponse | undefined): FlatModel[] {
  if (!providers) return [];
  const result: FlatModel[] = [];
  for (const p of providers.all) {
    if (!providers.connected.includes(p.id)) continue;
    for (const [modelID, model] of Object.entries(p.models)) {
      result.push({
        providerID: p.id,
        providerName: p.name,
        modelID,
        modelName: model.name || modelID,
        variants: model.variants,
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
  const ref = useRef<HTMLDivElement>(null);

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
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors capitalize cursor-pointer"
      >
        <span className="truncate max-w-[80px]">{displayName}</span>
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]">
          <div className="max-h-48 overflow-y-auto py-1">
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
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors capitalize cursor-pointer',
                    isSelected && 'bg-muted/40',
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

// ============================================================================
// Model Selector
// ============================================================================

function ModelSelector({
  models,
  selectedModel,
  onSelect,
}: {
  models: FlatModel[];
  selectedModel: { providerID: string; modelID: string } | null;
  onSelect: (model: { providerID: string; modelID: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const current = models.find(
    (m) => m.providerID === selectedModel?.providerID && m.modelID === selectedModel?.modelID,
  );
  const displayName = current?.modelName || models[0]?.modelName || 'Model';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <span className="truncate max-w-[120px]">{displayName}</span>
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden min-w-[220px]">
          <div className="max-h-64 overflow-y-auto py-1">
            {models.map((model) => {
              const isSelected =
                selectedModel?.providerID === model.providerID &&
                selectedModel?.modelID === model.modelID;
              return (
                <button
                  key={`${model.providerID}/${model.modelID}`}
                  onClick={() => {
                    onSelect({ providerID: model.providerID, modelID: model.modelID });
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors cursor-pointer',
                    isSelected && 'bg-muted/40',
                  )}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <div className="truncate">{model.modelName}</div>
                    <div className="text-xs text-muted-foreground/60 truncate">{model.providerName}</div>
                  </div>
                  {isSelected && <Check className="size-3.5 text-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
          className="inline-flex items-center h-8 px-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer capitalize"
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

function TokenProgress({ messages }: { messages: MessageWithParts[] | undefined }) {
  const totalTokens = useMemo(() => {
    if (!messages) return { input: 0, output: 0 };
    let input = 0;
    let output = 0;
    for (const msg of messages) {
      if (msg.info.role === 'assistant') {
        const tokens = (msg.info as any).tokens;
        if (tokens) {
          input += tokens.input || 0;
          output += tokens.output || 0;
        }
      }
    }
    return { input, output };
  }, [messages]);

  const total = totalTokens.input + totalTokens.output;
  if (total === 0) return null;

  const contextLimit = 200000;
  const ratio = Math.min(total / contextLimit, 1);
  const circumference = 2 * Math.PI * 7;
  const offset = circumference * (1 - ratio);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative size-6 flex items-center justify-center cursor-default">
          <svg className="size-5 -rotate-90" viewBox="0 0 18 18">
            <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30" />
            <circle
              cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              className={ratio > 0.8 ? 'text-orange-500' : 'text-muted-foreground'}
            />
          </svg>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="text-xs font-mono space-y-1">
          <div>Total: {(total / 1000).toFixed(1)}k tokens</div>
          <div>Input: {(totalTokens.input / 1000).toFixed(1)}k</div>
          <div>Output: {(totalTokens.output / 1000).toFixed(1)}k</div>
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
// Slash Command Popover
// ============================================================================

function SlashCommandPopover({
  commands,
  filter,
  selectedIndex,
  onSelect,
}: {
  commands: Command[];
  filter: string;
  selectedIndex: number;
  onSelect: (command: Command) => void;
}) {
  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)),
    );
  }, [commands, filter]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
      <div className="max-h-64 overflow-y-auto py-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.name}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors cursor-pointer',
              i === selectedIndex ? 'bg-muted/60' : 'hover:bg-muted/40',
            )}
          >
            <span className="font-mono text-muted-foreground">/{cmd.name}</span>
            <span className="text-muted-foreground/70 truncate">{cmd.description || ''}</span>
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
  kind: 'file' | 'agent';
  label: string;
  value: string;
  description?: string;
}

interface TrackedMention {
  kind: 'file' | 'agent';
  label: string;
}

function MentionPopover({
  items,
  selectedIndex,
  onSelect,
}: {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-mention-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  const agents = items.filter((i) => i.kind === 'agent');
  const files = items.filter((i) => i.kind === 'file');

  let globalIndex = 0;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
      <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {agents.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Modes</div>
            {agents.map((item) => {
              const idx = globalIndex++;
              return (
                <button
                  key={`agent-${item.value}`}
                  data-mention-index={idx}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer',
                    idx === selectedIndex ? 'bg-muted/60' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="size-4 rounded flex items-center justify-center bg-purple-500/15 text-purple-500 text-[10px] font-bold shrink-0">@</span>
                  <span className="truncate capitalize">{item.label}</span>
                  {item.description && <span className="text-muted-foreground/60 truncate text-xs">{item.description}</span>}
                </button>
              );
            })}
          </>
        )}
        {files.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Files</div>
            {files.map((item) => {
              const idx = globalIndex++;
              return (
                <button
                  key={`file-${item.value}`}
                  data-mention-index={idx}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer',
                    idx === selectedIndex ? 'bg-muted/60' : 'hover:bg-muted/40',
                  )}
                >
                  <FileCode className="size-3.5 text-blue-500 shrink-0" />
                  <span className="truncate font-mono text-xs">{item.label}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SessionChatInput - The unified chat input
// ============================================================================

export interface SessionChatInputProps {
  onSend: (text: string) => void;
  isBusy?: boolean;
  onStop?: () => void;
  agents?: Agent[];
  selectedAgent?: string | null;
  onAgentChange?: (agentName: string | null) => void;
  commands?: Command[];
  onCommand?: (command: Command) => void;
  models?: FlatModel[];
  selectedModel?: { providerID: string; modelID: string } | null;
  onModelChange?: (model: { providerID: string; modelID: string } | null) => void;
  variants?: string[];
  selectedVariant?: string | null;
  onVariantChange?: (variant: string | null) => void;
  messages?: MessageWithParts[];
  /** If true, disables the input (e.g. during session creation redirect) */
  disabled?: boolean;
  /** Auto-focus the textarea on mount (default: true on desktop) */
  autoFocus?: boolean;
  placeholder?: string;
  /** Toggle the Kortix Computer side panel */
  onTogglePanel?: () => void;
  /** Whether the panel is currently open */
  isPanelOpen?: boolean;
  /** Whether there are tool calls available to show in the panel */
  hasToolCalls?: boolean;
  /** Callback to search files via SDK for @ mentions */
  onFileSearch?: (query: string) => Promise<string[]>;
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
  disabled = false,
  autoFocus,
  placeholder = 'Ask anything...',
  onTogglePanel,
  isPanelOpen = false,
  hasToolCalls = false,
  onFileSearch,
}: SessionChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slashFilter, setSlashFilter] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState<{ query: string; triggerPos: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentions, setMentions] = useState<TrackedMention[]>([]);
  const [fileResults, setFileResults] = useState<string[]>([]);
  const fileSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Prompt history (Up/Down arrow)
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef('');

  // Default autoFocus: true on desktop, false on mobile
  const shouldAutoFocus = autoFocus ?? (typeof window !== 'undefined' && window.innerWidth >= 640);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      const localUrl = URL.createObjectURL(file);
      newFiles.push({ file, localUrl, isImage: isImageFile(file) });
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  }

  function removeAttachedFile(index: number) {
    setAttachedFiles((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.localUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

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
  useEffect(() => {
    clearTimeout(fileSearchTimer.current);
    if (!mentionQuery || !onFileSearch) {
      setFileResults([]);
      return;
    }
    if (mentionQuery.query.length === 0) {
      setFileResults([]);
      return;
    }
    fileSearchTimer.current = setTimeout(async () => {
      try {
        const results = await onFileSearch(mentionQuery.query);
        setFileResults(results);
      } catch {
        setFileResults([]);
      }
    }, 200);
    return () => clearTimeout(fileSearchTimer.current);
  }, [mentionQuery?.query, onFileSearch]);

  // Build mention popover items: agents (sync) + files (async)
  const mentionItems = useMemo((): MentionItem[] => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    const agentItems: MentionItem[] = agents
      .filter((a) => a.name.toLowerCase().includes(q))
      .map((a) => ({ kind: 'agent' as const, label: a.name, value: a.name }));
    const fileItems: MentionItem[] = fileResults.map((f) => ({
      kind: 'file' as const,
      label: f,
      value: f,
    }));
    return [...agentItems, ...fileItems];
  }, [mentionQuery, agents, fileResults]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isBusy || disabled) return;
    // Push to prompt history
    historyRef.current.push(trimmed);
    historyIndexRef.current = -1;
    draftRef.current = '';

    // Send as text — the server parses @mentions from the text content
    // and creates the appropriate FilePart/AgentPart objects with source positions.
    // Sending non-text parts via promptAsync causes the server to silently drop the message.
    onSend(trimmed);

    setText('');
    setSlashFilter(null);
    setMentionQuery(null);
    setMentions([]);
    for (const af of attachedFiles) URL.revokeObjectURL(af.localUrl);
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isBusy, disabled, onSend, attachedFiles]);

  function handleSelectCommand(cmd: Command) {
    onCommand?.(cmd);
    setText('');
    setSlashFilter(null);
    setSlashIndex(0);
  }

  function handleSelectMention(item: MentionItem) {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.triggerPos);
    const after = text.slice(mentionQuery.triggerPos + 1 + mentionQuery.query.length); // +1 for '@'
    const inserted = `@${item.label} `;
    const newText = before + inserted + after;
    setText(newText);
    setMentions((prev) => [...prev, { kind: item.kind, label: item.label }]);
    setMentionQuery(null);
    setMentionIndex(0);
    setFileResults([]);
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
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // @ mention popover keyboard navigation
    if (mentionQuery !== null && mentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(mentionItems[mentionIndex]);
        return;
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

    // Prompt history: Up arrow at the start of input
    if (e.key === 'ArrowUp' && slashFilter === null) {
      const ta = e.currentTarget;
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      if (atStart && historyRef.current.length > 0) {
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
    if (e.key === 'ArrowDown' && slashFilter === null && historyIndexRef.current >= 0) {
      const ta = e.currentTarget;
      const atEnd = ta.selectionStart === ta.value.length;
      if (atEnd) {
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

    // Slash command detection
    const match = val.match(/^\/(\S*)$/);
    if (match) {
      setSlashFilter(match[1]);
      setSlashIndex(0);
    } else {
      setSlashFilter(null);
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
  }

  const handleTranscription = useCallback((transcribedText: string) => {
    setText((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
  }, []);

  // Build highlighted segments for the overlay behind the textarea
  const highlightSegments = useMemo(() => {
    if (mentions.length === 0 || !text) return null;
    // Collect all mention ranges sorted by position
    const ranges: { start: number; end: number; kind: 'file' | 'agent' }[] = [];
    for (const m of mentions) {
      const needle = `@${m.label}`;
      const idx = text.indexOf(needle);
      if (idx !== -1) {
        ranges.push({ start: idx, end: idx + needle.length, kind: m.kind });
      }
    }
    if (ranges.length === 0) return null;
    ranges.sort((a, b) => a.start - b.start || b.end - a.end);

    const segs: { text: string; kind?: 'file' | 'agent' }[] = [];
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
    <div className="mx-auto w-full max-w-4xl relative shrink-0">
      <Card className="shadow-none w-full max-w-4xl mx-auto bg-transparent border-none overflow-visible py-0 pb-5 rounded-3xl relative z-10">
        <div className="w-full text-sm flex flex-col justify-between items-start rounded-lg overflow-visible">
          <CardContent className="w-full p-1.5 pb-2 bg-card border rounded-[24px] overflow-visible">
            <div className="relative flex flex-col w-full h-full gap-2 justify-between overflow-visible">
              {/* Slash command popover */}
              {slashFilter !== null && filteredCommands.length > 0 && (
                <SlashCommandPopover
                  commands={commands}
                  filter={slashFilter}
                  selectedIndex={slashIndex}
                  onSelect={handleSelectCommand}
                />
              )}

              {/* @ Mention popover */}
              {mentionQuery !== null && mentionItems.length > 0 && (
                <MentionPopover
                  items={mentionItems}
                  selectedIndex={mentionIndex}
                  onSelect={handleSelectMention}
                />
              )}

              {/* Attached files preview */}
              <AttachmentPreview files={attachedFiles} onRemove={removeAttachedFile} />

              <div className="flex flex-col gap-1 px-2">
                <div className="relative w-full">
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
                      // Sync highlight overlay scroll with textarea scroll
                      if (highlightRef.current && textareaRef.current) {
                        highlightRef.current.scrollTop = textareaRef.current.scrollTop;
                      }
                    }}
                    placeholder={placeholder}
                    rows={1}
                    disabled={disabled}
                    className={cn(
                      'relative w-full bg-transparent border-none shadow-none focus-visible:ring-0 px-0.5 pb-6 pt-4 min-h-[72px] max-h-[200px] overflow-y-auto resize-none rounded-[24px] text-[16px] sm:text-[15px] outline-none placeholder:text-muted-foreground/50 disabled:opacity-50',
                      highlightSegments && 'caret-foreground text-transparent',
                    )}
                    autoFocus={shouldAutoFocus}
                  />
                </div>
              </div>

              {/* Bottom toolbar */}
              <div className="flex items-center justify-between mt-0 mb-1 px-1.5 sm:px-2 gap-1 sm:gap-1.5 overflow-visible">
                {/* LEFT: Attach + Agent + Model + Variant */}
                <div className="flex items-center gap-0.5 min-w-0">
                  {/* File attach button */}
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
                        className="inline-flex items-center justify-center h-10 w-10 p-0 bg-transparent border-[1.5px] border-border rounded-2xl text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
                      >
                        <Paperclip className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Attach files</p>
                    </TooltipContent>
                  </Tooltip>

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

                {/* RIGHT: Panel toggle + TokenProgress + Voice + Submit/Stop */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasToolCalls && onTogglePanel && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={onTogglePanel}
                          className={cn(
                            'inline-flex items-center justify-center h-10 w-10 p-0 bg-transparent border-[1.5px] rounded-2xl transition-colors cursor-pointer',
                            isPanelOpen
                              ? 'border-primary/50 text-primary bg-primary/10 hover:bg-primary/15'
                              : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50',
                          )}
                        >
                          <PanelRight className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{isPanelOpen ? 'Close panel' : 'Open panel'}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <TokenProgress messages={messages} />

                  <VoiceRecorder
                    onTranscription={handleTranscription}
                    disabled={disabled || isBusy}
                  />

                  {isBusy && onStop ? (
                    <Button
                      size="sm"
                      onClick={onStop}
                      className="flex-shrink-0 self-end border-[1.5px] border-border rounded-2xl w-10 h-10"
                    >
                      <div className="min-h-[14px] min-w-[14px] w-[14px] h-[14px] rounded-sm bg-current" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!text.trim() || disabled}
                      onClick={handleSubmit}
                      className="flex-shrink-0 self-end border-[1.5px] border-border rounded-2xl w-10 h-10"
                    >
                      {disabled ? (
                        <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ArrowUp className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
