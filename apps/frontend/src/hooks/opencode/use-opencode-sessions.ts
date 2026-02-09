'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getOpenCodeSessions,
  getOpenCodeSession,
  createOpenCodeSession,
  deleteOpenCodeSession,
  getOpenCodeMessages,
  sendOpenCodeMessage,
  abortOpenCodeSession,
  getOpenCodeAgents,
  getOpenCodeAgent,
  getOpenCodeToolIds,
  getOpenCodeProjects,
  getOpenCodeCurrentProject,
  getOpenCodeCommands,
  executeOpenCodeCommand,
  summarizeOpenCodeSession,
  getOpenCodeProviders,
  type OpenCodeSession,
  type OpenCodeMessageWithParts,
  type OpenCodePromptPart,
  type SendOpenCodeMessageOptions,
  type OpenCodeAgent,
  type OpenCodeProject,
  type OpenCodeCommand,
  type OpenCodeProviderListResponse,
} from '@/lib/api/opencode';

export const opencodeKeys = {
  all: ['opencode'] as const,
  sessions: () => ['opencode', 'sessions'] as const,
  session: (id: string) => ['opencode', 'session', id] as const,
  messages: (sessionId: string) => ['opencode', 'session', sessionId, 'messages'] as const,
  agents: () => ['opencode', 'agents'] as const,
  toolIds: () => ['opencode', 'tool-ids'] as const,
  projects: () => ['opencode', 'projects'] as const,
  currentProject: () => ['opencode', 'project', 'current'] as const,
  commands: () => ['opencode', 'commands'] as const,
  providers: () => ['opencode', 'providers'] as const,
};

export function useOpenCodeSessions() {
  return useQuery<OpenCodeSession[]>({
    queryKey: opencodeKeys.sessions(),
    queryFn: getOpenCodeSessions,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useOpenCodeSession(sessionId: string) {
  return useQuery<OpenCodeSession>({
    queryKey: opencodeKeys.session(sessionId),
    queryFn: () => getOpenCodeSession(sessionId),
    enabled: !!sessionId,
  });
}

export function useCreateOpenCodeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOpenCodeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

export function useDeleteOpenCodeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteOpenCodeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

export function useOpenCodeMessages(sessionId: string) {
  return useQuery<OpenCodeMessageWithParts[]>({
    queryKey: opencodeKeys.messages(sessionId),
    queryFn: () => getOpenCodeMessages(sessionId),
    enabled: !!sessionId,
    staleTime: 5 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useSendOpenCodeMessage() {
  return useMutation({
    mutationFn: ({
      sessionId,
      parts,
      options,
    }: {
      sessionId: string;
      parts: OpenCodePromptPart[];
      options?: SendOpenCodeMessageOptions;
    }) => sendOpenCodeMessage(sessionId, parts, options),
  });
}

export function useAbortOpenCodeSession() {
  return useMutation({
    mutationFn: abortOpenCodeSession,
  });
}

export function useOpenCodeAgents() {
  return useQuery<OpenCodeAgent[]>({
    queryKey: opencodeKeys.agents(),
    queryFn: getOpenCodeAgents,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useOpenCodeAgent(agentName: string) {
  return useQuery<OpenCodeAgent | undefined>({
    queryKey: [...opencodeKeys.agents(), agentName],
    queryFn: () => getOpenCodeAgent(agentName),
    enabled: !!agentName,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOpenCodeToolIds() {
  return useQuery<string[]>({
    queryKey: opencodeKeys.toolIds(),
    queryFn: getOpenCodeToolIds,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useOpenCodeProjects() {
  return useQuery<OpenCodeProject[]>({
    queryKey: opencodeKeys.projects(),
    queryFn: getOpenCodeProjects,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useOpenCodeCurrentProject() {
  return useQuery<OpenCodeProject>({
    queryKey: opencodeKeys.currentProject(),
    queryFn: getOpenCodeCurrentProject,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useOpenCodeCommands() {
  return useQuery<OpenCodeCommand[]>({
    queryKey: opencodeKeys.commands(),
    queryFn: getOpenCodeCommands,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useExecuteOpenCodeCommand() {
  return useMutation({
    mutationFn: ({
      sessionId,
      command,
      args,
    }: {
      sessionId: string;
      command: string;
      args?: string;
    }) => executeOpenCodeCommand(sessionId, command, args),
  });
}

export function useSummarizeOpenCodeSession() {
  return useMutation({
    mutationFn: summarizeOpenCodeSession,
  });
}

export function useOpenCodeProviders() {
  return useQuery<OpenCodeProviderListResponse>({
    queryKey: opencodeKeys.providers(),
    queryFn: getOpenCodeProviders,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
