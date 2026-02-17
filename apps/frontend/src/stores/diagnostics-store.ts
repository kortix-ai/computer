'use client';

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type DiagnosticSeverity = 1 | 2 | 3 | 4; // Error, Warning, Info, Hint

export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: DiagnosticSeverity;
  message: string;
  source?: string;
}

interface DiagnosticsState {
  /** All diagnostics keyed by file path */
  byFile: Record<string, LspDiagnostic[]>;

  // ---- Actions ----

  /** Set all diagnostics for a given file (replaces existing) */
  setFileDiagnostics: (file: string, diagnostics: LspDiagnostic[]) => void;

  /** Bulk-set diagnostics from an lsp.updated event payload (Record<string, RawDiag[]>) */
  setFromLspEvent: (diagnosticsByFile: Record<string, RawDiagnostic[]>) => void;

  /** Clear diagnostics for a file */
  clearFile: (file: string) => void;

  /** Clear all diagnostics */
  clearAll: () => void;

  // ---- Derived ----

  /** Total error count (severity 1) */
  getErrorCount: () => number;

  /** Total warning count (severity 2) */
  getWarningCount: () => number;

  /** Get all diagnostics across all files, sorted by severity then file */
  getAllDiagnostics: () => LspDiagnostic[];
}

/**
 * Raw diagnostic shape from LSP / tool metadata.
 * Supports both the range-based format (from tool metadata) and flat format.
 */
interface RawDiagnostic {
  range?: {
    start: { line: number; character: number };
    end?: { line: number; character: number };
  };
  line?: number;
  column?: number;
  character?: number;
  endLine?: number;
  endColumn?: number;
  severity?: number;
  message: string;
  source?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeRawDiagnostic(file: string, raw: RawDiagnostic): LspDiagnostic {
  const line = raw.range?.start?.line ?? raw.line ?? 0;
  const column = raw.range?.start?.character ?? raw.column ?? raw.character ?? 0;
  const endLine = raw.range?.end?.line ?? raw.endLine;
  const endColumn = raw.range?.end?.character ?? raw.endColumn;
  const severity = (raw.severity ?? 1) as DiagnosticSeverity;

  return {
    file,
    line,
    column,
    endLine,
    endColumn,
    severity,
    message: raw.message,
    source: raw.source,
  };
}

// ============================================================================
// Store
// ============================================================================

export const useDiagnosticsStore = create<DiagnosticsState>()((set, get) => ({
  byFile: {},

  setFileDiagnostics: (file, diagnostics) =>
    set((state) => ({
      byFile: {
        ...state.byFile,
        [file]: diagnostics,
      },
    })),

  setFromLspEvent: (diagnosticsByFile) =>
    set((state) => {
      const next = { ...state.byFile };
      for (const [file, rawDiags] of Object.entries(diagnosticsByFile)) {
        if (!Array.isArray(rawDiags)) continue;
        const normalized = rawDiags.map((d) => normalizeRawDiagnostic(file, d));
        if (normalized.length === 0) {
          delete next[file];
        } else {
          next[file] = normalized;
        }
      }
      return { byFile: next };
    }),

  clearFile: (file) =>
    set((state) => {
      const { [file]: _, ...rest } = state.byFile;
      return { byFile: rest };
    }),

  clearAll: () => set({ byFile: {} }),

  getErrorCount: () => {
    const { byFile } = get();
    let count = 0;
    for (const diags of Object.values(byFile)) {
      for (const d of diags) {
        if (d.severity === 1) count++;
      }
    }
    return count;
  },

  getWarningCount: () => {
    const { byFile } = get();
    let count = 0;
    for (const diags of Object.values(byFile)) {
      for (const d of diags) {
        if (d.severity === 2) count++;
      }
    }
    return count;
  },

  getAllDiagnostics: () => {
    const { byFile } = get();
    const all: LspDiagnostic[] = [];
    for (const diags of Object.values(byFile)) {
      all.push(...diags);
    }
    // Sort: errors first, then warnings, then by file, then by line
    all.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity - b.severity;
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      return a.line - b.line;
    });
    return all;
  },
}));

// Expose on window for console debugging
if (typeof window !== 'undefined') {
  (window as any).__diagStore = useDiagnosticsStore;
}
