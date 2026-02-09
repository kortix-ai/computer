'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowUp,
  ChevronRight,
  ChevronDown,
  Terminal,
  FileEdit,
  Check,
  AlertCircle,
  ArrowDown,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  OpenCodeMessageWithParts,
  OpenCodeMessagePart,
  OpenCodeAgent,
  OpenCodeCommand,
  OpenCodeProviderListResponse,
  OpenCodeModel,
} from '@/lib/api/opencode';

// --- Tool Part Component ---

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

// --- User Message Row (matches Suna's UserMessageRow) ---

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

// --- Thinking Section ---

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

// --- Assistant Message Group (matches Suna's AssistantGroupRow) ---

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
        {/* Agent header - Kortix logomark like Suna */}
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

// --- Empty State ---

const examplePrompts = [
  'Help me set up authentication with NextAuth.js',
  'Create a REST API with CRUD endpoints',
  'Fix the TypeScript errors in my project',
  'Write unit tests for the utils module',
];

function EmptyState({ onPromptSelect }: { onPromptSelect: (text: string) => void }) {
  return (
    <div className="flex-1 min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 max-w-lg w-full px-6">
        <img
          src="/kortix-logomark-white.svg"
          alt="Kortix"
          className="dark:invert-0 invert"
          style={{ height: '24px', width: 'auto' }}
        />
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">New Session</h1>
          <p className="text-sm text-muted-foreground">
            Ask anything about your code
          </p>
        </div>
        <div className="w-full space-y-2 mt-4">
          <p className="text-xs text-muted-foreground font-medium">Try asking:</p>
          <div className="grid gap-2">
            {examplePrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onPromptSelect(prompt)}
                className="text-left px-4 py-3 rounded-3xl rounded-br-lg bg-card border text-sm text-muted-foreground hover:text-foreground transition-colors break-words"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Agent Selector ---

function AgentSelector({
  agents,
  selectedAgent,
  onSelect,
}: {
  agents: OpenCodeAgent[];
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

// --- Flat model list helper ---

interface FlatModel {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
  variants?: Record<string, Record<string, unknown>>;
}

function flattenModels(providers: OpenCodeProviderListResponse | undefined): FlatModel[] {
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

// --- Model Selector ---

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

// --- Variant / Thinking Mode Selector ---

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

// --- Token Progress Circle ---

function TokenProgress({ messages }: { messages: OpenCodeMessageWithParts[] | undefined }) {
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

  // Approximate context usage (assume 200k context)
  const contextLimit = 200000;
  const ratio = Math.min(total / contextLimit, 1);
  const circumference = 2 * Math.PI * 7;
  const offset = circumference * (1 - ratio);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative size-6 flex items-center justify-center cursor-default">
          <svg className="size-5 -rotate-90" viewBox="0 0 18 18">
            <circle
              cx="9"
              cy="9"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted/30"
            />
            <circle
              cx="9"
              cy="9"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
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

// --- File Attachment Helpers ---

interface AttachedFile {
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

// --- Attachment Preview Strip ---

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
              /* Image thumbnail - matches Suna's 54px rounded preview */
              <div className="h-[54px] w-[54px] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/20">
                <img
                  src={af.localUrl}
                  alt={af.file.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              /* File card - matches Suna's FileCard */
              <div className="flex items-center rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-sidebar h-[54px] w-fit min-w-[200px] max-w-[300px]">
                <div className="w-[54px] h-full flex items-center justify-center flex-shrink-0 bg-black/5 dark:bg-white/5">
                  <Icon className="h-5 w-5 text-black/60 dark:text-white/60" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center px-3 py-2 overflow-hidden">
                  <div className="text-sm font-medium truncate text-foreground">
                    {af.file.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="truncate">{getFileTypeLabel(type, ext)}</span>
                    <span className="flex-shrink-0">&middot;</span>
                    <span className="flex-shrink-0">{formatFileSize(af.file.size)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Remove button */}
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

// --- Slash Command Popover ---

function SlashCommandPopover({
  commands,
  filter,
  selectedIndex,
  onSelect,
}: {
  commands: OpenCodeCommand[];
  filter: string;
  selectedIndex: number;
  onSelect: (command: OpenCodeCommand) => void;
}) {
  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.title && c.title.toLowerCase().includes(q)) ||
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
            <span className="text-muted-foreground/70 truncate">{cmd.description || cmd.title || ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Chat Input (matches Suna's chat-input pattern) ---

function ChatInput({
  onSend,
  isBusy,
  onStop,
  agents,
  selectedAgent,
  onAgentChange,
  commands,
  onCommand,
  models,
  selectedModel,
  onModelChange,
  variants,
  selectedVariant,
  onVariantChange,
  messages,
}: {
  onSend: (text: string) => void;
  isBusy: boolean;
  onStop: () => void;
  agents: OpenCodeAgent[];
  selectedAgent: string | null;
  onAgentChange: (agentName: string | null) => void;
  commands: OpenCodeCommand[];
  onCommand: (command: OpenCodeCommand) => void;
  models: FlatModel[];
  selectedModel: { providerID: string; modelID: string } | null;
  onModelChange: (model: { providerID: string; modelID: string } | null) => void;
  variants: string[];
  selectedVariant: string | null;
  onVariantChange: (variant: string | null) => void;
  messages: OpenCodeMessageWithParts[] | undefined;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slashFilter, setSlashFilter] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      const localUrl = URL.createObjectURL(file);
      newFiles.push({ file, localUrl, isImage: isImageFile(file) });
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
    // Reset so the same file can be re-selected
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
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q)),
    );
  }, [commands, slashFilter]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    onSend(trimmed);
    setText('');
    setSlashFilter(null);
    // Clean up attached file URLs
    for (const af of attachedFiles) URL.revokeObjectURL(af.localUrl);
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isBusy, onSend, attachedFiles]);

  function handleSelectCommand(cmd: OpenCodeCommand) {
    onCommand(cmd);
    setText('');
    setSlashFilter(null);
    setSlashIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash command navigation
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

    // Detect slash command: entire input matches /something
    const match = val.match(/^\/(\S*)$/);
    if (match) {
      setSlashFilter(match[1]);
      setSlashIndex(0);
    } else {
      setSlashFilter(null);
    }

    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }

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

              {/* Attached files preview */}
              <AttachmentPreview files={attachedFiles} onRemove={removeAttachedFile} />

              <div className="flex flex-col gap-1 px-2">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  rows={1}
                  className="w-full bg-transparent border-none shadow-none focus-visible:ring-0 px-0.5 pb-6 pt-4 min-h-[72px] max-h-[200px] overflow-y-auto resize-none rounded-[24px] text-[16px] sm:text-[15px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="flex items-center justify-between mt-0 mb-1 px-1.5 sm:px-2 gap-1 sm:gap-1.5 overflow-visible">
                <div className="flex items-center gap-0.5 min-w-0">
                  {agents.length > 0 && (
                    <AgentSelector
                      agents={agents}
                      selectedAgent={selectedAgent}
                      onSelect={onAgentChange}
                    />
                  )}
                  {models.length > 0 && (
                    <ModelSelector
                      models={models}
                      selectedModel={selectedModel}
                      onSelect={onModelChange}
                    />
                  )}
                  {variants.length > 0 && (
                    <VariantSelector
                      variants={variants}
                      selectedVariant={selectedVariant}
                      onSelect={onVariantChange}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TokenProgress messages={messages} />
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
                  {isBusy ? (
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
                      disabled={!text.trim()}
                      onClick={handleSubmit}
                      className="flex-shrink-0 self-end border-[1.5px] border-border rounded-2xl w-10 h-10"
                    >
                      <ArrowUp className="size-4" />
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

// --- Main SessionChat Component ---

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

  // Filter agents: exclude subagents and hidden, like OpenCode does
  const visibleAgents = useMemo(
    () => (agents || []).filter((a) => a.mode !== 'subagent' && !a.hidden),
    [agents],
  );

  // Flatten models from connected providers
  const flatModels = useMemo(() => flattenModels(providers), [providers]);

  // Compute variants for the selected model
  const currentVariants = useMemo(() => {
    if (!selectedModel) {
      // Use first model's variants as default
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

  if (sessionLoading || messagesLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <KortixLoader size="small" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Session not found
      </div>
    );
  }

  const hasMessages = messages && messages.length > 0;

  // Determine if last assistant message is still streaming
  const lastMessage = messages?.[messages.length - 1];
  const isLastMessageStreaming =
    isBusy && lastMessage?.info.role === 'assistant';

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Messages or Empty State */}
      {hasMessages ? (
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 pb-6 bg-background h-full"
          >
            <div className="mx-auto max-w-3xl min-w-0 w-full px-3 sm:px-6">
              <div className="space-y-6 min-w-0">
                {messages.map((msg, i) => {
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
                {isBusy && lastMessage?.info.role === 'user' && (
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
        <EmptyState onPromptSelect={handleSend} />
      )}

      {/* Input */}
      <ChatInput
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
