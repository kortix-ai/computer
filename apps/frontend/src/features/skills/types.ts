/**
 * Skills feature types.
 *
 * Skills are SKILL.md files with YAML frontmatter (name + description)
 * and a Markdown body containing instructions. They live in well-known
 * directories and are discovered automatically by the OpenCode server.
 */

// ---------------------------------------------------------------------------
// Core skill type (matches the OpenCode SDK response)
// ---------------------------------------------------------------------------

export interface Skill {
  /** Unique skill identifier (lowercase, hyphenated) */
  name: string;
  /** What the skill does and when to load it */
  description: string;
  /** Absolute filesystem path to the SKILL.md file */
  location: string;
  /** Full file content (frontmatter + body) */
  content: string;
}

// ---------------------------------------------------------------------------
// Skill source classification
// ---------------------------------------------------------------------------

type SkillSource = 'project' | 'global' | 'external';

export function getSkillSource(location: string): SkillSource {
  if (location.includes('/.opencode/')) return 'project';
  if (
    location.includes('/.claude/') ||
    location.includes('/.agents/')
  )
    return 'external';
  if (location.includes('/.config/')) return 'global';
  return 'project';
}
