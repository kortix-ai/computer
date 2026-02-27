import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SessionMode = 'new' | 'reuse';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'skipped';

export interface Trigger {
  triggerId: string;
  sandboxId: string;
  accountId: string;
  name: string;
  description: string | null;
  cronExpr: string;
  timezone: string;
  agentName: string | null;
  modelProviderId: string | null;
  modelId: string | null;
  prompt: string;
  sessionMode: SessionMode;
  sessionId: string | null;
  isActive: boolean;
  maxRetries: number;
  timeoutMs: number;
  metadata: Record<string, unknown>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Execution {
  executionId: string;
  triggerId: string;
  sandboxId: string;
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
  sandbox_id: string;
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

const fetchTriggers = async (sandboxId?: string): Promise<Trigger[]> => {
  const params = new URLSearchParams();
  if (sandboxId) params.set('sandbox_id', sandboxId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<ApiListResponse>(`/cron/triggers${qs}`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch triggers');
  }
  return response.data!.data;
};

const fetchTrigger = async (triggerId: string): Promise<Trigger> => {
  const response = await backendApi.get<ApiSingleResponse>(`/cron/triggers/${triggerId}`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch trigger');
  }
  return response.data!.data;
};

const createTrigger = async (data: CreateTriggerData): Promise<Trigger> => {
  const response = await backendApi.post<ApiSingleResponse>('/cron/triggers', data);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to create trigger');
  }
  return response.data!.data;
};

const updateTrigger = async ({ id, data }: { id: string; data: UpdateTriggerData }): Promise<Trigger> => {
  const response = await backendApi.patch<ApiSingleResponse>(`/cron/triggers/${id}`, data);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to update trigger');
  }
  return response.data!.data;
};

const deleteTrigger = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/cron/triggers/${id}`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to delete trigger');
  }
};

const pauseTrigger = async (id: string): Promise<Trigger> => {
  const response = await backendApi.post<ApiSingleResponse>(`/cron/triggers/${id}/pause`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to pause trigger');
  }
  return response.data!.data;
};

const resumeTrigger = async (id: string): Promise<Trigger> => {
  const response = await backendApi.post<ApiSingleResponse>(`/cron/triggers/${id}/resume`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to resume trigger');
  }
  return response.data!.data;
};

const runTrigger = async (id: string): Promise<{ execution_id: string; status: string; message: string }> => {
  const response = await backendApi.post<ApiRunResponse>(`/cron/triggers/${id}/run`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to run trigger');
  }
  return response.data!.data;
};

const fetchExecutions = async (triggerId: string, limit = 50, offset = 0): Promise<Execution[]> => {
  const response = await backendApi.get<ApiExecutionsResponse>(
    `/cron/executions/by-trigger/${triggerId}?limit=${limit}&offset=${offset}`,
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch executions');
  }
  return response.data!.data;
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

export const useTriggers = (sandboxId?: string) => {
  return useQuery({
    queryKey: ['triggers', sandboxId ?? null],
    queryFn: () => fetchTriggers(sandboxId),
    enabled: !!sandboxId,
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
  const response = await backendApi.get<{ success: boolean; data: SandboxProvider[] }>(
    `/cron/sandboxes/${sandboxId}/models`,
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch models');
  }
  return response.data!.data;
};

const fetchSandboxAgents = async (sandboxId: string): Promise<SandboxAgent[]> => {
  const response = await backendApi.get<{ success: boolean; data: SandboxAgent[] }>(
    `/cron/sandboxes/${sandboxId}/agents`,
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch agents');
  }
  return response.data!.data;
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
