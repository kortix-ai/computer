'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  CircleAlert,
  AlertTriangle,
  Info,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  FileCode2,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  useDiagnosticsStore,
  type LspDiagnostic,
  type DiagnosticSeverity,
} from '@/stores/diagnostics-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';

// ============================================================================
// Constants & Helpers
// ============================================================================

function SeverityIcon({
  severity,
  className,
}: {
  severity: DiagnosticSeverity;
  className?: string;
}) {
  switch (severity) {
    case 1: // Error
      return <CircleAlert className={cn('text-red-500', className)} />;
    case 2: // Warning
      return <AlertTriangle className={cn('text-yellow-500', className)} />;
    case 3: // Info
      return <Info className={cn('text-blue-500', className)} />;
    case 4: // Hint
    default:
      return <HelpCircle className={cn('text-muted-foreground', className)} />;
  }
}

function getFilename(path: string): string {
  return path.split('/').pop() || path;
}

function getDirectory(path: string): string | undefined {
  const parts = path.split('/');
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join('/');
}

// ============================================================================
// Grouped diagnostics by file
// ============================================================================

interface FileGroup {
  file: string;
  diagnostics: LspDiagnostic[];
  errorCount: number;
  warningCount: number;
}

function groupByFile(diagnostics: LspDiagnostic[]): FileGroup[] {
  const map = new Map<string, LspDiagnostic[]>();
  for (const d of diagnostics) {
    const list = map.get(d.file) || [];
    list.push(d);
    map.set(d.file, list);
  }

  const groups: FileGroup[] = [];
  for (const [file, diags] of map) {
    // Sort diagnostics within file by line
    diags.sort((a, b) => a.line - b.line);
    groups.push({
      file,
      diagnostics: diags,
      errorCount: diags.filter((d) => d.severity === 1).length,
      warningCount: diags.filter((d) => d.severity === 2).length,
    });
  }

  // Sort groups: files with errors first, then by file path
  groups.sort((a, b) => {
    if (a.errorCount > 0 && b.errorCount === 0) return -1;
    if (a.errorCount === 0 && b.errorCount > 0) return 1;
    return a.file.localeCompare(b.file);
  });

  return groups;
}

// ============================================================================
// DiagnosticRow
// ============================================================================

function DiagnosticRow({
  diagnostic,
  onClick,
}: {
  diagnostic: LspDiagnostic;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors cursor-pointer rounded-md group"
    >
      <SeverityIcon severity={diagnostic.severity} className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/90 leading-snug line-clamp-2 group-hover:text-foreground">
          {diagnostic.message}
        </p>
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          Ln {diagnostic.line + 1}, Col {diagnostic.column + 1}
          {diagnostic.source && <span className="ml-1.5">({diagnostic.source})</span>}
        </span>
      </div>
    </button>
  );
}

// ============================================================================
// FileGroupSection
// ============================================================================

function FileGroupSection({
  group,
  defaultExpanded,
  onDiagnosticClick,
}: {
  group: FileGroup;
  defaultExpanded: boolean;
  onDiagnosticClick: (diagnostic: LspDiagnostic) => void;
}) {
  const [expanded, setExpanded] = useState(() => defaultExpanded);
  const filename = getFilename(group.file);
  const directory = getDirectory(group.file);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-muted/40 transition-colors cursor-pointer rounded-lg"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        <FileCode2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{filename}</span>
        {directory && (
          <span className="text-[10px] text-muted-foreground/50 font-mono truncate hidden sm:inline">
            {directory}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          {group.errorCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-500">
              <CircleAlert className="h-2.5 w-2.5" />
              {group.errorCount}
            </span>
          )}
          {group.warningCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-yellow-500">
              <AlertTriangle className="h-2.5 w-2.5" />
              {group.warningCount}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="ml-3 border-l border-border/30 pl-1 mb-1">
          {group.diagnostics.map((d, i) => (
            <DiagnosticRow
              key={`${d.line}:${d.column}:${i}`}
              diagnostic={d}
              onClick={() => onDiagnosticClick(d)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DiagnosticsBadge — the header badge showing error/warning counts
// ============================================================================

export function DiagnosticsBadge() {
  const byFile = useDiagnosticsStore((s) => s.byFile);
  const [open, setOpen] = useState(false);

  const openFileInComputer = useKortixComputerStore((s) => s.openFileInComputer);

  const allDiagnostics = useMemo(() => {
    const all: LspDiagnostic[] = [];
    for (const diags of Object.values(byFile)) {
      all.push(...diags);
    }
    return all;
  }, [byFile]);

  const errorCount = allDiagnostics.filter((d) => d.severity === 1).length;
  const warningCount = allDiagnostics.filter((d) => d.severity === 2).length;

  const groups = useMemo(() => groupByFile(allDiagnostics), [allDiagnostics]);

  const totalCount = errorCount + warningCount;

  const handleDiagnosticClick = useCallback(
    (diagnostic: LspDiagnostic) => {
      // Line is 0-indexed from LSP, targetLine in store is 1-indexed
      openFileInComputer(diagnostic.file, undefined, diagnostic.line + 1);
      setOpen(false);
    },
    [openFileInComputer],
  );

  if (totalCount === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer hover:bg-muted/60"
            >
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <CircleAlert className="h-3.5 w-3.5" />
                  <span>{errorCount}</span>
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{warningCount}</span>
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {errorCount > 0 && `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
          {errorCount > 0 && warningCount > 0 && ', '}
          {warningCount > 0 && `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="w-96 max-h-[60vh] p-0 overflow-hidden"
      >
        <div className="flex flex-col h-full max-h-[60vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Diagnostics</span>
              <div className="flex items-center gap-2">
                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-500">
                    {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-500">
                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Diagnostics list grouped by file */}
          <div className="flex-1 overflow-y-auto min-h-0 p-1.5">
            {groups.length > 0 ? (
              groups.map((group) => (
                <FileGroupSection
                  key={group.file}
                  group={group}
                  defaultExpanded={groups.length <= 3}
                  onDiagnosticClick={handleDiagnosticClick}
                />
              ))
            ) : (
              <div className="text-xs text-center py-6 text-muted-foreground">
                No diagnostics
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
