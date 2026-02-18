/**
 * Shared tools metadata hook.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/tools/use-tools-metadata.ts)
 * Reconciled with:  mobile   (apps/mobile/hooks/useToolsMetadata.ts)
 *
 * Both implementations are nearly identical:
 * - Same query key: ['tools', 'metadata']
 * - Same staleTime (1 hour) and gcTime (24 hours)
 * - Same array-to-object transform of the backend response
 */

import { useQuery } from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolMethod {
  name: string;
  display_name: string;
  description: string;
  enabled: boolean;
  is_core?: boolean;
  /** Whether method is visible in UI */
  visible?: boolean;
}

export interface ToolMetadata {
  name: string;
  display_name: string;
  description: string;
  tool_class: string;
  icon?: string;
  color?: string;
  enabled: boolean;
  is_core?: boolean;
  /** Sort order (lower = higher priority) */
  weight?: number;
  /** Whether tool is visible in UI */
  visible?: boolean;
  methods: ToolMethod[];
}

export interface ToolsMetadataResponse {
  success: boolean;
  tools: Record<string, ToolMetadata>;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const TOOLS_METADATA_QUERY_KEY = ['tools', 'metadata'] as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch all tools metadata from the backend API.
 * The backend returns an array; this hook converts it to an object keyed by tool name.
 */
export function useToolsMetadata(config: SharedHookConfig) {
  return useQuery<ToolsMetadataResponse>({
    queryKey: [...TOOLS_METADATA_QUERY_KEY],
    queryFn: async () => {
      const data = await config.fetchFn<{ success: boolean; tools: ToolMetadata[] }>('/tools');

      if (!data.success || !data.tools) {
        throw new Error('Failed to fetch tools metadata');
      }

      // Backend returns array — convert to object keyed by tool name
      const toolsObject: Record<string, ToolMetadata> = {};
      for (const tool of data.tools) {
        toolsObject[tool.name] = tool;
      }

      return { success: data.success, tools: toolsObject };
    },
    staleTime: 1000 * 60 * 60,       // 1 hour
    gcTime: 1000 * 60 * 60 * 24,     // 24 hours
  });
}

/**
 * Fetch metadata for a single tool by name.
 * (Frontend-only convenience — mobile can adopt later.)
 */
export function useToolMetadata(config: SharedHookConfig, toolName: string) {
  return useQuery<{ success: boolean; tool: ToolMetadata }>({
    queryKey: [...TOOLS_METADATA_QUERY_KEY, toolName],
    queryFn: async () => {
      const data = await config.fetchFn<{ success: boolean; tool: ToolMetadata }>(`/tools/${toolName}`);
      if (!data.success || !data.tool) {
        throw new Error(`Failed to fetch tool metadata for ${toolName}`);
      }
      return data;
    },
    enabled: !!toolName,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}
