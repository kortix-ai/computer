/**
 * OpenCode ToolView components for KortixComputer.
 *
 * These are registered in the ToolViewRegistry under the "oc-" prefix
 * to avoid collision with AgentPress tool names.
 */

export { OcBashToolView } from './OcBashToolView';
export { OcEditToolView } from './OcEditToolView';
export { OcWriteToolView } from './OcWriteToolView';
export { OcReadToolView } from './OcReadToolView';
export { OcSearchToolView } from './OcSearchToolView';
export { OcWebFetchToolView } from './OcWebFetchToolView';
export { OcWebSearchToolView } from './OcWebSearchToolView';
export { OcPresentationGenToolView } from './OcPresentationGenToolView';
export { OcImageSearchToolView } from './OcImageSearchToolView';
export { OcImageGenToolView } from './OcImageGenToolView';
export { OcShowUserToolView } from './OcShowUserToolView';
export { OcApplyPatchToolView } from './OcApplyPatchToolView';
export { OcTaskToolView } from './OcTaskToolView';
export { OcTodoToolView } from './OcTodoToolView';
export { OcGenericToolView } from './OcGenericToolView';
export { OcQuestionToolView } from './OcQuestionToolView';
export { OcSessionContextToolView } from './OcSessionContextToolView';
export { OcSkillToolView } from './OcSkillToolView';
export { OcCodesearchToolView } from './OcCodesearchToolView';
export { OcBatchToolView } from './OcBatchToolView';
export { OcPlanToolView } from './OcPlanToolView';
export { OcPtySpawnToolView, OcPtyReadToolView, OcPtyWriteToolView, OcPtyKillToolView } from './OcPtyToolViews';
export { OcMemSearchToolView } from './OcMemSearchToolView';
export { OcMemSaveToolView } from './OcMemSaveToolView';
export { OcSessionListToolView } from './OcSessionListToolView';
export { OcSessionGetToolView } from './OcSessionGetToolView';

import type { ToolViewComponent } from '../wrapper/ToolViewRegistry';
import { OcBashToolView } from './OcBashToolView';
import { OcEditToolView } from './OcEditToolView';
import { OcWriteToolView } from './OcWriteToolView';
import { OcReadToolView } from './OcReadToolView';
import { OcSearchToolView } from './OcSearchToolView';
import { OcWebFetchToolView } from './OcWebFetchToolView';
import { OcWebSearchToolView } from './OcWebSearchToolView';
import { OcPresentationGenToolView } from './OcPresentationGenToolView';
import { OcImageSearchToolView } from './OcImageSearchToolView';
import { OcImageGenToolView } from './OcImageGenToolView';
import { OcShowUserToolView } from './OcShowUserToolView';
import { OcApplyPatchToolView } from './OcApplyPatchToolView';
import { OcTaskToolView } from './OcTaskToolView';
import { OcTodoToolView } from './OcTodoToolView';
import { OcGenericToolView } from './OcGenericToolView';
import { OcQuestionToolView } from './OcQuestionToolView';
import { OcSessionContextToolView } from './OcSessionContextToolView';
import { OcSkillToolView } from './OcSkillToolView';
import { OcCodesearchToolView } from './OcCodesearchToolView';
import { OcBatchToolView } from './OcBatchToolView';
import { OcPlanToolView } from './OcPlanToolView';
import { OcPtySpawnToolView, OcPtyReadToolView, OcPtyWriteToolView, OcPtyKillToolView } from './OcPtyToolViews';
import { OcMemSearchToolView } from './OcMemSearchToolView';
import { OcMemSaveToolView } from './OcMemSaveToolView';
import { OcSessionListToolView } from './OcSessionListToolView';
import { OcSessionGetToolView } from './OcSessionGetToolView';

/**
 * Registry entries for OpenCode tools.
 * Call `toolViewRegistry.registerMany(ocToolViewRegistrations)` to activate.
 */
export const ocToolViewRegistrations: Record<string, ToolViewComponent> = {
  // Shell / command execution
  'oc-bash': OcBashToolView,

  // PTY (pseudo-terminal) tools
  'oc-pty_spawn': OcPtySpawnToolView,
  'oc-pty-spawn': OcPtySpawnToolView,
  'oc-pty_read': OcPtyReadToolView,
  'oc-pty-read': OcPtyReadToolView,
  'oc-pty_write': OcPtyWriteToolView,
  'oc-pty-write': OcPtyWriteToolView,
  'oc-pty_input': OcPtyWriteToolView,
  'oc-pty-input': OcPtyWriteToolView,
  'oc-pty_kill': OcPtyKillToolView,
  'oc-pty-kill': OcPtyKillToolView,

  // File editing
  'oc-edit': OcEditToolView,
  'oc-morph_edit': OcEditToolView,
  'oc-morph-edit': OcEditToolView,

  // File writing / creation
  'oc-write': OcWriteToolView,

  // File reading
  'oc-read': OcReadToolView,

  // Search tools (glob, grep, list)
  'oc-glob': OcSearchToolView,
  'oc-grep': OcSearchToolView,
  'oc-list': OcSearchToolView,

  // Web fetching (generic URL fetch)
  'oc-webfetch': OcWebFetchToolView,
  'oc-scrape-webpage': OcWebFetchToolView,

  // Web search (structured search results)
  'oc-websearch': OcWebSearchToolView,
  'oc-web-search': OcWebSearchToolView,
  'oc-web_search': OcWebSearchToolView,

  // Image search
  'oc-image-search': OcImageSearchToolView,

  // Image generation
  'oc-image-gen': OcImageGenToolView,

  // Video generation (uses generic — prompt + output display)
  'oc-video-gen': OcGenericToolView,

  // Presentation generation (create slide, preview, export, etc.)
  'oc-presentation-gen': OcPresentationGenToolView,

  // Show (output to user — files, images, URLs, text, errors)
  'oc-show': OcShowUserToolView,
  'oc-show-user': OcShowUserToolView, // backward compat

  // Apply patch (multi-file diffs)
  'oc-apply-patch': OcApplyPatchToolView,
  'oc-apply_patch': OcApplyPatchToolView,

  // Sub-agent delegation
  'oc-task': OcTaskToolView,

  // Todo / task management
  'oc-todowrite': OcTodoToolView,
  'oc-todoread': OcTodoToolView,

  // Question tool — formatted Q&A display
  'oc-question': OcQuestionToolView,

  // Session context (cross-session references)
  'oc-session-context': OcSessionContextToolView,
  'oc-session_context': OcSessionContextToolView,

  // Skill loading (SKILL.md knowledge modules)
  'oc-skill': OcSkillToolView,

  // Code search (external API search)
  'oc-codesearch': OcCodesearchToolView,

  // Batch execution (parallel tool calls)
  'oc-batch': OcBatchToolView,

  // Plan tools (agent switching)
  'oc-plan_exit': OcPlanToolView,
  'oc-plan-exit': OcPlanToolView,
  'oc-plan_enter': OcPlanToolView,
  'oc-plan-enter': OcPlanToolView,

  // Memory tools (kortix-sys-oc-plugin)
  'oc-mem_search': OcMemSearchToolView,
  'oc-mem-search': OcMemSearchToolView,
  'oc-mem_save': OcMemSaveToolView,
  'oc-mem-save': OcMemSaveToolView,

  // Session tools (kortix-sys-oc-plugin)
  'oc-session_list': OcSessionListToolView,
  'oc-session-list': OcSessionListToolView,
  'oc-session_get': OcSessionGetToolView,
  'oc-session-get': OcSessionGetToolView,

  // MCP tools and other unknown tools will fall through to the
  // registry's default (GenericToolView). The OcGenericToolView
  // is available for explicit oc-* fallback if needed.
};
