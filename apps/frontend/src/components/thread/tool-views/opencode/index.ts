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

/**
 * Registry entries for OpenCode tools.
 * Call `toolViewRegistry.registerMany(ocToolViewRegistrations)` to activate.
 */
export const ocToolViewRegistrations: Record<string, ToolViewComponent> = {
  // Shell / command execution
  'oc-bash': OcBashToolView,

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

  // Show user (output display)
  'oc-show-user': OcShowUserToolView,

  // Apply patch (multi-file diffs)
  'oc-apply-patch': OcApplyPatchToolView,
  'oc-apply_patch': OcApplyPatchToolView,

  // Sub-agent delegation
  'oc-task': OcTaskToolView,

  // Todo / task management
  'oc-todowrite': OcTodoToolView,
  'oc-todoread': OcTodoToolView,

  // Question tool (handled via pending store, generic fallback in panel)
  'oc-question': OcGenericToolView,

  // MCP tools and other unknown tools will fall through to the
  // registry's default (GenericToolView). The OcGenericToolView
  // is available for explicit oc-* fallback if needed.
};
