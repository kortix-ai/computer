import { create } from 'zustand';

export type FilesView = 'browser' | 'viewer' | 'history';

/** Clipboard operation type for copy/cut */
export type ClipboardOperation = 'copy' | 'cut';

/** Clipboard item representing a file or directory */
export interface ClipboardItem {
  /** Relative path of the item */
  path: string;
  /** Name of the item */
  name: string;
  /** Whether it's a file or directory */
  type: 'file' | 'directory';
  /** The operation (copy or cut/move) */
  operation: ClipboardOperation;
}

interface FilesStoreState {
  /** Which view is active: directory browser or file viewer */
  view: FilesView;
  /** Current directory path being browsed (relative to project root) */
  currentPath: string;
  /** Path of the file currently being viewed (null = none selected) */
  selectedFilePath: string | null;
  /** Ordered list of file paths for prev/next navigation in viewer */
  filePathList: string[];
  /** Index into filePathList for current file */
  currentFileIndex: number;
  /** Whether the search overlay is open */
  isSearchOpen: boolean;
  /** Unsaved file content persistence (keyed by filePath) */
  unsavedFileContent: Record<string, string>;
  /** Unsaved state tracking (has user made edits?) */
  unsavedFileState: Record<string, boolean>;
  /** Path of the file whose history is being viewed */
  historyFilePath: string | null;
  /** Currently selected commit hash in the history panel */
  selectedCommitHash: string | null;
  /** Clipboard item for copy/cut operations */
  clipboard: ClipboardItem | null;
  /** Target line number to scroll to after opening a file (1-indexed, null = none) */
  targetLine: number | null;

  // ── Explorer tree state ──────────────────────────────────────
  /** Set of expanded directory paths in the tree sidebar */
  expandedDirs: Set<string>;
  /** Whether the tree sidebar is collapsed */
  isSidebarCollapsed: boolean;
  /** Right panel mode: 'viewer' shows file, 'welcome' shows empty state */
  panelMode: 'welcome' | 'viewer' | 'history';
}

interface FilesStoreActions {
  /** Navigate to a directory */
  navigateToPath: (path: string) => void;
  /** Open a file in the viewer */
  openFile: (filePath: string, targetLine?: number) => void;
  /** Open a file and set the navigation list */
  openFileWithList: (filePath: string, fileList: string[], index: number) => void;
  /** Clear the target line after the viewer has scrolled to it */
  clearTargetLine: () => void;
  /** Go back from viewer to browser */
  goBackToBrowser: () => void;
  /** Navigate to next file in the list */
  nextFile: () => void;
  /** Navigate to previous file in the list */
  prevFile: () => void;
  /** Toggle search overlay */
  toggleSearch: () => void;
  /** Close search overlay */
  closeSearch: () => void;
  /** Set unsaved content for a file */
  setUnsavedContent: (filePath: string, content: string) => void;
  /** Get unsaved content for a file */
  getUnsavedContent: (filePath: string) => string | undefined;
  /** Clear unsaved content for a file */
  clearUnsavedContent: (filePath: string) => void;
  /** Set unsaved state (has user made edits?) */
  setUnsavedState: (filePath: string, hasUnsaved: boolean) => void;
  /** Get unsaved state for a file */
  getUnsavedState: (filePath: string) => boolean;
  /** Open the history view for a file */
  openHistory: (filePath: string) => void;
  /** Select a commit in the history panel */
  selectCommit: (commitHash: string | null) => void;
  /** Close the history view (go back to viewer or browser) */
  closeHistory: () => void;
  /** Copy a file/directory to clipboard */
  copyToClipboard: (path: string, name: string, type: 'file' | 'directory') => void;
  /** Cut a file/directory to clipboard */
  cutToClipboard: (path: string, name: string, type: 'file' | 'directory') => void;
  /** Clear clipboard */
  clearClipboard: () => void;
  /** Reset all state */
  reset: () => void;

  // ── Explorer tree actions ────────────────────────────────────
  /** Toggle a directory's expanded state in the tree */
  toggleDir: (path: string) => void;
  /** Expand a directory in the tree */
  expandDir: (path: string) => void;
  /** Collapse a directory in the tree */
  collapseDir: (path: string) => void;
  /** Expand all ancestor directories for a given file path */
  revealPath: (filePath: string) => void;
  /** Toggle sidebar collapsed state */
  toggleSidebar: () => void;
  /** Set sidebar collapsed state */
  setSidebarCollapsed: (collapsed: boolean) => void;
}

type FilesStore = FilesStoreState & FilesStoreActions;

const initialState: FilesStoreState = {
  view: 'browser',
  currentPath: '/workspace',
  selectedFilePath: null,
  filePathList: [],
  currentFileIndex: 0,
  isSearchOpen: false,
  unsavedFileContent: {},
  unsavedFileState: {},
  historyFilePath: null,
  selectedCommitHash: null,
  clipboard: null,
  targetLine: null,
  expandedDirs: new Set(['/workspace']),
  isSidebarCollapsed: false,
  panelMode: 'welcome',
};

export const useFilesStore = create<FilesStore>()((set, get) => ({
  ...initialState,

  navigateToPath: (path: string) => {
    const normalized = path || '/workspace';
    set({
      currentPath: normalized,
      view: 'browser',
      selectedFilePath: null,
    });
    // Auto-expand the target directory in tree
    get().expandDir(normalized);
  },

  openFile: (filePath: string, targetLine?: number) => {
    // Derive the parent directory to keep the tree in sync
    const lastSlash = filePath.lastIndexOf('/');
    const parentDir = lastSlash > 0 ? filePath.slice(0, lastSlash) : '/workspace';

    set({
      selectedFilePath: filePath,
      view: 'viewer',
      panelMode: 'viewer',
      filePathList: [filePath],
      currentFileIndex: 0,
      isSearchOpen: false,
      targetLine: targetLine ?? null,
      currentPath: parentDir,
    });
    // Reveal the file in the tree
    get().revealPath(filePath);
  },

  clearTargetLine: () => {
    set({ targetLine: null });
  },

  openFileWithList: (filePath: string, fileList: string[], index: number) => {
    const lastSlash = filePath.lastIndexOf('/');
    const parentDir = lastSlash > 0 ? filePath.slice(0, lastSlash) : '/workspace';

    set({
      selectedFilePath: filePath,
      view: 'viewer',
      panelMode: 'viewer',
      filePathList: fileList,
      currentFileIndex: index,
      isSearchOpen: false,
      currentPath: parentDir,
    });
    get().revealPath(filePath);
  },

  goBackToBrowser: () => {
    set({
      view: 'browser',
      panelMode: 'welcome',
      selectedFilePath: null,
    });
  },

  nextFile: () => {
    const { filePathList, currentFileIndex } = get();
    if (currentFileIndex < filePathList.length - 1) {
      const nextIndex = currentFileIndex + 1;
      set({
        currentFileIndex: nextIndex,
        selectedFilePath: filePathList[nextIndex],
      });
    }
  },

  prevFile: () => {
    const { filePathList, currentFileIndex } = get();
    if (currentFileIndex > 0) {
      const prevIndex = currentFileIndex - 1;
      set({
        currentFileIndex: prevIndex,
        selectedFilePath: filePathList[prevIndex],
      });
    }
  },

  toggleSearch: () => {
    set((s) => ({ isSearchOpen: !s.isSearchOpen }));
  },

  closeSearch: () => {
    set({ isSearchOpen: false });
  },

  setUnsavedContent: (filePath: string, content: string) => {
    set((state) => ({
      unsavedFileContent: {
        ...state.unsavedFileContent,
        [filePath]: content,
      },
    }));
  },

  getUnsavedContent: (filePath: string) => {
    return get().unsavedFileContent[filePath];
  },

  clearUnsavedContent: (filePath: string) => {
    set((state) => {
      const { [filePath]: _, ...restContent } = state.unsavedFileContent;
      const { [filePath]: __, ...restState } = state.unsavedFileState;
      return {
        unsavedFileContent: restContent,
        unsavedFileState: restState,
      };
    });
  },

  setUnsavedState: (filePath: string, hasUnsaved: boolean) => {
    set((state) => ({
      unsavedFileState: {
        ...state.unsavedFileState,
        [filePath]: hasUnsaved,
      },
    }));
  },

  getUnsavedState: (filePath: string) => {
    return get().unsavedFileState[filePath] ?? false;
  },

  openHistory: (filePath: string) => {
    set({
      view: 'history',
      panelMode: 'history',
      historyFilePath: filePath,
      selectedCommitHash: null,
      isSearchOpen: false,
    });
  },

  selectCommit: (commitHash: string | null) => {
    set({ selectedCommitHash: commitHash });
  },

  closeHistory: () => {
    const { selectedFilePath } = get();
    set({
      view: selectedFilePath ? 'viewer' : 'browser',
      panelMode: selectedFilePath ? 'viewer' : 'welcome',
      historyFilePath: null,
      selectedCommitHash: null,
    });
  },

  copyToClipboard: (path, name, type) => {
    set({ clipboard: { path, name, type, operation: 'copy' } });
  },

  cutToClipboard: (path, name, type) => {
    set({ clipboard: { path, name, type, operation: 'cut' } });
  },

  clearClipboard: () => {
    set({ clipboard: null });
  },

  reset: () => {
    set(initialState);
  },

  // ── Explorer tree actions ────────────────────────────────────

  toggleDir: (path: string) => {
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedDirs: next };
    });
  },

  expandDir: (path: string) => {
    set((state) => {
      if (state.expandedDirs.has(path)) return state;
      const next = new Set(state.expandedDirs);
      next.add(path);
      return { expandedDirs: next };
    });
  },

  collapseDir: (path: string) => {
    set((state) => {
      if (!state.expandedDirs.has(path)) return state;
      const next = new Set(state.expandedDirs);
      next.delete(path);
      return { expandedDirs: next };
    });
  },

  revealPath: (filePath: string) => {
    set((state) => {
      const next = new Set(state.expandedDirs);
      const parts = filePath.split('/');
      // Build ancestor paths and expand each
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join('/');
        if (ancestor) next.add(ancestor);
      }
      return { expandedDirs: next };
    });
  },

  toggleSidebar: () => {
    set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed }));
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    set({ isSidebarCollapsed: collapsed });
  },
}));
