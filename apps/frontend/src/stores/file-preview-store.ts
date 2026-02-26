import { create } from 'zustand';

interface FilePreviewState {
  /** Whether the preview dialog is open */
  isOpen: boolean;
  /** Path of the file currently being previewed */
  filePath: string | null;
  /** Optional line number to highlight */
  lineNumber?: number;

  /** Open the preview dialog with the given file */
  openPreview: (filePath: string, lineNumber?: number) => void;
  /** Close the preview dialog */
  closePreview: () => void;
}

export const useFilePreviewStore = create<FilePreviewState>((set) => ({
  isOpen: false,
  filePath: null,
  lineNumber: undefined,

  openPreview: (filePath, lineNumber) => {
    set({ isOpen: true, filePath, lineNumber });
  },

  closePreview: () => {
    set({ isOpen: false, filePath: null, lineNumber: undefined });
  },
}));
