/**
 * Utility Functions
 *
 * General-purpose utility functions and helpers
 */

// Core utilities
export * from './utils';
export * from './uuid';
export * from './date';
export * from './search';

// Theme & styling
export * from './theme';
export * from './fonts';
export * from './icon-mapping';

// Parsing & formatting
// message-grouping moved to @kortix/shared/utils
// tool-parser moved to @kortix/shared/tools
// tool-display moved to @kortix/shared/tools
// credit-formatter moved to @kortix/shared
export { formatCredits, formatCreditsWithSign, dollarsToCredits, creditsToDollars, formatDollarsAsCredits, CREDITS_PER_DOLLAR } from '@kortix/shared';

// Streaming & tool call utilities (portable from frontend)
// streaming-utils moved to @kortix/shared/streaming
export * from './tool-call-utils';
export * from './tool-data-extractor';

// Domain-specific utilities
export * from './thread-utils';
export * from './trigger-utils';
export * from './model-provider';
export * from './error-handler';

// Type definitions
export * from './auth-types';

// i18n
export * from './i18n';

