/**
 * Prompt Caching — Configuration
 *
 * Constants for cache_control breakpoint injection.
 */

export interface CacheInjectionConfig {
  /** Number of trailing assistant turns to exclude from prefix caching (their content may still change). */
  keepRecentAssistants: number;
  /** Minimum total message count before the prefix-boundary breakpoint activates. */
  minMessagesForPrefixCache: number;
}

export const CACHE_CONFIG: CacheInjectionConfig = {
  keepRecentAssistants: 3,
  minMessagesForPrefixCache: 6,
};
