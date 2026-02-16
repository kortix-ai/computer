import { create } from 'zustand';
import type { Skill } from '../types';

// ---------------------------------------------------------------------------
// Editor mode
// ---------------------------------------------------------------------------

export type SkillEditorMode = 'create' | 'edit';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SkillsStoreState {
  /** Whether the editor dialog is open */
  isEditorOpen: boolean;
  /** Current editor mode */
  editorMode: SkillEditorMode;
  /** Skill being edited (null for create mode) */
  editingSkill: Skill | null;
  /** Whether the delete confirmation dialog is open */
  isDeleteDialogOpen: boolean;
  /** Skill pending deletion */
  deletingSkill: Skill | null;
}

interface SkillsStoreActions {
  /** Open the editor in create mode */
  openCreateEditor: () => void;
  /** Open the editor in edit mode for a specific skill */
  openEditEditor: (skill: Skill) => void;
  /** Close the editor dialog */
  closeEditor: () => void;
  /** Open the delete confirmation dialog */
  openDeleteDialog: (skill: Skill) => void;
  /** Close the delete confirmation dialog */
  closeDeleteDialog: () => void;
}

export const useSkillsStore = create<SkillsStoreState & SkillsStoreActions>(
  (set) => ({
    // State
    isEditorOpen: false,
    editorMode: 'create',
    editingSkill: null,
    isDeleteDialogOpen: false,
    deletingSkill: null,

    // Actions
    openCreateEditor: () =>
      set({ isEditorOpen: true, editorMode: 'create', editingSkill: null }),

    openEditEditor: (skill) =>
      set({ isEditorOpen: true, editorMode: 'edit', editingSkill: skill }),

    closeEditor: () =>
      set({ isEditorOpen: false, editingSkill: null }),

    openDeleteDialog: (skill) =>
      set({ isDeleteDialogOpen: true, deletingSkill: skill }),

    closeDeleteDialog: () =>
      set({ isDeleteDialogOpen: false, deletingSkill: null }),
  }),
);
