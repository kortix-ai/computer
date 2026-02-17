import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChannelType =
  | 'telegram'
  | 'slack'
  | 'discord'
  | 'whatsapp'
  | 'teams'
  | 'voice'
  | 'email'
  | 'sms';

export type SessionStrategy = 'single' | 'per-thread' | 'per-user' | 'per-message';

export interface ChannelConfig {
  channelConfigId: string;
  sandboxId: string | null;
  accountId: string;
  channelType: ChannelType;
  name: string;
  enabled: boolean;
  credentials: Record<string, unknown>;
  platformConfig: Record<string, unknown>;
  sessionStrategy: SessionStrategy;
  systemPrompt: string | null;
  agentName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  sandbox?: { name: string; status: string };
}

export interface ChannelMessage {
  channelMessageId: string;
  channelConfigId: string;
  direction: 'inbound' | 'outbound';
  externalId: string | null;
  sessionId: string | null;
  chatType: string | null;
  content: string | null;
  attachments: unknown[];
  platformUser: { id: string; name: string; avatar?: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateChannelData {
  sandbox_id?: string | null;
  channel_type: ChannelType;
  name: string;
  enabled?: boolean;
  credentials?: Record<string, unknown>;
  platform_config?: Record<string, unknown>;
  session_strategy?: SessionStrategy;
  system_prompt?: string | null;
  agent_name?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateChannelData {
  sandbox_id?: string | null;
  name?: string;
  enabled?: boolean;
  credentials?: Record<string, unknown>;
  platform_config?: Record<string, unknown>;
  session_strategy?: SessionStrategy;
  system_prompt?: string | null;
  agent_name?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── API Functions ──────────────────────────────────────────────────────────

interface ApiListResponse {
  success: boolean;
  data: ChannelConfig[];
  total: number;
}

interface ApiSingleResponse {
  success: boolean;
  data: ChannelConfig;
}

interface ApiMessagesResponse {
  success: boolean;
  data: ChannelMessage[];
  total: number;
}

const fetchChannels = async (sandboxId?: string): Promise<ChannelConfig[]> => {
  const params = sandboxId ? `?sandbox_id=${sandboxId}` : '';
  const response = await backendApi.get<ApiListResponse>(`/channels${params}`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch channels');
  }
  return response.data!.data;
};

const fetchChannel = async (channelId: string): Promise<ChannelConfig> => {
  const response = await backendApi.get<ApiSingleResponse>(`/channels/${channelId}`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch channel');
  }
  return response.data!.data;
};

const createChannel = async (data: CreateChannelData): Promise<ChannelConfig> => {
  const response = await backendApi.post<ApiSingleResponse>('/channels', data);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to create channel');
  }
  return response.data!.data;
};

const updateChannel = async ({ id, data }: { id: string; data: UpdateChannelData }): Promise<ChannelConfig> => {
  const response = await backendApi.patch<ApiSingleResponse>(`/channels/${id}`, data);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to update channel');
  }
  return response.data!.data;
};

const deleteChannel = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/channels/${id}`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to delete channel');
  }
};

const enableChannel = async (id: string): Promise<ChannelConfig> => {
  const response = await backendApi.post<ApiSingleResponse>(`/channels/${id}/enable`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to enable channel');
  }
  return response.data!.data;
};

const disableChannel = async (id: string): Promise<ChannelConfig> => {
  const response = await backendApi.post<ApiSingleResponse>(`/channels/${id}/disable`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to disable channel');
  }
  return response.data!.data;
};

const linkChannel = async ({ id, sandboxId }: { id: string; sandboxId: string }): Promise<ChannelConfig> => {
  const response = await backendApi.post<ApiSingleResponse>(`/channels/${id}/link`, { sandbox_id: sandboxId });
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to link channel');
  }
  return response.data!.data;
};

const unlinkChannel = async (id: string): Promise<ChannelConfig> => {
  const response = await backendApi.post<ApiSingleResponse>(`/channels/${id}/unlink`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to unlink channel');
  }
  return response.data!.data;
};

const fetchChannelMessages = async (id: string, limit = 50, offset = 0): Promise<ChannelMessage[]> => {
  const response = await backendApi.get<ApiMessagesResponse>(
    `/channels/${id}/messages?limit=${limit}&offset=${offset}`,
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch messages');
  }
  return response.data!.data;
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

export const useChannels = (sandboxId?: string) => {
  return useQuery({
    queryKey: ['channels', sandboxId],
    queryFn: () => fetchChannels(sandboxId),
    staleTime: 1 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });
};

export const useChannel = (channelId: string) => {
  return useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => fetchChannel(channelId),
    enabled: !!channelId,
    staleTime: 1 * 60 * 1000,
  });
};

export const useCreateChannel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
};

export const useUpdateChannel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateChannel,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel', updated.channelConfigId] });
    },
  });
};

export const useDeleteChannel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
};

export const useToggleChannel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return enabled ? enableChannel(id) : disableChannel(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
};

export const useLinkChannel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: linkChannel,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel', updated.channelConfigId] });
    },
  });
};

export const useUnlinkChannel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkChannel,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel', updated.channelConfigId] });
    },
  });
};

export const useChannelMessages = (channelId: string, limit = 50) => {
  return useQuery({
    queryKey: ['channel-messages', channelId, limit],
    queryFn: () => fetchChannelMessages(channelId, limit),
    enabled: !!channelId,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
};
