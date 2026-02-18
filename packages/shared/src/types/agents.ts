/**
 * Shared agent types for AgentPress
 * Canonical definitions consumed by both frontend and mobile.
 *
 * Source of truth: frontend (apps/frontend/src/hooks/agents/utils.ts)
 * Reconciled with: mobile  (apps/mobile/api/types.ts)
 */

// ---------------------------------------------------------------------------
// Agent Version
// ---------------------------------------------------------------------------

export interface AgentVersion {
  version_id: string;
  agent_id: string;
  version_number: number;
  version_name: string;
  system_prompt: string;
  model?: string;
  configured_mcps: Array<AgentMcpConfig>;
  custom_mcps: Array<AgentCustomMcpConfig>;
  agentpress_tools: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  change_description?: string;
}

// ---------------------------------------------------------------------------
// MCP Configuration sub-types (shared by Agent, AgentCreateRequest, etc.)
// ---------------------------------------------------------------------------

export interface AgentMcpConfig {
  name: string;
  config: Record<string, any>;
}

export interface AgentCustomMcpConfig {
  name: string;
  type: 'json' | 'sse';
  config: Record<string, any>;
  enabledTools: string[];
}

// ---------------------------------------------------------------------------
// Agent metadata (restrictions, template info, etc.)
// ---------------------------------------------------------------------------

export interface AgentRestrictions {
  system_prompt_editable?: boolean;
  tools_editable?: boolean;
  name_editable?: boolean;
  mcps_editable?: boolean;
}

export interface AgentMetadata {
  template_name?: string;
  kortix_template_id?: string;
  is_kortix_team?: boolean;
  /** Indicates the agent is the built-in Suna default */
  is_suna_default?: boolean;
  centrally_managed?: boolean;
  management_version?: string;
  restrictions?: AgentRestrictions;
  installation_date?: string;
  last_central_update?: string;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface Agent {
  agent_id: string;
  name: string;
  description?: string;
  system_prompt: string;
  model?: string | null;
  configured_mcps: AgentMcpConfig[];
  custom_mcps?: AgentCustomMcpConfig[];
  agentpress_tools: Record<string, any>;
  is_default: boolean;
  is_public?: boolean;
  marketplace_published_at?: string;
  download_count?: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
  current_version_id?: string | null;
  version_count?: number;
  current_version?: AgentVersion | null;
  metadata?: AgentMetadata;
}

// ---------------------------------------------------------------------------
// Agent Run
// ---------------------------------------------------------------------------

export type AgentRunStatus =
  | 'running'
  | 'completed'
  | 'stopped'
  | 'failed'
  | 'cancelled'
  | 'error';

export interface AgentRun {
  id: string;
  thread_id: string;
  status: AgentRunStatus;
  started_at?: string;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  error?: string | null;
  model_name?: string;
  metadata?: Record<string, any>;
}

/** Lightweight representation of a currently-running agent run. */
export interface ActiveAgentRun {
  id: string;
  thread_id: string;
  status: 'running';
  started_at: string;
}

// ---------------------------------------------------------------------------
// Agent CRUD requests
// ---------------------------------------------------------------------------

export interface AgentCreateRequest {
  name: string;
  description?: string;
  system_prompt?: string;
  configured_mcps?: AgentMcpConfig[];
  custom_mcps?: AgentCustomMcpConfig[];
  agentpress_tools?: Record<string, any>;
  is_default?: boolean;
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
}

export interface AgentUpdateRequest {
  name?: string;
  description?: string;
  system_prompt?: string;
  model?: string | null;
  configured_mcps?: AgentMcpConfig[];
  custom_mcps?: AgentCustomMcpConfig[];
  agentpress_tools?: Record<string, any>;
  is_default?: boolean;
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
  replace_mcps?: boolean;
}

// ---------------------------------------------------------------------------
// Tool Call (completed / at-rest — not the streaming delta variant)
// ---------------------------------------------------------------------------

export interface ToolCall {
  id?: string;
  type?: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

// ---------------------------------------------------------------------------
// Unified Agent Start response
// ---------------------------------------------------------------------------

export interface UnifiedAgentStartResponse {
  thread_id: string;
  agent_run_id: string;
  status: string;
  project_id?: string;
  sandbox_id?: string;
}

// ---------------------------------------------------------------------------
// Agent list / pagination helpers
// ---------------------------------------------------------------------------

export interface AgentPaginationInfo {
  current_page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface AgentsResponse {
  agents: Agent[];
  pagination: AgentPaginationInfo;
}
