/**
 * Re-export error classes and utilities from @kortix/shared
 * This ensures consistency between frontend and mobile error handling.
 */
export {
  // Error classes
  AgentRunLimitError,
  AgentCountLimitError,
  ProjectLimitError,
  BillingError,
  TriggerLimitError,
  ModelAccessDeniedError,
  CustomWorkerLimitError,
  ThreadLimitError,
  RequestTooLargeError,
  // Parsing utilities
  parseTierRestrictionError,
  isTierRestrictionError,
  // Error state types and utilities
  
  // UI formatting utilities
  
  formatTierErrorForUI
} from '@kortix/shared/errors';

