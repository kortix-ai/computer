import { create, type StateCreator } from 'zustand';

/**
 * Shared Kortix Computer store factory.
 *
 * Extracts the common state shape used by both frontend and mobile to drive the
 * Kortix Computer panel (view switching, tool navigation, panel visibility).
 *
 * ── Architecture divergence ──
 * The two platform stores diverge significantly in file management:
 *
 * Frontend (apps/frontend/src/stores/kortix-computer-store.ts):
 *   - Delegates file state to an external `useFilesStore`.
 *   - Tracks per-session panel state (`_panelOpenBySession`, `_activeSessionId`).
 *   - Adds `currentSandboxId`, `shouldOpenPanel`, `isExpanded` state.
 *   - Uses `devtools` middleware.
 *   - ViewType includes 'desktop', 'terminal', 'changes'.
 *   - Applies `HIDE_BROWSER_TAB` feature flag in `setActiveView`.
 *
 * Mobile (apps/mobile/stores/kortix-computer-store.ts):
 *   - Manages all file state inline (`filesSubView`, `currentPath`,
 *     `selectedFilePath`, `filePathList`, `currentFileIndex`).
 *   - Includes version history state (`selectedVersion`, `selectedVersionDate`).
 *   - Includes unsaved-file-content persistence.
 *   - Has a `normalizeWorkspacePath` helper for path normalization.
 *   - ViewType is limited to 'tools' | 'files' | 'browser'.
 *
 * This base captures the ~40% that is identical, providing a common contract
 * and default implementations. Each platform extends with its own specifics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * View types shared across both platforms.
 * Platforms may extend with additional literals (e.g. 'desktop' | 'terminal').
 */
export type BaseViewType = 'tools' | 'files' | 'browser';

/**
 * Base state shape for the Kortix Computer panel.
 *
 * Uses `string` for `activeView` so platforms can extend the union without
 * type conflicts. The `BaseViewType` literal union is exported separately for
 * use in type guards and exhaustive switches.
 */
export interface KortixComputerBaseState {
  // -- View state -----------------------------------------------------------
  /** Currently active tab / view in the computer panel. */
  activeView: string;

  // -- Panel state ----------------------------------------------------------
  /** Whether the side panel (computer panel) is open. */
  isSidePanelOpen: boolean;

  // -- Tool navigation ------------------------------------------------------
  /**
   * Index of the tool call to scroll to in the tools view.
   * Set by `navigateToToolCall`, cleared by `clearPendingToolNav` after the
   * UI processes the navigation.
   */
  pendingToolNavIndex: number | null;

  // -- Actions --------------------------------------------------------------

  /** Switch the active view. */
  setActiveView: (view: string) => void;

  /**
   * Open a file in the computer panel.
   *
   * Base implementation opens the panel and switches to 'files' view.
   * Platform overrides handle file-state management:
   * - Frontend delegates to `useFilesStore`.
   * - Mobile updates inline file state (`selectedFilePath`, etc.).
   */
  openFileInComputer: (filePath: string, filePathList?: string[]) => void;

  /**
   * Open the file browser without selecting a specific file.
   *
   * Base implementation opens the panel and switches to 'files' view.
   */
  openFileBrowser: () => void;

  /**
   * Navigate to a specific tool call (e.g. from clicking a tool in the chat).
   * Opens the panel, switches to 'tools' view, and sets `pendingToolNavIndex`.
   */
  navigateToToolCall: (toolIndex: number) => void;

  /** Clear `pendingToolNavIndex` after the UI has processed the navigation. */
  clearPendingToolNav: () => void;

  /** Open the side panel. */
  openSidePanel: () => void;

  /** Close the side panel. */
  closeSidePanel: () => void;

  /** Reset all state to initial values. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state (exported so platforms can spread into extended stores)
// ---------------------------------------------------------------------------

export const kortixComputerBaseInitialState: Pick<
  KortixComputerBaseState,
  'activeView' | 'isSidePanelOpen' | 'pendingToolNavIndex'
> = {
  activeView: 'tools' as string,
  isSidePanelOpen: false,
  pendingToolNavIndex: null,
};

// ---------------------------------------------------------------------------
// State creator (usable as a zustand slice or standalone)
// ---------------------------------------------------------------------------

/**
 * Zustand state creator for the Kortix Computer base store.
 *
 * Provides sensible defaults for all actions. Platforms that need different
 * behaviour (e.g. frontend's per-session panel tracking, mobile's inline file
 * state) should create their own store using the exported types and initial
 * state as building blocks rather than using this creator directly.
 */
export const kortixComputerBaseStateCreator: StateCreator<KortixComputerBaseState> = (set) => ({
  ...kortixComputerBaseInitialState,

  setActiveView: (view: string) => {
    set({ activeView: view });
  },

  openFileInComputer: (filePath: string, _filePathList?: string[]) => {
    // Base: open the panel and switch to files view.
    // Platforms override to manage file-specific state.
    set({
      isSidePanelOpen: true,
      activeView: 'files',
    });
  },

  openFileBrowser: () => {
    // Base: open the panel and switch to files view.
    set({
      isSidePanelOpen: true,
      activeView: 'files',
    });
  },

  navigateToToolCall: (toolIndex: number) => {
    set({
      activeView: 'tools',
      pendingToolNavIndex: toolIndex,
      isSidePanelOpen: true,
    });
  },

  clearPendingToolNav: () => {
    set({ pendingToolNavIndex: null });
  },

  openSidePanel: () => {
    set({ isSidePanelOpen: true });
  },

  closeSidePanel: () => {
    set({ isSidePanelOpen: false });
  },

  reset: () => {
    set({ ...kortixComputerBaseInitialState });
  },
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an independent Kortix Computer base Zustand store instance.
 *
 * @example
 * ```ts
 * // Use directly when the base behaviour is sufficient:
 * export const useKortixComputerStore = createKortixComputerBaseStore();
 * ```
 *
 * For platform-specific extensions, create your own store using the exported
 * `kortixComputerBaseInitialState`, `kortixComputerBaseStateCreator`, and
 * `KortixComputerBaseState` type as building blocks. For example:
 *
 * ```ts
 * import {
 *   type KortixComputerBaseState,
 *   kortixComputerBaseInitialState,
 * } from '@kortix/shared/stores';
 *
 * interface MyExtendedState extends KortixComputerBaseState {
 *   isExpanded: boolean;
 *   toggleExpanded: () => void;
 * }
 *
 * export const useKortixComputerStore = create<MyExtendedState>((set) => ({
 *   ...kortixComputerBaseInitialState,
 *   isExpanded: false,
 *   // ... your actions
 * }));
 * ```
 */
export function createKortixComputerBaseStore() {
  return create<KortixComputerBaseState>(kortixComputerBaseStateCreator);
}
