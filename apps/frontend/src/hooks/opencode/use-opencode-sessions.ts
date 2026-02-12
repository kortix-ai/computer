'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient } from '@/lib/opencode-sdk';
import type {
  Session,
  Message,
  Part,
  Agent,
  Command,
  Project,
  SessionStatus,
  PermissionRule,
  Model,
  McpStatus,
  Path as PathInfo,
  ProviderListResponse as SdkProviderListResponse,
} from '@kortix/opencode-sdk/v2/client';

// ============================================================================
// Re-export SDK types for consumers
// ============================================================================

export type { Session, Message, Part, Agent, Command, Project, SessionStatus, PermissionRule, Model, McpStatus, PathInfo };

/**
 * Shape returned by `client.session.messages()`:
 * `Array<{ info: Message; parts: Part[] }>`
 */
export interface MessageWithParts {
  info: Message;
  parts: Part[];
}

/**
 * Provider list response — matches the actual SDK response from `client.provider.list()`.
 * The SDK's inline model shape differs from the `Model` type, so we use the SDK's
 * response type directly.
 */
export type ProviderListResponse = SdkProviderListResponse;

/**
 * Prompt part (input to send message).
 * Supports text, file references, and agent/mode mentions.
 */
export type PromptPart =
  | { type: 'text'; text: string; id?: string }
  | { type: 'file'; mime: string; url: string; filename?: string; source?: { text: { value: string; start: number; end: number }; type: 'file'; path: string } }
  | { type: 'agent'; name: string; source?: { value: string; start: number; end: number } };

export interface SendMessageOptions {
  model?: { providerID: string; modelID: string };
  agent?: string;
  variant?: string;
}

/**
 * Skill type from `client.app.skills()`.
 */
export interface Skill {
  name: string;
  description: string;
  location: string;
  content: string;
}

/**
 * Tool list item from `client.tool.list()`.
 */
export interface ToolListItem {
  id: string;
  description: string;
  parameters: unknown;
}

// ============================================================================
// Query Keys
// ============================================================================

export const opencodeKeys = {
  all: ['opencode'] as const,
  sessions: () => ['opencode', 'sessions'] as const,
  session: (id: string) => ['opencode', 'session', id] as const,
  messages: (sessionId: string) => ['opencode', 'session', sessionId, 'messages'] as const,
  agents: () => ['opencode', 'agents'] as const,
  toolIds: () => ['opencode', 'tool-ids'] as const,
  tools: (providerID: string, modelID: string) => ['opencode', 'tools', providerID, modelID] as const,
  skills: () => ['opencode', 'skills'] as const,
  projects: () => ['opencode', 'projects'] as const,
  currentProject: () => ['opencode', 'project', 'current'] as const,
  commands: () => ['opencode', 'commands'] as const,
  providers: () => ['opencode', 'providers'] as const,
  pathInfo: () => ['opencode', 'path-info'] as const,
  mcpStatus: () => ['opencode', 'mcp-status'] as const,
};

// ============================================================================
// Helper: unwrap SDK response (data / error)
// ============================================================================

function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error) {
    const err = result.error as any;
    throw new Error(err?.data?.message || err?.message || 'SDK request failed');
  }
  return result.data as T;
}

// ============================================================================
// Session Hooks
// ============================================================================

export function useOpenCodeSessions() {
  return useQuery<Session[]>({
    queryKey: opencodeKeys.sessions(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.session.list();
      const sessions = unwrap(result);
      return sessions.sort((a: Session, b: Session) => b.time.updated - a.time.updated);
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useOpenCodeSession(sessionId: string) {
  return useQuery<Session>({
    queryKey: opencodeKeys.session(sessionId),
    queryFn: async () => {
      const client = getClient();
      const result = await client.session.get({ sessionID: sessionId });
      return unwrap(result);
    },
    enabled: !!sessionId,
  });
}

export function useCreateOpenCodeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: { directory?: string; title?: string } | void) => {
      const client = getClient();
      const opts = options || {};
      const result = await client.session.create({
        directory: opts.directory,
        title: opts.title,
      });
      return unwrap(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

export function useDeleteOpenCodeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const client = getClient();
      const result = await client.session.delete({ sessionID: sessionId });
      unwrap(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

export function useUpdateOpenCodeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      title,
      archived,
    }: {
      sessionId: string;
      title?: string;
      archived?: boolean;
    }) => {
      const client = getClient();
      const body: { title?: string; time?: { archived?: number } } = {};
      if (title !== undefined) body.title = title;
      if (archived) body.time = { archived: Date.now() };
      const result = await client.session.update({ sessionID: sessionId, ...body });
      return unwrap(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

export function useOpenCodeSessionDiff(sessionId: string) {
  return useQuery({
    queryKey: ['opencode', 'session-diff', sessionId],
    queryFn: async () => {
      const client = getClient();
      const result = await client.session.diff({ sessionID: sessionId });
      return unwrap(result);
    },
    enabled: !!sessionId,
    staleTime: 5 * 1000,
  });
}

export function useOpenCodeSessionTodo(sessionId: string) {
  return useQuery({
    queryKey: ['opencode', 'session-todo', sessionId],
    queryFn: async () => {
      const client = getClient();
      const result = await client.session.todo({ sessionID: sessionId });
      return unwrap(result);
    },
    enabled: !!sessionId,
    staleTime: 5 * 1000,
  });
}

export function useOpenCodeMessages(sessionId: string) {
  return useQuery<MessageWithParts[]>({
    queryKey: opencodeKeys.messages(sessionId),
    queryFn: async () => {
      const client = getClient();
      const result = await client.session.messages({ sessionID: sessionId });
      return unwrap(result) as MessageWithParts[];
    },
    enabled: !!sessionId,
    staleTime: 5 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Prompt / Abort Hooks
// ============================================================================

export function useSendOpenCodeMessage() {
  return useMutation({
    mutationFn: async ({
      sessionId,
      parts,
      options,
    }: {
      sessionId: string;
      parts: PromptPart[];
      options?: SendMessageOptions;
    }) => {
      const client = getClient();
      const result = await client.session.promptAsync({
        sessionID: sessionId,
        parts: parts.map((p) => {
          if (p.type === 'file') return { type: 'file' as const, mime: p.mime, url: p.url, filename: p.filename, source: p.source };
          if (p.type === 'agent') return { type: 'agent' as const, name: p.name, source: p.source };
          return { type: 'text' as const, text: p.text };
        }),
        ...(options?.model && { model: options.model }),
        ...(options?.agent && { agent: options.agent }),
        ...(options?.variant && { variant: options.variant }),
      });
      // promptAsync returns void (204) — no unwrap needed, but check for errors
      if (result.error) {
        const err = result.error as any;
        throw new Error(err?.data?.message || err?.message || 'Failed to send message');
      }
    },
  });
}

export function useAbortOpenCodeSession() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const client = getClient();
      const result = await client.session.abort({ sessionID: sessionId });
      unwrap(result);
    },
  });
}

// ============================================================================
// Agent Hooks
// ============================================================================

export function useOpenCodeAgents() {
  return useQuery<Agent[]>({
    queryKey: opencodeKeys.agents(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.agent.list();
      return unwrap(result);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useOpenCodeAgent(agentName: string) {
  return useQuery<Agent | undefined>({
    queryKey: [...opencodeKeys.agents(), agentName],
    queryFn: async () => {
      const client = getClient();
      const result = await client.agent.list();
      const agents = unwrap(result);
      return agents.find((a: Agent) => a.name === agentName);
    },
    enabled: !!agentName,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateOpenCodeAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, patch }: { name: string; patch: Partial<Agent> }) => {
      const client = getClient();
      const result = await client.agent.update({ name, ...patch } as any);
      return unwrap(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.agents() });
    },
  });
}

// ============================================================================
// Tool Hooks
// ============================================================================

export function useOpenCodeToolIds() {
  return useQuery<string[]>({
    queryKey: opencodeKeys.toolIds(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.tool.ids();
      return unwrap(result);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useOpenCodeTools(providerID: string, modelID: string) {
  return useQuery<ToolListItem[]>({
    queryKey: opencodeKeys.tools(providerID, modelID),
    queryFn: async () => {
      const client = getClient();
      const result = await client.tool.list({ provider: providerID, model: modelID });
      return unwrap(result) as ToolListItem[];
    },
    enabled: !!providerID && !!modelID,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// Skill Hooks
// ============================================================================

export function useOpenCodeSkills() {
  return useQuery<Skill[]>({
    queryKey: opencodeKeys.skills(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.app.skills();
      return unwrap(result) as Skill[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// Project Hooks
// ============================================================================

export function useOpenCodeProjects() {
  return useQuery<Project[]>({
    queryKey: opencodeKeys.projects(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.project.list();
      return unwrap(result);
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useOpenCodeCurrentProject() {
  return useQuery<Project>({
    queryKey: opencodeKeys.currentProject(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.project.current();
      return unwrap(result);
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Path Info Hook
// ============================================================================

export function useOpenCodePathInfo() {
  return useQuery<PathInfo>({
    queryKey: opencodeKeys.pathInfo(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.path.get();
      return unwrap(result);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// Command Hooks
// ============================================================================

export function useOpenCodeCommands() {
  return useQuery<Command[]>({
    queryKey: opencodeKeys.commands(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.command.list();
      return unwrap(result);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useExecuteOpenCodeCommand() {
  return useMutation({
    mutationFn: async ({
      sessionId,
      command,
      args,
    }: {
      sessionId: string;
      command: string;
      args?: string;
    }) => {
      const client = getClient();
      const result = await client.session.command({
        sessionID: sessionId,
        command,
        arguments: args || '',
      });
      unwrap(result);
    },
  });
}

// ============================================================================
// Summarize Hook
// ============================================================================

export function useSummarizeOpenCodeSession() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const client = getClient();
      const result = await client.session.summarize({ sessionID: sessionId });
      unwrap(result);
    },
  });
}

// ============================================================================
// Provider Hooks
// ============================================================================

export function useOpenCodeProviders() {
  return useQuery<ProviderListResponse>({
    queryKey: opencodeKeys.providers(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.provider.list();
      return unwrap(result);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// MCP Status Hook
// ============================================================================

export function useOpenCodeMcpStatus() {
  return useQuery<Record<string, McpStatus>>({
    queryKey: opencodeKeys.mcpStatus(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.mcp.status();
      return unwrap(result) as Record<string, McpStatus>;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// File Search (direct SDK call, not a hook)
// ============================================================================

export async function findOpenCodeFiles(query: string): Promise<string[]> {
  const client = getClient();
  const result = await client.find.files({ query, limit: 20 });
  return unwrap(result);
}

// ============================================================================
// Permission & Question Reply (direct SDK calls, not hooks)
// ============================================================================

export async function replyToPermission(
  requestId: string,
  reply: 'once' | 'always' | 'reject',
  message?: string,
): Promise<void> {
  const client = getClient();
  const result = await client.permission.reply({ requestID: requestId, reply, message });
  unwrap(result);
}

export async function replyToQuestion(
  requestId: string,
  answers: string[][],
): Promise<void> {
  const client = getClient();
  const result = await client.question.reply({ requestID: requestId, answers });
  unwrap(result);
}

export async function rejectQuestion(requestId: string): Promise<void> {
  const client = getClient();
  const result = await client.question.reject({ requestID: requestId });
  unwrap(result);
}
