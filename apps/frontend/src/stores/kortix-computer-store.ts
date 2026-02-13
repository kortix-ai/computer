import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { HIDE_BROWSER_TAB } from '@/components/thread/utils';
import { useFilesStore } from '@/features/files';

export type ViewType = 'tools' | 'files' | 'browser' | 'desktop' | 'terminal' | 'changes';

interface KortixComputerState {
  // === SANDBOX CONTEXT ===
  currentSandboxId: string | null;
  
  // Main view state
  activeView: ViewType;
  
  // Panel state
  shouldOpenPanel: boolean;
  isSidePanelOpen: boolean;
  isExpanded: boolean;
  
  // Tool navigation state (for external tool click triggers)
  pendingToolNavIndex: number | null;
  
  // === ACTIONS ===
  
  setSandboxContext: (sandboxId: string | null) => void;
  setActiveView: (view: ViewType) => void;
  
  // For external triggers (clicking file in chat) — delegates to useFilesStore + opens panel
  openFileInComputer: (filePath: string, filePathList?: string[]) => void;
  
  // Open files browser without selecting a file — delegates to useFilesStore + opens panel
  openFileBrowser: () => void;
  
  // Navigate to a specific tool call (clicking tool in ThreadContent)
  navigateToToolCall: (toolIndex: number) => void;
  
  // Clear pending tool nav after KortixComputer processes it
  clearPendingToolNav: () => void;
  
  // Panel control
  clearShouldOpenPanel: () => void;
  setIsSidePanelOpen: (open: boolean) => void;
  openSidePanel: () => void;
  closeSidePanel: () => void;
  setIsExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  
  // Reset all state (full reset)
  reset: () => void;
}

const initialState = {
  currentSandboxId: null as string | null,
  activeView: 'tools' as ViewType,
  shouldOpenPanel: false,
  isSidePanelOpen: false,
  isExpanded: false,
  pendingToolNavIndex: null as number | null,
};

export const useKortixComputerStore = create<KortixComputerState>()(
  devtools(
    (set, get) => ({
      ...initialState,
      
      setSandboxContext: (sandboxId: string | null) => {
        const currentSandboxId = get().currentSandboxId;
        
        if (currentSandboxId !== sandboxId) {
          console.log('[KortixComputerStore] Sandbox context changed:', currentSandboxId, '->', sandboxId);
          // Reset files store when sandbox changes
          useFilesStore.getState().reset();
          set({
            currentSandboxId: sandboxId,
            activeView: 'tools',
          });
        }
      },
      
      setActiveView: (view: ViewType) => {
        // If browser tab is hidden and trying to set browser view, default to tools
        const effectiveView = HIDE_BROWSER_TAB && view === 'browser' ? 'tools' : view;
        // Terminal and Desktop are now in the right sidebar - redirect to tools
        const finalView = (effectiveView === 'terminal' || effectiveView === 'desktop' || effectiveView === 'changes') ? 'tools' : effectiveView;
        set({ activeView: finalView });
      },
      
      openFileInComputer: (filePath: string, filePathList?: string[]) => {
        // Delegate file state to the unified files store
        const filesStore = useFilesStore.getState();
        if (filePathList && filePathList.length > 0) {
          const index = filePathList.indexOf(filePath);
          filesStore.openFileWithList(filePath, filePathList, Math.max(0, index));
        } else {
          filesStore.openFile(filePath);
        }
        
        set({
          activeView: 'tools',
          shouldOpenPanel: true,
        });
      },
      
      openFileBrowser: () => {
        // Delegate file state to the unified files store
        useFilesStore.getState().navigateToPath('.');
        
        set({
          activeView: 'tools',
          shouldOpenPanel: true,
        });
      },
      
      navigateToToolCall: (toolIndex: number) => {
        set({
          activeView: 'tools',
          pendingToolNavIndex: toolIndex,
          shouldOpenPanel: true,
        });
      },
      
      clearPendingToolNav: () => {
        set({ pendingToolNavIndex: null });
      },
      
      clearShouldOpenPanel: () => {
        set({ shouldOpenPanel: false });
      },
      
      setIsSidePanelOpen: (open: boolean) => {
        set({ isSidePanelOpen: open });
      },
      
      openSidePanel: () => {
        set({ isSidePanelOpen: true });
      },
      
      closeSidePanel: () => {
        set({ isSidePanelOpen: false, isExpanded: false });
      },

      setIsExpanded: (expanded: boolean) => {
        set({ isExpanded: expanded });
      },

      toggleExpanded: () => {
        set((state) => ({ isExpanded: !state.isExpanded }));
      },
      
      reset: () => {
        console.log('[KortixComputerStore] Full reset');
        useFilesStore.getState().reset();
        set(initialState);
      },
    }),
    {
      name: 'kortix-computer-store',
    }
  )
);

// === SELECTOR HOOKS ===

// Sandbox context
export const useKortixComputerSandboxId = () =>
  useKortixComputerStore((state) => state.currentSandboxId);

export const useSetSandboxContext = () =>
  useKortixComputerStore((state) => state.setSandboxContext);

// Main view state
export const useKortixComputerActiveView = () => 
  useKortixComputerStore((state) => state.activeView);

// Individual selectors for pending tool navigation (stable primitives)
export const useKortixComputerPendingToolNavIndex = () =>
  useKortixComputerStore((state) => state.pendingToolNavIndex);

export const useKortixComputerClearPendingToolNav = () =>
  useKortixComputerStore((state) => state.clearPendingToolNav);

// Side panel state selectors
export const useIsSidePanelOpen = () =>
  useKortixComputerStore((state) => state.isSidePanelOpen);

export const useSetIsSidePanelOpen = () =>
  useKortixComputerStore((state) => state.setIsSidePanelOpen);

export const useIsExpanded = () =>
  useKortixComputerStore((state) => state.isExpanded);

export const useToggleExpanded = () =>
  useKortixComputerStore((state) => state.toggleExpanded);
