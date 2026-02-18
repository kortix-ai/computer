/**
 * Abstract fetch interface for platform-agnostic hooks.
 *
 * Both frontend (via backendApi wrapper) and mobile (via raw fetch + auth
 * headers) implement this contract so the shared hooks don't depend on
 * any platform-specific HTTP client.
 */

/**
 * A generic fetch function that returns parsed JSON of type T.
 * Implementations must handle auth headers, error responses, and JSON parsing.
 */
export interface SharedFetchFn {
  <T>(url: string, options?: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  }): Promise<T>;
}

/**
 * Configuration object passed to every shared hook.
 */
export interface SharedHookConfig {
  /** Platform-specific fetch function that handles auth and returns parsed JSON */
  fetchFn: SharedFetchFn;
  /** Optional base URL — some hooks build full URLs, others receive relative paths */
  baseUrl?: string;
}
