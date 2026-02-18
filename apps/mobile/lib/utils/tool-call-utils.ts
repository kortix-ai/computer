/**
 * Tool call utilities for parsing and handling tool call data
 * Re-exports from @kortix/shared for backward compatibility
 */

// Re-export all tool call utilities from shared package
export {
  parseToolCallArguments,
  normalizeToolName,
  getToolDisplayParam,
  parseToolCallForDisplay,
  extractAndParseToolCalls,
  isFileOperationTool,
  isCommandTool,
  isWebTool,
  getToolCategory,
  type ToolCategory,
  type ParsedToolCallData,
} from '@kortix/shared/tools';

// Re-export ToolResultData type (without timestamp for backward compatibility)
export type { ToolResultData } from '@kortix/shared/tools';
