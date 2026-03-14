import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/auth-token';
import { ensureSandbox, getSandboxUrl } from '@/lib/platform-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SessionMode = 'new' | 'reuse';
export type TriggerType = 'cron' | 'webhook';
export type TriggerSourceType = 'manual' | 'agent';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'skipped';

export interface Trigger {
  id: string;
  triggerId: string | null;
  type: TriggerType;
  sourceType: TriggerSourceType;
  sandboxId?: string;
  accountId?: string;
  name: string;
  description: string | null;
  cronExpr: string | null;
  timezone: string | null;
  agentName: string | null;
  modelProviderId: string | null;
  modelId: string | null;
  prompt: string;
  sessionMode: SessionMode;
  sessionId?: string | null;
  isActive: boolean;
  enabled?: boolean;
  editable: boolean;
  agentFilePath?: string | null;
  maxRetries: number;
  timeoutMs: number;
  metadata: Record<string, unknown>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  webhook: {
    path: string;
    method: string;
    secretProtected: boolean;
  } | null;
}

export interface Execution {
  executionId: string;
  triggerId: string;
  sandboxId?: string;
  status: ExecutionStatus;
  sessionId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  retryCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  trigger_name?: string;
}

export interface CreateTriggerData {
  sandbox_id?: string;
  name: string;
  description?: string;
  cron_expr: string;
  timezone?: string;
  agent_name?: string;
  model_provider_id?: string;
  model_id?: string;
  prompt: string;
  session_mode?: SessionMode;
  session_id?: string;
  max_retries?: number;
  timeout_ms?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateTriggerData {
  name?: string;
  description?: string | null;
  cron_expr?: string;
  timezone?: string;
  agent_name?: string | null;
  model_provider_id?: string | null;
  model_id?: string | null;
  prompt?: string;
  session_mode?: SessionMode;
  session_id?: string | null;
  is_active?: boolean;
  max_retries?: number;
  timeout_ms?: number;
  metadata?: Record<string, unknown>;
}

// ─── API Functions ──────────────────────────────────────────────────────────

interface ApiListResponse {
  success: boolean;
  data: Trigger[];
  total: number;
}

interface ApiSingleResponse {
  success: boolean;
  data: Trigger;
}

interface ApiExecutionsResponse {
  success: boolean;
  data: Execution[];
  total: number;
  limit: number;
  offset: number;
}

interface ApiRunResponse {
  success: boolean;
  data: {
    execution_id: string;
    status: string;
    message: string;
  };
}

async function getCronBaseUrl(): Promise<string> {
  const { sandbox } = await ensureSandbox();
  return `${getSandboxUrl(sandbox)}/kortix/cron`;
}

async function getSandboxBaseUrl(): Promise<string> {
  const { sandbox } = await ensureSandbox();
  return getSandboxUrl(sandbox);
}

async function fetchCronJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = await getCronBaseUrl();
  const response = await authenticatedFetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Request failed with ${response.status}`);
  }
  return body as T;
}

const fetchTriggers = async (): Promise<Trigger[]> => {
  const baseUrl = await getSandboxBaseUrl();
  const response = await authenticatedFetch(`${baseUrl}/kortix/triggers`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Request failed with ${response.status}`);
  }
  const api = body as ApiListResponse;
  const normalized = api.data.map((trigger) => ({
    maxRetries: 0,
    timeoutMs: 300000,
    metadata: {},
    ...trigger,
    isActive: trigger.isActive ?? trigger.enabled ?? true,
  }));
  return normalized;
};

const fetchTrigger = async (triggerId: string): Promise<Trigger> => {
  const response = await fetchCronJson<ApiSingleResponse>(`/triggers/${triggerId}`);
  return response.data;
};

const createTrigger = async (data: CreateTriggerData): Promise<Trigger> => {
  const { sandbox_id: _sandboxId, ...payload } = data;
  const response = await fetchCronJson<ApiSingleResponse>('/triggers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
};

const updateTrigger = async ({ id, data }: { id: string; data: UpdateTriggerData }): Promise<Trigger> => {
  const response = await fetchCronJson<ApiSingleResponse>(`/triggers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.data;
};

const deleteTrigger = async (id: string): Promise<void> => {
  await fetchCronJson(`/triggers/${id}`, { method: 'DELETE' });
};

const pauseTrigger = async (id: string): Promise<Trigger> => {
  const response = await fetchCronJson<ApiSingleResponse>(`/triggers/${id}/pause`, { method: 'POST' });
  return response.data;
};

const resumeTrigger = async (id: string): Promise<Trigger> => {
  const response = await fetchCronJson<ApiSingleResponse>(`/triggers/${id}/resume`, { method: 'POST' });
  return response.data;
};

const runTrigger = async (id: string): Promise<{ execution_id: string; status: string; message: string }> => {
  const response = await fetchCronJson<ApiRunResponse>(`/triggers/${id}/run`, { method: 'POST' });
  return response.data;
};

const fetchExecutions = async (triggerId: string, limit = 50, offset = 0): Promise<Execution[]> => {
  const response = await fetchCronJson<ApiExecutionsResponse>(
    `/executions/by-trigger/${triggerId}?limit=${limit}&offset=${offset}`,
  );
  return response.data;
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

export const useTriggers = (sandboxId?: string) => {
  return useQuery({
    queryKey: ['triggers', sandboxId ?? null],
    queryFn: () => fetchTriggers(),
    // When sandboxId is absent, backend returns all triggers for the account.
    enabled: true,
    staleTime: 1 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });
};

export const useTrigger = (triggerId: string) => {
  return useQuery({
    queryKey: ['trigger', triggerId],
    queryFn: () => fetchTrigger(triggerId),
    enabled: !!triggerId,
    staleTime: 1 * 60 * 1000,
  });
};

export const useCreateTrigger = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTrigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
    },
  });
};

export const useUpdateTrigger = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateTrigger,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
      queryClient.invalidateQueries({ queryKey: ['trigger', updated.triggerId] });
    },
  });
};

export const useDeleteTrigger = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTrigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
    },
  });
};

export const useToggleTrigger = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return isActive ? resumeTrigger(id) : pauseTrigger(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
    },
  });
};

export const useRunTrigger = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runTrigger,
    onSuccess: () => {
      // Refresh executions after manual run
      queryClient.invalidateQueries({ queryKey: ['trigger-executions'] });
    },
  });
};

export const useTriggerExecutions = (triggerId: string, limit = 50) => {
  return useQuery({
    queryKey: ['trigger-executions', triggerId, limit],
    queryFn: () => fetchExecutions(triggerId, limit),
    enabled: !!triggerId,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
};

// ─── Sandbox Models & Agents ────────────────────────────────────────────────

export interface SandboxModel {
  id: string;
  name: string;
}

export interface SandboxProvider {
  id: string;
  name: string;
  models: SandboxModel[];
}

export interface SandboxAgent {
  name: string;
  description?: string;
  mode?: string;
}

const fetchSandboxModels = async (sandboxId: string): Promise<SandboxProvider[]> => {
  const baseUrl = await getSandboxBaseUrl();
  const response = await authenticatedFetch(`${baseUrl}/config/providers`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models (${response.status})`);
  }

  const data = await response.json() as Record<string, unknown> | unknown[];
  const rawProviders: any[] = Array.isArray(data) ? data : ((data.providers || []) as any[]);
  return rawProviders.map((provider: any) => ({
    id: provider.id || '',
    name: provider.name || provider.id || '',
    models: Object.values(provider.models || {}).map((model: any) => ({
      id: model.id || '',
      name: model.name || model.id || '',
    })),
  }));
};

const fetchSandboxAgents = async (sandboxId: string): Promise<SandboxAgent[]> => {
  const baseUrl = await getSandboxBaseUrl();
  const response = await authenticatedFetch(`${baseUrl}/agent`);
  if (!response.ok) {
    throw new Error(`Failed to fetch agents (${response.status})`);
  }

  const data = await response.json() as Record<string, unknown> | unknown[];
  const rawAgents: any[] = Array.isArray(data) ? data : ((data.agents || Object.values(data)) as any[]);
  return rawAgents.map((agent: any) => ({
    name: agent.name || '',
    description: agent.description,
    mode: agent.mode,
  }));
};

export const useSandboxModels = (sandboxId?: string | null) => {
  return useQuery({
    queryKey: ['sandbox-models', sandboxId],
    queryFn: () => fetchSandboxModels(sandboxId!),
    enabled: !!sandboxId,
    staleTime: 5 * 60 * 1000, // 5 min cache — models don't change often
  });
};

export const useSandboxAgents = (sandboxId?: string | null) => {
  return useQuery({
    queryKey: ['sandbox-agents', sandboxId],
    queryFn: () => fetchSandboxAgents(sandboxId!),
    enabled: !!sandboxId,
    staleTime: 5 * 60 * 1000,
  });
};
