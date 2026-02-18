/**
 * Shared custom MCP tools hooks.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/agents/use-custom-mcp-tools.ts)
 * Reconciled with:  mobile   (apps/mobile/hooks/useCustomMcp.ts)
 *
 * Both apps share the same backend endpoints:
 * - GET  /agents/{agentId}/custom-mcp-tools  (list tools for a config URL)
 * - POST /agents/{agentId}/custom-mcp-tools  (update enabled tools)
 * - POST /mcp/discover-custom-tools          (discover tools for a new URL)
 *
 * Differences reconciled:
 * - Frontend's `CustomMCPTool` has `enabled` field; mobile's `CustomMcpTool`
 *   has `parameters`. We union both as optional fields.
 * - Mobile has `useDiscoverCustomMcpTools` (mutation to probe a new URL);
 *   frontend does not. Included here for completeness.
 * - Mobile passes MCP URL/type/headers as request body for update;
 *   frontend passes via custom `X-MCP-*` headers for the GET. The shared
 *   hook passes via headers for GET (matching the backend) and body for POST.
 * - Mobile's response shape includes `serverName`, `processedConfig`,
 *   `success`, `message` — merged into `CustomMcpDiscoverResponse`.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomMcpTool {
  name: string;
  description?: string;
  /** Whether the tool is currently enabled for the agent */
  enabled?: boolean;
  /** JSON Schema parameters (returned by discovery) */
  parameters?: unknown;
}

export interface CustomMcpConfig {
  url: string;
  type?: 'http' | 'sse';
  headers?: Record<string, string>;
}

export interface CustomMcpToolsResponse {
  tools: CustomMcpTool[];
  has_mcp_config?: boolean;
}

export interface CustomMcpDiscoverRequest {
  type: string;
  config: CustomMcpConfig;
}

export interface CustomMcpDiscoverResponse {
  success: boolean;
  tools: CustomMcpTool[];
  serverName?: string;
  processedConfig?: unknown;
  message?: string;
}

export interface CustomMcpUpdateRequest {
  agentId: string;
  url: string;
  type: string;
  enabled_tools: string[];
  name?: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const customMcpKeys = {
  all: ['custom-mcp'] as const,
  tools: (agentId: string, url?: string) =>
    [...customMcpKeys.all, 'tools', agentId, url] as const,
  discover: (url: string, type: string) =>
    [...customMcpKeys.all, 'discover', url, type] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch the list of custom MCP tools for an agent + MCP config URL.
 *
 * Both apps call `GET /agents/{agentId}/custom-mcp-tools` with the MCP URL
 * and type passed as custom headers.
 */
export function useCustomMcpTools(
  config: SharedHookConfig,
  agentId: string,
  mcpConfig: CustomMcpConfig | null | undefined,
) {
  return useQuery<CustomMcpToolsResponse>({
    queryKey: customMcpKeys.tools(agentId, mcpConfig?.url),
    queryFn: () => {
      const headers: Record<string, string> = {
        'X-MCP-URL': mcpConfig!.url,
        'X-MCP-Type': mcpConfig!.type || 'sse',
      };
      if (mcpConfig!.headers) {
        headers['X-MCP-Headers'] = JSON.stringify(mcpConfig!.headers);
      }
      return config.fetchFn<CustomMcpToolsResponse>(
        `/agents/${agentId}/custom-mcp-tools`,
        { headers },
      );
    },
    enabled: !!agentId && !!mcpConfig?.url,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Discover tools from a new custom MCP URL.
 *
 * Mobile-origin hook — calls `POST /mcp/discover-custom-tools`.
 * Frontend may not currently expose this but the endpoint exists.
 */
export function useDiscoverCustomMcpTools(config: SharedHookConfig) {
  return useMutation({
    mutationFn: (request: CustomMcpDiscoverRequest) =>
      config.fetchFn<CustomMcpDiscoverResponse>('/mcp/discover-custom-tools', {
        method: 'POST',
        body: request,
      }),
  });
}

/**
 * Update the set of enabled custom MCP tools for an agent.
 *
 * Both apps call `POST /agents/{agentId}/custom-mcp-tools` with the
 * URL, type, and list of enabled tool names.
 *
 * On success the query cache for the agent's MCP tools and agent detail
 * is invalidated.
 *
 * @param invalidateKeys Additional query key prefixes to invalidate on
 *   success (e.g. platform-specific agent detail keys).
 */
export function useUpdateCustomMcpTools(
  config: SharedHookConfig,
  invalidateKeys?: readonly (readonly string[])[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CustomMcpUpdateRequest) => {
      const { agentId, ...body } = request;
      return config.fetchFn(`/agents/${agentId}/custom-mcp-tools`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate the tools query for this agent + URL
      queryClient.invalidateQueries({
        queryKey: customMcpKeys.tools(variables.agentId, variables.url),
      });
      // Invalidate broader agent-tools key
      queryClient.invalidateQueries({
        queryKey: ['agent-tools', variables.agentId],
      });
      // Invalidate any extra keys the caller requested
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: [...key] });
        }
      }
    },
  });
}
