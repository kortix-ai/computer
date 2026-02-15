'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient } from '@/lib/opencode-sdk';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
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

function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error) {
    const err = result.error as any;
    const status = (result.response as Response | undefined)?.status;
    // Try to extract the most specific error message from the SDK response
    const msg =
      err?.data?.message ||
      err?.message ||
      err?.error ||
      (typeof err === 'string' ? err : null) ||
      (typeof err === 'object' ? JSON.stringify(err) : null) ||
      (status ? `Server returned ${status}` : 'SDK request failed');
    throw new Error(msg);
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
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000),
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
      if (archived !== undefined) body.time = { archived: archived ? Date.now() : 0 };
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
      const mappedParts = parts.map((p) => {
        if (p.type === 'file') return { type: 'file' as const, mime: p.mime, url: p.url, filename: p.filename, source: p.source };
        if (p.type === 'agent') return { type: 'agent' as const, name: p.name, source: p.source };
        return { type: 'text' as const, text: p.text };
      });
      const payload = {
        sessionID: sessionId,
        parts: mappedParts,
        ...(options?.model && { model: options.model }),
        ...(options?.agent && { agent: options.agent }),
        ...(options?.variant && { variant: options.variant }),
      };

      // Retry up to 2 times on transient connection errors
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const client = getClient();
          const result = await client.session.promptAsync(payload);
          // promptAsync returns void (204) — no unwrap needed, but check for errors
          if (result.error) {
            const err = result.error as any;
            throw new Error(err?.data?.message || err?.message || 'Failed to send message');
          }
          return; // success
        } catch (err: any) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const msg = lastError.message.toLowerCase();
          const isTransient = msg.includes('unable to connect') || msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('timeout');
          if (!isTransient || attempt >= 2) throw lastError;
          // Wait before retry: 1s, 2s
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      if (lastError) throw lastError;
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { sessionId: string; providerID?: string; modelID?: string }) => {
      const client = getClient();

      let { providerID, modelID } = params;

      // 1. Try config default model
      if (!providerID || !modelID) {
        try {
          const configResult = await client.config.get();
          const config = configResult.data as any;
          if (config?.model) {
            const parts = (config.model as string).split('/');
            if (parts.length >= 2) {
              providerID = providerID || parts[0];
              modelID = modelID || parts.slice(1).join('/');
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. Try to get model from the session's latest assistant message
      if (!providerID || !modelID) {
        try {
          const msgs = await client.session.messages({ sessionID: params.sessionId });
          const allMsgs = (msgs.data ?? []) as Array<{ info: { role: string; providerID?: string; modelID?: string } }>;
          for (let i = allMsgs.length - 1; i >= 0; i--) {
            const m = allMsgs[i].info;
            if (m.role === 'assistant' && m.providerID && m.modelID) {
              providerID = providerID || m.providerID;
              modelID = modelID || m.modelID;
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      // 3. Try first available provider/model from provider list
      if (!providerID || !modelID) {
        try {
          const providerResult = await client.provider.list();
          const providers = providerResult.data as any;
          if (providers && typeof providers === 'object') {
            for (const [pid, providerInfo] of Object.entries(providers)) {
              const models = (providerInfo as any)?.models;
              if (models && typeof models === 'object') {
                const firstModelId = Object.keys(models)[0];
                if (firstModelId) {
                  providerID = pid;
                  modelID = firstModelId;
                  break;
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (!providerID || !modelID) {
        throw new Error('No model available for compaction. Please configure a model in settings.');
      }

      const result = await client.session.summarize({
        sessionID: params.sessionId,
        providerID,
        modelID,
      });
      unwrap(result);
      return params.sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(sessionId) });
    },
  });
}

// ============================================================================
// Fork / Revert / Unrevert Hooks
// ============================================================================

/**
 * Fork a session at a specific message point.
 * Creates a new session that branches off from the given message.
 * Returns the newly created Session.
 */
export function useForkSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      messageId,
    }: {
      sessionId: string;
      messageId?: string;
    }) => {
      const client = getClient();
      const result = await client.session.fork({
        sessionID: sessionId,
        ...(messageId && { messageID: messageId }),
      });
      return unwrap(result) as Session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

/**
 * Revert a session to a specific message, undoing all subsequent changes.
 * The session enters a "reverted" state (session.revert is populated).
 */
export function useRevertSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      messageId,
      partId,
    }: {
      sessionId: string;
      messageId: string;
      partId?: string;
    }) => {
      const client = getClient();
      const result = await client.session.revert({
        sessionID: sessionId,
        messageID: messageId,
        ...(partId && { partID: partId }),
      });
      return unwrap(result) as Session;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.session(variables.sessionId) });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(variables.sessionId) });
    },
  });
}

/**
 * Unrevert a session — restores all previously reverted messages.
 * Clears the session.revert field.
 */
export function useUnrevertSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const client = getClient();
      const result = await client.session.unrevert({
        sessionID: sessionId,
      });
      return unwrap(result) as Session;
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(sessionId) });
    },
  });
}

// ============================================================================
// Init Hook — analyze project and create AGENTS.md (via /init command)
// ============================================================================

export function useInitSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const client = getClient();
      const result = await client.session.command({
        sessionID: sessionId,
        command: 'init',
        arguments: '',
      });
      if (result.error) {
        const err = result.error as any;
        throw new Error(err?.data?.message || err?.message || 'Failed to initialize project');
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.session(variables.sessionId) });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(variables.sessionId) });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
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
// Share / Unshare Hooks
// ============================================================================

export function useShareSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const client = getClient();
      const result = await client.session.share({ sessionID: sessionId });
      return unwrap(result) as Session;
    },
    onSuccess: (updatedSession) => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.session(updatedSession.id) });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

export function useUnshareSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const client = getClient();
      const result = await client.session.unshare({ sessionID: sessionId });
      return unwrap(result) as Session;
    },
    onSuccess: (updatedSession) => {
      queryClient.invalidateQueries({ queryKey: opencodeKeys.session(updatedSession.id) });
      queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    },
  });
}

// ============================================================================
// Part Edit / Delete Hooks
// ============================================================================

/**
 * Update a message part (e.g. edit text content).
 * Uses `client.part.update()` — available in SDK v2.
 * SSE `message.part.updated` events handle cache updates automatically.
 */
export function useUpdatePart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      messageId,
      partId,
      part,
    }: {
      sessionId: string;
      messageId: string;
      partId: string;
      part: Partial<Part>;
    }) => {
      const client = getClient();
      const result = await client.part.update({
        sessionID: sessionId,
        messageID: messageId,
        partID: partId,
        part: part as Part,
      });
      return unwrap(result) as Part;
    },
    onSuccess: (_data, variables) => {
      // SSE handles incremental cache update via message.part.updated,
      // but invalidate as fallback in case SSE is disconnected.
      queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(variables.sessionId) });
    },
  });
}

/**
 * Delete a message part.
 * Uses `client.part.delete()` — available in SDK v2.
 * SSE `message.part.removed` events handle cache updates automatically.
 */
export function useDeletePart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      messageId,
      partId,
    }: {
      sessionId: string;
      messageId: string;
      partId: string;
    }) => {
      const client = getClient();
      const result = await client.part.delete({
        sessionID: sessionId,
        messageID: messageId,
        partID: partId,
      });
      return unwrap(result);
    },
    onSuccess: (_data, variables) => {
      // SSE handles incremental cache update via message.part.removed,
      // but invalidate as fallback in case SSE is disconnected.
      queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(variables.sessionId) });
    },
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

// ============================================================================
// Session Busy Polling (fallback when SSE is unavailable)
// ============================================================================

/**
 * Polls session status and refreshes messages when enabled.
 * Acts as a reliable fallback for when the SSE event stream is
 * not connected or drops — ensures promptAsync responses always arrive.
 */
export function useSessionBusyPolling(sessionId: string, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !sessionId) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const client = getClient();
        const statusResult = await client.session.status();
        if (!cancelled && statusResult.data) {
          const statuses = statusResult.data as Record<string, any>;
          const status = statuses[sessionId];
          if (status) {
            useOpenCodeSessionStatusStore.getState().setStatus(sessionId, status);
          }
        }
      } catch {
        // ignore polling errors
      }
      if (!cancelled) {
        queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(sessionId) });
      }
    };

    // Immediate first poll, then every 2s
    poll();
    const interval = setInterval(poll, 2000);

    // Safety: stop after 5 minutes to prevent infinite polling.
    // Do one final status check — if server says idle, update the store so
    // the UI doesn't stay stuck in a "busy" state after polling stops.
    const timeout = setTimeout(async () => {
      clearInterval(interval);
      try {
        const client = getClient();
        const statusResult = await client.session.status();
        if (!cancelled && statusResult.data) {
          const statuses = statusResult.data as Record<string, any>;
          const status = statuses[sessionId];
          if (status) {
            useOpenCodeSessionStatusStore.getState().setStatus(sessionId, status);
          }
        }
      } catch {
        // ignore
      }
      cancelled = true;
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [enabled, sessionId, queryClient]);
}
