'use client';

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  type ReactNode,
  type ComponentType,
} from 'react';
import { createTwoFilesPatch } from 'diff';
import {
  Terminal,
  FileCode2,
  Search,
  Globe,
  ListTree,
  CheckSquare,
  CircleAlert,
  Loader2,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  MessageCircle,
  Ban,
  ExternalLink,
  Glasses,
  SquareKanban,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useRouter } from 'next/navigation';
import { useOpenCodeMessages } from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useOcFileOpen } from '@/components/thread/tool-views/opencode/useOcFileOpen';
import { QuestionPrompt } from '@/components/session/question-prompt';
import {
  type ToolPart,
  type PermissionRequest,
  type QuestionRequest,
  type MessageWithParts,
  type ToolInfo,
  type Diagnostic,
  type ApplyPatchFile,
  type TriggerTitle,
  PERMISSION_LABELS,
  isToolPart,
  getChildSessionId,
  shouldShowToolPart,
  computeStatusFromPart,
  getToolInfo,
  getFilename,
  getDirectory,
  getDiagnostics,
  stripAnsi,
  getChildSessionToolParts,
  getPermissionForTool,
} from '@/ui';

// ============================================================================
// Tool Registry
// ============================================================================

interface ToolProps {
  part: ToolPart;
  sessionId?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  locked?: boolean;
  onPermissionReply?: (requestId: string, reply: 'once' | 'always' | 'reject') => void;
}

type ToolComponent = ComponentType<ToolProps>;

const registry = new Map<string, ToolComponent>();

export const ToolRegistry = {
  register(name: string, component: ToolComponent) {
    registry.set(name, component);
  },
  get(name: string): ToolComponent | undefined {
    return registry.get(name);
  },
};

// ============================================================================
// Helper: extract input/metadata/output/status from part
// ============================================================================

function partInput(part: ToolPart): Record<string, unknown> {
  return part.state.input ?? {};
}

function partMetadata(part: ToolPart): Record<string, unknown> {
  if (part.state.status === 'completed' || part.state.status === 'running' || part.state.status === 'error') {
    return (part.state.metadata as Record<string, unknown>) ?? {};
  }
  return {};
}

function partOutput(part: ToolPart): string {
  if (part.state.status === 'completed') {
    return part.state.output ?? '';
  }
  return '';
}

function partStatus(part: ToolPart): string {
  return part.state.status;
}

// ============================================================================
// StatusIcon
// ============================================================================

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <Check className="size-3 text-emerald-500 flex-shrink-0" />;
    case 'error':
      return <CircleAlert className="size-3 text-muted-foreground flex-shrink-0" />;
    case 'running':
    case 'pending':
      return <Loader2 className="size-3 animate-spin text-muted-foreground flex-shrink-0" />;
    default:
      return null;
  }
}

// ============================================================================
// TriggerTitle type guard
// ============================================================================

function isTriggerTitle(val: unknown): val is TriggerTitle {
  return (
    typeof val === 'object' &&
    val !== null &&
    'title' in val &&
    typeof (val as TriggerTitle).title === 'string'
  );
}

// ============================================================================
// BasicTool — collapsible wrapper
// ============================================================================

interface BasicToolProps {
  icon: ReactNode;
  trigger: TriggerTitle | ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  locked?: boolean;
  onSubtitleClick?: () => void;
}

export function BasicTool({
  icon,
  trigger,
  children,
  defaultOpen = false,
  forceOpen,
  locked,
  onSubtitleClick,
}: BasicToolProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (locked && !value) return;
      setOpen(value);
    },
    [locked],
  );

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <div
          data-component="tool-trigger"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
            'bg-muted/20 hover:bg-muted/40 border border-border/40',
            'text-xs cursor-pointer transition-colors select-none',
            'max-w-full group',
          )}
        >
          {/* Arrow */}
          {children && !locked && (
            <ChevronRight
              className={cn(
                'size-3 transition-transform flex-shrink-0 text-muted-foreground',
                open && 'rotate-90',
              )}
            />
          )}

          {/* Icon */}
          <span className="flex-shrink-0">{icon}</span>

          {/* Trigger content */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isTriggerTitle(trigger) ? (
              <>
                <span className="font-medium text-xs text-foreground whitespace-nowrap">
                  {trigger.title}
                </span>
                {trigger.subtitle && (
                  <span
                    className={cn(
                      'text-muted-foreground text-xs truncate font-mono',
                      onSubtitleClick && 'cursor-pointer hover:text-foreground underline-offset-2 hover:underline',
                    )}
                    onClick={
                      onSubtitleClick
                        ? (e) => {
                            e.stopPropagation();
                            onSubtitleClick();
                          }
                        : undefined
                    }
                  >
                    {trigger.subtitle}
                  </span>
                )}
                {trigger.args &&
                  trigger.args.length > 0 &&
                  trigger.args.map((arg, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono whitespace-nowrap"
                    >
                      {arg}
                    </span>
                  ))}
              </>
            ) : (
              trigger
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      {children && (
        <CollapsibleContent>
          <div className="mt-1.5 mb-2 rounded-lg bg-muted/30 border border-border/30 text-xs overflow-hidden">
            {children}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// ============================================================================
// InlineDiffView
// ============================================================================

function InlineDiffView({
  oldValue,
  newValue,
  filename,
}: {
  oldValue: string;
  newValue: string;
  filename: string;
}) {
  const patch = useMemo(() => {
    if (!oldValue && !newValue) return '';
    return createTwoFilesPatch(filename, filename, oldValue || '', newValue || '', '', '');
  }, [oldValue, newValue, filename]);

  if (!patch) return null;

  const lines = patch.split('\n');
  const diffLines = lines.slice(4);

  return (
    <pre className="p-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
      {diffLines.map((line, i) => {
        let cls = 'text-muted-foreground/80';
        if (line.startsWith('+')) cls = 'text-emerald-500 bg-emerald-500/5';
        else if (line.startsWith('-')) cls = 'text-red-500 bg-red-500/5';
        else if (line.startsWith('@@')) cls = 'text-blue-500/70';
        return (
          <div key={i} className={cls}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

// ============================================================================
// DiagnosticsDisplay
// ============================================================================

function DiagnosticsDisplay({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;

  return (
    <div className="space-y-1 px-2 pb-2">
      {diagnostics.map((d, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-500">
          <CircleAlert className="size-3 flex-shrink-0 mt-0.5" />
          <span>
            [{d.range.start.line + 1}:{d.range.start.character + 1}] {d.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// DiffChanges
// ============================================================================

function DiffChanges({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions === 0 && deletions === 0) return null;

  return (
    <span className="flex items-center gap-1.5 text-[10px] ml-auto whitespace-nowrap">
      {additions > 0 && <span className="text-emerald-500">+{additions}</span>}
      {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
    </span>
  );
}

// ============================================================================
// Tool Renderers — self-registering
// ============================================================================

// --- Bash ---
function BashTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const metadata = partMetadata(part);
  const output = partOutput(part);
  const status = partStatus(part);
  const command = (input.command as string) || (metadata.command as string) || '';
  const description = (input.description as string) || '';
  const strippedOutput = output ? stripAnsi(output) : '';

  const codeBlock = `\`\`\`bash\n$ ${command}${strippedOutput ? '\n\n' + strippedOutput : ''}\n\`\`\``;

  return (
    <BasicTool
      icon={<Terminal className="size-3.5 flex-shrink-0" />}
      trigger={{ title: 'Shell', subtitle: description }}
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      <div data-scrollable className="p-2 max-h-96 overflow-auto">
        <UnifiedMarkdown content={codeBlock} isStreaming={status === 'running'} />
      </div>
    </BasicTool>
  );
}
ToolRegistry.register('bash', BashTool);

// --- Edit ---
function EditTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const metadata = partMetadata(part);
  const filediff = metadata.filediff as Record<string, unknown> | undefined;
  const filePath = input.filePath as string | undefined;
  const filename = getFilename(filePath) || '';
  const directory = filePath ? getDirectory(filePath) : undefined;
  const diagnostics = getDiagnostics(
    metadata.diagnostics as Record<string, Diagnostic[]> | undefined,
    filePath,
  );

  const additions = (filediff?.additions as number) ?? 0;
  const deletions = (filediff?.deletions as number) ?? 0;
  const before = (filediff?.before as string) ?? (input.oldString as string) ?? '';
  const after = (filediff?.after as string) ?? (input.newString as string) ?? '';
  const hasDiff = before !== '' || after !== '';

  return (
    <BasicTool
      icon={<FileCode2 className="size-3.5 flex-shrink-0" />}
      trigger={
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="font-medium text-xs text-foreground whitespace-nowrap">Edit</span>
          <span className="text-xs text-foreground font-mono truncate">{filename}</span>
          {directory && (
            <span className="text-muted-foreground text-[10px] font-mono truncate hidden sm:inline">
              {directory}
            </span>
          )}
          {filediff && <DiffChanges additions={additions} deletions={deletions} />}
        </div>
      }
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      {hasDiff && (
        <div className="max-h-96 overflow-auto rounded border border-border/30">
          <InlineDiffView oldValue={before} newValue={after} filename={filename} />
        </div>
      )}
      <DiagnosticsDisplay diagnostics={diagnostics} />
    </BasicTool>
  );
}
ToolRegistry.register('edit', EditTool);
ToolRegistry.register('morph_edit', EditTool);

// --- Write ---
function WriteTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const metadata = partMetadata(part);
  const filePath = input.filePath as string | undefined;
  const filename = getFilename(filePath) || '';
  const directory = filePath ? getDirectory(filePath) : undefined;
  const content = (input.content as string) || '';
  const ext = filename.split('.').pop() || '';
  const diagnostics = getDiagnostics(
    metadata.diagnostics as Record<string, Diagnostic[]> | undefined,
    filePath,
  );

  return (
    <BasicTool
      icon={<FileCode2 className="size-3.5 flex-shrink-0" />}
      trigger={
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="font-medium text-xs text-foreground whitespace-nowrap">Write</span>
          <span className="text-xs text-foreground font-mono truncate">{filename}</span>
          {directory && (
            <span className="text-muted-foreground text-[10px] font-mono truncate hidden sm:inline">
              {directory}
            </span>
          )}
        </div>
      }
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      {content && (
        <div className="max-h-96 overflow-auto">
          <UnifiedMarkdown content={`\`\`\`${ext}\n${content}\n\`\`\``} isStreaming={false} />
        </div>
      )}
      <DiagnosticsDisplay diagnostics={diagnostics} />
    </BasicTool>
  );
}
ToolRegistry.register('write', WriteTool);

// --- Read ---
function ReadTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const metadata = partMetadata(part);
  const status = partStatus(part);
  const filePath = input.filePath as string | undefined;
  const filename = getFilename(filePath) || '';

  const args: string[] = [];
  if (input.offset) args.push('offset=' + String(input.offset));
  if (input.limit) args.push('limit=' + String(input.limit));

  const loaded = useMemo(() => {
    if (status !== 'completed') return [];
    const val = metadata.loaded;
    if (!val || !Array.isArray(val)) return [];
    return val.filter((p): p is string => typeof p === 'string');
  }, [status, metadata.loaded]);

  return (
    <>
      <BasicTool
        icon={<Glasses className="size-3.5 flex-shrink-0" />}
        trigger={{ title: 'Read', subtitle: filename, args }}
        defaultOpen={defaultOpen}
        forceOpen={forceOpen}
        locked={locked}
      />
      {loaded.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-2">
          {loaded.map((filepath, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-emerald-500">+</span>
              <span className="truncate font-mono text-[10px]">{filepath}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
ToolRegistry.register('read', ReadTool);

// ============================================================================
// Parsing helpers for Glob/Grep/List output
// ============================================================================

/** Try to parse output into a list of file paths (one per line) */
function parseFilePaths(output: string): string[] | null {
  if (!output) return null;
  const lines = output.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const pathLike = lines.filter((l) => l.startsWith('/') || l.startsWith('./') || l.startsWith('~'));
  if (pathLike.length >= lines.length * 0.7) return pathLike;
  return null;
}

interface GrepMatch { line: number; content: string; }
interface GrepFileGroup { filePath: string; matches: GrepMatch[]; }

/** Parse grep output into structured file groups */
function parseGrepOutput(output: string): { matchCount: number; groups: GrepFileGroup[] } | null {
  if (!output) return null;
  const text = String(output).trim();
  const headerMatch = text.match(/^Found\s+(\d+)\s+match/i);
  const matchCount = headerMatch ? parseInt(headerMatch[1], 10) : 0;
  const body = headerMatch ? text.slice(headerMatch[0].length).trim() : text;
  if (!body) return null;

  const groups: GrepFileGroup[] = [];
  const blocks = body.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const fileMatch = trimmed.match(/^(\/[^:]+?):\s*/);
    if (!fileMatch) continue;
    const filePath = fileMatch[1];
    const rest = trimmed.slice(fileMatch[0].length);
    const matches: GrepMatch[] = [];
    const lineRegex = /Line\s+(\d+):\s*([\s\S]*?)(?=\s*(?:Line\s+\d+:|$))/g;
    let m: RegExpExecArray | null;
    while ((m = lineRegex.exec(rest)) !== null) {
      matches.push({ line: parseInt(m[1], 10), content: m[2].trim().replace(/;$/, '') });
    }
    if (matches.length > 0) groups.push({ filePath, matches });
  }

  if (groups.length === 0) return null;
  return { matchCount: matchCount || groups.reduce((sum, g) => sum + g.matches.length, 0), groups };
}

// ============================================================================
// InlineFileList — styled file path list for Glob/List
// ============================================================================

function InlineFileList({ paths, onFileClick, toDisplayPath }: { paths: string[]; onFileClick: (path: string) => void; toDisplayPath: (p: string) => string }) {
  return (
    <div className="py-0.5">
      {paths.map((fp, i) => {
        const dp = toDisplayPath(fp);
        const name = getFilename(dp);
        const dir = getDirectory(dp);
        return (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-muted/50 transition-colors group"
            onClick={() => onFileClick(fp)}
            title={dp}
          >
            <FileText className="size-3 text-muted-foreground/50 flex-shrink-0 group-hover:text-foreground/60 transition-colors" />
            <span className="text-[11px] min-w-0 flex items-baseline gap-1.5 overflow-hidden">
              <span className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0">{name}</span>
              {dir && <span className="text-muted-foreground/40 truncate text-[10px]">{dir}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// InlineGrepResults — styled grep result groups
// ============================================================================

function InlineGrepResults({ groups, onFileClick, toDisplayPath }: { groups: GrepFileGroup[]; onFileClick: (path: string) => void; toDisplayPath: (p: string) => string }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(groups.length === 1 ? 0 : null);

  return (
    <div className="py-1 px-2 space-y-1">
      {groups.map((group, i) => {
        const dp = toDisplayPath(group.filePath);
        const name = getFilename(dp);
        const dir = getDirectory(dp);
        const isExpanded = expandedIndex === i;

        return (
          <div key={i} className="rounded-md border border-border/30 overflow-hidden">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors group"
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
            >
              {isExpanded ? (
                <ChevronDown className="size-3 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="size-3 text-muted-foreground flex-shrink-0" />
              )}
              <FileText className="size-3 text-muted-foreground/50 flex-shrink-0" />
              <span className="text-[11px] min-w-0 flex items-baseline gap-1.5 overflow-hidden flex-1">
                <span
                  className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0 cursor-pointer hover:text-blue-500 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onFileClick(group.filePath); }}
                  title={group.filePath}
                >
                  {name}
                </span>
                {dir && <span className="text-muted-foreground/40 truncate text-[10px]">{dir}</span>}
              </span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{group.matches.length}</span>
            </div>
            {isExpanded && (
              <div className="border-t border-border/20">
                {group.matches.map((match, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-0 border-b last:border-b-0 border-border/10"
                  >
                    <span className="text-[10px] font-mono text-muted-foreground/50 w-10 text-right pr-2 py-1 flex-shrink-0 select-none">
                      {match.line}
                    </span>
                    <span className="text-[10px] font-mono text-foreground/70 py-1 pr-2 break-all leading-relaxed">
                      {match.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Glob ---
function GlobTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const output = partOutput(part);
  const { openFile, openFileWithList, toDisplayPath } = useOcFileOpen();
  const directory = getDirectory(input.path as string) || undefined;
  const args: string[] = [];
  if (input.pattern) args.push('pattern=' + String(input.pattern));

  const filePaths = useMemo(() => parseFilePaths(output), [output]);

  return (
    <BasicTool
      icon={<Search className="size-3.5 flex-shrink-0" />}
      trigger={{ title: 'Glob', subtitle: directory, args }}
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      {filePaths && filePaths.length > 0 ? (
        <div data-scrollable className="max-h-72 overflow-auto">
          <InlineFileList paths={filePaths} onFileClick={(fp) => openFileWithList(fp, filePaths)} toDisplayPath={toDisplayPath} />
        </div>
      ) : output ? (
        <div data-scrollable className="p-2 max-h-72 overflow-auto">
          <UnifiedMarkdown content={output} isStreaming={false} />
        </div>
      ) : null}
    </BasicTool>
  );
}
ToolRegistry.register('glob', GlobTool);

// --- Grep ---
function GrepTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const output = partOutput(part);
  const { openFile, toDisplayPath } = useOcFileOpen();
  const directory = getDirectory(input.path as string) || undefined;
  const args: string[] = [];
  if (input.pattern) args.push('pattern=' + String(input.pattern));
  if (input.include) args.push('include=' + String(input.include));

  const grepResult = useMemo(() => parseGrepOutput(output), [output]);

  return (
    <BasicTool
      icon={<Search className="size-3.5 flex-shrink-0" />}
      trigger={{ title: 'Grep', subtitle: directory, args }}
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      {grepResult ? (
        <div data-scrollable className="max-h-72 overflow-auto">
          <InlineGrepResults groups={grepResult.groups} onFileClick={(fp) => openFile(fp)} toDisplayPath={toDisplayPath} />
        </div>
      ) : output ? (
        <div data-scrollable className="p-2 max-h-72 overflow-auto">
          <UnifiedMarkdown content={output} isStreaming={false} />
        </div>
      ) : null}
    </BasicTool>
  );
}
ToolRegistry.register('grep', GrepTool);

// --- List ---
function ListTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const output = partOutput(part);
  const { openFile, openFileWithList, toDisplayPath } = useOcFileOpen();
  const directory = getDirectory(input.path as string) || (input.path as string) || undefined;

  const filePaths = useMemo(() => parseFilePaths(output), [output]);

  return (
    <BasicTool
      icon={<ListTree className="size-3.5 flex-shrink-0" />}
      trigger={{ title: 'List', subtitle: directory }}
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      {filePaths && filePaths.length > 0 ? (
        <div data-scrollable className="max-h-72 overflow-auto">
          <InlineFileList paths={filePaths} onFileClick={(fp) => openFileWithList(fp, filePaths)} toDisplayPath={toDisplayPath} />
        </div>
      ) : output ? (
        <div data-scrollable className="p-2 max-h-72 overflow-auto">
          <UnifiedMarkdown content={output} isStreaming={false} />
        </div>
      ) : null}
    </BasicTool>
  );
}
ToolRegistry.register('list', ListTool);

// --- WebFetch ---
function WebFetchTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const output = partOutput(part);
  const url = (input.url as string) || '';
  const args: string[] = [];
  if (input.format) args.push('format=' + String(input.format));

  return (
    <BasicTool
      icon={<Globe className="size-3.5 flex-shrink-0" />}
      trigger={
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="font-medium text-xs text-foreground whitespace-nowrap">Web Fetch</span>
          <span className="text-muted-foreground text-xs truncate font-mono">{url}</span>
          {args.map((arg, i) => (
            <span
              key={i}
              className="text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono whitespace-nowrap"
            >
              {arg}
            </span>
          ))}
          <ExternalLink className="size-3 text-muted-foreground/60 flex-shrink-0 ml-auto" />
        </div>
      }
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      {output && (
        <div data-scrollable className="p-2 max-h-72 overflow-auto">
          <UnifiedMarkdown content={output} isStreaming={false} />
        </div>
      )}
    </BasicTool>
  );
}
ToolRegistry.register('webfetch', WebFetchTool);

// --- Task (sub-agent) — Slack-thread-style inline card ---
function TaskTool({ part, sessionId, defaultOpen, forceOpen, locked, onPermissionReply }: ToolProps) {
  const router = useRouter();
  const input = partInput(part);
  const status = partStatus(part);
  const childSessionId = getChildSessionId(part);
  const isRunning = status === 'running' || status === 'pending';
  const isDone = status === 'completed';
  const isError = status === 'error';
  const subagentType = (input.subagent_type as string) || 'task';
  const description = (input.description as string) || '';

  // Fetch child session messages
  const { data: childMessages } = useOpenCodeMessages(childSessionId || '');

  // Get child session permissions from pending store
  const allPermissions = useOpenCodePendingStore((s) => s.permissions);
  const childPermission = useMemo(() => {
    if (!childSessionId) return undefined;
    return Object.values(allPermissions).find((p) => p.sessionID === childSessionId);
  }, [allPermissions, childSessionId]);

  // Extract child tool parts
  const childToolParts = useMemo(() => {
    if (!childMessages) return [];
    return getChildSessionToolParts(childMessages);
  }, [childMessages]);

  // Find the child tool part matching the permission
  const childPermissionToolPart = useMemo(() => {
    if (!childPermission?.tool || !childMessages) return undefined;
    for (const msg of childMessages) {
      if (msg.info.role !== 'assistant') continue;
      for (const p of msg.parts) {
        if (isToolPart(p) && p.callID === childPermission.tool.callID) {
          return p;
        }
      }
    }
    return undefined;
  }, [childPermission, childMessages]);

  const hasChildPermission = !!childPermission;

  const handleOpenThread = useCallback(() => {
    if (childSessionId) {
      router.push(`/sessions/${childSessionId}`);
    }
  }, [childSessionId, router]);

  // Permission mode — render the child tool that needs attention inline
  if (hasChildPermission) {
    return (
      <div className="space-y-1.5">
        {childPermissionToolPart ? (
          (() => {
            const Comp = ToolRegistry.get(childPermissionToolPart.tool);
            return Comp ? (
              <Comp part={childPermissionToolPart} sessionId={childSessionId} defaultOpen forceOpen locked />
            ) : (
              <GenericTool part={childPermissionToolPart} />
            );
          })()
        ) : (
          <TaskThreadCard
            subagentType={subagentType}
            description={description}
            isRunning={true}
            isDone={false}
            isError={false}
            childToolParts={childToolParts}
            onOpen={handleOpenThread}
            hasChild={!!childSessionId}
          />
        )}
        {childPermission && (
          <PermissionPromptInline permission={childPermission} onReply={onPermissionReply} />
        )}
      </div>
    );
  }

  // Normal mode — thread card
  return (
    <TaskThreadCard
      subagentType={subagentType}
      description={description}
      isRunning={isRunning}
      isDone={isDone}
      isError={isError}
      childToolParts={childToolParts}
      onOpen={handleOpenThread}
      hasChild={!!childSessionId}
    />
  );
}
ToolRegistry.register('task', TaskTool);

// --- TaskThreadCard — clean inline sub-agent card ---
function TaskThreadCard({
  subagentType,
  description,
  isRunning,
  isDone,
  isError,
  childToolParts,
  onOpen,
  hasChild,
}: {
  subagentType: string;
  description: string;
  isRunning: boolean;
  isDone: boolean;
  isError: boolean;
  childToolParts: ToolPart[];
  onOpen: () => void;
  hasChild: boolean;
}) {
  const stepCount = childToolParts.length;

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        isError
          ? 'border-destructive/25'
          : 'border-border/50',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
        {/* Status */}
        {isRunning ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground flex-shrink-0" />
        ) : isError ? (
          <CircleAlert className="size-3.5 text-muted-foreground flex-shrink-0" />
        ) : isDone ? (
          <Check className="size-3.5 text-emerald-500 flex-shrink-0" />
        ) : (
          <SquareKanban className="size-3.5 text-muted-foreground flex-shrink-0" />
        )}

        {/* Title */}
        <span className="font-medium text-xs text-foreground capitalize flex-1 min-w-0 truncate">
          {subagentType} Agent
        </span>

        {/* Meta */}
        {stepCount > 0 && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums flex-shrink-0">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <div className="px-3 py-1.5 border-b border-border/30">
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{description}</p>
        </div>
      )}

      {/* Scrollable tool activity list */}
      {childToolParts.length > 0 && (
        <div data-scrollable className="max-h-48 overflow-y-auto">
          {childToolParts.map((childPart, i) => {
            const info = getToolInfo(childPart.tool, childPart.state.input ?? {});
            return (
              <div
                key={childPart.id}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs',
                  i > 0 && 'border-t border-border/20',
                )}
              >
                <ToolIconForName name={info.icon} />
                <span className="font-medium text-foreground/80 whitespace-nowrap">{info.title}</span>
                {info.subtitle && (
                  <span className="truncate text-muted-foreground font-mono text-[10px]">{info.subtitle}</span>
                )}
                <span className="ml-auto flex-shrink-0">
                  <StatusIcon status={childPart.state.status} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer — Open Thread */}
      {hasChild && (
        <button
          onClick={onOpen}
          className={cn(
            'flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-medium',
            'border-t border-border/30',
            'text-muted-foreground hover:text-foreground hover:bg-muted/30',
            'transition-colors cursor-pointer',
          )}
        >
          <ExternalLink className="size-3" />
          Open Thread
        </button>
      )}
    </div>
  );
}

// --- ToolIconForName: maps icon string to Lucide icon ---
function ToolIconForName({ name }: { name: string }) {
  const cls = 'size-3 flex-shrink-0';
  switch (name) {
    case 'terminal':
    case 'console':
      return <Terminal className={cls} />;
    case 'file-pen':
    case 'code-lines':
      return <FileCode2 className={cls} />;
    case 'glasses':
      return <Glasses className={cls} />;
    case 'search':
    case 'magnifying-glass-menu':
      return <Search className={cls} />;
    case 'globe':
    case 'window-cursor':
      return <Globe className={cls} />;
    case 'list':
    case 'bullet-list':
      return <ListTree className={cls} />;
    case 'check-square':
    case 'checklist':
      return <CheckSquare className={cls} />;
    case 'message-circle':
    case 'bubble-5':
      return <MessageCircle className={cls} />;
    case 'square-kanban':
    case 'task':
      return <SquareKanban className={cls} />;
    default:
      return <Cpu className={cls} />;
  }
}

// --- TodoWrite ---
function TodoWriteTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const metadata = partMetadata(part);

  const todos = useMemo(() => {
    const meta = metadata.todos;
    if (Array.isArray(meta)) return meta;
    const inp = input.todos;
    if (Array.isArray(inp)) return inp;
    return [];
  }, [metadata.todos, input.todos]);

  const completed = useMemo(
    () => todos.filter((t: Record<string, unknown>) => t.status === 'completed').length,
    [todos],
  );

  const subtitle = todos.length > 0 ? `${completed}/${todos.length}` : '';

  return (
    <BasicTool
      icon={<CheckSquare className="size-3.5 flex-shrink-0" />}
      trigger={{ title: 'Todos', subtitle }}
      defaultOpen={defaultOpen ?? true}
      forceOpen={forceOpen}
      locked={locked}
    >
      {todos.length > 0 && (
        <div className="p-2 space-y-1">
          {todos.map((todo: Record<string, unknown>, i: number) => (
            <label key={i} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={todo.status === 'completed'}
                readOnly
                className="mt-0.5 rounded border-border accent-primary"
              />
              <span
                className={cn(
                  'leading-relaxed',
                  todo.status === 'completed' && 'line-through text-muted-foreground',
                )}
              >
                {String(todo.content || '')}
              </span>
            </label>
          ))}
        </div>
      )}
    </BasicTool>
  );
}
ToolRegistry.register('todowrite', TodoWriteTool);

// --- Question ---
function QuestionToolRenderer({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const input = partInput(part);
  const metadata = partMetadata(part);

  const questions = useMemo(
    () => (Array.isArray(input.questions) ? input.questions : []) as Array<{ question: string; options?: { label: string; description?: string }[] }>,
    [input.questions],
  );

  const answers = useMemo(
    () => (Array.isArray(metadata.answers) ? metadata.answers : []) as string[][],
    [metadata.answers],
  );

  const isAnswered = answers.length > 0;
  const subtitle = questions.length > 0
    ? isAnswered
      ? `${answers.length} answered`
      : `${questions.length} ${questions.length > 1 ? 'questions' : 'question'}`
    : '';

  return (
    <BasicTool
      icon={<MessageCircle className="size-3.5 flex-shrink-0" />}
      trigger={{ title: 'Questions', subtitle }}
      defaultOpen={defaultOpen ?? isAnswered}
      forceOpen={forceOpen || isAnswered}
      locked={locked}
    >
      {isAnswered && (
        <div className="p-2 space-y-2">
          {questions.map((q, i) => {
            const answer = answers[i] || [];
            return (
              <div key={i} className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">{q.question}</p>
                <p className="text-xs text-muted-foreground">
                  {answer.join(', ') || 'No answer'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </BasicTool>
  );
}
ToolRegistry.register('question', QuestionToolRenderer);

// --- Apply Patch ---
function ApplyPatchTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
  const metadata = partMetadata(part);

  const files = useMemo(
    () => (Array.isArray(metadata.files) ? metadata.files : []) as ApplyPatchFile[],
    [metadata.files],
  );

  const subtitle = files.length > 0
    ? `${files.length} ${files.length > 1 ? 'files' : 'file'}`
    : '';

  return (
    <BasicTool
      icon={<FileCode2 className="size-3.5 flex-shrink-0" />}
      trigger={{ title: 'Patch', subtitle }}
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={locked}
    >
      {files.length > 0 && (
        <div className="p-2 space-y-2">
          {files.map((file, i) => (
            <div key={i} className="space-y-1">
              {/* File header */}
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                    file.type === 'add' && 'bg-emerald-500/15 text-emerald-500',
                    file.type === 'update' && 'bg-amber-500/15 text-amber-500',
                    file.type === 'delete' && 'bg-red-500/15 text-red-500',
                    file.type === 'move' && 'bg-blue-500/15 text-blue-500',
                  )}
                >
                  {file.type === 'add'
                    ? 'Created'
                    : file.type === 'update'
                      ? 'Patched'
                      : file.type === 'delete'
                        ? 'Deleted'
                        : 'Moved'}
                </span>
                <span className="font-mono text-[11px] text-foreground truncate">
                  {file.relativePath}
                </span>
                {file.type !== 'delete' && (
                  <DiffChanges additions={file.additions} deletions={file.deletions} />
                )}
                {file.type === 'delete' && file.deletions > 0 && (
                  <span className="ml-auto text-[10px] text-red-500">-{file.deletions}</span>
                )}
              </div>

              {/* File diff */}
              {file.type !== 'delete' && (file.before || file.after) && (
                <div className="max-h-72 overflow-auto rounded border border-border/30">
                  <InlineDiffView
                    oldValue={file.before}
                    newValue={file.after}
                    filename={file.relativePath}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </BasicTool>
  );
}
ToolRegistry.register('apply_patch', ApplyPatchTool);

// ============================================================================
// ToolError
// ============================================================================

export function ToolError({ error }: { error: string }) {
  const cleaned = error.replace(/^Error:\s*/, '');
  const colonIdx = cleaned.indexOf(': ');
  const hasTitle = colonIdx > 0 && colonIdx < 30;
  const title = hasTitle ? cleaned.slice(0, colonIdx) : undefined;
  const message = hasTitle ? cleaned.slice(colonIdx + 2) : cleaned;

  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground">
      <Ban className="size-3 flex-shrink-0 mt-0.5" />
      {title ? (
        <div className="min-w-0">
          <span className="font-medium text-foreground/70">{title}: </span>
          <span className="break-all">{message}</span>
        </div>
      ) : (
        <span className="break-all">{message}</span>
      )}
    </div>
  );
}

// ============================================================================
// GenericTool (fallback)
// ============================================================================

export function GenericTool({ part }: ToolProps) {
  const output = partOutput(part);

  return (
    <BasicTool
      icon={<Cpu className="size-3.5 flex-shrink-0" />}
      trigger={{ title: part.tool }}
    >
      {output && (
        <div className="p-2 max-h-72 overflow-auto font-mono text-[11px]">
          <pre className="whitespace-pre-wrap text-muted-foreground">{output}</pre>
        </div>
      )}
    </BasicTool>
  );
}

// ============================================================================
// PermissionPromptInline
// ============================================================================

interface PermissionPromptInlineProps {
  permission: PermissionRequest;
  onReply?: (requestId: string, reply: 'once' | 'always' | 'reject') => void;
}

function PermissionPromptInline({ permission, onReply }: PermissionPromptInlineProps) {
  const [visible, setVisible] = useState(false);
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const label = PERMISSION_LABELS[permission.permission] || permission.permission;

  const handleReply = useCallback(
    (reply: 'once' | 'always' | 'reject') => {
      if (replying) return;
      setReplying(true);
      onReply?.(permission.id, reply);
    },
    [replying, permission.id, onReply],
  );

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <span className="text-xs text-foreground flex-1">
        Permission: <span className="font-medium">{label}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          disabled={replying}
          onClick={() => handleReply('reject')}
          className="px-2 py-1 text-[11px] rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          Deny
        </button>
        <button
          disabled={replying}
          onClick={() => handleReply('always')}
          className="px-2 py-1 text-[11px] rounded-md text-foreground hover:bg-muted transition-colors border border-border disabled:opacity-50"
        >
          Allow always
        </button>
        <button
          disabled={replying}
          onClick={() => handleReply('once')}
          className="px-2 py-1 text-[11px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          Allow once
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ToolPartRenderer — main dispatch (primary export)
// ============================================================================

interface ToolPartRendererProps {
  part: ToolPart;
  permission?: PermissionRequest;
  question?: QuestionRequest;
  onPermissionReply?: (requestId: string, reply: 'once' | 'always' | 'reject') => void;
  onQuestionReply?: (requestId: string, answers: string[][]) => void;
  onQuestionReject?: (requestId: string) => void;
  defaultOpen?: boolean;
}

export function ToolPartRenderer({
  part,
  sessionId,
  permission,
  question,
  onPermissionReply,
  onQuestionReply,
  onQuestionReject,
  defaultOpen,
}: ToolPartRendererProps & { sessionId?: string }) {
  // Skip todoread
  if (part.tool === 'todoread') return null;

  // Error state
  if (part.state.status === 'error' && 'error' in part.state) {
    return <ToolError error={(part.state as { error: string }).error} />;
  }

  // Look up registered component
  const RegisteredComponent = ToolRegistry.get(part.tool);
  const forceOpen = !!permission || !!question;
  const isLocked = !!permission || !!question;

  const toolElement = RegisteredComponent ? (
    <RegisteredComponent
      part={part}
      sessionId={sessionId}
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      locked={isLocked}
      onPermissionReply={onPermissionReply}
    />
  ) : (
    <GenericTool part={part} />
  );

  return (
    <div className="relative">
      {toolElement}

      {/* Permission prompt */}
      {permission && onPermissionReply && (
        <div className="mt-1.5">
          <PermissionPromptInline permission={permission} onReply={onPermissionReply} />
        </div>
      )}

      {/* Question prompt */}
      {question && onQuestionReply && onQuestionReject && (
        <div className="mt-1.5">
          <QuestionPrompt
            request={question}
            onReply={onQuestionReply}
            onReject={onQuestionReject}
          />
        </div>
      )}
    </div>
  );
}
