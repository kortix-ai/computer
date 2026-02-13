/**
 * @kortix/shared
 * 
 * Shared code between frontend (Next.js) and mobile (React Native) applications.
 * This package contains platform-agnostic types, utilities, and business logic.
 * 
 * @example
 * // Import types
 * import type { UnifiedMessage, ParsedContent } from '@kortix/shared/types';
 * 
 * // Import streaming utilities
 * import { extractTextFromPartialJson, isAskOrCompleteTool } from '@kortix/shared/streaming';
 * 
 * // Import tool utilities
 * import { getUserFriendlyToolName, getToolIconKey } from '@kortix/shared/tools';
 * 
 * // Import general utilities
 * import { safeJsonParse, groupMessages } from '@kortix/shared/utils';
 * 
 * // Import animation utilities
 * import { useSmoothText, useSmoothToolField } from '@kortix/shared/animations';
 */

// Re-export everything for convenience
export * from './types';
export * from './streaming';
export * from './tools';
export * from './utils';
export * from './animations';
export * from './constants/upload-limits';
export * from './errors';

