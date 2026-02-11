import { create } from 'zustand';

export type FilesView = 'browser' | 'viewer';

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
}

interface FilesStoreActions {
  /** Navigate to a directory */
  navigateToPath: (path: string) => void;
  /** Open a file in the viewer */
  openFile: (filePath: string) => void;
  /** Open a file and set the navigation list */
  openFileWithList: (filePath: string, fileList: string[], index: number) => void;
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
  /** Reset all state */
  reset: () => void;
}

type FilesStore = FilesStoreState & FilesStoreActions;

const initialState: FilesStoreState = {
  view: 'browser',
  currentPath: '.',
  selectedFilePath: null,
  filePathList: [],
  currentFileIndex: 0,
  isSearchOpen: false,
  unsavedFileContent: {},
  unsavedFileState: {},
};

export const useFilesStore = create<FilesStore>()((set, get) => ({
  ...initialState,

  navigateToPath: (path: string) => {
    set({
      currentPath: path || '.',
      view: 'browser',
      selectedFilePath: null,
    });
  },

  openFile: (filePath: string) => {
    set({
      selectedFilePath: filePath,
      view: 'viewer',
      filePathList: [filePath],
      currentFileIndex: 0,
      isSearchOpen: false,
    });
  },

  openFileWithList: (filePath: string, fileList: string[], index: number) => {
    set({
      selectedFilePath: filePath,
      view: 'viewer',
      filePathList: fileList,
      currentFileIndex: index,
      isSearchOpen: false,
    });
  },

  goBackToBrowser: () => {
    set({
      view: 'browser',
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

  reset: () => {
    set(initialState);
  },
}));
