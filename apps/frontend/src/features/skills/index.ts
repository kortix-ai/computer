/**
 * Skills feature — global SKILL.md file management.
 *
 * Provides CRUD operations for skills (instruction sets that agents
 * can load on demand). Skills are SKILL.md files with YAML frontmatter
 * stored in well-known directories.
 */

// Types
export type {
  Skill,
  SkillSource,
  SkillFilterTab,
  CreateSkillInput,
  UpdateSkillInput,
  DeleteSkillInput,
} from './types';

export {
  getSkillSource,
  SOURCE_META,
  SKILL_FILTER_TABS,
  SKILL_NAME_REGEX,
  SKILL_NAME_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
  validateSkillName,
  validateSkillDescription,
  buildSkillFileContent,
  parseSkillFileContent,
} from './types';

// API
export {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
} from './api/skills-api';

// Hooks
export {
  useSkills,
  skillsKeys,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
} from './hooks';

// Store
export { useSkillsStore, type SkillEditorMode } from './store/skills-store';

// Components
export {
  SkillList,
  SkillCard,
  SkillEditor,
  DeleteSkillDialog,
} from './components';
